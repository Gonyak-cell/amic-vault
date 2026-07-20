import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BACKUP_TABLES,
  buildDrillManifest,
  hashJson,
  main,
  runBackupRestoreDrill,
} from './backup-restore-drill.mjs';

const tenantId = '11111111-1111-4111-8111-111111111111';
const schemaRows = Object.freeze([
  [{ table_name: 'users', column_name: 'tenant_id', data_type: 'uuid', is_nullable: 'NO' }],
  [{ tablename: 'users', indexname: 'users_pkey', indexdef: 'CREATE UNIQUE INDEX users_pkey' }],
  [{ table_name: 'users', conname: 'users_pkey', definition: 'PRIMARY KEY (user_id)' }],
  [{ schemaname: 'public', tablename: 'users', policyname: 'tenant_isolation', cmd: 'ALL' }],
  [{ event_object_table: 'users', trigger_name: 'users_updated_at', action_timing: 'BEFORE' }],
]);
const changedSchemaRows = Object.freeze([
  [{ table_name: 'users', column_name: 'tenant_id', data_type: 'uuid', is_nullable: 'NO' }],
  [{ tablename: 'users', indexname: 'users_pkey', indexdef: 'CREATE UNIQUE INDEX users_pkey' }],
  [{ table_name: 'users', conname: 'users_pkey', definition: 'PRIMARY KEY (user_id)' }],
  [{ schemaname: 'public', tablename: 'users', policyname: 'tenant_isolation_v2', cmd: 'ALL' }],
  [{ event_object_table: 'users', trigger_name: 'users_updated_at', action_timing: 'BEFORE' }],
]);

describe('backup-restore-drill', () => {
  it('builds a verified manifest when schema and core row counts match', () => {
    const rowCounts = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, index + 1]));
    const schemaHash = hashJson(schemaRows);

    const manifest = buildDrillManifest({
      tenantId,
      drillId: 'restore-drill-2026-07-03',
      drillEvidenceRef: 'aws-drill-2026-07-03',
      primarySchemaHash: schemaHash,
      restoredSchemaHash: schemaHash,
      primaryRowCounts: rowCounts,
      restoredRowCounts: rowCounts,
      verifiedAt: '2026-07-03T00:00:00.000Z',
    });

    assert.equal(manifest.status, 'verified');
    assert.equal(manifest.schemaHash, manifest.restoredSchemaHash);
    assert.equal(manifest.tableCount, BACKUP_TABLES.length);
    assert.match(manifest.drillManifestHash, /^[a-f0-9]{64}$/u);
  });

  it('posts a verified snapshot request for a matching restored database', async () => {
    const rowCounts = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, index + 3]));
    const primaryClient = new MockClient(schemaRows, rowCounts);
    const restoredClient = new MockClient(schemaRows, rowCounts);
    let postedUrl = '';
    let postedBody;

    const result = await runBackupRestoreDrill({
      primaryClient,
      restoredClient,
      tenantId,
      apiBaseUrl: 'http://vault.local/v1',
      sessionCookie: 'amic_session=secret-session-cookie',
      drillId: 'restore-drill-2026-07-03',
      drillEvidenceRef: 'aws-drill-2026-07-03',
      fetchImpl: async (url, init) => {
        postedUrl = url;
        postedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return { backupSnapshotId: '22222222-2222-4222-8222-222222222222' };
          },
        };
      },
      now: new Date('2026-07-03T00:00:00.000Z'),
    });

    assert.equal(postedUrl, 'http://vault.local/v1/enterprise/backups/snapshots');
    assert.equal(postedBody.status, 'verified');
    assert.equal(postedBody.drillId, 'restore-drill-2026-07-03');
    assert.equal(postedBody.schemaHash, result.manifest.schemaHash);
    assert.equal(postedBody.restoredSchemaHash, result.manifest.restoredSchemaHash);
    assert.equal(postedBody.drillManifestHash, result.manifest.drillManifestHash);
    assert.equal(JSON.stringify(result).includes('secret-session-cookie'), false);
  });

  it('returns exit code 1 for a schema mismatch without echoing database URLs', async () => {
    const rowCounts = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, index + 5]));
    let stderr = '';
    let stdout = '';

    const exitCode = await main(
      [
        '--primary-database-url',
        'postgres://primary-secret@localhost/db',
        '--restored-database-url',
        'postgres://restored-secret@localhost/db',
        '--tenant-id',
        tenantId,
        '--dry-run',
      ],
      {
        clientFactory: (connectionString) =>
          connectionString.includes('primary-secret')
            ? new MockClient(schemaRows, rowCounts)
            : new MockClient(changedSchemaRows, rowCounts),
        now: new Date('2026-07-03T00:00:00.000Z'),
        stdout: { write: (chunk) => (stdout += chunk) },
        stderr: { write: (chunk) => (stderr += chunk) },
      },
    );

    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /schema_hash_mismatch/);
    assert.equal(stderr.includes('primary-secret'), false);
    assert.equal(stderr.includes('restored-secret'), false);
  });

  it('prints manifest JSON for a matching dry run', async () => {
    const rowCounts = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, index + 8]));
    let stdout = '';
    let stderr = '';

    const exitCode = await main(
      [
        '--primary-database-url',
        'postgres://primary-secret@localhost/db',
        '--restored-database-url',
        'postgres://restored-secret@localhost/db',
        '--tenant-id',
        tenantId,
        '--drill-id',
        'restore-drill-2026-07-03',
        '--dry-run',
      ],
      {
        clientFactory: () => new MockClient(schemaRows, rowCounts),
        now: new Date('2026-07-03T00:00:00.000Z'),
        stdout: { write: (chunk) => (stdout += chunk) },
        stderr: { write: (chunk) => (stderr += chunk) },
      },
    );

    assert.equal(exitCode, 0);
    assert.equal(stderr, '');
    const manifest = JSON.parse(stdout);
    assert.equal(manifest.status, 'verified');
    assert.equal(manifest.drillId, 'restore-drill-2026-07-03');
    assert.match(manifest.drillManifestHash, /^[a-f0-9]{64}$/u);
  });
});

class MockClient {
  constructor(schemaPayload, rowCounts) {
    this.schemaPayload = schemaPayload;
    this.rowCounts = rowCounts;
    this.schemaIndex = 0;
    this.connected = false;
    this.ended = false;
  }

  async connect() {
    this.connected = true;
  }

  async end() {
    this.ended = true;
  }

  async query(sql) {
    if (sql.includes('information_schema.columns') || sql.includes('pg_indexes')) {
      return { rows: this.schemaPayload[this.schemaIndex++] ?? [] };
    }
    if (
      sql.includes('pg_constraint') ||
      sql.includes('pg_policies') ||
      sql.includes('information_schema.triggers')
    ) {
      return { rows: this.schemaPayload[this.schemaIndex++] ?? [] };
    }

    const table = BACKUP_TABLES.find((candidate) => sql.includes(`FROM ${candidate} `));
    if (!table) throw new Error(`unexpected query: ${sql}`);
    return { rows: [{ count: String(this.rowCounts[table]) }] };
  }
}
