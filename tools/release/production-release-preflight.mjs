import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'docs/release/production-execution-preflight.md',
  'docs/release/remaining-launch-tuw.md',
  'docs/release/evidence-register.md',
  'docs/release/launch-control-sheet.md',
  'docs/release/production-release-runbook.md',
  'docs/release/launch-blocker-ledger.md',
  'docs/release/enterprise-dms-ui-release-evidence.md',
  'docs/release/enterprise-dms-monitor-map.md',
  'docs/release/enterprise-dms-responsive-a11y-matrix.md',
  'docs/release/rollback-runbook.md',
  'docs/release/production-ui-rollout-checklist.md',
  'docs/ledger/gates/LOCAL_AI_PROD_READY_gate.md',
  'docs/release/local-ai-production-enablement-runbook.md',
];

const forbiddenSecretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /secret\s*[:=]\s*['"][^'"]+['"]/i,
  /\b\d{12}\b/,
  /arn:aws:[^\s|)]+/i,
];

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing production preflight file: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf8');
}

function assertContains(content, needle, file) {
  if (!content.includes(needle)) {
    throw new Error(`${file} must contain ${needle}`);
  }
}

function assertNoForbiddenSecrets(content, file) {
  const scanContent = content.replace(uuidPattern, 'UUID_REDACTED');
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(scanContent)) {
      throw new Error(
        `${file} appears to contain a forbidden secret or provider identifier pattern`,
      );
    }
  }
}

const contents = new Map();
for (const file of requiredFiles) {
  const content = readRequired(file);
  contents.set(file, content);
  assertNoForbiddenSecrets(content, file);
}

const preflight = contents.get('docs/release/production-execution-preflight.md');
for (const expected of [
  'PROD-REL-PREFLIGHT-AWS-2026-06-14-001',
  'PASSED - PRODUCTION CUSTOMER LAUNCH SMOKE VERIFIED',
  '42e7b29665406dc1b6f110acf4a79e8453e2c8c5',
  'f4b69249c28ebf9e4465f36841af5d6c40fe7743',
  '65e2db1b401f02c52c58b87bd7af755b24b68483',
  'approved customer documents through app-controlled upload/versioning only',
  'Do not reuse the AWS staging target as production',
  'PROD-INFRA-AWS-001',
  'PROD-DEPLOY-WORKFLOW-AWS-001',
  'PROD-SMOKE-AWS-001',
  'SMOKE-011',
  'PROD-PATCH-D80FBB5-DEPLOY-2026-06-15',
  'PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15',
  'PROD-PATCH-42E7B29-DEPLOY-2026-06-15',
  'PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15',
  'PROD-PATCH-46C6B14-DEPLOY-2026-06-16',
  'PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16',
  'PROD-PATCH-70F0944-UIUX-DEPLOY-2026-06-18',
  'PROD-PATCH-70F0944-UIUX-PUBLIC-SMOKE-2026-06-18',
  'PROD-LAI-UPLOAD-PREP-CANARY-ENABLE-2026-06-16',
  'PROD-LAI-UPLOAD-PREP-CANARY-PUBLIC-SMOKE-2026-06-16',
  'PROD-LAI-FILE-ORG-FULL-ENABLE-2026-06-16',
  'PROD-LAI-FILE-ORG-FULL-SMOKE-2026-06-16',
  'd80fbb5d5bf339ed11ddd6bca27b9e937bd83811',
  '46c6b14c4d0fd143b478e3184018635c9f96568a',
  '70f094490b1eab41b04b1c48137b47a585263f5c',
  '62b35cd497e1482e5e0fb5bd898e09ffa88270b',
  'c9dc922d50fe7b39b52f023d1942d8b7c5ad4cac',
  'SMOKE-015',
  'PROD-MONITOR-ALARMS-AWS-2026-06-15',
  'APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15',
  'APPROVAL-LRB-014-JWS-OWNER-2026-06-15',
  'PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15',
]) {
  assertContains(preflight, expected, 'docs/release/production-execution-preflight.md');
}

