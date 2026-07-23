import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { buildBackupSetManifest } from './build-backup-set-manifest.mjs';
import {
  BACKUP_TABLES,
  DrillError,
  hashJson,
  main,
  proveAuditImmutability,
  proveCrossTenantIsolation,
  proveExactObjectReadback,
  proveTenantTableProtection,
  runBackupRestoreDrill,
} from './backup-restore-drill.mjs';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '22222222-2222-4222-8222-222222222222';
const expectedRegion = 'kr-central-1';
const expectedProfileFingerprint = sha256('sf20-production-profile');
const fixedNow = new Date('2026-07-23T10:30:00.000Z');
const objectBytes = Buffer.from('synthetic exact-version bytes');
const portableBytes = Buffer.from('synthetic pg16 custom backup');
const testDirectory = mkdtempSync(join(tmpdir(), 'sf20-restore-drill-'));
const privateKeyPath = join(testDirectory, 'signing-private.pem');
const publicKeyPath = join(testDirectory, 'signing-public.pem');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
writeFileSync(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
chmodSync(privateKeyPath, 0o600);
writeFileSync(publicKeyPath, publicKey.export({ format: 'pem', type: 'spki' }), { mode: 0o644 });

after(() => rmSync(testDirectory, { recursive: true, force: true }));

const schemaRows = Object.freeze([
  [{ table_name: 'users', column_name: 'tenant_id', data_type: 'uuid', is_nullable: 'NO' }],
  [{ tablename: 'users', indexname: 'users_pkey', indexdef: 'CREATE UNIQUE INDEX users_pkey' }],
  [{ table_name: 'users', conname: 'users_pkey', definition: 'PRIMARY KEY (user_id)' }],
  [{ schemaname: 'public', tablename: 'users', policyname: 'tenant_isolation', cmd: 'ALL' }],
  [{ event_object_table: 'users', trigger_name: 'users_updated_at', action_timing: 'BEFORE' }],
]);
const changedSchemaRows = Object.freeze([
  ...schemaRows.slice(0, 3),
  [{ schemaname: 'public', tablename: 'users', policyname: 'tenant_isolation_v2', cmd: 'ALL' }],
  schemaRows[4],
]);

describe('backup-restore-drill direct recovery proof', () => {
  it('verifies sealed database, RLS, audit, cross-tenant, exact object, and cleanup proofs', async () => {
    const first = createHarness();
    const firstResult = await runHarness(first);

    assert.equal(firstResult.manifest.status, 'verified');
    assert.equal(firstResult.manifest.cleanup, 'VERIFIED');
    assert.equal(firstResult.manifest.tenantProtection.tableCount, BACKUP_TABLES.length);
    assert.equal(firstResult.manifest.auditImmutability.update, 'DENIED');
    assert.equal(firstResult.manifest.auditImmutability.delete, 'DENIED');
    assert.equal(firstResult.manifest.crossTenantIsolation.crossTenantRows, 0);
    assert.equal(firstResult.manifest.objectReadback.mode, 'EXACT_VERSION');
    assert.equal(first.cleanupCalls, 1);
    assert.equal(first.cleanupChecks, 1);

    const serialized = JSON.stringify(firstResult);
    assert.equal(serialized.includes(tenantId), false);
    assert.equal(serialized.includes(otherTenantId), false);
    assert.equal(serialized.includes('ref-entry-proof-0001'), false);
    assert.equal(serialized.includes(objectBytes.toString('utf8')), false);

    const second = createHarness();
    const secondResult = await runHarness(second);
    assert.equal(secondResult.manifest.drillManifestHash, firstResult.manifest.drillManifestHash);
    assert.equal(second.cleanupCalls, 1);
    assert.equal(second.cleanupChecks, 1);
  });

  it('records the API snapshot only after direct proof and verified cleanup', async () => {
    const sequence = [];
    const harness = createHarness({
      teardownRestore: async () => {
        sequence.push('teardown');
        harness.cleaned = true;
        harness.cleanupCalls += 1;
      },
      verifyRestoreCleanup: async () => {
        sequence.push('cleanup-verified');
        harness.cleanupChecks += 1;
        return harness.cleaned;
      },
    });
    const result = await runHarness(harness, {
      dryRun: false,
      apiBaseUrl: 'https://vault.invalid/v1',
      sessionCookie: 'amic_session=do-not-print',
      fetchImpl: async (url, init) => {
        sequence.push('snapshot');
        assert.equal(harness.cleaned, true);
        assert.equal(url, 'https://vault.invalid/v1/enterprise/backups/snapshots');
        const body = JSON.parse(init.body);
        assert.equal(body.status, 'verified');
        assert.equal(body.drillManifestHash, resultPlaceholder(body.drillManifestHash));
        return {
          ok: true,
          status: 200,
          async json() {
            return { backupSnapshotId: '33333333-3333-4333-8333-333333333333' };
          },
        };
      },
    });

    assert.deepEqual(sequence, ['teardown', 'cleanup-verified', 'snapshot']);
    assert.equal(result.snapshot.backupSnapshotId, '33333333-3333-4333-8333-333333333333');
    assert.equal(JSON.stringify(result).includes('do-not-print'), false);
  });

  it('rejects direct-proof mutations and still tears down every fixture', async (t) => {
    const cases = [
      {
        name: 'schema mismatch',
        mutate: (harness) => {
          harness.restoredClient.schemaPayload = changedSchemaRows;
        },
        code: 'schema_hash_mismatch',
      },
      {
        name: 'row-count mismatch',
        mutate: (harness) => {
          harness.restoredClient.rowCounts.documents += 1;
        },
        code: 'row_counts_mismatch',
      },
      {
        name: 'missing tenant table',
        mutate: (harness) => {
          harness.restoredClient.protectionRows = harness.restoredClient.protectionRows.slice(1);
        },
        code: 'tenant_table_missing',
      },
      {
        name: 'RLS disabled',
        mutate: (harness) => {
          harness.restoredClient.protectionRows[0].rls_enabled = false;
        },
        code: 'tenant_table_protection_failed',
      },
      {
        name: 'FORCE RLS disabled',
        mutate: (harness) => {
          harness.restoredClient.protectionRows[0].force_rls = false;
        },
        code: 'tenant_table_protection_failed',
      },
      {
        name: 'policy absent',
        mutate: (harness) => {
          harness.restoredClient.protectionRows[0].policy_count = '0';
        },
        code: 'tenant_table_protection_failed',
      },
      {
        name: 'audit update allowed',
        mutate: (harness) => {
          harness.runtimeClient.denyUpdate = false;
        },
        code: 'audit_mutation_not_denied',
      },
      {
        name: 'audit delete allowed',
        mutate: (harness) => {
          harness.runtimeClient.denyDelete = false;
        },
        code: 'audit_mutation_not_denied',
      },
      {
        name: 'runtime owner bypass',
        mutate: (harness) => {
          harness.runtimeClient.role.owns_documents = true;
        },
        code: 'runtime_role_unsafe',
      },
      {
        name: 'tenant context missing',
        mutate: (harness) => {
          harness.runtimeClient.contextMatches = false;
        },
        code: 'tenant_context_failed',
      },
      {
        name: 'cross-tenant row visible',
        mutate: (harness) => {
          harness.runtimeClient.crossRows = 1;
        },
        code: 'cross_tenant_rows_visible',
      },
      {
        name: 'latest object reader',
        mutate: (harness) => {
          harness.exactObjectReader.mode = 'latest';
        },
        code: 'exact_object_reader_required',
      },
      {
        name: 'object version mismatch',
        mutate: (harness) => {
          harness.exactObjectReader.versionFingerprint = sha256('different-version');
        },
        code: 'object_version_mismatch',
      },
      {
        name: 'object hash mismatch after capture',
        mutate: (harness) => {
          const changed = Buffer.from(objectBytes);
          changed[0] ^= 0xff;
          harness.exactObjectReader.body = changed;
        },
        code: 'object_hash_mismatch',
      },
      {
        name: 'truncated object',
        mutate: (harness) => {
          harness.exactObjectReader.body = objectBytes.subarray(0, objectBytes.length - 1);
        },
        code: 'object_size_mismatch',
      },
      {
        name: 'oversized object stream',
        mutate: (harness) => {
          harness.exactObjectReader.body = Buffer.concat([objectBytes, Buffer.from('x')]);
        },
        code: 'object_size_mismatch',
      },
      {
        name: 'object exceeds configured cap',
        mutate: (harness) => {
          harness.maxObjectReadBytes = objectBytes.length - 1;
        },
        code: 'object_read_limit_exceeded',
      },
      {
        name: 'exact object missing',
        mutate: (harness) => {
          harness.exactObjectReader.fail = true;
        },
        code: 'object_exact_read_failed',
      },
      {
        name: 'cleanup is not verified',
        mutate: (harness) => {
          harness.verifyRestoreCleanup = async () => {
            harness.cleanupChecks += 1;
            return false;
          };
        },
        code: 'restore_cleanup_unverified',
      },
    ];

    for (const testCase of cases) {
      await t.test(testCase.name, async () => {
        const harness = createHarness();
        testCase.mutate(harness);
        await assert.rejects(
          runHarness(harness),
          (error) => error instanceof DrillError && error.code === testCase.code,
        );
        assert.equal(harness.cleanupCalls, 1);
        assert.equal(harness.cleanupChecks, 1);

        const cleanRepeat = createHarness();
        const result = await runHarness(cleanRepeat);
        assert.equal(result.manifest.status, 'verified');
        assert.equal(cleanRepeat.cleanupCalls, 1);
      });
    }
  });

  it('rejects an unsealed or tampered backup set before proof, then cleans up', async () => {
    const harness = createHarness();
    harness.backupSetManifest.unsigned.objects[0].bytes += 1;
    await assert.rejects(
      runHarness(harness),
      (error) => error instanceof DrillError && error.code === 'backup_set_manifest_invalid',
    );
    assert.equal(harness.cleanupCalls, 1);
    assert.equal(harness.cleanupChecks, 1);
  });

  it('emits only a bounded code when an operator adapter is absent', async () => {
    let stdout = '';
    let stderr = '';
    const exitCode = await main(
      [
        '--primary-database-url',
        'postgres://primary-secret@localhost/db',
        '--restored-database-url',
        'postgres://restored-secret@localhost/db',
        '--restored-runtime-database-url',
        'postgres://runtime-secret@localhost/db',
        '--tenant-id',
        tenantId,
        '--other-tenant-id',
        otherTenantId,
        '--backup-set-manifest',
        '/private/provider/account/object-key.json',
        '--verification-key',
        '/private/key.pem',
        '--approved-region',
        expectedRegion,
        '--profile-fingerprint',
        expectedProfileFingerprint,
        '--dry-run',
      ],
      {
        stdout: { write: (value) => (stdout += value) },
        stderr: { write: (value) => (stderr += value) },
      },
    );

    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
    assert.deepEqual(JSON.parse(stderr), {
      ok: false,
      code: 'external_restore_adapter_required',
    });
    for (const secret of [
      'primary-secret',
      'restored-secret',
      'runtime-secret',
      tenantId,
      otherTenantId,
      'object-key',
      '/private/key.pem',
    ]) {
      assert.equal(stderr.includes(secret), false);
    }
  });
});

describe('backup-restore-drill proof helpers', () => {
  it('proves RLS and FORCE RLS for every required tenant table', async () => {
    const client = new SchemaClient();
    const proof = await proveTenantTableProtection(client);
    assert.equal(proof.status, 'VERIFIED');
    assert.equal(proof.tableCount, BACKUP_TABLES.length);
    assert.match(proof.catalogHash, /^[a-f0-9]{64}$/u);
  });

  it('requires both audit mutations to fail with no row change', async () => {
    const runtimeClient = new RuntimeClient();
    const proof = await proveAuditImmutability(runtimeClient, tenantId);
    assert.deepEqual(proof, {
      status: 'VERIFIED',
      update: 'DENIED',
      delete: 'DENIED',
      rowsChanged: 0,
    });
  });

  it('accepts a closed permission error for the cross-tenant query', async () => {
    const runtimeClient = new RuntimeClient();
    runtimeClient.crossTenantDenied = true;
    const proof = await proveCrossTenantIsolation({
      runtimeClient,
      tenantId,
      otherTenantId,
    });
    assert.equal(proof.outcome, 'DENIED');
    assert.equal(proof.crossTenantRows, 0);
  });

  it('hashes streamed exact-version bytes without retaining object references', async () => {
    const backupSetManifest = createBackupSetManifest();
    const proof = await proveExactObjectReadback({
      manifest: backupSetManifest,
      exactObjectReader: {
        mode: 'exact-version',
        async readExactVersion({ versionFingerprint }) {
          return {
            referenceKind: 'exact-version',
            versionFingerprint,
            body: (async function* chunks() {
              yield objectBytes.subarray(0, 7);
              yield objectBytes.subarray(7);
            })(),
          };
        },
      },
    });
    assert.equal(proof.objectCount, 1);
    assert.equal(proof.inventoryHash, proof.readbackHash);
    assert.equal(JSON.stringify(proof).includes('ref-entry-proof-0001'), false);
  });
});

function createHarness(overrides = {}) {
  const rowCounts = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, index + 3]));
  const backupSetManifest = createBackupSetManifest();
  const exactObjectReader = {
    mode: 'exact-version',
    versionFingerprint: backupSetManifest.unsigned.objects[0].versionFingerprint,
    body: objectBytes,
    fail: false,
    async readExactVersion() {
      if (this.fail) throw new Error('synthetic missing object');
      return {
        referenceKind: 'exact-version',
        versionFingerprint: this.versionFingerprint,
        body: this.body,
      };
    },
  };
  const harness = {
    primaryClient: new SchemaClient({ rowCounts }),
    restoredClient: new SchemaClient({ rowCounts }),
    runtimeClient: new RuntimeClient(),
    backupSetManifest,
    exactObjectReader,
    maxObjectReadBytes: objectBytes.length + 1024,
    cleanupCalls: 0,
    cleanupChecks: 0,
    cleaned: false,
    async teardownRestore() {
      harness.cleaned = true;
      harness.cleanupCalls += 1;
    },
    async verifyRestoreCleanup() {
      harness.cleanupChecks += 1;
      return harness.cleaned;
    },
    ...overrides,
  };
  return harness;
}

