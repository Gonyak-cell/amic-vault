import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

// This validator is the production-readiness gate index. Route/code scanning is
// still enforced by eval:ai-gate and ai-prep:scan in the gate command set.
const requiredFiles = [
  'docs/ledger/gates/LOCAL_AI_PROD_READY_gate.md',
  'docs/ledger/gates/LOCAL_AI_gate.md',
  'docs/release/local-ai-ops-runbook.md',
  'docs/release/local-ai-production-enablement-runbook.md',
  'docs/release/production-release-runbook.md',
  'docs/release/evidence-register.md',
  'docs/reports/gemma4_hardening_l0_evidence.md',
  'package.json',
];

const forbiddenSecretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /secret\s*[:=]\s*['"][^'"]+['"]/i,
  /https?:\/\/(?!127\.0\.0\.1)(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?[^\s)`|]*/i,
  /https?:\/\/(?!127\.0\.0\.1(?::|\/|$)|localhost(?::|\/|$)|example\.com(?::|\/|$))[^\s)`|]*(?:amazonaws\.com|cloudfront\.net|execute-api\.)[^\s)`|]*/i,
];

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing Local AI production readiness file: ${relativePath}`);
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

const gate = contents.get('docs/ledger/gates/LOCAL_AI_PROD_READY_gate.md');
for (const expected of [
  'TECHNICAL_READY PASS',
  'GOVERNANCE_APPROVAL BLOCKED',
  'PRODUCTION_ENABLEMENT BLOCKED',
  'local_gemma',
  'gemma4:12b',
  'externalModelCallAttempts 0',
  'LOCAL_GEMMA_ENABLED=false',
  'AI_PREP_ENABLED=false',
  'AI_PREP_QUEUE_WORKER_ENABLED=false',
  'AI_SUMMARY_GEMMA_ENABLED=false',
  'APPROVAL-LAI-PROD-OPERATOR',
  'APPROVAL-LAI-PROD-SECURITY',
  'APPROVAL-LAI-PROD-LEGAL-DATA',
  'APPROVAL-LAI-PROD-CUSTOMER-SCOPE',
  'PROD-LAI-ENV-AUDIT',
  'PROD-LAI-ALERT-DELIVERY',
  'PROD-LAI-ROLLBACK-OWNER',
  'pnpm local-ai:prod-ready',
]) {
  assertContains(gate, expected, 'docs/ledger/gates/LOCAL_AI_PROD_READY_gate.md');
}

if (
  gate.includes('YYYY-MM-DD') &&
  (!gate.includes('GOVERNANCE_APPROVAL BLOCKED') || !gate.includes('PRODUCTION_ENABLEMENT BLOCKED'))
) {
  throw new Error(
    'LOCAL_AI_PROD_READY_gate.md cannot retain YYYY-MM-DD placeholders after governance or enablement is unblocked',
  );
}

const enablement = contents.get('docs/release/local-ai-production-enablement-runbook.md');
for (const expected of [
  'PLAN ONLY - DO NOT ENABLE',
  'Enablement Order After Approval',
  'AI_PREP_TENANT_MAX_CONCURRENCY=1',
  'AI_SUMMARY_GEMMA_ENABLED=false',
  'Rollback',
  'Emergency Disable',
  'externalModelCallAttempts=0',
]) {
  assertContains(enablement, expected, 'docs/release/local-ai-production-enablement-runbook.md');
}

const opsRunbook = contents.get('docs/release/local-ai-ops-runbook.md');
for (const expected of [
  'Production-disabled defaults',
  'LOCAL_GEMMA_ENABLED=false',
  'AI_PREP_QUEUE_WORKER_ENABLED=false',
  'PACK-LAI-20 governance gate',
]) {
  assertContains(opsRunbook, expected, 'docs/release/local-ai-ops-runbook.md');
}

const productionRunbook = contents.get('docs/release/production-release-runbook.md');
for (const expected of [
  'LOCAL_AI_PROD_READY_gate.md',
  'local-ai-production-enablement-runbook.md',
  'Local Gemma runtime execution remains disabled',
]) {
  assertContains(productionRunbook, expected, 'docs/release/production-release-runbook.md');
}

const evidenceRegister = contents.get('docs/release/evidence-register.md');
for (const expected of [
  'EV-LAI-PROD-001',
  'EV-LAI-PROD-002',
  'EV-LAI-PROD-003',
  'approval-required',
]) {
  assertContains(evidenceRegister, expected, 'docs/release/evidence-register.md');
}

const packageJson = contents.get('package.json');
assertContains(packageJson, '"local-ai:prod-ready"', 'package.json');

console.log('local AI production readiness check passed');
