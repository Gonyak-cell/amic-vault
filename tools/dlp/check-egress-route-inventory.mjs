#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SERVICE_ROOT = 'apps/api/src/modules';
const CANDIDATE_MARKERS = Object.freeze([
  'this.storageService.getByStorageUri(',
  'this.storageService.getRangeByStorageUri(',
  'this.storageService.createReadUrlByStorageUri(',
  'downloadRefFor(',
  'this.insertOrFindInsertion(',
  'this.documentUpload.uploadBuffer(',
]);

const FORCED_CANDIDATES = Object.freeze([
  {
    key: 'ExternalService.createLink',
    path: 'apps/api/src/modules/external/external.service.ts',
  },
  {
    key: 'StorageService.sha256ByStorageUri',
    path: 'apps/api/src/modules/storage/storage.service.ts',
  },
]);

export const EGRESS_INVENTORY = Object.freeze({
  'DdService.exportReport': {
    path: 'apps/api/src/modules/dd/dd.service.ts',
    category: 'reviewed_exclusion',
    rationale: 'creates a permission-scoped internal Vault document; bytes leave only through DocumentLifecycleService.download',
    permissionControl: 'assertCanEditMatter',
    auditControl: 'DD_REPORT_EXPORTED',
    required: ['assertCanEditMatter', 'this.documentUpload.uploadBuffer(', 'DD_REPORT_EXPORTED'],
  },
  'DdService.exportNegotiationIssues': {
    path: 'apps/api/src/modules/dd/dd.service.ts',
    category: 'reviewed_exclusion',
    rationale: 'creates a permission-scoped internal Vault document; bytes leave only through DocumentLifecycleService.download',
    permissionControl: 'assertCanEditMatter',
    auditControl: 'CONTRACT_NEGOTIATION_ISSUES_EXPORTED',
    required: [
      'assertCanEditMatter',
      'this.documentUpload.uploadBuffer(',
      'CONTRACT_NEGOTIATION_ISSUES_EXPORTED',
    ],
  },
  'DocumentEditingService.getEditBaseFile': {
    path: 'apps/api/src/modules/document/document-editing.service.ts',
    category: 'reviewed_exclusion',
    rationale: 'bounded editing loop for the owner of an active edit session',
    permissionControl: 'requireOwnedActiveSession and canSaveDocumentSubversion',
    auditControl: 'documentDownloadedAudit',
    required: [
      'requireOwnedActiveSession',
      'canSaveDocumentSubversion',
      'documentDownloadedAudit',
      'EDIT_SESSION_BASE_FILE',
    ],
    order: [['documentDownloadedAudit', 'this.storageService.getByStorageUri(']],
  },
  'DocumentEditingService.getNativeDraft': {
    path: 'apps/api/src/modules/document/document-editing.service.ts',
    category: 'reviewed_exclusion',
    rationale: 'bounded native editor content for the owner of an active edit session',
    permissionControl: 'requireOwnedActiveSession and canSaveDocumentSubversion',
    auditControl: 'audited active edit-session lifecycle',
    required: [
      'requireOwnedActiveSession',
      'canSaveDocumentSubversion',
      'streamToBufferLimited',
      'NATIVE_EDIT_MAX_BYTES',
    ],
  },
  'DocumentEditingService.getSubversionFile': {
    path: 'apps/api/src/modules/document/document-editing.service.ts',
    category: 'reviewed_exclusion',
    rationale: 'bounded internal subversion review, not a general document egress route',
    permissionControl: 'canReadDocumentSubversion and visible reviewer check',
    auditControl: 'documentDownloadedAudit',
    required: [
      'canReadDocumentSubversion',
      'findVisibleSubversionById',
      'documentDownloadedAudit',
      'SUBVERSION_REVIEW_FILE',
    ],
    order: [['documentDownloadedAudit', 'this.storageService.getByStorageUri(']],
  },
  'DocumentLifecycleService.download': {
    path: 'apps/api/src/modules/document/document-lifecycle.service.ts',
    category: 'gated',
    required: [
      'assertCanDownloadDocument',
      'evaluateDocumentEgress',
      "purpose: 'document_download'",
      'DLP_REVIEW_REQUIRED',
      'documentDownloadedAudit',
      'this.storageService.getByStorageUri(',
    ],
    order: [
      ['evaluateDocumentEgress', 'documentDownloadedAudit'],
      ['evaluateDocumentEgress', 'this.storageService.getByStorageUri('],
    ],
  },
  'EmailReparseService.reparseEmail': {
    path: 'apps/api/src/modules/email/email-reparse.service.ts',
    category: 'internal_processing',
    rationale: 'queue-owned parser maintenance; no response carries the raw bytes',
    authorityControl: 'exact tenant/email queue payload and stored target lookup',
    auditControl: 'storeReparseResult',
    required: ['findTarget', 'parserClient.parseRawEmail', 'storeReparseResult'],
  },
  'EmailService.downloadRawEmail': {
    path: 'apps/api/src/modules/email/email.service.ts',
    category: 'gated',
    required: [
      'assertCanDownloadRawEmail',
      'evaluateEmailEgress',
      "purpose: 'raw_email_download'",
      'DLP_REVIEW_REQUIRED',
      'emailRawDownloadedAudit',
      'this.storageService.getByStorageUri(',
    ],
    order: [
      ['evaluateEmailEgress', 'emailRawDownloadedAudit'],
      ['evaluateEmailEgress', 'this.storageService.getByStorageUri('],
    ],
  },
  'EmailService.ensureEmailBodySearchDocument': {
    path: 'apps/api/src/modules/email/email.service.ts',
    category: 'internal_processing',
    rationale: 'creates an internal permission-scoped search document after filing',
    authorityControl: 'isEmailBodySearchEnabled and filed matter context',
    auditControl: 'createEmailBodySearchDocument upload audit',
    required: ['isEmailBodySearchEnabled', 'createEmailBodySearchDocument', 'emailSearchText'],
  },
  'ExternalService.createLink': {
    path: 'apps/api/src/modules/external/external.service.ts',
    category: 'gated',
    required: [
      'assertCanReadDocument',
      'evaluateExternalDlp',
      'DLP_REVIEW_REQUIRED',
      'EXTERNAL_DLP_WARNING_REQUIRED',
      'newLinkToken',
    ],
    order: [
      ['evaluateExternalDlp', 'newLinkToken'],
      ['DLP_REVIEW_REQUIRED', 'newLinkToken'],
    ],
  },
  'ExternalService.downloadTicket': {
    path: 'apps/api/src/modules/external/external.service.ts',
    category: 'gated',
    required: [
      'resolveReadyToken',
      'evaluateDocumentEgress',
      "purpose: 'external_ticket'",
      'DLP_REVIEW_REQUIRED',
      'downloadRefFor',
      'EXTERNAL_DOWNLOAD_REQUESTED',
    ],
    order: [
      ['evaluateDocumentEgress', 'downloadRefFor'],
      ['evaluateDocumentEgress', 'EXTERNAL_DOWNLOAD_REQUESTED'],
    ],
  },
  'FilePromotionService.promote': {
    path: 'apps/api/src/modules/file-security/file-promotion.service.ts',
    category: 'internal_processing',
    rationale: 'quarantine-to-primary promotion after a clean, hash-bound, fresh-signature verdict',
    authorityControl: 'clean scan state and exact SHA-256 recheck',
    auditControl: 'document upload and file-security promotion audits',
    required: [
      "row.state !== 'clean'",
      "row.result_code !== 'clean'",
      'row.observed_sha256 !== row.expected_sha256',
      'FILE_SECURITY_PROMOTION_RECHECK_DENIED',
    ],
  },
  'FileSecurityService.scan': {
    path: 'apps/api/src/modules/file-security/file-security.service.ts',
    category: 'internal_processing',
    rationale: 'quarantined scanner input consumed by the private ingestion trust boundary',
    authorityControl: 'size cap, expected SHA-256 and private scanner call',
    auditControl: 'FILE_SCAN_COMPLETED or FILE_SECURITY_HELD',
    required: [
      '25 * 1024 * 1024',
      'observedSha256 !== payload.expectedSha256',
      "fetchIngestionWorker('/security/scan'",
    ],
  },
  'ClosingBinderService.downloadArchive': {
    path: 'apps/api/src/modules/matter/closing-binder.service.ts',
    category: 'gated',
    required: [
      'assertCanReadMatter',
      'assertCanDownloadDocument',
      'evaluateDocumentEgress',
      'evaluateEmailEgress',
      'DLP_REVIEW_REQUIRED',
      'this.storageService.getByStorageUri(',
    ],
    order: [
      ['evaluateDocumentEgress', 'this.storageService.getByStorageUri('],
      ['evaluateEmailEgress', 'this.storageService.getByStorageUri('],
    ],
  },
  'OutlookDocumentInsertionService.createDocumentInsertion': {
    path: 'apps/api/src/modules/outlook/outlook-document-insertion.service.ts',
    category: 'gated',
    required: [
      'canReadDocument',
      'evaluateDocumentEgress',
      "purpose: 'outlook_document_insertion'",
      'dlpReviewRequired()',
      'insertOrFindInsertion',
    ],
    order: [['evaluateDocumentEgress', 'insertOrFindInsertion']],
  },
  'PreviewService.ensureDerivedPreview': {
    path: 'apps/api/src/modules/preview/preview.service.ts',
    category: 'internal_processing',
    rationale: 'conversion worker creates an internal rendition and returns no source bytes',
    authorityControl: 'exact preview target selected by precreate or authorized preview flow',
    auditControl: 'preview artifact persistence and conversion audit',
    required: ['findReadyArtifact', 'previewConvertJob.convertOfficeToPdf', 'putTenantObject'],
  },
  'PreviewService.openPreview': {
    path: 'apps/api/src/modules/preview/preview.service.ts',
    category: 'reviewed_exclusion',
    rationale: 'range-capable in-app preview session, explicitly excluded from covered download egress',
    permissionControl: 'previewSessionService.authorizeStream',
    auditControl: 'audited preview access session',
    required: ['previewSessionService.authorizeStream', 'parseRange', 'getRangeByStorageUri'],
  },
  'StorageService.sha256ByStorageUri': {
    path: 'apps/api/src/modules/storage/storage.service.ts',
    category: 'internal_processing',
    rationale: 'tenant-validated storage integrity helper returning only a SHA-256 digest',
    authorityControl: 'assertTenantStorageUri inside getByStorageUri',
    auditControl: 'observeStorageOperation storage metrics',
    required: ['this.getByStorageUri', 'sha256Stream'],
  },
});

