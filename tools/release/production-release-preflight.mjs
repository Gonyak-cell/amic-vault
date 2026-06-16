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
  'PROD-LAI-UPLOAD-PREP-CANARY-ENABLE-2026-06-16',
  'PROD-LAI-UPLOAD-PREP-CANARY-PUBLIC-SMOKE-2026-06-16',
  'd80fbb5d5bf339ed11ddd6bca27b9e937bd83811',
  '46c6b14c4d0fd143b478e3184018635c9f96568a',
  '62b35cd497e1482e5e0fb5bd898e09ffa88270b',
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
  'GOVERNANCE_APPROVAL APPROVED_FOR_RUNTIME_CANARY',
  'PRODUCTION_ENABLEMENT RUNTIME_CANARY_ACTIVE',
  'UPLOAD_PREP_ENABLEMENT ACTIVE_CANARY_FILE_ORG_PREP',
  'LOCAL_GEMMA_ENABLED=true',
  'AI_PREP_ENABLED=true',
  'AI_PREP_QUEUE_WORKER_ENABLED=true',
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
  'UPLOAD PREP QUEUE ACTIVE FOR FILE ORGANIZATION CANARY ONLY',
  'docs/release/local-ai-production-enablement-runbook.md',
);
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
for (const expected of [
  'PROD-PATCH-D80FBB5-DEPLOY-2026-06-15',
  'PROD-PATCH-42E7B29-DEPLOY-2026-06-15',
  'PROD-PATCH-46C6B14-DEPLOY-2026-06-16',
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
  evidenceRef: 'PROD-PATCH-46C6B14-FULL-SMOKE-2026-06-16',
  status: 'prod-patch-46c6b14-smoke-passed',
  deploymentExecuted: true,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Production release preflight verified: ${result.evidenceRef} (${result.status})`);
}
