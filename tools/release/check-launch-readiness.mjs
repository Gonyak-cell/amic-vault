import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'docs/release/launch-readiness-pack.md',
  'docs/release/staging-deployment-plan.md',
  'docs/release/production-release-runbook.md',
  'docs/release/rollback-runbook.md',
  'docs/release/uat-checklist.md',
  'docs/release/launch-execution-plan.md',
  'docs/release/operator-decision-sheet.md',
  'docs/release/uat-evidence-template.md',
  'docs/release/staging-smoke-plan.md',
  'docs/release/security-evidence-index.md',
  'docs/release/launch-blocker-ledger.md',
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
  'docs/release/env.staging-smoke.example',
  'infra/ci/staging-deploy.yml',
  'infra/ci/prod-gate.yml',
  'infra/ci/PROD_GATE.md',
  'tools/release/check-launch-execution.mjs',
  'tools/release/staging-smoke.mjs',
  'tools/release/local-staging-preflight.mjs',
  '.github/workflows/ci.yml',
  'package.json',
];

const requiredBlockers = [
  'LRB-001',
  'LRB-002',
  'LRB-003',
  'LRB-004',
  'LRB-005',
  'LRB-006',
  'LRB-007',
  'LRB-008',
  'LRB-009',
  'LRB-010',
  'LRB-011',
  'LRB-012',
  'LRB-013',
  'LRB-014',
];

const forbiddenSecretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /sk-[A-Za-z0-9]{20,}/,
];

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing required launch readiness file: ${relativePath}`);
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

const pack = contents.get('docs/release/launch-readiness-pack.md');
for (const file of requiredFiles.slice(1, 11)) {
  assertContains(pack, file, 'docs/release/launch-readiness-pack.md');
}
for (const file of [
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
  'tools/release/staging-smoke.mjs',
  'tools/release/local-staging-preflight.mjs',
]) {
  assertContains(pack, file, 'docs/release/launch-readiness-pack.md');
}
assertContains(pack, 'PREPARED - NOT LAUNCHED', 'docs/release/launch-readiness-pack.md');
assertContains(pack, '9e346d9e48c962448bcccbbef9e30d9c3e468e4f', 'docs/release/launch-readiness-pack.md');
assertContains(pack, 'docs/package/', 'docs/release/launch-readiness-pack.md');

const blockerLedger = contents.get('docs/release/launch-blocker-ledger.md');
for (const blocker of requiredBlockers) {
  assertContains(blockerLedger, blocker, 'docs/release/launch-blocker-ledger.md');
}
assertContains(blockerLedger, 'approval-required', 'docs/release/launch-blocker-ledger.md');
assertContains(blockerLedger, 'TBD', 'docs/release/launch-blocker-ledger.md');

const staging = contents.get('infra/ci/staging-deploy.yml');
assertContains(staging, 'launch_readiness_version: 1', 'infra/ci/staging-deploy.yml');
assertContains(staging, 'deployment_enabled: false', 'infra/ci/staging-deploy.yml');
assertContains(staging, 'approval_required: true', 'infra/ci/staging-deploy.yml');
assertContains(staging, 'docs/release/uat-checklist.md', 'infra/ci/staging-deploy.yml');
assertContains(staging, 'docs/release/rollback-runbook.md', 'infra/ci/staging-deploy.yml');

const prod = contents.get('infra/ci/prod-gate.yml');
assertContains(prod, 'launch_readiness_version: 1', 'infra/ci/prod-gate.yml');
assertContains(prod, 'approval_required: true', 'infra/ci/prod-gate.yml');
assertContains(prod, 'enabled: false', 'infra/ci/prod-gate.yml');
assertContains(prod, 'docs/release/production-release-runbook.md', 'infra/ci/prod-gate.yml');
assertContains(prod, 'docs/release/rollback-runbook.md', 'infra/ci/prod-gate.yml');

const uat = contents.get('docs/release/uat-checklist.md');
for (const uatId of ['UAT-001', 'UAT-010', 'UAT-020']) {
  assertContains(uat, uatId, 'docs/release/uat-checklist.md');
}

const stagingInputChecklist = contents.get('docs/release/staging-input-checklist.md');
for (const expected of ['STAGE-IN-001', 'STAGE-IN-008', 'Evidence ref only']) {
  assertContains(stagingInputChecklist, expected, 'docs/release/staging-input-checklist.md');
}

const syntheticUatScenarios = contents.get('docs/release/synthetic-uat-scenarios.md');
for (const expected of ['UAT-001', 'UAT-020', 'EV-UAT-020']) {
  assertContains(syntheticUatScenarios, expected, 'docs/release/synthetic-uat-scenarios.md');
}

const launchControlSheet = contents.get('docs/release/launch-control-sheet.md');
for (const expected of ['PREPARED - NOT LAUNCHED', 'pnpm launch:execution', 'LRB-013']) {
  assertContains(launchControlSheet, expected, 'docs/release/launch-control-sheet.md');
}
assertContains(launchControlSheet, 'pnpm release:local-preflight', 'docs/release/launch-control-sheet.md');

const evidenceIndex = contents.get('docs/release/security-evidence-index.md');
for (const evidence of [
  'docs/ledger/gates/R14_gate.md',
  'docs/reports/R14_scale_learning.md',
  'pnpm launch:readiness',
]) {
  assertContains(evidenceIndex, evidence, 'docs/release/security-evidence-index.md');
}

const rcFreeze = contents.get('docs/release/rc-freeze-decision-pack.md');
for (const expected of ['9e346d9e48c962448bcccbbef9e30d9c3e468e4f', '#66', '#67', '#68', '#69', 'operator decision']) {
  assertContains(rcFreeze, expected, 'docs/release/rc-freeze-decision-pack.md');
}

const evidenceRegister = contents.get('docs/release/evidence-register.md');
for (const expected of ['EV-RC-001', 'EV-STAGE-001', 'EV-UAT-001', 'EV-PROD-005']) {
  assertContains(evidenceRegister, expected, 'docs/release/evidence-register.md');
}

const remainingTuw = contents.get('docs/release/remaining-launch-tuw.md');
for (const expected of [
  'REL-RC-FREEZE-TUW-001',
  'REL-SMOKE-AUTO-TUW-004',
  'REL-STAGE-LOCAL-PREFLIGHT-TUW-004B',
  'REL-ACTUAL-RUNBOOK-TUW-007B',
  'REL-PROD-REL-TUW-010',
]) {
  assertContains(remainingTuw, expected, 'docs/release/remaining-launch-tuw.md');
}

const actualLaunchRunbook = contents.get('docs/release/actual-launch-runbook.md');
for (const expected of [
  'READY FOR OPERATOR INPUT - NO DEPLOYMENT EXECUTED',
  '9e346d9e48c962448bcccbbef9e30d9c3e468e4f',
  'SMOKE-011',
  'LRB-001',
  'LRB-013',
  'pnpm release:local-preflight',
  'production-release-runbook.md',
]) {
  assertContains(actualLaunchRunbook, expected, 'docs/release/actual-launch-runbook.md');
}

const smokeScript = contents.get('tools/release/staging-smoke.mjs');
for (const expected of ['SMOKE-001', 'SMOKE-010', 'SMOKE-011', 'SMOKE_REQUIRE_AUTH']) {
  assertContains(smokeScript, expected, 'tools/release/staging-smoke.mjs');
}
const localPreflight = contents.get('docs/release/local-staging-preflight.md');
for (const expected of ['pnpm release:local-preflight', 'PRE-020', 'isolated local']) {
  assertContains(localPreflight, expected, 'docs/release/local-staging-preflight.md');
}
assertContains(
  contents.get('tools/release/local-staging-preflight.mjs'),
  'local-staging-preflight',
  'tools/release/local-staging-preflight.mjs',
);

const packageJson = contents.get('package.json');
assertContains(packageJson, '"release:smoke"', 'package.json');
assertContains(packageJson, '"release:local-preflight"', 'package.json');

const ciWorkflow = contents.get('.github/workflows/ci.yml');
assertContains(ciWorkflow, 'pnpm launch:readiness', '.github/workflows/ci.yml');
assertContains(ciWorkflow, 'pnpm launch:execution', '.github/workflows/ci.yml');

const docsPackageDiff = execFileSync('git', ['diff', '--name-only', '--', 'docs/package'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
if (docsPackageDiff.length > 0) {
  throw new Error(`docs/package must remain frozen, but diff exists:\n${docsPackageDiff}`);
}

console.log('Launch readiness artifacts verified.');
