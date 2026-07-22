#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const filterAliases = new Map([['matter-member', 'matter-team']]);
const filters = process.argv
  .slice(2)
  .filter((filter) => filter !== '--')
  .map((filter) => filterAliases.get(filter) ?? filter);

const domainBuild = spawnSync('pnpm', ['--filter', '@amic-vault/domain', 'build'], {
  stdio: 'inherit',
});

if (domainBuild.status !== 0) {
  process.exit(domainBuild.status ?? 1);
}

const sharedBuild = spawnSync('pnpm', ['--filter', '@amic-vault/shared', 'build'], {
  stdio: 'inherit',
});

if (sharedBuild.status !== 0) {
  process.exit(sharedBuild.status ?? 1);
}

const aiBuild = spawnSync('pnpm', ['--filter', '@amic-vault/ai', 'build'], {
  stdio: 'inherit',
});

if (aiBuild.status !== 0) {
  process.exit(aiBuild.status ?? 1);
}

const apiBuild = spawnSync('pnpm', ['--filter', '@amic-vault/api', 'build'], { stdio: 'inherit' });
if (apiBuild.status !== 0) process.exit(apiBuild.status ?? 1);

const migrationDatabaseUrl = process.env.DATABASE_MIGRATION_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const runtimeDatabaseUrl = process.env.DATABASE_RUNTIME_URL ?? process.env.APP_DATABASE_URL ?? 'postgres://vault_app:vault_app_dev_password@localhost:5432/amic_vault';

// Production queue schemas are prepared once by a migration-role task before
// API/worker runtime starts. Reuse that exact local tool for integration so
// runtime-role tests exercise an already-provisioned queue rather than letting
// the runtime identity create schema objects.
const queuePrepare = spawnSync(
  'node',
  [
    'apps/api/dist/tools/prepare-ai-prep-queue.js',
    '--runtime-role',
    process.env.DATABASE_RUNTIME_ROLE ?? 'vault_app',
  ],
  {
    env: {
      ...process.env,
      DATABASE_URL: migrationDatabaseUrl,
    },
    stdio: 'inherit',
  },
);

if (queuePrepare.status !== 0) {
  process.exit(queuePrepare.status ?? 1);
}

const seed = spawnSync('pnpm', ['db:seed'], {
  env: { ...process.env, DATABASE_MIGRATION_URL: migrationDatabaseUrl, DATABASE_URL: migrationDatabaseUrl },
  stdio: 'inherit',
});

if (seed.status !== 0) {
  process.exit(seed.status ?? 1);
}

function listSpecFiles(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listSpecFiles(fullPath);
      return entry.isFile() && entry.name.endsWith('.spec.ts') ? [fullPath] : [];
    })
    .sort();
}

const allSpecs = listSpecFiles('tests/integration');
const specs =
  filters.length === 0
    ? allSpecs
    : allSpecs.filter((file) => filters.some((filter) => file.includes(filter)));

if (specs.length === 0) {
  console.error(`no integration specs matched: ${filters.join(', ')}`);
  process.exit(1);
}

const integrationEnv = {
  ...process.env,
  DATABASE_URL: migrationDatabaseUrl,
  DATABASE_MIGRATION_URL: migrationDatabaseUrl,
  DATABASE_RUNTIME_URL: runtimeDatabaseUrl,
  DATABASE_RUNTIME_ROLE: process.env.DATABASE_RUNTIME_ROLE ?? 'vault_app',
  MATTER_APP_SOURCE_CONFIGURED: process.env.MATTER_APP_SOURCE_CONFIGURED ?? 'true',
  MATTER_APP_RUNTIME_READY: process.env.MATTER_APP_RUNTIME_READY ?? 'true',
  MATTER_APP_SOURCE_MODE: process.env.MATTER_APP_SOURCE_MODE ?? 'matter_app_event_projection',
};

const fullSuiteBatchSize = 8;
const runtimeIsolationSpecs = specs.filter((file) => file.endsWith('tests/integration/fail-closed/runtime-role-startup.spec.ts'));
const regularSpecs = specs.filter((file) => !runtimeIsolationSpecs.includes(file));
const regularBatches =
  filters.length === 0
    ? Array.from({ length: Math.ceil(regularSpecs.length / fullSuiteBatchSize) }, (_, index) =>
        regularSpecs.slice(index * fullSuiteBatchSize, (index + 1) * fullSuiteBatchSize),
      )
    : regularSpecs.length === 0 ? [] : [regularSpecs];
const specBatches = [...runtimeIsolationSpecs.map((spec) => [spec]), ...regularBatches.filter((batch) => batch.length > 0)];

for (const batch of specBatches) {
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--no-file-parallelism', ...batch], {
    env: integrationEnv,
    stdio: 'inherit',
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}
