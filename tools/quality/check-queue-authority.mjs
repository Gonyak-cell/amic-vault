import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { scanSources } from './check-database-authority.mjs';

export const queueConnectionBudget = 1;
const queueFactoryPath = 'apps/api/src/common/queue/queue.module.ts';
const queueRegistryPath = 'apps/api/src/common/queue/queue.registry.ts';
const sourceExtensions = new Set(['.ts', '.mts', '.cts', '.mjs', '.cjs', '.js']);

function fail(message) {
  throw new Error(`queue authority check failed: ${message}`);
}

function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))
      ? [path]
      : [];
  });
}

export function validateQueueAuthority({ sources, env = process.env }) {
  const constructors = scanSources(sources).filter((record) => record.constructor === 'PgBoss');
  if (constructors.length !== 1) fail(`expected one PgBoss constructor, found ${constructors.length}`);
  const [constructor] = constructors;
  if (constructor.path !== queueFactoryPath || constructor.processRole !== 'API_WORKER_OR_SCHEDULER') {
    fail(`PgBoss constructor is not the central QueueModule factory: ${constructor.path}`);
  }

  const registry = sources.find((source) => source.path === queueRegistryPath)?.text;
  if (!registry) fail('QueueRegistry source is missing');
  for (const contract of [
    'QUEUE_NOT_REGISTERED',
    'QUEUE_CONSUMER_ROLE_DENIED',
    'QUEUE_RUNTIME_SCHEMA_MUTATION_FORBIDDEN',
    'QUEUE_REGISTRY_STOPPED',
    'currentProcessRole(this.env) !== \'worker\'',
    'assertRuntimeQueueOptions(options, this.env)',
    'if (!this.definitions.has(name)) throw new Error(\'QUEUE_NOT_REGISTERED\')',
  ]) {
    if (!registry.includes(contract)) fail(`QueueRegistry fail-closed contract missing: ${contract}`);
  }

  const configured = env.QUEUE_CONNECTION_BUDGET;
  if (configured !== undefined && Number(configured) !== queueConnectionBudget) {
    fail(`unsupported QUEUE_CONNECTION_BUDGET: ${configured}`);
  }
  return {
    schemaVersion: 'amic-vault.queue-authority-validation.v1',
    status: 'PASS',
    pgBossConstructorPath: constructor.path,
    processConnectionBudget: queueConnectionBudget,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const roots = process.argv.slice(2);
    const selectedRoots = roots.length > 0 ? roots : ['apps/api/src'];
    const sources = selectedRoots.flatMap((root) =>
      walk(resolve(root)).map((file) => ({ path: relative(process.cwd(), file), text: readFileSync(file, 'utf8') })),
    );
    process.stdout.write(`${JSON.stringify(validateQueueAuthority({ sources }))}\n`);
  } catch (error) {
    process.stderr.write(`QUEUE_AUTHORITY_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
