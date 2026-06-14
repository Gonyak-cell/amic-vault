import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'docs/release/launch-execution-plan.md',
  'docs/release/operator-decision-sheet.md',
  'docs/release/uat-evidence-template.md',
  'docs/release/synthetic-uat-evidence.md',
  'docs/release/staging-smoke-plan.md',
  'docs/release/launch-blocker-ledger.md',
  'docs/release/uat-checklist.md',
  'docs/release/security-evidence-index.md',
  'docs/release/rc-freeze-decision-pack.md',
  'docs/release/release-notes-rc-9e346d9.md',
  'docs/release/evidence-register.md',
  'docs/release/remaining-launch-tuw.md',
  'docs/release/local-synthetic-uat-walkthrough.md',
  'docs/release/local-staging-preflight.md',
  'docs/release/staging-input-checklist.md',
  'docs/release/synthetic-uat-scenarios.md',
  'docs/release/launch-control-sheet.md',
  'docs/release/actual-launch-runbook.md',
  'docs/release/production-execution-preflight.md',
  'docs/release/env.staging-smoke.example',
  'tools/release/staging-smoke.mjs',
  'tools/release/synthetic-uat-evidence.mjs',
  'tools/release/local-staging-preflight.mjs',
  'tools/release/production-release-preflight.mjs',
  '.github/workflows/ci.yml',
  'package.json',
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
const syntheticUatEvidence = contents.get('docs/release/synthetic-uat-evidence.md');
const smokePlan = contents.get('docs/release/staging-smoke-plan.md');
const rcFreeze = contents.get('docs/release/rc-freeze-decision-pack.md');
const evidenceRegister = contents.get('docs/release/evidence-register.md');
const remainingTuw = contents.get('docs/release/remaining-launch-tuw.md');
const localWalkthrough = contents.get('docs/release/local-synthetic-uat-walkthrough.md');
const localPreflight = contents.get('docs/release/local-staging-preflight.md');
const stagingInputChecklist = contents.get('docs/release/staging-input-checklist.md');
const syntheticUatScenarios = contents.get('docs/release/synthetic-uat-scenarios.md');
const launchControlSheet = contents.get('docs/release/launch-control-sheet.md');
const actualLaunchRunbook = contents.get('docs/release/actual-launch-runbook.md');
const smokeScript = contents.get('tools/release/staging-smoke.mjs');
const productionPreflight = contents.get('docs/release/production-execution-preflight.md');
const ciWorkflow = contents.get('.github/workflows/ci.yml');
const packageJson = contents.get('package.json');

for (const blockerId of blockerIds) {
  assertContains(executionPlan, blockerId, 'docs/release/launch-execution-plan.md');
  assertContains(decisionSheet, blockerId, 'docs/release/operator-decision-sheet.md');
}

for (const uatId of uatIds) {
  assertContains(uatTemplate, uatId, 'docs/release/uat-evidence-template.md');
  assertContains(syntheticUatScenarios, uatId, 'docs/release/synthetic-uat-scenarios.md');
  assertContains(syntheticUatEvidence, uatId, 'docs/release/synthetic-uat-evidence.md');
  assertContains(syntheticUatEvidence, `EV-UAT-${uatId.slice(4)}`, 'docs/release/synthetic-uat-evidence.md');
}

for (const smokeId of ['SMOKE-001', 'SMOKE-004', 'SMOKE-010', 'SMOKE-011']) {
  assertContains(smokePlan, smokeId, 'docs/release/staging-smoke-plan.md');
  assertContains(smokeScript, smokeId, 'tools/release/staging-smoke.mjs');
}

for (const expected of ['9e346d9e48c962448bcccbbef9e30d9c3e468e4f', '#66', '#67', '#68', '#69']) {
  assertContains(rcFreeze, expected, 'docs/release/rc-freeze-decision-pack.md');
}

for (const expected of ['EV-RC-001', 'EV-STAGE-001', 'EV-PROD-005', 'EV-PROD-006']) {
  assertContains(evidenceRegister, expected, 'docs/release/evidence-register.md');
}

