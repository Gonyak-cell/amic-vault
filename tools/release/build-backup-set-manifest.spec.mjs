import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  BackupSetError,
  buildBackupSetManifest,
  main,
  measurePortableBackupBytes,
  verifyBackupSetManifest,
} from './build-backup-set-manifest.mjs';

const region = 'kr-test-1';
const country = 'KR';
const profileFingerprint = 'a'.repeat(64);
const portableBytes = Buffer.from('synthetic-postgresql-16-custom-backup');
const objectBody = Buffer.from('synthetic-versioned-object');
const portableMeasurement = measurePortableBackupBytes(portableBytes);
const hash = (value) => createHash('sha256').update(value).digest('hex');
let root;
let privateKeyPath;
let publicKeyPath;
let wrongPublicKeyPath;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'amic-vault-backup-set-'));
  const pair = generateKeyPairSync('ed25519');
  const wrong = generateKeyPairSync('ed25519');
  privateKeyPath = join(root, 'signing-private.pem');
  publicKeyPath = join(root, 'signing-public.pem');
  wrongPublicKeyPath = join(root, 'wrong-public.pem');
  writeFileSync(privateKeyPath, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }), {
    mode: 0o600,
  });
  writeFileSync(publicKeyPath, pair.publicKey.export({ format: 'pem', type: 'spki' }), {
    mode: 0o644,
  });
  writeFileSync(wrongPublicKeyPath, wrong.publicKey.export({ format: 'pem', type: 'spki' }), {
    mode: 0o644,
  });
  chmodSync(privateKeyPath, 0o600);
  chmodSync(publicKeyPath, 0o644);
  chmodSync(wrongPublicKeyPath, 0o644);
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

function inputFixture() {
  return {
    schemaVersion: 'amic-vault.sf20-backup-set-input.v1',
    backupSetId: 'bset-synthetic-0001',
    country,
    region,
    captureStartedAt: '2026-07-23T00:00:00Z',
    captureEndedAt: '2026-07-23T00:30:00Z',
    profileFingerprint,
    databaseTargetFingerprint: 'b'.repeat(64),
    objectStoreTargetFingerprint: 'c'.repeat(64),
    pitr: {
      receiptReference: 'ref-pitr-receipt-0001',
      region,
      capturedAt: '2026-07-23T00:10:00Z',
      restorePointAt: '2026-07-23T00:05:00Z',
      status: 'AVAILABLE',
      encrypted: true,
      immutable: true,
    },
    portableDatabase: {
      receiptReference: 'ref-portable-backup-0001',
      region,
      capturedAt: '2026-07-23T00:20:00Z',
      postgresqlMajor: 16,
      format: 'custom',
      sha256: portableMeasurement.sha256,
      bytes: portableMeasurement.bytes,
      encrypted: true,
      immutable: true,
    },
    objects: [
      {
        reference: 'ref-blob-version-0001',
        versionFingerprint: 'd'.repeat(64),
        region,
        capturedAt: '2026-07-23T00:25:00Z',
        sha256: hash(objectBody),
        bytes: objectBody.length,
        encrypted: true,
        immutable: true,
        versioned: true,
        referenceKind: 'exact-version',
      },
    ],
  };
}

function build(overrides = {}) {
  return buildBackupSetManifest({
    input: inputFixture(),
    portableBackupMeasurement: portableMeasurement,
    signingPrivateKeyPath: privateKeyPath,
    verificationPublicKeyPath: publicKeyPath,
    expectedRegion: region,
    expectedCountry: country,
    expectedProfileFingerprint: profileFingerprint,
    now: new Date('2026-07-23T00:45:00Z'),
    ...overrides,
  });
}

function buildFails(mutator, code, overrides = {}) {
  const input = inputFixture();
  mutator(input);
  assert.throws(
    () => build({ input, ...overrides }),
    (error) => error instanceof BackupSetError && error.code === code,
  );
}

