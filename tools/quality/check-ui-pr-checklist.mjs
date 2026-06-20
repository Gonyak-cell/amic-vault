#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const requiredFiles = [
  '.github/pull_request_template.md',
  'docs/ui/pr-review-checklist.md',
  'docs/ui/design-system-checklist.md',
  'docs/ui/production-ui-inventory.md',
  'docs/ui/enterprise-dms-ux-baseline-gap-audit.md',
  'docs/ui/enterprise-dms-ux-tuw-plan.md',
  'docs/ui/enterprise-dms-ux-route-capability-inventory.md',
  'docs/ui/enterprise-dms-release-hardening.md',
  'docs/ui/enterprise-dms-pr-d-closeout.md',
  'docs/ui/enterprise-dms-pr-e-closeout.md',
  'docs/ui/enterprise-dms-pr-f-readiness.md',
  'docs/release/enterprise-dms-ui-release-evidence.md',
  'docs/integrations/matter-app-vault-contract.md',
];

const requiredPatterns = [
  { label: 'fake data review', pattern: /fake\/mock\/sample\/demo/i },
  { label: 'API unavailable state review', pattern: /API-unavailable|API unavailable|API 미응답/i },
  { label: 'ID exposure review', pattern: /workspace ID.*tenant ID|tenant ID.*workspace ID/i },
  { label: 'profile name and email review', pattern: /display name and email|name and email|이름.*이메일/i },
  { label: 'role and feature gating review', pattern: /Role, feature, and route visibility gates|Role And Capability Gating/i },
  { label: 'fail-closed review', pattern: /fail-closed/i },
  { label: 'empty and error state review', pattern: /empty.*permission denied|Empty, Error, And Permission States/is },
  { label: 'AI Prep scope review', pattern: /file organization prep/i },
  { label: 'raw AI data exclusion review', pattern: /raw prompt.*model response|raw prompt, raw source.*model response/is },
  { label: 'design-system review', pattern: /SaaS design tokens|SaaS Design System/i },
  { label: 'design-system checklist review', pattern: /docs\/ui\/design-system-checklist\.md/ },
  { label: 'production route inventory review', pattern: /docs\/ui\/production-ui-inventory\.md|Production UI Inventory/i },
  { label: 'visual drift review', pattern: /raw hex.*custom shadow.*custom gradient|custom shadow.*custom gradient/is },
  { label: 'shared component review', pattern: /PageHeader.*SectionCard.*EmptyState.*StatusBadge|StatusBadge.*table\/list\/filter/is },
  { label: 'i18n review', pattern: /i18n|ko\/en/i },
  { label: 'responsive review', pattern: /375px.*768px.*1440px|1440px.*768px.*375px/is },
  { label: 'accessibility review', pattern: /keyboard focus|accessible names|aria-current/i },
  { label: 'literal guard command', pattern: /pnpm check:production-ui-literals/ },
  { label: 'checklist guard command', pattern: /pnpm check:ui-pr-checklist/ },
  { label: 'production smoke gate', pattern: /Production UI smoke gate|production UI smoke gate/i },
  { label: 'evidence redaction review', pattern: /no secrets.*customer file contents|Evidence uses refs only/is },
  { label: 'enterprise DMS UX baseline review', pattern: /Enterprise DMS UX Baseline Gap Audit/i },
  { label: 'enterprise DMS TUW plan review', pattern: /Enterprise DMS UX TUW Plan/i },
  { label: 'route capability inventory review', pattern: /Route Capability Inventory/i },
  { label: 'Matter app source-of-truth review', pattern: /Matter app.*source of truth|source-of-truth.*Matter app/is },
  { label: 'no independent Vault-only Matter Code namespace review', pattern: /No independent Vault-only Matter Code namespace/i },
  { label: 'no free-floating upload review', pattern: /No free-floating document upload/i },
  { label: 'release hardening review', pattern: /Enterprise DMS Release Hardening/i },
  { label: 'authenticated DMS smoke review', pattern: /Matter Code.*upload.*document detail.*search/is },
  { label: 'negative auth smoke review', pattern: /Non-member.*Wall-blocked.*Non-admin/is },
  { label: 'rollback and monitor review', pattern: /Rollback Plan[\s\S]*Production Monitor/i },
  {
    label: 'DMS UI release evidence template',
    pattern: /Enterprise DMS UI Release Evidence[\s\S]*DMS-UX-808[\s\S]*DMS-UX-811/i,
  },
  {
    label: 'DMS rollout evidence matrix',
    pattern: /Matter Code selection before upload[\s\S]*Negative auth and wall-blocked[\s\S]*AI Prep remains file organization prep only/i,
  },
  {
    label: 'DMS rollback controls evidence',
    pattern: /Route visibility policy[\s\S]*Matter app source flags[\s\S]*Worker flags[\s\S]*Database rollback/is,
  },
  {
    label: 'DMS production monitor evidence',
    pattern: /Upload failure rate[\s\S]*Extraction\/OCR[\s\S]*AI prep queue[\s\S]*Audit write failures/is,
  },
  {
    label: 'DMS release signoff evidence',
    pattern:
      /DMS-UX-812 Release Signoff[\s\S]*Operator owner[\s\S]*Security owner[\s\S]*Legal-data owner[\s\S]*Customer-scope owner[\s\S]*Rollback owner/is,
  },
  {
    label: 'PR-D closeout evidence',
    pattern:
      /DMS-UX-527 PR-D Closeout[\s\S]*Effective Access[\s\S]*Ethical Wall[\s\S]*Records Context[\s\S]*RecordsActionContextPanel[\s\S]*Matter\/Document Activity Timeline[\s\S]*Action Inbox[\s\S]*Notification Center[\s\S]*Ops Health/is,
  },
  {
    label: 'PR-D AI and external scope evidence',
    pattern:
      /AI Prep file organization only[\s\S]*External sharing gated[\s\S]*stale-content clearing/is,
  },
  {
    label: 'PR-D deferred item evidence',
    pattern:
      /Remaining Deferred Items[\s\S]*Unified persisted task DB\/API[\s\S]*Persisted notifications[\s\S]*Records disposal task API[\s\S]*User\/group picker APIs[\s\S]*Access request creation\/approval workflow/is,
  },
  {
    label: 'PR-E closeout evidence',
    pattern:
      /DMS-UX-714 PR-E Closeout[\s\S]*Taxonomy Admin Contract[\s\S]*Matter Template Admin[\s\S]*Search Refiner Admin[\s\S]*Outlook Filing Unification[\s\S]*Office\/OneDrive Integration Plan[\s\S]*Integration Status Safety/is,
  },
  {
    label: 'PR-E gated integration evidence',
    pattern:
      /No fake\/mock\/sample\/demo connected states[\s\S]*No OneDrive connected[\s\S]*No editable Matter template or folder template save action[\s\S]*Taxonomy and search refiner save\/list\/disable actions[\s\S]*AI Prep remains file organization prep/is,
  },
  {
    label: 'PR-E deferred item evidence',
    pattern:
      /Remaining Deferred Items[\s\S]*Persisted Matter template save\/audit APIs[\s\S]*Folder template inheritance semantics[\s\S]*OneDrive open\/save\/sync runtime[\s\S]*Office coauthoring/is,
  },
  {
    label: 'PR-F readiness split evidence',
    pattern:
      /PR-F Readiness Evidence[\s\S]*DMS-UX-801[\s\S]*DMS-UX-802[\s\S]*DMS-UX-806[\s\S]*DMS-UX-807[\s\S]*Manual Receipt Requirements/is,
  },
  {
    label: 'PR-F automated evidence matrix',
    pattern:
      /Automated Evidence Matrix[\s\S]*Production UI literal guard[\s\S]*Production UI smoke guard[\s\S]*Staging smoke credential gate[\s\S]*Responsive\/accessibility component guards/is,
  },
  {
    label: 'PR-F DMS main-loop smoke evidence',
    pattern:
      /pnpm release:dms-smoke[\s\S]*Matter Code[\s\S]*matter-scoped upload[\s\S]*negative-auth/is,
  },
  {
    label: 'DMS body-search fixture evidence',
    pattern:
      /search-body-fixture\.spec\.ts[\s\S]*body\/full-text[\s\S]*unauthorized[\s\S]*bounded audit metadata/is,
  },
  {
    label: 'DMS upload receipt evidence',
    pattern:
      /UploadQueueReceipt[\s\S]*document-detail[\s\S]*all-documents vault[\s\S]*Matter file-cabinet[\s\S]*file-organization prep[\s\S]*duplicate-candidate/is,
  },
  {
    label: 'DMS upload refresh evidence',
    pattern:
      /upload refresh key[\s\S]*DocumentVaultList[\s\S]*MatterDocumentList[\s\S]*successful Matter-scoped upload[\s\S]*re-queries both the all-documents vault and the selected Matter file list/is,
  },
  {
    label: 'DMS version receipt evidence',
    pattern:
      /new-version upload[\s\S]*version list[\s\S]*document-scoped audit timeline[\s\S]*file-organization prep status[\s\S]*duplicate-candidate[\s\S]*raw document\/version\/file refs/is,
  },
  {
    label: 'DMS related item evidence',
    pattern:
      /DMS related item guard[\s\S]*permission-scoped matter document list API[\s\S]*permission-scoped Matter email timeline API[\s\S]*current-document filtering[\s\S]*no visible raw Matter\/email reference/is,
  },
  {
    label: 'PR-F hold criteria',
    pattern:
      /Hold Criteria[\s\S]*approved staging\/production credentials are missing[\s\S]*Matter Code source is not configured[\s\S]*legal analysis[\s\S]*responsive or keyboard QA is missing/is,
  },
];

const issues = [];
const fileTexts = [];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    issues.push(`Missing required file: ${relativePath}`);
    continue;
  }
  const text = readFileSync(absolutePath, 'utf8');
  fileTexts.push({ relativePath, text });
}

const combinedText = fileTexts.map(({ text }) => text).join('\n\n');

for (const { label, pattern } of requiredPatterns) {
  if (!pattern.test(combinedText)) {
    issues.push(`Missing required checklist coverage: ${label}`);
  }
}

for (const { relativePath, text } of fileTexts) {
  const trailingWhitespaceLines = text
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => /[ \t]+$/.test(line));

  for (const { lineNumber } of trailingWhitespaceLines) {
    issues.push(`${relativePath}:${lineNumber} has trailing whitespace`);
  }
}

if (issues.length > 0) {
  console.error('UI PR checklist guard failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('UI PR checklist guard passed.');
