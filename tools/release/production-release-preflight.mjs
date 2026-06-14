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
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(content)) {
      throw new Error(`${file} appears to contain a forbidden secret or provider identifier pattern`);
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
  'PASSED - PRODUCTION BOOTSTRAP AND SMOKE VERIFIED',
  '5ff600f60d86d7eb1122c882b265e9686ee02dc7',
  '65e2db1b401f02c52c58b87bd7af755b24b68483',
  'synthetic-data-only',
  'Do not reuse the AWS staging target as production',
  'PROD-INFRA-AWS-001',
  'PROD-DEPLOY-WORKFLOW-AWS-001',
  'PROD-SMOKE-AWS-001',
  'SMOKE-011',
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
  contents.get('docs/release/evidence-register.md'),
  'EV-PROD-007',
  'docs/release/evidence-register.md',
);
assertContains(
  contents.get('docs/release/launch-control-sheet.md'),
  'production-smoke-passed',
  'docs/release/launch-control-sheet.md',
);
assertContains(
  contents.get('docs/release/production-release-runbook.md'),
  'DEPLOYED - POST-LAUNCH MONITORING',
  'docs/release/production-release-runbook.md',
);
assertContains(
  contents.get('docs/release/launch-blocker-ledger.md'),
  'PROD-SMOKE-AWS-001',
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
  evidenceRef: 'PROD-SMOKE-AWS-001',
  status: 'production-smoke-passed',
  deploymentExecuted: true,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Production release preflight verified: ${result.evidenceRef} (${result.status})`);
}
