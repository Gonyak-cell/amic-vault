#!/usr/bin/env node

import {
  constants,
  closeSync,
  createReadStream,
  existsSync,
  fstatSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HASH = /^[a-f0-9]{64}$/u;
const BACKUP_SET_ID = /^bset-[A-Za-z0-9][A-Za-z0-9._-]{7,71}$/u;
const OPAQUE_REFERENCE = /^ref-[A-Za-z0-9][A-Za-z0-9._-]{11,95}$/u;
const REGION = /^[a-z]{2}-[a-z0-9][a-z0-9-]{1,47}-[1-9][0-9]?$/u;
const MAX_OBJECTS = 20_000;
const MAX_COMPONENT_BYTES = 10 * 1024 * 1024 * 1024 * 1024;
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_KEY_BYTES = 16 * 1024;
const MAX_CAPTURE_WINDOW_MS = 60 * 60 * 1000;
const MAX_FRESHNESS_MS = 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const INPUT_KEYS = [
  'schemaVersion',
  'backupSetId',
  'country',
  'region',
  'captureStartedAt',
  'captureEndedAt',
  'profileFingerprint',
  'databaseTargetFingerprint',
  'objectStoreTargetFingerprint',
  'pitr',
  'portableDatabase',
  'objects',
];
const PITR_KEYS = [
  'receiptReference',
  'region',
  'capturedAt',
  'restorePointAt',
  'status',
  'encrypted',
  'immutable',
];
const PORTABLE_KEYS = [
  'receiptReference',
  'region',
  'capturedAt',
  'postgresqlMajor',
  'format',
  'sha256',
  'bytes',
  'encrypted',
  'immutable',
];
const OBJECT_KEYS = [
  'reference',
  'versionFingerprint',
  'region',
  'capturedAt',
  'sha256',
  'bytes',
  'encrypted',
  'immutable',
  'versioned',
  'referenceKind',
];

export class BackupSetError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BackupSetError';
    this.code = code;
  }
}

function fail(code) {
  throw new BackupSetError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function object(value, code) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  return value;
}

function exactKeys(value, expected, code) {
  exactSet(Object.keys(object(value, code)), expected, code);
}

function exactSet(actual, expected, code) {
  assert(
    actual.length === expected.length &&
      actual.every((value) => expected.includes(value)) &&
      expected.every((value) => actual.includes(value)),
    code,
  );
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function timestamp(value, code) {
  assert(
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value),
    code,
  );
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds), code);
  return milliseconds;
}

function validateFingerprint(value, code) {
  assert(typeof value === 'string' && HASH.test(value), code);
}

function opaqueReference(value, code) {
  assert(
    typeof value === 'string' &&
      OPAQUE_REFERENCE.test(value) &&
      !/(?:tenant|document|object-key|account|endpoint|https?|arn|s3|\/|@)/iu.test(value),
    code,
  );
}

function boundedBytes(value, code) {
  assert(Number.isSafeInteger(value) && value >= 1 && value <= MAX_COMPONENT_BYTES, code);
}

function validateCaptureTime(value, start, end, code) {
  const capturedAt = timestamp(value, code);
  assert(capturedAt >= start && capturedAt <= end, code);
  return capturedAt;
}

