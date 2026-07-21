import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryReport, scanSources, validateInventory } from './check-database-authority.mjs';

const fixtureSource = `
  import { Pool as RuntimePool } from 'pg';
  import type { Pool } from 'pg';
  import pg from 'pg';
  import PgBoss from 'pg-boss';
  // new RuntimePool();
  const text = 'new PgBoss()';
  new RuntimePool({ connectionString: process.env.DATABASE_RUNTIME_URL });
  new pg.Pool();
  new PgBoss({});
`;

test('uses the TypeScript AST to ignore comments, strings, and type-only imports', () => {
  const report = inventoryReport(scanSources([{ path: 'apps/api/src/modules/example.service.ts', text: fixtureSource }]));
  assert.equal(report.poolCount, 2);
  assert.equal(report.pgBossCount, 1);
  assert.equal(report.unclassifiedRuntimeCount, 0);
  assert.equal(report.records[0].connectionEnvironment, 'DATABASE_RUNTIME_URL');
});

test('classifies CLI constructions separately from runtime migrations', () => {
  const report = inventoryReport(scanSources([
    { path: 'apps/api/src/tools/reindex.ts', text: "import { Pool } from 'pg'; new Pool({});" },
    { path: 'tools/db/check.mjs', text: "import pg from 'pg'; new pg.Pool({});" },
  ]));
  assert.equal(report.runtimeCount, 0);
  assert.equal(report.cliCount, 2);
  assert.deepEqual(Object.keys(report.migrationBatches), ['CLI_EXCEPTION']);
});

test('recognizes a locally bound dynamic pg-boss import without string matching', () => {
  const report = inventoryReport(scanSources([{ path: 'apps/api/src/modules/queue.service.ts', text: "async function start() { const { PgBoss } = await import('pg-boss'); return new PgBoss({}); }" }]));
  assert.equal(report.pgBossCount, 1);
  assert.equal(report.records[0].migrationBatch, 'QUE');
});

test('fails closed when the locked inventory digest or count drifts', () => {
  const report = inventoryReport(scanSources([{ path: 'apps/api/src/modules/example.service.ts', text: "import { Pool } from 'pg'; new Pool({});" }]));
  const sourceMap = { productAuthorityTargets: [{ portfolio: 'OSS-01', directConstructorBaseline: { poolCount: report.poolCount, clientCount: report.clientCount, pgBossCount: report.pgBossCount, inventorySha256: report.inventorySha256, directConnectionAllowlist: [{ path: 'apps/api/src/modules/example.service.ts', constructor: 'Pool', processRole: 'API_RUNTIME', connectionEnvironment: 'INDIRECT_OR_ARGUMENT' }] } }] };
  assert.equal(validateInventory({ report, sourceMap }).status, 'PASS');
  sourceMap.productAuthorityTargets[0].directConstructorBaseline.poolCount += 1;
  assert.throws(() => validateInventory({ report, sourceMap }), /poolCount drift/);
});

test('rejects an unallowlisted direct Client constructor', () => {
  const report = inventoryReport(scanSources([{ path: 'apps/api/src/modules/example.service.ts', text: "import { Client } from 'pg'; new Client({});" }]));
  const sourceMap = { productAuthorityTargets: [{ portfolio: 'OSS-01', directConstructorBaseline: { poolCount: report.poolCount, clientCount: report.clientCount, pgBossCount: report.pgBossCount, inventorySha256: report.inventorySha256, directConnectionAllowlist: [] } }] };
  assert.throws(() => validateInventory({ report, sourceMap }), /unallowlisted direct Client/);
});