const ROUTE_CONTRACTS = Object.freeze([
  {
    id: 'current_document_and_bulk_individual_download',
    path: 'apps/api/src/modules/document/document.controller.ts',
    className: 'DocumentMetadataController',
    methodName: 'downloadDocument',
    required: ['this.lifecycleService.download(', 'new StreamableFile(download.body)'],
  },
  {
    id: 'external_download_ticket',
    path: 'apps/api/src/modules/external/external.controller.ts',
    className: 'ExternalController',
    methodName: 'downloadTicket',
    required: ['this.external.downloadTicket('],
  },
  {
    id: 'raw_email_download',
    path: 'apps/api/src/modules/email/email.controller.ts',
    className: 'EmailController',
    methodName: 'downloadRawEmail',
    required: ['this.emailService.downloadRawEmail(', 'new StreamableFile(download.body)'],
  },
  {
    id: 'outlook_document_insertion',
    path: 'apps/api/src/modules/outlook/outlook.controller.ts',
    className: 'OutlookController',
    methodName: 'createDocumentInsertion',
    required: ['this.outlookDocumentInsertionService.createDocumentInsertion('],
  },
  {
    id: 'closing_binder_archive',
    path: 'apps/api/src/modules/matter/matter.controller.ts',
    className: 'MatterController',
    methodName: 'downloadClosingBinderArchive',
    required: ['this.closingBinderService.downloadArchive(', 'new StreamableFile(download.body)'],
  },
  {
    id: 'generated_dd_document',
    path: 'apps/api/src/modules/dd/dd.controller.ts',
    className: 'DdController',
    methodName: 'exportReport',
    required: ['this.dd.exportReport('],
  },
]);

