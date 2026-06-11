#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const filters = process.argv.slice(2).filter((filter) => filter !== '--');

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

const seed = spawnSync('pnpm', ['db:seed'], {
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

const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...specs], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
