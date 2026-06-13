import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'docs/release/launch-execution-plan.md',
  'docs/release/operator-decision-sheet.md',
  'docs/release/uat-evidence-template.md',
  'docs/release/staging-smoke-plan.md',
  'docs/release/launch-blocker-ledger.md',
  'docs/release/uat-checklist.md',
  'docs/release/security-evidence-index.md',
];

const blockerIds = Array.from({ length: 14 }, (_, index) => `LRB-${String(index + 1).padStart(3, '0')}`);
const uatIds = Array.from({ length: 20 }, (_, index) => `UAT-${String(index + 1).padStart(3, '0')}`);

const forbiddenSecretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /secret\s*[:=]\s*['"][^'"]+['"]/i,
];

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing launch execution file: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf8');
}

function assertContains(content, needle, file) {
  if (!content.includes(needle)) {
    throw new Error(`${file} must contain ${needle}`);
  }
}

function assertNoForbiddenSecrets(content, file) {
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(content)) {
      throw new Error(`${file} appears to contain a forbidden secret pattern`);
    }
  }
}

const contents = new Map();
for (const file of requiredFiles) {
  const content = readRequired(file);
  contents.set(file, content);
  assertNoForbiddenSecrets(content, file);
}

const executionPlan = contents.get('docs/release/launch-execution-plan.md');
const decisionSheet = contents.get('docs/release/operator-decision-sheet.md');
const uatTemplate = contents.get('docs/release/uat-evidence-template.md');
const smokePlan = contents.get('docs/release/staging-smoke-plan.md');

for (const blockerId of blockerIds) {
  assertContains(executionPlan, blockerId, 'docs/release/launch-execution-plan.md');
  assertContains(decisionSheet, blockerId, 'docs/release/operator-decision-sheet.md');
}

for (const uatId of uatIds) {
  assertContains(uatTemplate, uatId, 'docs/release/uat-evidence-template.md');
}

for (const smokeId of ['SMOKE-001', 'SMOKE-004', 'SMOKE-010']) {
  assertContains(smokePlan, smokeId, 'docs/release/staging-smoke-plan.md');
}

for (const phrase of [
  'Do not commit secrets',
  'Do not record',
  'docs/package/',
  'Codex must not invent or approve',
]) {
  assertContains(
    `${executionPlan}\n${decisionSheet}\n${smokePlan}`,
    phrase,
    'launch execution artifacts',
  );
}

const docsPackageDiff = execFileSync('git', ['diff', '--name-only', '--', 'docs/package'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
if (docsPackageDiff.length > 0) {
  throw new Error(`docs/package must remain frozen, but diff exists:\n${docsPackageDiff}`);
}

console.log('Launch execution artifacts verified.');
