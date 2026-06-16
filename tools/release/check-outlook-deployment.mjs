import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'docs/release/outlook-addin-deployment-runbook.md',
  'docs/release/outlook-addin-graph-scope-matrix.md',
  'docs/release/evidence-register.md',
  'docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md',
  'docs/execution/PACKS_R4_R14.md',
  'docs/security/outlook-addin-threat-model.md',
  'docs/integrations/outlook-addin-api-contract.md',
  'apps/web/public/outlook-addin/manifest.xml',
  'apps/web/public/outlook-addin/smart-alerts.js',
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

const forbiddenTenantEvidencePatterns = [
  /[a-z0-9.-]+\.onmicrosoft\.com/i,
  /login\.microsoftonline\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  /admin\.microsoft\.com/i,
  /portal\.azure\.com/i,
  /entra\.microsoft\.com/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing Outlook deployment file: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf8');
}

function assertContains(content, needle, file) {
  if (!content.includes(needle)) {
    throw new Error(`${file} must contain ${needle}`);
  }
}

function assertNotContains(content, needle, file) {
  if (content.includes(needle)) {
    throw new Error(`${file} must not contain ${needle}`);
  }
}

function assertNoForbiddenSecrets(content, file) {
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(content)) {
      throw new Error(`${file} appears to contain a forbidden secret pattern`);
    }
  }
}

