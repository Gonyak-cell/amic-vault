#!/usr/bin/env node

import { createHash, createPublicKey, verify } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { stableStringify } from './build-backup-set-manifest.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const KEY_FINGERPRINT = /^sha256:[a-f0-9]{64}$/u;
const REGION = /^[a-z]{2}-[a-z0-9][a-z0-9-]{1,47}-[1-9][0-9]?$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{80,120}$/u;
const REQUIRED_SURFACES = Object.freeze([
  'app',
  'backup',
  'database',
  'object-storage',
  'secret-key',
]);
const ALL_SURFACES = Object.freeze([...REQUIRED_SURFACES, 'telemetry']);
const RECEIPT_PAYLOAD_KEYS = Object.freeze([
  'schemaVersion',
  'surface',
  'country',
  'region',
  'profileFingerprint',
  'capturedAt',
  'validUntil',
  'status',
]);
const INPUT_KEYS = Object.freeze([
  'schemaVersion',
  'approvedCountry',
  'approvedRegion',
  'profileFingerprint',
  'evaluatedAt',
  'timing',
  'receipts',
]);
const TIMING_KEYS = Object.freeze([
  'incidentCutoffAt',
  'restorePointAt',
  'drillStartedAt',
  'verifiedReadyAt',
  'monotonicRtoSeconds',
]);
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_RPO_SECONDS = 60 * 60;
const MAX_RTO_SECONDS = 4 * 60 * 60;

export class ResidencyError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ResidencyError';
    this.code = code;
  }
}

function fail(code) {
  throw new ResidencyError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function exactKeys(value, expected, code) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  const actual = Object.keys(value);
  assert(
    actual.length === expected.length &&
      actual.every((key) => expected.includes(key)) &&
      expected.every((key) => actual.includes(key)),
    code,
  );
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

function receiptPayload(receipt) {
  return Object.fromEntries(RECEIPT_PAYLOAD_KEYS.map((key) => [key, receipt[key]]));
}

function publicKeyFingerprint(publicKey) {
  const key = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey);
  assert(key.asymmetricKeyType === 'ed25519', 'RECEIPT_SIGNING_KEY_INVALID');
  const der = key.export({ format: 'der', type: 'spki' });
  return {
    key,
    fingerprint: `sha256:${sha256(der)}`,
  };
}

function resolveTrustedKey(trustedSigningKeys, fingerprint) {
  const candidate =
    trustedSigningKeys instanceof Map
      ? trustedSigningKeys.get(fingerprint)
      : trustedSigningKeys?.[fingerprint];
  assert(candidate, 'RECEIPT_SIGNING_KEY_UNTRUSTED');
  const resolved = publicKeyFingerprint(candidate);
  assert(resolved.fingerprint === fingerprint, 'RECEIPT_SIGNING_KEY_UNTRUSTED');
  return resolved.key;
}

export function sealHashedResidencyReceipt(payload) {
  exactKeys(payload, RECEIPT_PAYLOAD_KEYS, 'RECEIPT_SCHEMA_INVALID');
  return {
    ...structuredClone(payload),
    integrity: {
      kind: 'sha256',
      payloadSha256: sha256(stableStringify(payload)),
    },
  };
}