for (const expected of ['REL-RC-FREEZE-TUW-001', 'REL-SMOKE-AUTO-TUW-004', 'REL-PROD-REL-TUW-010']) {
  assertContains(remainingTuw, expected, 'docs/release/remaining-launch-tuw.md');
}
for (const expected of [
  'REL-STAGE-INPUT-TUW-004A',
  'REL-STAGE-LOCAL-PREFLIGHT-TUW-004B',
  'REL-UAT-SCENARIOS-TUW-006A',
  'REL-LAUNCH-CONTROL-TUW-007A',
  'REL-ACTUAL-RUNBOOK-TUW-007B',
]) {
  assertContains(remainingTuw, expected, 'docs/release/remaining-launch-tuw.md');
}

for (const expected of ['pnpm release:smoke -- --dry-run', 'pnpm release:smoke -- --local']) {
  assertContains(localWalkthrough, expected, 'docs/release/local-synthetic-uat-walkthrough.md');
  assertContains(launchControlSheet, expected, 'docs/release/launch-control-sheet.md');
}
for (const expected of [
  'pnpm release:local-preflight',
  'PRE-020',
  'LRB-001',
  'isolated local',
]) {
  assertContains(localPreflight, expected, 'docs/release/local-staging-preflight.md');
}

for (const expected of ['STAGE-IN-001', 'STAGE-IN-008', 'Evidence ref only']) {
  assertContains(stagingInputChecklist, expected, 'docs/release/staging-input-checklist.md');
}

for (const expected of ['EV-UAT-001', 'EV-UAT-020', 'negative permission']) {
  assertContains(syntheticUatScenarios, expected, 'docs/release/synthetic-uat-scenarios.md');
}
for (const expected of [
  'SYNTH-UAT-TECH-2026-06-14-001',
  'accepted',
  'pnpm release:uat',
  'APPROVAL-LRB-011-SYNTH-UAT-2026-06-14',
]) {
  assertContains(syntheticUatEvidence, expected, 'docs/release/synthetic-uat-evidence.md');
}

for (const expected of [
  'PROD-REL-PREFLIGHT-AWS-2026-06-14-001',
  'blocked-prod-infra',
  'Do not reuse the AWS staging target as production',
]) {
  assertContains(productionPreflight, expected, 'docs/release/production-execution-preflight.md');
}

for (const expected of ['PREPARED - NOT LAUNCHED', 'LRB-001', 'pnpm launch:execution', 'pnpm release:uat']) {
  assertContains(launchControlSheet, expected, 'docs/release/launch-control-sheet.md');
}

for (const expected of [
  'READY FOR OPERATOR INPUT - NO DEPLOYMENT EXECUTED',
  '9e346d9e48c962448bcccbbef9e30d9c3e468e4f',
  'SMOKE-011',
  'LRB-001',
  'LRB-013',
  'Do not commit secrets',
  'pnpm release:smoke -- --json',
  'pnpm release:local-preflight',
  'production-release-runbook.md',
]) {
  assertContains(actualLaunchRunbook, expected, 'docs/release/actual-launch-runbook.md');
}

assertContains(smokeScript, 'SMOKE_REQUIRE_AUTH', 'tools/release/staging-smoke.mjs');
assertContains(
  contents.get('tools/release/local-staging-preflight.mjs'),
  'local-staging-preflight',
  'tools/release/local-staging-preflight.mjs',
);
assertContains(
  contents.get('tools/release/production-release-preflight.mjs'),
  'Production release preflight',
  'tools/release/production-release-preflight.mjs',
);
assertContains(ciWorkflow, 'pnpm launch:execution', '.github/workflows/ci.yml');
assertContains(ciWorkflow, 'pnpm release:prod-preflight', '.github/workflows/ci.yml');
assertContains(packageJson, '"release:smoke"', 'package.json');
assertContains(packageJson, '"release:uat"', 'package.json');
assertContains(packageJson, '"release:local-preflight"', 'package.json');
assertContains(packageJson, '"release:prod-preflight"', 'package.json');

for (const phrase of [
  'Do not commit secrets',
  'Do not record',
  'docs/package/',
  'Codex must not invent or approve',
  'pnpm release:smoke',
]) {
  assertContains(
    `${executionPlan}\n${decisionSheet}\n${smokePlan}\n${localWalkthrough}`,
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