function assertNoConcreteExternalUrl(content, file) {
  const urls = content.match(/https?:\/\/[^\s)'"<>]+/g) ?? [];
  const unexpected = urls.filter((url) => {
    const normalized = url.toLowerCase();
    return (
      !normalized.startsWith('https://learn.microsoft.com/') &&
      !normalized.startsWith('https://localhost:') &&
      !normalized.startsWith('http://localhost:')
    );
  });
  if (unexpected.length > 0) {
    throw new Error(`${file} contains concrete external URL(s): ${unexpected.join(', ')}`);
  }
}

function assertNoConcreteTenantEvidence(content, file) {
  for (const pattern of forbiddenTenantEvidencePatterns) {
    if (pattern.test(content)) {
      throw new Error(`${file} appears to contain concrete tenant/admin evidence`);
    }
  }
}

function evidenceRow(content, evidenceId) {
  const line = content
    .split('\n')
    .find((row) => row.trim().startsWith(`| ${evidenceId} `));
  if (!line) {
    throw new Error(`docs/release/evidence-register.md must contain row ${evidenceId}`);
  }
  const columns = line.split('|').map((column) => column.trim());
  if (columns.length < 7) {
    throw new Error(`docs/release/evidence-register.md row ${evidenceId} is malformed`);
  }
  return {
    id: columns[1],
    status: columns[3],
    evidenceRef: columns[5],
    notes: columns[6],
  };
}

const contents = new Map();
for (const file of requiredFiles) {
  const content = readRequired(file);
  contents.set(file, content);
  assertNoForbiddenSecrets(content, file);
}

const runbook = contents.get('docs/release/outlook-addin-deployment-runbook.md');
const scopeMatrix = contents.get('docs/release/outlook-addin-graph-scope-matrix.md');
const evidence = contents.get('docs/release/evidence-register.md');
const plan = contents.get('docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md');
const packs = contents.get('docs/execution/PACKS_R4_R14.md');
const manifest = contents.get('apps/web/public/outlook-addin/manifest.xml');
const smartAlerts = contents.get('apps/web/public/outlook-addin/smart-alerts.js');
const packageJson = contents.get('package.json');

for (const file of [
  'docs/release/outlook-addin-deployment-runbook.md',
  'docs/release/evidence-register.md',
]) {
  const content = contents.get(file);
  assertNoConcreteExternalUrl(content, file);
  assertNoConcreteTenantEvidence(content, file);
}

for (const section of [
  '## Non-Negotiable Boundaries',
  '## Deployment Authorities',
  '## Required Repository Evidence',
  '## Runtime Gate Order',
  '## Manifest Validation',
  '## Microsoft 365 Integrated Apps Rollout Rings',
  '## Production Readiness Checklist',
  '## Disable And Rollback',
  '## Support Escalation',
  '## Stop Conditions',
]) {
  assertContains(runbook, section, 'docs/release/outlook-addin-deployment-runbook.md');
}

for (const ring of ['Ring 0', 'Ring 1', 'Ring 2', 'Ring 3']) {
  assertContains(runbook, ring, 'docs/release/outlook-addin-deployment-runbook.md');
}

for (const flag of [
  'OUTLOOK_ADDIN_ENABLED',
  'OUTLOOK_AUTH_EXCHANGE_ENABLED',
  'OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED',
  'OUTLOOK_SMART_ALERTS_ENABLED',
  'OUTLOOK_SEND_FILE_ENABLED',
  'OUTLOOK_DOCUMENT_INSERTION_ENABLED',
  'OUTLOOK_FOLDER_MAPPING_ENABLED',
  'OUTLOOK_AUTOFILE_ENABLED',
]) {
  assertContains(runbook, flag, 'docs/release/outlook-addin-deployment-runbook.md');
}

for (const evidenceId of Array.from({ length: 10 }, (_, index) => {
  return `EV-OUTLOOK-${String(index + 1).padStart(3, '0')}`;
})) {
  assertContains(evidence, evidenceId, 'docs/release/evidence-register.md');
  assertContains(runbook, evidenceId, 'docs/release/outlook-addin-deployment-runbook.md');
}

for (const [evidenceId, expectedStatus] of [
  ['EV-OUTLOOK-001', 'prepared'],
  ['EV-OUTLOOK-002', 'blocked'],
  ['EV-OUTLOOK-003', 'blocked'],
  ['EV-OUTLOOK-004', 'prepared'],
  ['EV-OUTLOOK-005', 'prepared'],
  ['EV-OUTLOOK-006', 'prepared'],
  ['EV-OUTLOOK-007', 'prepared'],
  ['EV-OUTLOOK-008', 'prepared'],
  ['EV-OUTLOOK-009', 'prepared'],
  ['EV-OUTLOOK-010', 'prepared'],
]) {
  const row = evidenceRow(evidence, evidenceId);
  if (row.status !== expectedStatus) {
    throw new Error(
      `docs/release/evidence-register.md ${evidenceId} status must be ${expectedStatus}`,
    );
  }
}

for (const [evidenceId, expectedRef] of [
  ['EV-OUTLOOK-002', 'PENDING-M365-INTEGRATION-GATE'],
  ['EV-OUTLOOK-003', 'PENDING-TENANT-ADMIN-CONSENT'],
  ['EV-OUTLOOK-010', 'pnpm outlook:deployment:check'],
]) {
  const row = evidenceRow(evidence, evidenceId);
  if (!row.evidenceRef.includes(expectedRef) && !row.notes.includes(expectedRef)) {
    throw new Error(
      `docs/release/evidence-register.md ${evidenceId} must reference ${expectedRef}`,
    );
  }
}

for (const expected of [
  'PENDING-M365-INTEGRATION-GATE',
  'PENDING-TENANT-ADMIN-CONSENT',
  'docs/release/outlook-addin-graph-scope-matrix.md',
  'docs/release/outlook-addin-deployment-runbook.md',
  'pnpm outlook:deployment:check',
]) {
  assertContains(evidence, expected, 'docs/release/evidence-register.md');
}

for (const expected of [
  'OUTLOOK-DEPLOY-TUW-001',
  'OUTLOOK-DEPLOY-TUW-002',
  'OUTLOOK-DEPLOY-TUW-003',
  'OUTLOOK-DEPLOY-TUW-004',
  'IT/admin',
  'pilot practice group',
  'broader firm',
  'production',
]) {
  assertContains(plan, expected, 'docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md');
}

assertContains(
  packs,
  'PACK-OA-10 | `codex/outlook-deployment-rollback`',
  'docs/execution/PACKS_R4_R14.md',
);

for (const expected of ['Mail.Read', 'graph.mail-read.attachments', 'PENDING-TENANT-ADMIN-CONSENT']) {
  assertContains(scopeMatrix, expected, 'docs/release/outlook-addin-graph-scope-matrix.md');
}
for (const rejected of ['Mail.ReadWrite', 'Mail.Send', 'Files.Read.All', 'Sites.Read.All']) {
  assertContains(scopeMatrix, rejected, 'docs/release/outlook-addin-graph-scope-matrix.md');
}

for (const expected of [
  '<Permissions>ReadItem</Permissions>',
  'LaunchEvent Type="OnMessageSend"',
  'SendMode="SoftBlock"',
  'https://localhost:3000/outlook-addin',
]) {
  assertContains(manifest, expected, 'apps/web/public/outlook-addin/manifest.xml');
}
for (const forbidden of ['ReadWriteMailbox', 'Mail.Send', 'WebApplicationInfo']) {
  assertNotContains(manifest, forbidden, 'apps/web/public/outlook-addin/manifest.xml');
}

for (const expected of ['/v1/m365/outlook/send-policy-decisions', 'sendModeOverride']) {
  assertContains(smartAlerts, expected, 'apps/web/public/outlook-addin/smart-alerts.js');
}
for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'accessToken', 'refreshToken']) {
  assertNotContains(smartAlerts, forbidden, 'apps/web/public/outlook-addin/smart-alerts.js');
}

assertContains(packageJson, 'outlook:deployment:check', 'package.json');

console.log('outlook deployment check passed');
