#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsRoot = path.join(root, 'docs', 'package');
const manifestPath = path.join(root, 'docs', 'package', '.frozen-manifest.json');

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === '.frozen-manifest.json' || entry.name === '.DS_Store') {
      return [];
    }
    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }
    if (entry.isFile()) {
      return [fullPath];
    }
    return [];
  });
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const current = Object.fromEntries(
  listFiles(docsRoot)
    .map((filePath) => [path.relative(root, filePath), fileHash(filePath)])
    .sort(([left], [right]) => left.localeCompare(right)),
);

if (process.argv.includes('--write')) {
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ generatedAt: 'PACK-R0-01', files: current }, null, 2)}\n`,
  );
  console.log(`wrote ${manifestPath}`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expected = manifest.files ?? {};

const currentKeys = Object.keys(current);
const expectedKeys = Object.keys(expected);

let failed = false;
for (const key of expectedKeys) {
  if (!(key in current)) {
    console.error(`docs package frozen check failed: missing ${key}`);
    failed = true;
  } else if (current[key] !== expected[key]) {
    console.error(`docs package frozen check failed: checksum mismatch ${key}`);
    failed = true;
  }
}
for (const key of currentKeys) {
  if (!(key in expected)) {
    console.error(`docs package frozen check failed: unexpected ${key}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`docs package frozen check passed: ${currentKeys.length} files`);