assertContains(
  contents.get('docs/release/remaining-launch-tuw.md'),
  'EV-PROD-006 / EV-PROD-007 / PROD-SMOKE-AWS-001',
  'docs/release/remaining-launch-tuw.md',
);
assertContains(
  contents.get('docs/release/remaining-launch-tuw.md'),
  'active-monitoring',
  'docs/release/remaining-launch-tuw.md',
);
assertContains(
  contents.get('docs/release/remaining-launch-tuw.md'),
  'REL-PROD-PATCH-D80FBB5-TUW-010A',
  'docs/release/remaining-launch-tuw.md',
);
assertContains(
  contents.get('docs/release/evidence-register.md'),
  'EV-PROD-007',
  'docs/release/evidence-register.md',
);
for (const expected of [
  'EV-PROD-008',
  'EV-PROD-009',
  'EV-PROD-010',
  'EV-PROD-011',
  'EV-PROD-012',
  'EV-PROD-013',
  'EV-PROD-014',
  'EV-PROD-015',
  'EV-PROD-016',
  'EV-PROD-017',
]) {
  assertContains(
    contents.get('docs/release/evidence-register.md'),
    expected,
    'docs/release/evidence-register.md',
  );
}
assertContains(
  contents.get('docs/release/launch-control-sheet.md'),
  'PROD-CUSTOMER-LAUNCH-FINAL-SMOKE-2026-06-15',
  'docs/release/launch-control-sheet.md',
);
for (const expected of [
  'PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15',
  'PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15',
  'PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16',
]) {
  assertContains(
    contents.get('docs/release/launch-control-sheet.md'),
    expected,
    'docs/release/launch-control-sheet.md',
  );
}
assertContains(
  contents.get('docs/release/production-release-runbook.md'),
  'DEPLOYED - POST-LAUNCH MONITORING',
  'docs/release/production-release-runbook.md',
);
for (const expected of [
  'TECHNICAL_READY PASS',
  'GOVERNANCE_APPROVAL APPROVED_FOR_FILE_ORG_FULL_RELEASE',
  'PRODUCTION_ENABLEMENT FULL_RELEASE_ACTIVE',
  'UPLOAD_PREP_ENABLEMENT FULL_RELEASE_FILE_ORG_PREP',
  'LOCAL_GEMMA_ENABLED=true',
  'AI_PREP_ENABLED=true',
  'AI_PREP_QUEUE_WORKER_ENABLED=true',
  'AI_PREP_REQUIRE_TENANT_ALLOWLIST=false',
  'PGBOSS_MIGRATE_ENABLED=false',
  'PGBOSS_CREATE_SCHEMA_ENABLED=false',
]) {
  assertContains(
    contents.get('docs/ledger/gates/LOCAL_AI_PROD_READY_gate.md'),
    expected,
    'docs/ledger/gates/LOCAL_AI_PROD_READY_gate.md',
  );
}
assertContains(
  contents.get('docs/release/local-ai-production-enablement-runbook.md'),
  'FILE ORGANIZATION PREP FULL RELEASE ACTIVE',
  'docs/release/local-ai-production-enablement-runbook.md',
);
const dmsEvidence = contents.get('docs/release/enterprise-dms-ui-release-evidence.md');
for (const expected of [
  'DMS-GA-305/DMS-GA-701 Release Evidence Bridge',
  'DMS-GA-702 Release Evidence Bridge',
  'EV-DMS-UI-005B',
  'RB-DMS-001-ROUTE-VISIBILITY',
  'RB-DMS-002-MATTER-SOURCE-FLAGS',
  'RB-DMS-003-WORKER-FLAGS',
  'RB-DMS-004-DB-AUDIT-INVARIANTS',
  'RB-DMS-005-STORAGE-INTEGRITY',
  'RB-DMS-006-MONITOR-TRIGGERS',
  'RB-DMS-007-OFFICE-ONEDRIVE-GATE',
  'DMS-GA-703 Release Evidence Bridge',
  'RA-DMS-GUARD-001',
  'DMS-RA-001',
  'DMS-RA-007',
  'DMS-GA-704 Release Evidence Bridge',
  'EV-DMS-UI-006A',
  'GUARD-DMS-001-SURFACE-COVERAGE',
  'GUARD-DMS-002-NO-FAKE-DATA',
  'GUARD-DMS-003-NO-INTERNAL-REFS',
  'GUARD-DMS-004-AI-SCOPE-EXCLUSION',
  'MON-DMS-001A-UPLOAD-FAILURE-RATE',
  'MON-DMS-003B-REINDEX-QUEUE-AGE',
  'MON-DMS-003C-REINDEX-FAILURE-RATE',
  'MON-DMS-008C-OFFICE-ONEDRIVE-CLAIM-GATE',
]) {
  assertContains(dmsEvidence, expected, 'docs/release/enterprise-dms-ui-release-evidence.md');
}
const dmsResponsiveA11y = contents.get('docs/release/enterprise-dms-responsive-a11y-matrix.md');
for (const expected of [
  'Status: REQUIRED BEFORE DMS PRODUCTION SIGNOFF - EXTERNAL REFS ONLY',
  'DMS-GA-703',
  'DMS-UX-806',
  'DMS-UX-807',
  'RA-DMS-GUARD-001',
  'RA-DMS-GUARD-002',
  'RA-DMS-GUARD-003',
  'RA-DMS-GUARD-004',
  'DMS-RA-001',
  'DMS-RA-002',
  'DMS-RA-003',
  'DMS-RA-004',
  'DMS-RA-005',
  'DMS-RA-006',
  'DMS-RA-007',
  '1440px',
  '768px',
  '375px',
  'KEYBOARD',
  'SR-BASICS',
  'Missing route coverage',
]) {
  assertContains(dmsResponsiveA11y, expected, 'docs/release/enterprise-dms-responsive-a11y-matrix.md');
}
const dmsRollbackRunbook = contents.get('docs/release/rollback-runbook.md');
for (const expected of [
  'Enterprise DMS Rollback Drill',
  'DMS-GA-702',
  'Rollback owner must be assigned',
  'No Enterprise DMS rollback step may hard delete',
  'Audit history remains append-only',
  'DMS-RB-001',
  'DMS-RB-002',
  'DMS-RB-003',
  'DMS-RB-004',
  'DMS-RB-005',
  'DMS-RB-006',
  'DMS-RB-007',
  'RB-DMS-001-ROUTE-VISIBILITY',
  'RB-DMS-002-MATTER-SOURCE-FLAGS',
  'RB-DMS-003-WORKER-FLAGS',
  'RB-DMS-004-DB-AUDIT-INVARIANTS',
  'RB-DMS-005-STORAGE-INTEGRITY',
  'RB-DMS-006-MONITOR-TRIGGERS',
  'RB-DMS-007-OFFICE-ONEDRIVE-GATE',
  'MATTER_APP_SOURCE_MODE',
  'AI_PREP_ENABLED=false',
  'AI_PREP_QUEUE_WORKER_ENABLED=false',
  'LOCAL_GEMMA_ENABLED=false',
  'AI_SUMMARY_GEMMA_ENABLED=false',
  'MON-DMS-001',
  'MON-DMS-008',
  'hidden_until_api_ready',
]) {
  assertContains(dmsRollbackRunbook, expected, 'docs/release/rollback-runbook.md');
}
const dmsMonitorMap = contents.get('docs/release/enterprise-dms-monitor-map.md');
for (const expected of [
  'Status: REQUIRED BEFORE DMS PRODUCTION SIGNOFF - EXTERNAL REFS ONLY',
  'DMS-GA-305 Reindex Evidence Contract',
  'REINDEX-DMS-001',
  'REINDEX-DMS-002',
  'REINDEX-DMS-005',
  'DMS-MON-001',
  'DMS-MON-002',
  'DMS-MON-003',
  'DMS-MON-004',
  'DMS-MON-005',
  'DMS-MON-006',
  'DMS-MON-007',
  'DMS-MON-008',
  'Missing query refs are not a code failure, but they are a release blocker.',
]) {
  assertContains(dmsMonitorMap, expected, 'docs/release/enterprise-dms-monitor-map.md');
}
assertContains(
  contents.get('docs/release/production-ui-rollout-checklist.md'),
  'MON-DMS-001*',
  'docs/release/production-ui-rollout-checklist.md',
);
for (const expected of [
  'DMS-RB-001',
  'DMS-RB-007',
  'RB-DMS-001*',
  'RB-DMS-007*',
  'HOLD` until rollback owner and drill refs attached',
  'RA-DMS-001C-375',
  'RA-DMS-007E-SR-BASICS',
  'UI-PRE-009',
  'GUARD-DMS-001*',
  'GUARD-DMS-004*',
]) {
  assertContains(
    contents.get('docs/release/production-ui-rollout-checklist.md'),
    expected,
    'docs/release/production-ui-rollout-checklist.md',
  );
}
assertContains(
  contents.get('docs/release/evidence-register.md'),
  'EV-LAI-PROD-002',
  'docs/release/evidence-register.md',
);
assertContains(
  contents.get('docs/release/evidence-register.md'),
  'approved-runtime-canary',
  'docs/release/evidence-register.md',
);
assertContains(
  contents.get('docs/release/evidence-register.md'),
  'EV-LAI-PROD-007',
  'docs/release/evidence-register.md',
);
assertContains(
  contents.get('docs/release/evidence-register.md'),
  'PROD-LAI-UPLOAD-PREP-CANARY-PUBLIC-SMOKE-2026-06-16',
  'docs/release/evidence-register.md',
);
assertContains(
  contents.get('docs/release/evidence-register.md'),
  'EV-LAI-PROD-009',
  'docs/release/evidence-register.md',
);
assertContains(
  contents.get('docs/release/evidence-register.md'),
  'active-full-release',
  'docs/release/evidence-register.md',
);
for (const expected of [
  'PROD-PATCH-D80FBB5-DEPLOY-2026-06-15',
  'PROD-PATCH-42E7B29-DEPLOY-2026-06-15',
  'PROD-PATCH-46C6B14-DEPLOY-2026-06-16',
  'PROD-PATCH-70F0944-UIUX-DEPLOY-2026-06-18',
  'PROD-PATCH-70F0944-UIUX-PUBLIC-SMOKE-2026-06-18',
]) {
  assertContains(
    contents.get('docs/release/production-release-runbook.md'),
    expected,
    'docs/release/production-release-runbook.md',
  );
}
assertContains(
  contents.get('docs/release/launch-blocker-ledger.md'),
  'PROD-SMOKE-AWS-001',
  'docs/release/launch-blocker-ledger.md',
);
for (const expected of [
  'PROD-PATCH-D80FBB5-FULL-SMOKE-2026-06-15',
  'PROD-PATCH-42E7B29-FULL-SMOKE-2026-06-15',
  'PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16',
]) {
  assertContains(
    contents.get('docs/release/launch-blocker-ledger.md'),
    expected,
    'docs/release/launch-blocker-ledger.md',
  );
}
assertContains(
  contents.get('docs/release/launch-blocker-ledger.md'),
  'APPROVAL-LRB-007-CUSTOMER-DATA-2026-06-15',
  'docs/release/launch-blocker-ledger.md',
);

const docsPackageDiff = execFileSync('git', ['diff', '--name-only', '--', 'docs/package'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
if (docsPackageDiff.length > 0) {
  throw new Error(`docs/package must remain frozen, but diff exists:\n${docsPackageDiff}`);
}

const result = {
  evidenceRef: 'PROD-PATCH-70F0944-UIUX-PUBLIC-SMOKE-2026-06-18',
  status: 'prod-patch-70f0944-uiux-public-smoke-passed',
  deploymentExecuted: true,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Production release preflight verified: ${result.evidenceRef} (${result.status})`);
}