describe('signed SF20 backup-set manifest', () => {
  it('is deterministic, complete, offline-verifiable, and value-free', () => {
    const first = build();
    const second = build();
    assert.deepEqual(first, second);
    const verdict = verifyBackupSetManifest({
      manifest: first,
      verificationPublicKeyPath: publicKeyPath,
      expectedRegion: region,
      expectedCountry: country,
      expectedProfileFingerprint: profileFingerprint,
    });
    assert.equal(verdict.status, 'COMPLETE');
    assert.equal(verdict.objectCount, 1);
    assert.match(first.unsignedPayloadSha256, /^[a-f0-9]{64}$/u);
    assert.match(first.signing.keyFingerprint, /^sha256:[a-f0-9]{64}$/u);
    const rendered = JSON.stringify(first);
    for (const forbidden of [
      'postgres://',
      'https://',
      'arn:',
      'account-id',
      'tenant_id',
      'document_id',
      'object-key',
      privateKeyPath,
      portableBytes.toString('utf8'),
      objectBody.toString('utf8'),
    ]) {
      assert.equal(rendered.includes(forbidden), false);
    }
  });

  it('rejects missing partial empty and unknown component schemas', () => {
    buildFails((input) => delete input.pitr, 'BACKUP_SET_INPUT_SCHEMA_INVALID');
    buildFails((input) => delete input.portableDatabase, 'BACKUP_SET_INPUT_SCHEMA_INVALID');
    buildFails((input) => {
      input.objects = [];
    }, 'OBJECT_INVENTORY_INVALID');
    buildFails((input) => {
      input.providerReceiptBody = 'forbidden';
    }, 'BACKUP_SET_INPUT_SCHEMA_INVALID');
    buildFails((input) => {
      input.schemaVersion = 'unknown';
    }, 'BACKUP_SET_INPUT_SCHEMA_INVALID');
    buildFails((input) => {
      input.pitr.unknown = true;
    }, 'PITR_RECEIPT_INVALID');
  });

  it('hashes portable bytes directly and rejects byte hash or size drift', () => {
    assert.throws(
      () =>
        build({
          portableBackupMeasurement: measurePortableBackupBytes(
            Buffer.from('tampered-postgresql-backup'),
          ),
        }),
      (error) => error instanceof BackupSetError && error.code === 'PORTABLE_BACKUP_BYTES_MISMATCH',
    );
    buildFails((input) => {
      input.portableDatabase.sha256 = 'e'.repeat(64);
    }, 'PORTABLE_BACKUP_BYTES_MISMATCH');
    buildFails((input) => {
      input.portableDatabase.bytes += 1;
    }, 'PORTABLE_BACKUP_BYTES_MISMATCH');
  });

  it('rejects wrong PostgreSQL version and unencrypted or mutable components', () => {
    buildFails((input) => {
      input.portableDatabase.postgresqlMajor = 15;
    }, 'PORTABLE_BACKUP_INVALID');
    buildFails((input) => {
      input.portableDatabase.encrypted = false;
    }, 'PORTABLE_BACKUP_INVALID');
    buildFails((input) => {
      input.pitr.immutable = false;
    }, 'PITR_RECEIPT_INVALID');
    buildFails((input) => {
      input.objects[0].encrypted = false;
    }, 'OBJECT_INVENTORY_INVALID');
    buildFails((input) => {
      input.objects[0].versioned = false;
    }, 'OBJECT_INVENTORY_INVALID');
  });

  it('rejects latest mutable malformed and duplicate object inventory entries', () => {
    buildFails((input) => {
      input.objects[0].referenceKind = 'latest';
    }, 'OBJECT_INVENTORY_INVALID');
    buildFails((input) => {
      input.objects[0].sha256 = 'invalid';
    }, 'OBJECT_HASH_INVALID');
    buildFails((input) => {
      input.objects[0].bytes = 0;
    }, 'OBJECT_SIZE_INVALID');
    buildFails((input) => {
      input.objects.push(structuredClone(input.objects[0]));
    }, 'OBJECT_REFERENCE_INVALID');
    buildFails((input) => {
      input.objects[0].reference = 'ref-object-key-customer-0001';
    }, 'OBJECT_REFERENCE_INVALID');
  });

  it('rejects stale excessive cross-region and profile-drift captures', () => {
    buildFails(() => undefined, 'BACKUP_SET_STALE', { now: new Date('2026-07-23T02:00:01Z') });
    buildFails((input) => {
      input.captureEndedAt = '2026-07-23T01:00:01Z';
    }, 'BACKUP_SET_CAPTURE_WINDOW_INVALID');
    buildFails((input) => {
      input.pitr.region = 'kr-other-1';
    }, 'PITR_RECEIPT_INVALID');
    buildFails((input) => {
      input.objects[0].region = 'kr-other-1';
    }, 'OBJECT_INVENTORY_INVALID');
    buildFails((input) => {
      input.profileFingerprint = 'f'.repeat(64);
    }, 'BACKUP_SET_PROFILE_INVALID');
    buildFails((input) => {
      input.objects[0].capturedAt = '2026-07-23T00:31:00Z';
    }, 'OBJECT_CAPTURE_INVALID');
  });

  it('detects any signed-field tamper and rejects unsigned wrong or revoked keys', () => {
    const manifest = build();
    const tampered = structuredClone(manifest);
    tampered.unsigned.objects[0].bytes += 1;
    assert.throws(
      () =>
        verifyBackupSetManifest({
          manifest: tampered,
          verificationPublicKeyPath: publicKeyPath,
          expectedRegion: region,
          expectedProfileFingerprint: profileFingerprint,
        }),
      (error) => error instanceof BackupSetError && error.code === 'MANIFEST_HASH_MISMATCH',
    );
    assert.throws(
      () =>
        verifyBackupSetManifest({
          manifest,
          verificationPublicKeyPath: wrongPublicKeyPath,
        }),
      (error) => error instanceof BackupSetError && error.code === 'VERIFICATION_KEY_MISMATCH',
    );
    assert.throws(
      () =>
        verifyBackupSetManifest({
          manifest,
          verificationPublicKeyPath: publicKeyPath,
          revokedKeyFingerprints: [manifest.signing.keyFingerprint],
        }),
      (error) => error instanceof BackupSetError && error.code === 'SIGNING_KEY_REVOKED',
    );
    const unsigned = structuredClone(manifest);
    delete unsigned.signing;
    assert.throws(
      () =>
        verifyBackupSetManifest({
          manifest: unsigned,
          verificationPublicKeyPath: publicKeyPath,
        }),
      (error) => error instanceof BackupSetError && error.code === 'MANIFEST_SCHEMA_INVALID',
    );
  });

  it('requires a regular private Ed25519 key with owner-only mode', () => {
    const weak = join(root, 'weak-private.pem');
    writeFileSync(weak, readFileSync(privateKeyPath), { mode: 0o644 });
    chmodSync(weak, 0o644);
    assert.throws(
      () => build({ signingPrivateKeyPath: weak }),
      (error) => error instanceof BackupSetError && error.code === 'FILE_MODE_INVALID',
    );
    const link = join(root, 'linked-private.pem');
    symlinkSync(privateKeyPath, link);
    assert.throws(
      () => build({ signingPrivateKeyPath: link }),
      (error) => error instanceof BackupSetError && error.code === 'FILE_INVALID',
    );
  });

  it('writes only a verified complete manifest and never overwrites it', async () => {
    const inputPath = join(root, 'input.json');
    const portablePath = join(root, 'portable.dump');
    const outputPath = join(root, 'complete-manifest.json');
    writeFileSync(inputPath, JSON.stringify(inputFixture()));
    writeFileSync(portablePath, portableBytes, { mode: 0o600 });
    chmodSync(portablePath, 0o600);
    let stdout = '';
    let stderr = '';
    const argv = [
      '--input',
      inputPath,
      '--portable-backup',
      portablePath,
      '--signing-key',
      privateKeyPath,
      '--verification-key',
      publicKeyPath,
      '--approved-region',
      region,
      '--profile-fingerprint',
      profileFingerprint,
      '--output',
      outputPath,
    ];
    assert.equal(
      await main(argv, {
        now: new Date('2026-07-23T00:45:00Z'),
        stdout: { write: (value) => (stdout += value) },
        stderr: { write: (value) => (stderr += value) },
      }),
      0,
    );
    assert.equal(stdout, '');
    assert.equal(stderr, '');
    const manifest = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(
      verifyBackupSetManifest({
        manifest,
        verificationPublicKeyPath: publicKeyPath,
        expectedRegion: region,
        expectedProfileFingerprint: profileFingerprint,
      }).status,
      'COMPLETE',
    );
    assert.equal(
      await main(argv, {
        now: new Date('2026-07-23T00:45:00Z'),
        stdout: { write: () => undefined },
        stderr: { write: (value) => (stderr += value) },
      }),
      1,
    );
    assert.match(stderr, /OUTPUT_ALREADY_EXISTS/u);
    assert.equal(stderr.includes(privateKeyPath), false);
  });
});
