import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'apps/web/public/word-addin/manifest.xml',
  'apps/web/src/app/word-addin/page.tsx',
  'apps/web/src/app/word-addin/word-addin-client.tsx',
  'apps/web/src/app/word-addin/word-addin-client.test.tsx',
  'apps/web/src/app/word-addin/word-manifest.spec.ts',
  'tools/release/render-word-manifest.mjs',
  'package.json',
];

const forbiddenSecretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /secret\s*[:=]\s*['"][^'"]+['"]/i,
  /refresh[_-]?token\s*[:=]\s*['"][^'"]+['"]/i,
  /access[_-]?token\s*[:=]\s*['"][^'"]+['"]/i,
];

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) throw new Error(`Missing Word add-in file: ${relativePath}`);
  return readFileSync(absolutePath, 'utf8');
}

function assertContains(content, needle, file) {
  if (!content.includes(needle)) throw new Error(`${file} must contain ${needle}`);
}

function assertNotContains(content, needle, file) {
  if (content.includes(needle)) throw new Error(`${file} must not contain ${needle}`);
}

for (const file of requiredFiles) {
  const content = readRequired(file);
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(content)) throw new Error(`${file} appears to contain a forbidden secret pattern`);
  }
}

const manifest = readRequired('apps/web/public/word-addin/manifest.xml');
const client = readRequired('apps/web/src/app/word-addin/word-addin-client.tsx');
const apiClient = readRequired('apps/web/src/lib/api/contract-intel.ts');
const packageJson = readRequired('package.json');

for (const expected of [
  'xsi:type="TaskPaneApp"',
  '<Host Name="Document"/>',
  '<Permissions>ReadWriteDocument</Permissions>',
  'https://localhost:3000/word-addin',
]) {
  assertContains(manifest, expected, 'apps/web/public/word-addin/manifest.xml');
}
for (const forbidden of ['Mailbox', 'ReadWriteMailbox', 'Mail.Send', 'WebApplicationInfo']) {
  assertNotContains(manifest, forbidden, 'apps/web/public/word-addin/manifest.xml');
}
for (const expected of ['insertOoxml', 'prepareWordClauseInsertion', 'searchSimilarClauses']) {
  assertContains(client, expected, 'apps/web/src/app/word-addin/word-addin-client.tsx');
}
assertContains(
  apiClient,
  '/contract-intel/word-addin/clause-insertions',
  'apps/web/src/lib/api/contract-intel.ts',
);
assertContains(packageJson, 'word:deployment:check', 'package.json');
assertContains(packageJson, 'word:manifest:render', 'package.json');

console.log('word deployment check passed');