export function validateResidencyReceipt({
  receipt,
  approvedCountry,
  approvedRegion,
  profileFingerprint,
  evaluatedAt,
  trustedSigningKeys,
}) {
  exactKeys(receipt, [...RECEIPT_PAYLOAD_KEYS, 'integrity'], 'RECEIPT_SCHEMA_INVALID');
  const payload = receiptPayload(receipt);
  exactKeys(payload, RECEIPT_PAYLOAD_KEYS, 'RECEIPT_SCHEMA_INVALID');
  assert(
    payload.schemaVersion === 'amic-vault.sf20-residency-receipt.v1' &&
      ALL_SURFACES.includes(payload.surface) &&
      payload.status === 'VERIFIED',
    'RECEIPT_SCHEMA_INVALID',
  );
  assert(
    payload.country === approvedCountry &&
      payload.region === approvedRegion &&
      payload.profileFingerprint === profileFingerprint,
    'RECEIPT_RESIDENCY_MISMATCH',
  );
  assert(
    payload.country === 'KR' &&
      REGION.test(payload.region) &&
      HASH.test(payload.profileFingerprint),
    'RECEIPT_RESIDENCY_INVALID',
  );

  const evaluated = timestamp(evaluatedAt, 'EVALUATION_TIME_INVALID');
  const captured = timestamp(payload.capturedAt, 'RECEIPT_TIME_INVALID');
  const validUntil = timestamp(payload.validUntil, 'RECEIPT_TIME_INVALID');
  assert(
    captured <= validUntil &&
      captured <= evaluated + MAX_CLOCK_SKEW_MS &&
      evaluated - captured <= MAX_RECEIPT_AGE_MS &&
      evaluated <= validUntil,
    'RECEIPT_STALE',
  );

  const canonical = Buffer.from(stableStringify(payload));
  if (receipt.integrity?.kind === 'sha256') {
    exactKeys(receipt.integrity, ['kind', 'payloadSha256'], 'RECEIPT_INTEGRITY_INVALID');
    assert(
      HASH.test(receipt.integrity.payloadSha256) &&
        receipt.integrity.payloadSha256 === sha256(canonical),
      'RECEIPT_HASH_INVALID',
    );
  } else if (receipt.integrity?.kind === 'ed25519') {
    exactKeys(
      receipt.integrity,
      ['kind', 'keyFingerprint', 'signature'],
      'RECEIPT_INTEGRITY_INVALID',
    );
    assert(
      KEY_FINGERPRINT.test(receipt.integrity.keyFingerprint) &&
        SIGNATURE.test(receipt.integrity.signature),
      'RECEIPT_SIGNATURE_INVALID',
    );
    const publicKey = resolveTrustedKey(trustedSigningKeys, receipt.integrity.keyFingerprint);
    assert(
      verify(null, canonical, publicKey, Buffer.from(receipt.integrity.signature, 'base64url')),
      'RECEIPT_SIGNATURE_INVALID',
    );
  } else {
    fail('RECEIPT_INTEGRITY_INVALID');
  }
  return {
    surface: payload.surface,
    integrityKind: receipt.integrity.kind,
    receiptFingerprint: sha256(
      stableStringify({
        payload,
        integrity: receipt.integrity,
      }),
    ),
  };
}

export function deriveRecoveryMeasurements(timing) {
  exactKeys(timing, TIMING_KEYS, 'RECOVERY_TIMING_SCHEMA_INVALID');
  const incidentCutoff = timestamp(timing.incidentCutoffAt, 'RECOVERY_TIMING_INVALID');
  const restorePoint = timestamp(timing.restorePointAt, 'RECOVERY_TIMING_INVALID');
  const drillStarted = timestamp(timing.drillStartedAt, 'RECOVERY_TIMING_INVALID');
  const verifiedReady = timestamp(timing.verifiedReadyAt, 'RECOVERY_TIMING_INVALID');
  assert(
    restorePoint <= incidentCutoff && drillStarted <= verifiedReady,
    'RECOVERY_CLOCK_INVERSION',
  );
  const rpoMilliseconds = incidentCutoff - restorePoint;
  const rtoMilliseconds = verifiedReady - drillStarted;
  assert(
    rpoMilliseconds % 1000 === 0 && rtoMilliseconds % 1000 === 0,
    'RECOVERY_SUBSECOND_AMBIGUOUS',
  );
  const rpoSeconds = rpoMilliseconds / 1000;
  const rtoSeconds = rtoMilliseconds / 1000;
  assert(
    Number.isSafeInteger(timing.monotonicRtoSeconds) &&
      timing.monotonicRtoSeconds >= 0 &&
      timing.monotonicRtoSeconds === rtoSeconds,
    'RECOVERY_MONOTONIC_MISMATCH',
  );
  assert(rpoSeconds <= MAX_RPO_SECONDS, 'RPO_CEILING_EXCEEDED');
  assert(rtoSeconds <= MAX_RTO_SECONDS, 'RTO_CEILING_EXCEEDED');
  return {
    rpoSeconds,
    rpoCeilingSeconds: MAX_RPO_SECONDS,
    rtoSeconds,
    rtoCeilingSeconds: MAX_RTO_SECONDS,
  };
}

