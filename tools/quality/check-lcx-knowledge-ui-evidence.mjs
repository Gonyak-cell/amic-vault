#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const evidencePath = 'docs/lazycodex/lcx-knowledge-vault-ui-evidence-2026-07-02.md';
const absoluteEvidencePath = path.join(repoRoot, evidencePath);
const allowedStatuses = new Set([
  '구현 가능',
  '요청 가능',
  '승인 필요',
  '연결 필요',
  '사용 불가',
  '숨김',
]);

const issues = [];

if (!existsSync(absoluteEvidencePath)) {
  issues.push(`Missing LCX evidence file: ${evidencePath}`);
} else {
  const source = readFileSync(absoluteEvidencePath, 'utf8');
  const rowPattern = /^\|\s*(LCX-KSUI-\d{3})\s*\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|/gm;
  const rows = new Map();
  let match;

  while ((match = rowPattern.exec(source)) !== null) {
    const [, id, surface, status, evidence, hold] = match.map((value) => value.trim());
    if (rows.has(id)) issues.push(`Duplicate LCX evidence row: ${id}`);
    rows.set(id, { surface, status, evidence, hold });
  }

  for (let index = 0; index <= 50; index += 1) {
    const id = `LCX-KSUI-${String(index).padStart(3, '0')}`;
    const row = rows.get(id);
    if (!row) {
      issues.push(`Missing LCX evidence row: ${id}`);
      continue;
    }
    if (!allowedStatuses.has(row.status)) {
      issues.push(`${id} has unsupported status: ${row.status || '(empty)'}`);
    }
    if (!row.surface) issues.push(`${id} is missing a surface`);
    if (!row.evidence || row.evidence === '-') issues.push(`${id} is missing evidence`);
    if (!row.hold || row.hold === '-') issues.push(`${id} is missing safe hold or next proof`);
  }

  for (const id of rows.keys()) {
    if (!/^LCX-KSUI-(0[0-4]\d|050)$/.test(id)) {
      issues.push(`Unexpected LCX evidence row id: ${id}`);
    }
  }

  if (!/pnpm check:lcx-knowledge-ui-evidence/.test(source)) {
    issues.push('Evidence file must mention pnpm check:lcx-knowledge-ui-evidence');
  }
  if (/TODO|TBD|확인 필요 TBD/i.test(source)) {
    issues.push('Evidence file contains unresolved TODO/TBD marker');
  }
}

if (issues.length > 0) {
  console.error('LCX knowledge UI evidence check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log('LCX knowledge UI evidence check passed.');
