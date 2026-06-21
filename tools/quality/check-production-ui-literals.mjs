#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, 'apps/web/src');

const excludedPathParts = [
  `${path.sep}__fixtures__${path.sep}`,
  `${path.sep}__mocks__${path.sep}`,
  `${path.sep}tests${path.sep}`,
];

const excludedFilePatterns = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\.stories\.[tj]sx?$/,
];

const literalPatterns = [
  { name: 'mock literal', pattern: /\bmock\b/i },
  { name: 'demo literal', pattern: /\bdemo\b/i },
  { name: 'fake literal', pattern: /\bfake\b/i },
  { name: 'faker literal', pattern: /\bfaker\b/i },
  { name: 'known sample hash variable', pattern: /sampleHash/ },
  { name: 'known sample fingerprint variable', pattern: /sampleFingerprint/ },
  { name: 'placeholder SSO provider', pattern: /Corporate IdP/ },
  { name: 'placeholder key reference', pattern: /Tenant HSM reference/ },
  { name: 'placeholder evidence ref', pattern: /soc2-access-control/ },
  { name: 'prefilled retention code', pattern: /RET-INDEFINITE/ },
  { name: 'prefilled retention label', pattern: /Indefinite retention/ },
  { name: 'prefilled retention reason', pattern: /CLIENT_RECORDS/ },
  { name: 'prefilled request code', pattern: /RFI-001/ },
  { name: 'prefilled evidence code', pattern: /EV-001/ },
  { name: 'prefilled fact code', pattern: /FACT-001/ },
  { name: 'prefilled diligence issue code', pattern: /DD-ISS-001/ },
  { name: 'prefilled pleading code', pattern: /PLD-001/ },
  { name: 'placeholder witness timeline', pattern: /Witness timeline/ },
  { name: 'placeholder approval issue', pattern: /Missing board approval/ },
  { name: 'placeholder charter request', pattern: /Corporate charter documents/ },
  { name: 'placeholder person', pattern: /김민준/ },
  { name: 'placeholder person', pattern: /정서연/ },
  { name: 'placeholder team', pattern: /법무 운영팀/ },
  { name: 'placeholder document', pattern: /주식매매계약서/ },
  { name: 'placeholder brand', pattern: /Gonyak/ },
  { name: 'theme selector copy', pattern: /디자인 테마/ },
  { name: 'workspace id label', pattern: /workspace\s+ID|워크스페이스 ID/i },
  { name: 'tenant id label', pattern: /tenant\s+ID|테넌트 ID/i },
  { name: 'matter id label', pattern: /Matter ID|사건 ID/i },
  { name: 'document id label', pattern: /Document ID|문서 ID/i },
  { name: 'version id label', pattern: /Version ID|버전 ID/i },
  { name: 'file id label', pattern: /File ID|파일 ID/i },
  { name: 'user id label', pattern: /User ID|사용자 ID/i },
  { name: 'raw uuid literal', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
  { name: 'download id label', pattern: /다운로드 ID/ },
  { name: 'download ref label', pattern: /Download ref/ },
  { name: 'raw prompt copy', pattern: /raw prompt|prompt 원문/i },
  { name: 'raw source copy', pattern: /raw source|source text|source 원문/i },
  { name: 'model response copy', pattern: /model response|model-response|모델 응답/i },
  { name: 'external model copy', pattern: /external model|외부 모델/i },
  { name: 'legal analysis copy', pattern: /legal analysis|법률 분석/i },
  { name: 'document summary claim', pattern: /document summary|summary generation|문서 요약/i },
  {
    name: 'unsafe id slice formatter',
    pattern:
      /\b(documentId|matterId|clientId|userId|tenantId|workspaceId|versionId|fileObjectId)\b[^;\n]*\.slice\s*\(\s*0\s*,/i,
  },
  {
    name: 'unsafe id short hash formatter',
    pattern:
      /\bshortHash\s*\(\s*(status\.)?(matterId|documentId|clientId|userId|tenantId|workspaceId|selectedMatterId|selectedDocumentId|versionId|fileObjectId)\b/i,
  },
  { name: 'outlook filing matter short ref', pattern: /shortHash\(status\.matterId/ },
  { name: 'outlook selected matter short ref', pattern: /selectedMatterId \? shortHash/ },
];

const requiredExpandedDmsSurfaceFiles = [
  'apps/web/src/app/(app)/files/page.tsx',
  'apps/web/src/components/document/document-upload-panel.tsx',
  'apps/web/src/components/document/document-vault-list.tsx',
  'apps/web/src/components/document/matter-document-list.tsx',
  'apps/web/src/components/document/document-action-center.tsx',
  'apps/web/src/app/(app)/matters/page.tsx',
  'apps/web/src/app/(app)/matters/[matterId]/page.tsx',
  'apps/web/src/app/(app)/matters/[matterId]/team/page.tsx',
  'apps/web/src/components/matter/add-member-dialog.tsx',
  'apps/web/src/components/matter/team-member-list.tsx',
  'apps/web/src/app/(app)/search/search-client.tsx',
  'apps/web/src/app/(app)/search/folders/search-folders-client.tsx',
  'apps/web/src/app/(app)/records/records-governance-client.tsx',
  'apps/web/src/app/(app)/audit/audit-console-client.tsx',
  'apps/web/src/app/(app)/walls/wall-admin-client.tsx',
  'apps/web/src/app/(app)/work/work-queue-client.tsx',
  'apps/web/src/app/(app)/notifications/notifications-client.tsx',
  'apps/web/src/app/(app)/admin/page.tsx',
  'apps/web/src/app/(app)/admin/security/page.tsx',
  'apps/web/src/app/(app)/enterprise/enterprise-hardening-client.tsx',
  'apps/web/src/app/(app)/integrations/page.tsx',
  'apps/web/src/app/(app)/integrations/outlook/outlook-integration-status-client.tsx',
  'apps/web/src/components/ai/ai-prep-status-panel.tsx',
  'apps/web/src/components/ai/ai-prep-matter-dashboard.tsx',
];

function shouldScanFile(filePath) {
  if (!/\.[tj]sx?$/.test(filePath)) return false;
  if (excludedFilePatterns.some((pattern) => pattern.test(filePath))) return false;
  return !excludedPathParts.some((part) => filePath.includes(part));
}

function walk(directory) {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      files.push(...walk(filePath));
    } else if (shouldScanFile(filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

const findings = [];

const scannedFiles = walk(sourceRoot);
const scannedRelativeFiles = new Set(scannedFiles.map((filePath) => path.relative(repoRoot, filePath)));

for (const relativePath of requiredExpandedDmsSurfaceFiles) {
  if (!scannedRelativeFiles.has(relativePath)) {
    findings.push({
      filePath: relativePath,
      line: 1,
      name: 'expanded DMS guard surface missing from scan',
      text: 'file is missing or excluded from production UI literal scanning',
    });
  }
}

for (const filePath of scannedFiles) {
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    for (const { name, pattern } of literalPatterns) {
      if (pattern.test(line)) {
        findings.push({
          filePath: path.relative(repoRoot, filePath),
          line: lineIndex + 1,
          name,
          text: line.trim(),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Production UI literal check failed:');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} ${finding.name}: ${finding.text}`);
  }
  process.exit(1);
}

console.log('Production UI literal check passed.');