function validateUnsignedPayload(
  payload,
  {
    expectedRegion,
    expectedCountry = 'KR',
    expectedProfileFingerprint,
    now,
    enforceFreshness = false,
  } = {},
) {
  exactKeys(payload, INPUT_KEYS.concat('status'), 'BACKUP_SET_SCHEMA_INVALID');
  assert(
    payload.schemaVersion === 'amic-vault.sf20-backup-set-unsigned.v1' &&
      payload.status === 'COMPLETE',
    'BACKUP_SET_SCHEMA_INVALID',
  );
  assert(BACKUP_SET_ID.test(payload.backupSetId), 'BACKUP_SET_ID_INVALID');
  assert(
    typeof payload.country === 'string' &&
      /^[A-Z]{2}$/u.test(payload.country) &&
      (!expectedCountry || payload.country === expectedCountry),
    'BACKUP_SET_COUNTRY_INVALID',
  );
  assert(
    typeof payload.region === 'string' &&
      REGION.test(payload.region) &&
      (!expectedRegion || payload.region === expectedRegion),
    'BACKUP_SET_REGION_INVALID',
  );
  validateFingerprint(payload.profileFingerprint, 'BACKUP_SET_PROFILE_INVALID');
  if (expectedProfileFingerprint) {
    assert(payload.profileFingerprint === expectedProfileFingerprint, 'BACKUP_SET_PROFILE_INVALID');
  }
  validateFingerprint(payload.databaseTargetFingerprint, 'BACKUP_SET_TARGET_INVALID');
  validateFingerprint(payload.objectStoreTargetFingerprint, 'BACKUP_SET_TARGET_INVALID');

  const captureStartedAt = timestamp(payload.captureStartedAt, 'BACKUP_SET_CAPTURE_WINDOW_INVALID');
  const captureEndedAt = timestamp(payload.captureEndedAt, 'BACKUP_SET_CAPTURE_WINDOW_INVALID');
  assert(
    captureStartedAt <= captureEndedAt &&
      captureEndedAt - captureStartedAt <= MAX_CAPTURE_WINDOW_MS,
    'BACKUP_SET_CAPTURE_WINDOW_INVALID',
  );
  if (enforceFreshness) {
    const current = now instanceof Date ? now.getTime() : Number.NaN;
    assert(
      Number.isFinite(current) &&
        captureEndedAt <= current + CLOCK_SKEW_MS &&
        current - captureEndedAt <= MAX_FRESHNESS_MS,
      'BACKUP_SET_STALE',
    );
  }

  exactKeys(payload.pitr, PITR_KEYS, 'PITR_RECEIPT_INVALID');
  opaqueReference(payload.pitr.receiptReference, 'PITR_RECEIPT_INVALID');
  assert(
    payload.pitr.region === payload.region &&
      payload.pitr.status === 'AVAILABLE' &&
      payload.pitr.encrypted === true &&
      payload.pitr.immutable === true,
    'PITR_RECEIPT_INVALID',
  );
  validateCaptureTime(
    payload.pitr.capturedAt,
    captureStartedAt,
    captureEndedAt,
    'PITR_RECEIPT_INVALID',
  );
  const restorePointAt = timestamp(payload.pitr.restorePointAt, 'PITR_RECEIPT_INVALID');
  assert(
    restorePointAt <= captureEndedAt && captureEndedAt - restorePointAt <= MAX_FRESHNESS_MS,
    'PITR_RECEIPT_INVALID',
  );

  exactKeys(payload.portableDatabase, PORTABLE_KEYS, 'PORTABLE_BACKUP_INVALID');
  opaqueReference(payload.portableDatabase.receiptReference, 'PORTABLE_BACKUP_INVALID');
  assert(
    payload.portableDatabase.region === payload.region &&
      payload.portableDatabase.postgresqlMajor === 16 &&
      payload.portableDatabase.format === 'custom' &&
      payload.portableDatabase.encrypted === true &&
      payload.portableDatabase.immutable === true,
    'PORTABLE_BACKUP_INVALID',
  );
  validateCaptureTime(
    payload.portableDatabase.capturedAt,
    captureStartedAt,
    captureEndedAt,
    'PORTABLE_BACKUP_INVALID',
  );
  validateFingerprint(payload.portableDatabase.sha256, 'PORTABLE_BACKUP_INVALID');
  boundedBytes(payload.portableDatabase.bytes, 'PORTABLE_BACKUP_INVALID');

  assert(
    Array.isArray(payload.objects) &&
      payload.objects.length >= 1 &&
      payload.objects.length <= MAX_OBJECTS,
    'OBJECT_INVENTORY_INVALID',
  );
  const references = new Set();
  for (const entry of payload.objects) {
    exactKeys(entry, OBJECT_KEYS, 'OBJECT_INVENTORY_INVALID');
    opaqueReference(entry.reference, 'OBJECT_REFERENCE_INVALID');
    assert(!references.has(entry.reference), 'OBJECT_REFERENCE_INVALID');
    references.add(entry.reference);
    validateFingerprint(entry.versionFingerprint, 'OBJECT_VERSION_INVALID');
    validateFingerprint(entry.sha256, 'OBJECT_HASH_INVALID');
    boundedBytes(entry.bytes, 'OBJECT_SIZE_INVALID');
    validateCaptureTime(
      entry.capturedAt,
      captureStartedAt,
      captureEndedAt,
      'OBJECT_CAPTURE_INVALID',
    );
    assert(
      entry.region === payload.region &&
        entry.encrypted === true &&
        entry.immutable === true &&
        entry.versioned === true &&
        entry.referenceKind === 'exact-version',
      'OBJECT_INVENTORY_INVALID',
    );
  }
  return payload;
}

