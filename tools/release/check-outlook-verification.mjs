import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredFiles = [
  'docs/release/outlook-addin-verification-matrix.md',
  'docs/release/outlook-addin-deployment-runbook.md',
  'docs/release/outlook-addin-graph-scope-matrix.md',
  'docs/release/evidence-register.md',
  'docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md',
  'docs/execution/PACKS_R4_R14.md',
  'tools/release/check-outlook-deployment.mjs',
  'package.json',
  '.github/workflows/ci.yml',
  'apps/api/src/modules/outlook/outlook-audit.events.ts',
  'apps/api/src/modules/outlook/outlook.service.spec.ts',
  'apps/api/src/modules/outlook/outlook-auth.service.spec.ts',
  'apps/api/src/modules/outlook/outlook-graph-attachment.service.spec.ts',
  'apps/api/src/modules/outlook/outlook-send-file.service.spec.ts',
  'apps/api/src/modules/outlook/outlook-document-insertion.service.spec.ts',
  'apps/api/src/modules/outlook/outlook-folder-mapping.service.spec.ts',
  'packages/shared/src/outlook/outlook-types.spec.ts',
  'apps/web/src/lib/outlook-addin/outlook-item.spec.ts',
  'apps/web/src/app/outlook-addin/outlook-addin-client.test.tsx',
  'apps/web/src/app/outlook-addin/outlook-manifest.spec.ts',
  'tests/integration/cross-tenant/outlook-filing-requests-rls.spec.ts',
  'tests/integration/cross-tenant/outlook-auth-graph-rls.spec.ts',
  'tests/integration/cross-tenant/outlook-document-insertions-rls.spec.ts',
  'tests/integration/cross-tenant/outlook-folder-mappings-rls.spec.ts',
  'tests/integration/search-permission/outlook-matter-suggestions.spec.ts',
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
    throw new Error(`Missing Outlook verification file: ${relativePath}`);
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

function isTestFixtureFile(file) {
  return file.endsWith('.spec.ts') || file.endsWith('.test.tsx');
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
}

for (const file of requiredFiles.filter((requiredFile) => !isTestFixtureFile(requiredFile))) {
  const content = contents.get(file);
  assertNoForbiddenSecrets(content, file);
  assertNoConcreteExternalUrl(content, file);
}

const matrix = contents.get('docs/release/outlook-addin-verification-matrix.md');
const evidence = contents.get('docs/release/evidence-register.md');
const plan = contents.get('docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md');
const packs = contents.get('docs/execution/PACKS_R4_R14.md');
const packageJson = contents.get('package.json');
const ci = contents.get('.github/workflows/ci.yml');
const auditEvents = contents.get('apps/api/src/modules/outlook/outlook-audit.events.ts');

const tenantEvidenceFiles = [
  'docs/release/outlook-addin-verification-matrix.md',
  'docs/release/outlook-addin-deployment-runbook.md',
  'docs/release/outlook-addin-graph-scope-matrix.md',
  'docs/release/evidence-register.md',
  'docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md',
  'docs/execution/PACKS_R4_R14.md',
];

for (const file of tenantEvidenceFiles) {
  const content = contents.get(file);
  assertNoConcreteTenantEvidence(content, file);
}

for (const section of [
  '## Verification Boundaries',
  '## Gate Summary',
  '## OA11 TUW Matrix',
  '## Permission Negative Matrix',
  '## Audit Coverage Matrix',
  '## Metadata Leakage Matrix',
  '## Tenant Isolation Matrix',
  '## Idempotency And Dedupe Matrix',
  '## Graph Scope And Deployment Evidence Matrix',
  '## Offline And Smart Alert Failure Matrix',
  '## Evidence Register And Gate Checklist',
  '## Required Repo-Local Verification Commands',
]) {
  assertContains(matrix, section, 'docs/release/outlook-addin-verification-matrix.md');
}

for (let index = 1; index <= 8; index += 1) {
  const tuw = `OUTLOOK-VERIFY-TUW-${String(index).padStart(3, '0')}`;
  assertContains(plan, tuw, 'docs/execution/TUW_OUTLOOK_ADDIN_OA00_OA11.md');
  assertContains(matrix, tuw, 'docs/release/outlook-addin-verification-matrix.md');
}

assertContains(
  packs,
  'PACK-OA-11 | `codex/outlook-verification-evidence`',
  'docs/execution/PACKS_R4_R14.md',
);
assertContains(packageJson, 'outlook:verification:check', 'package.json');
assertContains(ci, 'pnpm outlook:verification:check', '.github/workflows/ci.yml');

for (const [evidenceId, expectedStatus] of [
  ['EV-OUTLOOK-002', 'blocked'],
  ['EV-OUTLOOK-003', 'blocked'],
  ['EV-OUTLOOK-004', 'prepared'],
  ['EV-OUTLOOK-011', 'prepared'],
]) {
  const row = evidenceRow(evidence, evidenceId);
  if (row.status !== expectedStatus) {
    throw new Error(
      `docs/release/evidence-register.md ${evidenceId} status must be ${expectedStatus}`,
    );
  }
}

for (const expected of [
  'docs/release/outlook-addin-verification-matrix.md',
  'pnpm outlook:verification:check',
  'EV-OUTLOOK-002',
  'EV-OUTLOOK-003',
  'EV-OUTLOOK-011',
]) {
  assertContains(evidence, expected, 'docs/release/evidence-register.md');
  assertContains(matrix, expected, 'docs/release/outlook-addin-verification-matrix.md');
}

for (const action of [
  'OUTLOOK_ADDIN_SESSION_EXCHANGED',
  'OUTLOOK_ADDIN_SESSION_DENIED',
  'OUTLOOK_EMAIL_FILE_REQUESTED',
  'OUTLOOK_EMAIL_FILE_DENIED',
  'OUTLOOK_EMAIL_FILE_CANCELLED',
  'OUTLOOK_SEND_POLICY_EVALUATED',
  'OUTLOOK_SEND_FILE_REQUESTED',
  'OUTLOOK_SEND_FILE_DENIED',
  'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_REQUESTED',
  'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRED',
  'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED',
  'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
  'OUTLOOK_DOCUMENT_INSERT_DENIED',
  'OUTLOOK_FOLDER_MAPPING_CHANGED',
  'OUTLOOK_AUTOFILE_JOB_RECORDED',
]) {
  assertContains(auditEvents, action, 'apps/api/src/modules/outlook/outlook-audit.events.ts');
  assertContains(matrix, action, 'docs/release/outlook-addin-verification-matrix.md');
}

for (const [file, markers] of [
  [
    'apps/api/src/modules/outlook/outlook.service.spec.ts',
    [
      'fails closed and audits when the Outlook integration gate is disabled',
      'queues an enabled filing request through PermissionService and audit',
      'marks duplicate manual filing requests in audit metadata',
      'denies status lookup for a different user without leaking existence',
    ],
  ],
  [
    'apps/api/src/modules/outlook/outlook-send-file.service.spec.ts',
    [
      'fails closed and audits when Smart Alerts policy gate is disabled',
      'blocks when PermissionService denies upload to the selected matter',
      'denies send-and-file when warnings are not acknowledged',
      'marks duplicate send-and-file requests in audit metadata',
    ],
  ],
  [
    'apps/api/src/modules/outlook/outlook-document-insertion.service.spec.ts',
    [
      'denies external recipient insertions before policy permits the channel',
      'denies attach-copy until a reviewed copy transport exists',
      'denies when DocumentPermissionService does not allow read',
      'marks duplicate internal-reference insertions in audit metadata',
    ],
  ],
  [
    'apps/api/src/modules/outlook/outlook-folder-mapping.service.spec.ts',
    [
      'denies mapping creation for unauthorized matters',
      'requires admin approval before approving pending-admin mappings',
      'requires the auto-file gate before an admin can enable auto-file',
      'records wrong-matter auto-file warnings with hash-only job metadata',
    ],
  ],
  [
    'tests/integration/search-permission/outlook-matter-suggestions.spec.ts',
    [
      'does not suggest wall-excluded matters even when the Outlook hash matches',
      'does not expose cross-tenant matters from attacker-supplied hashes',
    ],
  ],
  [
    'packages/shared/src/outlook/outlook-types.spec.ts',
    [
      'rejects raw Outlook/mailbox/message fields by schema',
      'rejects raw Graph attachment IDs and token values',
      'rejects raw Smart Alert subject, body, recipients, and filenames',
      'rejects raw folder mapping names, paths, mailbox addresses, and Graph IDs',
    ],
  ],
  [
    'apps/web/src/lib/outlook-addin/outlook-item.spec.ts',
    [
      'converts Office item data into hash-only filing metadata',
      'fails closed when required mailbox or item identifiers are unavailable',
      'fails closed when folder mapping is requested without a folder ref hash',
    ],
  ],
  [
    'apps/web/src/app/outlook-addin/outlook-manifest.spec.ts',
    [
      'declares OnMessageSend with a bounded Smart Alerts runtime',
      'keeps the Smart Alerts runtime stateless and server-policy driven',
    ],
  ],
]) {
  const content = contents.get(file);
  for (const marker of markers) {
    assertContains(content, marker, file);
  }
}

for (const file of [
  'tests/integration/cross-tenant/outlook-filing-requests-rls.spec.ts',
  'tests/integration/cross-tenant/outlook-auth-graph-rls.spec.ts',
  'tests/integration/cross-tenant/outlook-document-insertions-rls.spec.ts',
  'tests/integration/cross-tenant/outlook-folder-mappings-rls.spec.ts',
]) {
  const content = contents.get(file);
  assertContains(content, 'isolates', file);
  assertContains(content, 'tenant', file);
}

console.log('outlook verification check passed');