async function runHarness(harness, overrides = {}) {
  return runBackupRestoreDrill({
    primaryClient: harness.primaryClient,
    restoredClient: harness.restoredClient,
    restoredRuntimeClient: harness.runtimeClient,
    tenantId,
    otherTenantId,
    drillId: 'restore-drill-2026-07-23',
    drillEvidenceRef: 'synthetic-drill-2026-07-23',
    backupSetManifest: harness.backupSetManifest,
    verificationPublicKey: publicKey,
    expectedRegion,
    expectedProfileFingerprint,
    exactObjectReader: harness.exactObjectReader,
    maxObjectReadBytes: harness.maxObjectReadBytes,
    teardownRestore: harness.teardownRestore,
    verifyRestoreCleanup: harness.verifyRestoreCleanup,
    dryRun: true,
    now: fixedNow,
    ...overrides,
  });
}

function createBackupSetManifest() {
  const input = {
    schemaVersion: 'amic-vault.sf20-backup-set-input.v1',
    backupSetId: 'bset-synthetic-proof-0001',
    country: 'KR',
    region: expectedRegion,
    captureStartedAt: '2026-07-23T10:00:00.000Z',
    captureEndedAt: '2026-07-23T10:20:00.000Z',
    profileFingerprint: expectedProfileFingerprint,
    databaseTargetFingerprint: sha256('database-target'),
    objectStoreTargetFingerprint: sha256('storage-target'),
    pitr: {
      receiptReference: 'ref-pitr-proof-0001',
      region: expectedRegion,
      capturedAt: '2026-07-23T10:10:00.000Z',
      restorePointAt: '2026-07-23T10:09:00.000Z',
      status: 'AVAILABLE',
      encrypted: true,
      immutable: true,
    },
    portableDatabase: {
      receiptReference: 'ref-portable-proof-0001',
      region: expectedRegion,
      capturedAt: '2026-07-23T10:12:00.000Z',
      postgresqlMajor: 16,
      format: 'custom',
      sha256: sha256(portableBytes),
      bytes: portableBytes.length,
      encrypted: true,
      immutable: true,
    },
    objects: [
      {
        reference: 'ref-entry-proof-0001',
        versionFingerprint: sha256('exact-version-0001'),
        region: expectedRegion,
        capturedAt: '2026-07-23T10:15:00.000Z',
        sha256: sha256(objectBytes),
        bytes: objectBytes.length,
        encrypted: true,
        immutable: true,
        versioned: true,
        referenceKind: 'exact-version',
      },
    ],
  };
  return buildBackupSetManifest({
    input,
    portableBackupMeasurement: {
      sha256: sha256(portableBytes),
      bytes: portableBytes.length,
    },
    signingPrivateKeyPath: privateKeyPath,
    verificationPublicKeyPath: publicKeyPath,
    expectedRegion,
    expectedProfileFingerprint,
    now: fixedNow,
  });
}