function unsignedPayload(input, options) {
  exactKeys(input, INPUT_KEYS, 'BACKUP_SET_INPUT_SCHEMA_INVALID');
  assert(
    input.schemaVersion === 'amic-vault.sf20-backup-set-input.v1',
    'BACKUP_SET_INPUT_SCHEMA_INVALID',
  );
  const payload = {
    ...structuredClone(input),
    schemaVersion: 'amic-vault.sf20-backup-set-unsigned.v1',
    status: 'COMPLETE',
    objects: [...input.objects].sort((left, right) =>
      left.reference.localeCompare(right.reference),
    ),
  };
  return validateUnsignedPayload(payload, {
    ...options,
    enforceFreshness: true,
  });
}

export function measurePortableBackupBytes(bytes) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 1, 'PORTABLE_BACKUP_BYTES_INVALID');
  boundedBytes(bytes.length, 'PORTABLE_BACKUP_BYTES_INVALID');
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

export async function measurePortableBackupFile(path) {
  assert(typeof path === 'string' && isAbsolute(path) && !path.includes('\0'), 'FILE_PATH_INVALID');
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const metadata = fstatSync(descriptor);
    const mode = metadata.mode & 0o777;
    const expectedUid = process.getuid?.();
    assert(
      metadata.isFile() &&
        metadata.size >= 1 &&
        metadata.size <= MAX_COMPONENT_BYTES &&
        (mode & 0o077) === 0 &&
        (mode & 0o400) !== 0 &&
        (metadata.uid === 0 || (expectedUid !== undefined && metadata.uid === expectedUid)),
      'PORTABLE_BACKUP_FILE_INVALID',
    );
    const digest = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(path, { fd: descriptor, autoClose: false })) {
      bytes += chunk.length;
      assert(bytes <= MAX_COMPONENT_BYTES, 'PORTABLE_BACKUP_FILE_INVALID');
      digest.update(chunk);
    }
    assert(bytes === metadata.size, 'PORTABLE_BACKUP_FILE_INVALID');
    return { bytes, sha256: digest.digest('hex') };
  } catch (error) {
    if (error instanceof BackupSetError) throw error;
    fail('PORTABLE_BACKUP_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function publicKeyFingerprint(key) {
  const publicKey = key.type === 'public' ? key : createPublicKey(key);
  assert(publicKey.asymmetricKeyType === 'ed25519', 'SIGNING_KEY_TYPE_INVALID');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return { publicKey, fingerprint: `sha256:${sha256(der)}` };
}

function readBoundedFile(path, maximumBytes, confidential) {
  assert(typeof path === 'string' && isAbsolute(path) && !path.includes('\0'), 'FILE_PATH_INVALID');
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const metadata = fstatSync(descriptor);
    assert(
      metadata.isFile() && metadata.size >= 1 && metadata.size <= maximumBytes,
      'FILE_INVALID',
    );
    const mode = metadata.mode & 0o777;
    if (confidential) {
      assert((mode & 0o077) === 0 && (mode & 0o400) !== 0, 'FILE_MODE_INVALID');
      const expectedUid = process.getuid?.();
      assert(
        metadata.uid === 0 || (expectedUid !== undefined && metadata.uid === expectedUid),
        'FILE_OWNER_INVALID',
      );
    }
    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    assert(bytesRead >= 1 && bytesRead <= maximumBytes, 'FILE_INVALID');
    return buffer.subarray(0, bytesRead);
  } catch (error) {
    if (error instanceof BackupSetError) throw error;
    fail('FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function privateKeyFromFile(path) {
  const material = readBoundedFile(path, MAX_KEY_BYTES, true);
  try {
    const key = createPrivateKey(material);
    assert(key.asymmetricKeyType === 'ed25519', 'SIGNING_KEY_TYPE_INVALID');
    return key;
  } catch (error) {
    if (error instanceof BackupSetError) throw error;
    fail('SIGNING_KEY_INVALID');
  }
}

function publicKeyFromFile(path) {
  const material = readBoundedFile(path, MAX_KEY_BYTES, false);
  try {
    const key = createPublicKey(material);
    assert(key.asymmetricKeyType === 'ed25519', 'SIGNING_KEY_TYPE_INVALID');
    return key;
  } catch (error) {
    if (error instanceof BackupSetError) throw error;
    fail('VERIFICATION_KEY_INVALID');
  }
}

export function buildBackupSetManifest({
  input,
  portableBackupMeasurement,
  signingPrivateKeyPath,
  verificationPublicKeyPath,
  expectedRegion,
  expectedCountry = 'KR',
  expectedProfileFingerprint,
  revokedKeyFingerprints = [],
  now = new Date(),
}) {
  assert(
    typeof expectedRegion === 'string' && REGION.test(expectedRegion),
    'APPROVED_REGION_REQUIRED',
  );
  assert(expectedCountry === 'KR', 'APPROVED_COUNTRY_REQUIRED');
  validateFingerprint(expectedProfileFingerprint, 'EXPECTED_PROFILE_REQUIRED');
  const payload = unsignedPayload(input, {
    expectedRegion,
    expectedCountry,
    expectedProfileFingerprint,
    now,
  });
  assert(
    portableBackupMeasurement?.sha256 === payload.portableDatabase.sha256 &&
      portableBackupMeasurement?.bytes === payload.portableDatabase.bytes,
    'PORTABLE_BACKUP_BYTES_MISMATCH',
  );
  const privateKey = privateKeyFromFile(signingPrivateKeyPath);
  const { publicKey, fingerprint } = publicKeyFingerprint(privateKey);
  assert(
    Array.isArray(revokedKeyFingerprints) &&
      revokedKeyFingerprints.every((value) => /^sha256:[a-f0-9]{64}$/u.test(value)) &&
      !revokedKeyFingerprints.includes(fingerprint),
    'SIGNING_KEY_REVOKED',
  );
  const expectedPublicKey = publicKeyFromFile(verificationPublicKeyPath);
  const expected = publicKeyFingerprint(expectedPublicKey);
  assert(expected.fingerprint === fingerprint, 'VERIFICATION_KEY_MISMATCH');

  const canonical = Buffer.from(stableStringify(payload));
  const signature = sign(null, canonical, privateKey).toString('base64url');
  assert(
    verify(null, canonical, publicKey, Buffer.from(signature, 'base64url')),
    'SIGNATURE_INVALID',
  );
  const manifest = {
    schemaVersion: 'amic-vault.sf20-backup-set-manifest.v1',
    unsigned: payload,
    unsignedPayloadSha256: sha256(canonical),
    signing: {
      algorithm: 'ed25519',
      keyFingerprint: fingerprint,
      signature,
    },
  };
  verifyBackupSetManifest({
    manifest,
    verificationPublicKey: expectedPublicKey,
    expectedRegion,
    expectedCountry,
    expectedProfileFingerprint,
    revokedKeyFingerprints,
  });
  return manifest;
}

export function verifyBackupSetManifest({
  manifest,
  verificationPublicKey,
  verificationPublicKeyPath,
  expectedRegion,
  expectedCountry = 'KR',
  expectedProfileFingerprint,
  revokedKeyFingerprints = [],
}) {
  exactKeys(
    manifest,
    ['schemaVersion', 'unsigned', 'unsignedPayloadSha256', 'signing'],
    'MANIFEST_SCHEMA_INVALID',
  );
  exactKeys(
    manifest.signing,
    ['algorithm', 'keyFingerprint', 'signature'],
    'MANIFEST_SCHEMA_INVALID',
  );
  assert(
    manifest.schemaVersion === 'amic-vault.sf20-backup-set-manifest.v1' &&
      manifest.signing.algorithm === 'ed25519' &&
      /^sha256:[a-f0-9]{64}$/u.test(manifest.signing.keyFingerprint) &&
      /^[A-Za-z0-9_-]{80,120}$/u.test(manifest.signing.signature),
    'MANIFEST_SCHEMA_INVALID',
  );
  validateUnsignedPayload(manifest.unsigned, {
    expectedRegion,
    expectedCountry,
    expectedProfileFingerprint,
  });
  const publicKey =
    verificationPublicKey ??
    (verificationPublicKeyPath ? publicKeyFromFile(verificationPublicKeyPath) : undefined);
  assert(publicKey, 'VERIFICATION_KEY_REQUIRED');
  const expected = publicKeyFingerprint(publicKey);
  assert(expected.fingerprint === manifest.signing.keyFingerprint, 'VERIFICATION_KEY_MISMATCH');
  assert(
    Array.isArray(revokedKeyFingerprints) &&
      revokedKeyFingerprints.every((value) => /^sha256:[a-f0-9]{64}$/u.test(value)) &&
      !revokedKeyFingerprints.includes(expected.fingerprint),
    'SIGNING_KEY_REVOKED',
  );
  const canonical = Buffer.from(stableStringify(manifest.unsigned));
  assert(sha256(canonical) === manifest.unsignedPayloadSha256, 'MANIFEST_HASH_MISMATCH');
  assert(
    verify(null, canonical, publicKey, Buffer.from(manifest.signing.signature, 'base64url')),
    'SIGNATURE_INVALID',
  );
  return {
    status: 'COMPLETE',
    backupSetId: manifest.unsigned.backupSetId,
    unsignedPayloadSha256: manifest.unsignedPayloadSha256,
    signingKeyFingerprint: manifest.signing.keyFingerprint,
    objectCount: manifest.unsigned.objects.length,
  };
}

function safeJson(path) {
  const body = readBoundedFile(path, MAX_INPUT_BYTES, false);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    fail('BACKUP_SET_INPUT_JSON_INVALID');
  }
}

function atomicWrite(path, value) {
  assert(typeof path === 'string' && isAbsolute(path), 'OUTPUT_PATH_INVALID');
  assert(!existsSync(path), 'OUTPUT_ALREADY_EXISTS');
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    if (error instanceof BackupSetError) throw error;
    fail('OUTPUT_WRITE_FAILED');
  }
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      'portable-backup': { type: 'string' },
      'signing-key': { type: 'string' },
      'verification-key': { type: 'string' },
      'approved-region': { type: 'string' },
      country: { type: 'string', default: 'KR' },
      'profile-fingerprint': { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  for (const name of [
    'input',
    'portable-backup',
    'signing-key',
    'verification-key',
    'approved-region',
    'profile-fingerprint',
  ]) {
    assert(values[name], 'CLI_OPTION_REQUIRED');
  }
  return values;
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  try {
    const options = parseCli(argv);
    if (options.help) {
      stdout.write(
        'Usage: build-backup-set-manifest.mjs --input FILE --portable-backup FILE --signing-key FILE --verification-key FILE --approved-region REGION --profile-fingerprint SHA256 [--output FILE]\n',
      );
      return 0;
    }
    const input = safeJson(options.input);
    const portableBackupMeasurement = await measurePortableBackupFile(
      resolve(options['portable-backup']),
    );
    const manifest = buildBackupSetManifest({
      input,
      portableBackupMeasurement,
      signingPrivateKeyPath: resolve(options['signing-key']),
      verificationPublicKeyPath: resolve(options['verification-key']),
      expectedRegion: options['approved-region'],
      expectedCountry: options.country,
      expectedProfileFingerprint: options['profile-fingerprint'],
      now: deps.now ?? new Date(),
    });
    if (options.output) atomicWrite(resolve(options.output), manifest);
    else stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `${JSON.stringify({
        status: 'FAILED',
        code: error instanceof BackupSetError ? error.code : 'BACKUP_SET_BUILD_FAILED',
      })}\n`,
    );
    return 1;
  }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) process.exitCode = await main();