function walk(root) {
  return readdirSync(root)
    .sort()
    .flatMap((name) => {
      const path = join(root, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

export function loadEgressSources(repoRoot = process.cwd()) {
  const serviceRoot = resolve(repoRoot, SERVICE_ROOT);
  const paths = walk(serviceRoot).filter((path) => /\.(?:service|controller)\.ts$/u.test(path));
  return Object.fromEntries(
    paths.map((path) => [relative(repoRoot, path), readFileSync(path, 'utf8')]),
  );
}

function methodRecords(path, text) {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const records = [];
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.body || !member.name) continue;
        records.push({
          key: `${node.name.text}.${member.name.getText(sourceFile)}`,
          path,
          body: member.body.getText(sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return records;
}

function allMethods(sources) {
  return Object.entries(sources).flatMap(([path, text]) => methodRecords(path, text));
}

export function discoverEgressCandidates(sources) {
  const methods = allMethods(sources);
  const candidates = new Map();
  for (const method of methods) {
    const markers = CANDIDATE_MARKERS.filter((marker) => method.body.includes(marker));
    if (markers.length > 0) candidates.set(method.key, { ...method, markers });
  }
  for (const forced of FORCED_CANDIDATES) {
    const method = methods.find(
      (candidate) => candidate.key === forced.key && candidate.path === forced.path,
    );
    if (method) candidates.set(method.key, { ...method, markers: ['forced_egress_route'] });
  }
  return [...candidates.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function validateMethodContract(method, contract, errors, prefix) {
  if (!method) {
    errors.push(`${prefix}: method missing`);
    return;
  }
  for (const token of contract.required ?? []) {
    if (!method.body.includes(token)) errors.push(`${prefix}: required token missing: ${token}`);
  }
  for (const [before, after] of contract.order ?? []) {
    const beforeIndex = method.body.indexOf(before);
    const afterIndex = method.body.indexOf(after);
    if (beforeIndex < 0 || afterIndex < 0 || beforeIndex >= afterIndex) {
      errors.push(`${prefix}: unsafe order: ${before} must precede ${after}`);
    }
  }
}

export function inspectEgressInventory({
  sources,
  inventory = EGRESS_INVENTORY,
} = {}) {
  const candidates = discoverEgressCandidates(sources);
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const methods = allMethods(sources);
  const errors = [];
  const inventoryKeys = Object.keys(inventory).sort();
  const candidateKeys = candidates.map((candidate) => candidate.key);
  const unknown = candidateKeys.filter((key) => !(key in inventory));
  const stale = inventoryKeys.filter((key) => !candidateByKey.has(key));
  for (const key of unknown) errors.push(`${key}: unknown egress candidate`);
  for (const key of stale) errors.push(`${key}: inventory entry no longer maps to a candidate`);

  for (const [key, contract] of Object.entries(inventory)) {
    const method = candidateByKey.get(key);
    if (method && method.path !== contract.path) {
      errors.push(`${key}: path drift: ${method.path}`);
    }
    if (contract.category === 'reviewed_exclusion') {
      if (!contract.rationale || !contract.permissionControl || !contract.auditControl) {
        errors.push(`${key}: reviewed exclusion lacks rationale/permission/audit control`);
      }
    } else if (contract.category === 'internal_processing') {
      if (!contract.rationale || !contract.authorityControl || !contract.auditControl) {
        errors.push(`${key}: internal processing entry lacks rationale/authority/audit control`);
      }
    } else if (contract.category !== 'gated') {
      errors.push(`${key}: unsupported inventory category`);
    }
    validateMethodContract(method, contract, errors, key);
  }

  for (const route of ROUTE_CONTRACTS) {
    const method = methods.find(
      (candidate) =>
        candidate.path === route.path &&
        candidate.key === `${route.className}.${route.methodName}`,
    );
    validateMethodContract(method, route, errors, `route:${route.id}`);
  }

  const categories = Object.values(inventory).reduce((counts, entry) => {
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    return counts;
  }, {});
  return {
    schemaVersion: 'amic-vault.dlp-egress-route-inventory.v1',
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    candidateCount: candidates.length,
    routeContractCount: ROUTE_CONTRACTS.length,
    unknownCount: unknown.length,
    staleCount: stale.length,
    categories,
    candidates: candidates.map(({ key, path, markers }) => ({
      key,
      path,
      markers,
      category: inventory[key]?.category ?? 'unknown',
    })),
    errors,
  };
}

export function validateEgressInventory(input) {
  const report = inspectEgressInventory(input);
  if (report.status !== 'PASS') {
    throw new Error(`DLP egress route inventory failed:\n${report.errors.join('\n')}`);
  }
  return report;
}

function main() {
  try {
    const report = validateEgressInventory({ sources: loadEgressSources() });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