class SchemaClient {
  constructor({
    schemaPayload = schemaRows,
    rowCounts = Object.fromEntries(BACKUP_TABLES.map((table) => [table, 1])),
    protectionRows = protectedRows(),
  } = {}) {
    this.schemaPayload = schemaPayload;
    this.rowCounts = { ...rowCounts };
    this.protectionRows = protectionRows.map((row) => ({ ...row }));
    this.schemaIndex = 0;
  }

  async query(sql) {
    if (sql.includes('sf20:tenant-protection')) {
      return { rows: this.protectionRows };
    }
    if (
      sql.includes('information_schema.columns') ||
      sql.includes('pg_indexes') ||
      sql.includes('pg_constraint') ||
      sql.includes('pg_policies') ||
      sql.includes('information_schema.triggers')
    ) {
      return { rows: this.schemaPayload[this.schemaIndex++] ?? [] };
    }
    const table = BACKUP_TABLES.find((candidate) => sql.includes(`FROM ${candidate} `));
    if (!table) throw new Error('unexpected schema query');
    return { rows: [{ count: String(this.rowCounts[table]) }] };
  }
}

class RuntimeClient {
  constructor() {
    this.role = {
      is_superuser: false,
      bypasses_rls: false,
      owns_documents: false,
    };
    this.contextMatches = true;
    this.crossRows = 0;
    this.crossTenantDenied = false;
    this.denyUpdate = true;
    this.denyDelete = true;
    this.auditRows = 7;
  }

