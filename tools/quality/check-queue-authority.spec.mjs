import assert from 'node:assert/strict';
import test from 'node:test';
import { queueConnectionBudget, validateQueueAuthority } from './check-queue-authority.mjs';

const centralFactory = "import PgBoss from 'pg-boss'; export const create = () => new PgBoss({});";
const registry = `
  const currentProcessRole = () => 'api';
  const assertRuntimeQueueOptions = (options, env) => undefined;
  const contracts = ['QUEUE_NOT_REGISTERED', 'QUEUE_CONSUMER_ROLE_DENIED', 'QUEUE_RUNTIME_SCHEMA_MUTATION_FORBIDDEN', 'QUEUE_REGISTRY_STOPPED'];
  if (currentProcessRole(this.env) !== 'worker') throw new Error(contracts[1]);
  assertRuntimeQueueOptions(options, this.env);
  if (!this.definitions.has(name)) throw new Error('QUEUE_NOT_REGISTERED');
`;

function sources(extra = []) {
  return [
    { path: 'apps/api/src/common/queue/queue.module.ts', text: centralFactory },
    { path: 'apps/api/src/common/queue/queue.registry.ts', text: registry },
    ...extra,
  ];
}

test('accepts only the central PgBoss factory at the one-connection budget', () => {
  const report = validateQueueAuthority({ sources: sources() });
  assert.equal(report.status, 'PASS');
  assert.equal(report.processConnectionBudget, queueConnectionBudget);
});

test('rejects a second direct PgBoss constructor and unsupported budget', () => {
  assert.throws(
    () => validateQueueAuthority({
      sources: sources([{ path: 'apps/api/src/modules/example.ts', text: "import PgBoss from 'pg-boss'; new PgBoss({});" }]),
    }),
    /expected one PgBoss constructor/,
  );
  assert.throws(
    () => validateQueueAuthority({ sources: sources(), env: { QUEUE_CONNECTION_BUDGET: '2' } }),
    /unsupported QUEUE_CONNECTION_BUDGET/,
  );
});
