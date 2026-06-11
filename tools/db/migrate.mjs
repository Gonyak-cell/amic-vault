#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { databaseUrl } from './config.mjs';

const [direction = 'up', count] = process.argv.slice(2);
if (!['up', 'down'].includes(direction)) {
  console.error('usage: node tools/db/migrate.mjs <up|down> [count]');
  process.exit(2);
}

const args = [
  'exec',
  'node-pg-migrate',
  direction,
  ...(count ? [count] : []),
  '--migrations-dir',
  'db/migrations/[0-9][0-9][0-9][0-9]_*.sql',
  '--use-glob',
  '--migrations-table',
  'schema_migrations',
  '--single-transaction',
  'true',
  '--check-order',
  'true',
];

const result = spawnSync('pnpm', args, {
  env: { ...process.env, DATABASE_URL: databaseUrl() },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
