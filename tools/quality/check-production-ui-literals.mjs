#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, 'apps/web/src');

const excludedPathParts = [
  `${path.sep}__fixtures__${path.sep}`,
  `${path.sep}__mocks__${path.sep}`,
  `${path.sep}tests${path.sep}`,
];

const excludedFilePatterns = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\.stories\.[tj]sx?$/,
];

const literalPatterns = [
  { name: 'mock literal', pattern: /\bmock\b/i },
  { name: 'demo literal', pattern: /\bdemo\b/i },
  { name: 'fake literal', pattern: /\bfake\b/i },
  { name: 'faker literal', pattern: /\bfaker\b/i },
  { name: 'known sample hash variable', pattern: /sampleHash/ },
  { name: 'known sample fingerprint variable', pattern: /sampleFingerprint/ },
  { name: 'placeholder SSO provider', pattern: /Corporate IdP/ },
  { name: 'placeholder key reference', pattern: /Tenant HSM reference/ },
  { name: 'placeholder evidence ref', pattern: /soc2-access-control/ },
  { name: 'prefilled retention code', pattern: /RET-INDEFINITE/ },
  { name: 'prefilled retention label', pattern: /Indefinite retention/ },
  { name: 'prefilled retention reason', pattern: /CLIENT_RECORDS/ },
  { name: 'prefilled request code', pattern: /RFI-001/ },
  { name: 'prefilled evidence code', pattern: /EV-001/ },
  { name: 'prefilled fact code', pattern: /FACT-001/ },
  { name: 'prefilled diligence issue code', pattern: /DD-ISS-001/ },
  { name: 'prefilled pleading code', pattern: /PLD-001/ },
  { name: 'placeholder witness timeline', pattern: /Witness timeline/ },
  { name: 'placeholder approval issue', pattern: /Missing board approval/ },
  { name: 'placeholder charter request', pattern: /Corporate charter documents/ },
  { name: 'placeholder person', pattern: /김민준/ },
  { name: 'placeholder person', pattern: /정서연/ },
  { name: 'placeholder team', pattern: /법무 운영팀/ },
  { name: 'placeholder document', pattern: /주식매매계약서/ },
  { name: 'placeholder brand', pattern: /Gonyak/ },
  { name: 'theme selector copy', pattern: /디자인 테마/ },
  { name: 'workspace id label', pattern: /워크스페이스 ID/ },
  { name: 'user id label', pattern: /사용자 ID/ },
  { name: 'download id label', pattern: /다운로드 ID/ },
  { name: 'download ref label', pattern: /Download ref/ },
  { name: 'outlook filing matter short ref', pattern: /shortHash\(status\.matterId/ },
  { name: 'outlook selected matter short ref', pattern: /selectedMatterId \? shortHash/ },
];

function shouldScanFile(filePath) {
  if (!/\.[tj]sx?$/.test(filePath)) return false;
  if (excludedFilePatterns.some((pattern) => pattern.test(filePath))) return false;
  return !excludedPathParts.some((part) => filePath.includes(part));
}

function walk(directory) {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      files.push(...walk(filePath));
    } else if (shouldScanFile(filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

const findings = [];

for (const filePath of walk(sourceRoot)) {
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    for (const { name, pattern } of literalPatterns) {
      if (pattern.test(line)) {
        findings.push({
          filePath: path.relative(repoRoot, filePath),
          line: lineIndex + 1,
          name,
          text: line.trim(),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Production UI literal check failed:');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} ${finding.name}: ${finding.text}`);
  }
  process.exit(1);
}

console.log('Production UI literal check passed.');