  async query(sql) {
    if (
      sql === 'BEGIN' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('SAVEPOINT ') ||
      sql.startsWith('ROLLBACK TO SAVEPOINT ') ||
      sql.startsWith('RELEASE SAVEPOINT ')
    ) {
      return { rows: [] };
    }
    if (sql.includes('sf20:runtime-role')) return { rows: [{ ...this.role }] };
    if (sql.includes('sf20:set-tenant-context')) {
      return { rows: [{ matches: this.contextMatches }] };
    }
    if (sql.includes('sf20:audit-count')) {
      return { rows: [{ count: String(this.auditRows) }] };
    }
    if (sql.startsWith('UPDATE audit_events')) {
      if (this.denyUpdate) throw sqlStateError();
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith('DELETE FROM audit_events')) {
      if (this.denyDelete) throw sqlStateError();
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('sf20:cross-tenant')) {
      if (this.crossTenantDenied) throw sqlStateError();
      return { rows: [{ count: String(this.crossRows) }] };
    }
    throw new Error('unexpected runtime query');
  }
}

function protectedRows() {
  return [...BACKUP_TABLES].sort().map((table) => ({
    table_name: table,
    rls_enabled: true,
    force_rls: true,
    policy_count: '1',
  }));
}

function sqlStateError() {
  return Object.assign(new Error('synthetic bounded denial'), { code: '42501' });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function resultPlaceholder(value) {
  assert.match(value, /^[a-f0-9]{64}$/u);
  return value;
}

assert.match(hashJson({ test: true }), /^[a-f0-9]{64}$/u);
