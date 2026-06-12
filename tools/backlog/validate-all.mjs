#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const backlogPaths = [
  'docs/package/codex/data/backlog_r0_r3.csv',
  'docs/backlog/backlog_r4_r14.csv',
];

for (const backlogPath of backlogPaths) {
  const result = spawnSync('node', ['tools/backlog/validate.mjs', backlogPath], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