export function checkSf20Residency(input, { requireTelemetry = false, trustedSigningKeys } = {}) {
  exactKeys(input, INPUT_KEYS, 'RESIDENCY_INPUT_SCHEMA_INVALID');
  assert(
    input.schemaVersion === 'amic-vault.sf20-residency-input.v1' &&
      input.approvedCountry === 'KR' &&
      REGION.test(input.approvedRegion) &&
      HASH.test(input.profileFingerprint),
    'RESIDENCY_PROFILE_INVALID',
  );
  timestamp(input.evaluatedAt, 'EVALUATION_TIME_INVALID');
  assert(
    Array.isArray(input.receipts) &&
      input.receipts.length >= 1 &&
      input.receipts.length <= ALL_SURFACES.length,
    'RESIDENCY_RECEIPTS_INVALID',
  );

  const validated = input.receipts.map((receipt) =>
    validateResidencyReceipt({
      receipt,
      approvedCountry: input.approvedCountry,
      approvedRegion: input.approvedRegion,
      profileFingerprint: input.profileFingerprint,
      evaluatedAt: input.evaluatedAt,
      trustedSigningKeys,
    }),
  );
  const surfaces = validated.map(({ surface }) => surface);
  assert(new Set(surfaces).size === surfaces.length, 'RESIDENCY_RECEIPT_DUPLICATE');
  const required = requireTelemetry ? [...REQUIRED_SURFACES, 'telemetry'] : REQUIRED_SURFACES;
  assert(
    required.every((surface) => surfaces.includes(surface)),
    'RESIDENCY_RECEIPT_MISSING',
  );
  const sorted = [...validated].sort((left, right) => left.surface.localeCompare(right.surface));
  const measurements = deriveRecoveryMeasurements(input.timing);
  const result = {
    schemaVersion: 'amic-vault.sf20-residency-result.v1',
    status: 'TECHNICAL_PASS',
    approvedCountry: input.approvedCountry,
    approvedRegion: input.approvedRegion,
    profileFingerprint: input.profileFingerprint,
    receiptCount: sorted.length,
    surfaces: sorted.map(({ surface, integrityKind }) => ({
      surface,
      integrityKind,
      residency: 'VERIFIED',
    })),
    receiptsHash: sha256(stableStringify(sorted)),
    measurements,
    deploymentReady: false,
    deploymentStatus: 'EXTERNAL_BLOCKED_APPROVED_STAGING_ROLLBACK_RECEIPT_REQUIRED',
    nonClaims: ['NO_PROVIDER_RESOURCE_MUTATION', 'NO_STAGING_DEPLOYMENT', 'NO_RELEASE_OR_GO_LIVE'],
  };
  return {
    ...result,
    resultHash: sha256(stableStringify(result)),
  };
}

function readBoundedJson(path) {
  assert(typeof path === 'string' && path && !path.includes('\0'), 'INPUT_FILE_INVALID');
  let descriptor;
  try {
    descriptor = openSync(
      resolve(path),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const metadata = fstatSync(descriptor);
    assert(
      metadata.isFile() && metadata.size >= 1 && metadata.size <= MAX_INPUT_BYTES,
      'INPUT_FILE_INVALID',
    );
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error instanceof ResidencyError) throw error;
    fail('INPUT_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      'require-telemetry': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  assert(values.input, 'CLI_OPTION_REQUIRED');
  return values;
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  try {
    const options = parseCli(argv);
    if (options.help) {
      stdout.write('Usage: check-sf20-residency.mjs --input FILE [--require-telemetry]\n');
      return 0;
    }
    const result = checkSf20Residency(deps.input ?? readBoundedJson(options.input), {
      requireTelemetry: options['require-telemetry'],
      trustedSigningKeys: deps.trustedSigningKeys,
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `${JSON.stringify({
        status: 'FAILED',
        code: error instanceof ResidencyError ? error.code : 'RESIDENCY_CHECK_FAILED',
      })}\n`,
    );
    return 1;
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) process.exitCode = main();
