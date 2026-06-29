import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

interface ProductionPreflightCliArgs {
  dryRun: boolean;
  runId: string;
  importCloseoutPath: string;
  fullCloseoutPath: string;
  matterLinkageCloseoutPath: string;
  evidenceIndexPath: string;
  sanitizedOut: string;
  targetEnvironment: string;
  productionDbRef: string | undefined;
  storageContainmentRef: string | undefined;
  rollbackSnapshotRef: string | undefined;
  operatorRoleRef: string | undefined;
  manifestRef: string | undefined;
  approvalRef: string | undefined;
}

interface CustomerWideImportCloseoutReceipt {
  receipt_type?: unknown;
  gate_status?: unknown;
  approved_scope_rows?: unknown;
  resolved_import_manifest_rows?: unknown;
  reconciliation?: Record<string, unknown>;
  full_replay?: {
    already_imported?: unknown;
    allowed_skipped?: unknown;
    ready?: unknown;
    blocked?: unknown;
    failed?: unknown;
  };
}

interface FullCloseoutReceipt {
  status?: unknown;
  counts?: Record<string, unknown>;
}

interface MatterLinkageCloseoutReceipt {
  status?: unknown;
  baseline_counts?: Record<string, unknown>;
  acceptance_gate?: Record<string, unknown>;
  leak_scan?: {
    status?: unknown;
    findings?: unknown;
  };
}

interface ProductionPreflightCounts {
  approvedScopeRows: number;
  resolvedImportManifestRows: number;
  importedOrReusedRows: number;
  allowedSkippedRows: number;
  readyRows: number;
  blockedRows: number;
  failedRows: number;
  activeDocuments: number;
  docsWithMatter: number;
  canonicalExtractionReady: number;
  searchIndexedDocuments: number;
  aiAllowedDocuments: number;
  docsWithAll4RealGemma: number;
  realGemmaOutputs: number;
  fallbackPayloads: number;
}

const expectedCounts = {
  approvedScopeRows: 22403,
  importedOrReusedRows: 22286,
  allowedSkippedRows: 117,
  activeDocuments: 22299,
  docsWithMatter: 22299,
  canonicalExtractionReady: 22299,
  searchIndexedDocuments: 22299,
  aiAllowedDocuments: 22299,
  docsWithAll4RealGemma: 22299,
  realGemmaOutputs: 89196,
  fallbackPayloads: 0,
};

const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const forbiddenEvidencePatterns = [
  /\/Users\//u,
  /CloudStorage/u,
  /object_key/u,
  /storage_uri/u,
  /BEGIN [A-Z ]*PRIVATE KEY/u,
  /sk-[A-Za-z0-9_-]{8,}/u,
  /Bearer\s+[A-Za-z0-9._-]+/u,
  /amic_session=/iu,
  /set-cookie\s*:/iu,
];

export function usage(): string {
  return [
    'usage: pnpm onedrive:production-preflight -- --dry-run --run-id <id> --target-environment production --import-closeout <customer-wide-closeout.json> --full-closeout <full-closeout.json> --matter-linkage-closeout <matter-linkage.json> --evidence-index <evidence-index.md> --sanitized-out <out.json> [--production-db-ref <ref>] [--storage-containment-ref <ref>] [--rollback-snapshot-ref <ref>] [--operator-role-ref <ref>] [--manifest-ref <ref>] [--approval-ref <ref>]',
    '',
    'Performs a no-write production readiness preflight for OneDrive closeout promotion.',
    'It does not execute production import, production cutover, OneDrive connected-state, Office sync, or Gemma indexing.',
  ].join('\n');
}

export function parseProductionPreflightArgs(
  argv: readonly string[],
): ProductionPreflightCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  if (!dryRun || argv.includes('--execute')) {
    throw new Error('only --dry-run is supported for production preflight');
  }
  return {
    dryRun,
    runId: requiredArg(argv, '--run-id'),
    targetEnvironment: requiredArg(argv, '--target-environment'),
    importCloseoutPath: requiredArg(argv, '--import-closeout'),
    fullCloseoutPath: requiredArg(argv, '--full-closeout'),
    matterLinkageCloseoutPath: requiredArg(argv, '--matter-linkage-closeout'),
    evidenceIndexPath: requiredArg(argv, '--evidence-index'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    productionDbRef: argValue(argv, '--production-db-ref'),
    storageContainmentRef: argValue(argv, '--storage-containment-ref'),
    rollbackSnapshotRef: argValue(argv, '--rollback-snapshot-ref'),
    operatorRoleRef: argValue(argv, '--operator-role-ref'),
    manifestRef: argValue(argv, '--manifest-ref'),
    approvalRef: argValue(argv, '--approval-ref'),
  };
}

export async function runProductionPreflight(args: ProductionPreflightCliArgs) {
  const importCloseout = (await readJson(args.importCloseoutPath)) as CustomerWideImportCloseoutReceipt;
  const fullCloseout = (await readJson(args.fullCloseoutPath)) as FullCloseoutReceipt;
  const matterLinkage = (await readJson(
    args.matterLinkageCloseoutPath,
  )) as MatterLinkageCloseoutReceipt;
  const evidenceIndex = await readFile(args.evidenceIndexPath, 'utf8');
  const counts = collectCounts(importCloseout, fullCloseout, matterLinkage);
  const blockers = collectBlockers(args, importCloseout, fullCloseout, matterLinkage, evidenceIndex, counts);
  const report = {
    receipt_type: 'onedrive_production_preflight',
    mode: 'dry-run',
    status: blockers.length === 0 ? 'ready_for_production_import_decision' : 'blocked',
    run_id: args.runId,
    target_environment: args.targetEnvironment,
    production_write_executed: false,
    production_import_executed: false,
    production_source_of_truth_cutover_executed: false,
    onedrive_connected_state_claimed: false,
    office_open_save_sync_claimed: false,
    gemma_indexing_executed: false,
    blockers,
    counts: {
      approved_scope_rows: counts.approvedScopeRows,
      resolved_import_manifest_rows: counts.resolvedImportManifestRows,
      imported_or_reused_rows: counts.importedOrReusedRows,
      allowed_skipped_rows: counts.allowedSkippedRows,
      ready_rows: counts.readyRows,
      blocked_rows: counts.blockedRows,
      failed_rows: counts.failedRows,
      active_documents: counts.activeDocuments,
      docs_with_matter: counts.docsWithMatter,
      canonical_extraction_ready: counts.canonicalExtractionReady,
      search_indexed_documents: counts.searchIndexedDocuments,
      ai_allowed_documents: counts.aiAllowedDocuments,
      docs_with_all_4_real_gemma: counts.docsWithAll4RealGemma,
      real_gemma_outputs: counts.realGemmaOutputs,
      fallback_payloads: counts.fallbackPayloads,
    },
    production_refs: {
      production_db_ref: safeOptionalHash(args.productionDbRef),
      storage_containment_ref: safeOptionalHash(args.storageContainmentRef),
      rollback_snapshot_ref: safeOptionalHash(args.rollbackSnapshotRef),
      operator_role_ref: safeOptionalHash(args.operatorRoleRef),
      manifest_ref: safeOptionalHash(args.manifestRef),
      approval_ref: safeOptionalHash(args.approvalRef),
    },
    acceptance_checks: {
      local_import_closeout_pass: importCloseout.gate_status === 'pass',
      local_full_closeout_pass: fullCloseout.status === 'PASS',
      matter_linkage_closeout_pass: matterLinkage.status === 'pass',
      matter_linkage_acceptance_all_pass: allAcceptancePass(matterLinkage.acceptance_gate),
      local_count_parity_pass: localCountParity(counts),
      production_refs_present: productionRefsPresent(args),
      production_refs_safe: productionRefsSafe(args),
      evidence_index_leak_scan_pass: evidenceLeakFindings(evidenceIndex).length === 0,
      no_production_write: true,
      forbidden_claims_false: true,
    },
    evidence_refs: {
      import_closeout_ref: safeReceiptRef(args.importCloseoutPath),
      full_closeout_ref: safeReceiptRef(args.fullCloseoutPath),
      matter_linkage_closeout_ref: safeReceiptRef(args.matterLinkageCloseoutPath),
      evidence_index_ref: safeReceiptRef(args.evidenceIndexPath),
      receipt_hash: sha256([
        args.runId,
        args.targetEnvironment,
        counts.approvedScopeRows,
        counts.activeDocuments,
        counts.realGemmaOutputs,
        blockers.join(','),
      ].join('|')),
    },
    not_executed: [
      'production import',
      'production source-of-truth cutover',
      'OneDrive connected state',
      'Office open/save/sync',
      'Gemma indexing execution',
      'customer document content logging',
    ],
    sanitization:
      'Only counts, boolean gates, hashed refs, and sanitized evidence filenames are written.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

function collectCounts(
  importCloseout: CustomerWideImportCloseoutReceipt,
  fullCloseout: FullCloseoutReceipt,
  matterLinkage: MatterLinkageCloseoutReceipt,
): ProductionPreflightCounts {
  const counts = fullCloseout.counts ?? {};
  const baselineCounts = matterLinkage.baseline_counts ?? {};
  return {
    approvedScopeRows: numberValue(importCloseout.approved_scope_rows),
    resolvedImportManifestRows: numberValue(importCloseout.resolved_import_manifest_rows),
    importedOrReusedRows: numberValue(importCloseout.full_replay?.already_imported),
    allowedSkippedRows: numberValue(importCloseout.full_replay?.allowed_skipped),
    readyRows: numberValue(importCloseout.full_replay?.ready),
    blockedRows: numberValue(importCloseout.full_replay?.blocked),
    failedRows: numberValue(importCloseout.full_replay?.failed),
    activeDocuments: numberValue(counts.active_documents),
    docsWithMatter: numberValue(baselineCounts.docsWithMatter),
    canonicalExtractionReady: numberValue(counts.canonical_extraction_ready),
    searchIndexedDocuments: numberValue(counts.search_indexed_documents),
    aiAllowedDocuments: numberValue(counts.ai_allowed_documents),
    docsWithAll4RealGemma: numberValue(counts.docs_with_all_4_real_gemma),
    realGemmaOutputs: numberValue(counts.real_gemma_outputs),
    fallbackPayloads: numberValue(counts.fallback_payloads),
  };
}

function collectBlockers(
  args: ProductionPreflightCliArgs,
  importCloseout: CustomerWideImportCloseoutReceipt,
  fullCloseout: FullCloseoutReceipt,
  matterLinkage: MatterLinkageCloseoutReceipt,
  evidenceIndex: string,
  counts: ProductionPreflightCounts,
): string[] {
  const blockers: string[] = [];
  const reconciliation = importCloseout.reconciliation ?? {};
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (args.targetEnvironment !== 'production') blockers.push('target_environment_must_be_production');
  if (!productionRefsPresent(args)) blockers.push('production_external_refs_missing');
  if (!productionRefsSafe(args)) blockers.push('production_external_refs_invalid');
  if (importCloseout.receipt_type !== 'customer_wide_import_closeout') {
    blockers.push('customer_wide_import_closeout_receipt_missing');
  }
  if (importCloseout.gate_status !== 'pass') blockers.push('customer_wide_import_closeout_not_passed');
  if (reconciliation.imported_plus_allowed_skipped_equals_scope !== true) {
    blockers.push('import_scope_reconciliation_not_passed');
  }
  if (reconciliation.no_blocked_rows_remaining !== true) blockers.push('blocked_rows_reconciliation_not_passed');
  if (reconciliation.no_failed_rows_remaining !== true) blockers.push('failed_rows_reconciliation_not_passed');
  if (reconciliation.documents_versions_file_objects_equal !== true) {
    blockers.push('documents_versions_file_objects_not_equal');
  }
  if (fullCloseout.status !== 'PASS') blockers.push('full_closeout_not_passed');
  if (matterLinkage.status !== 'pass') blockers.push('matter_linkage_closeout_not_passed');
  if (!allAcceptancePass(matterLinkage.acceptance_gate)) {
    blockers.push('matter_linkage_acceptance_not_all_pass');
  }
  if (matterLinkage.leak_scan?.status !== 'PASS') blockers.push('matter_linkage_leak_scan_not_passed');
  if (!localCountParity(counts)) blockers.push('local_closeout_count_parity_failed');
  for (const finding of evidenceLeakFindings(evidenceIndex)) blockers.push(finding);
  return [...new Set(blockers)];
}

function localCountParity(counts: ProductionPreflightCounts): boolean {
  return (
    counts.approvedScopeRows === expectedCounts.approvedScopeRows &&
    counts.importedOrReusedRows === expectedCounts.importedOrReusedRows &&
    counts.allowedSkippedRows === expectedCounts.allowedSkippedRows &&
    counts.readyRows === 0 &&
    counts.blockedRows === 0 &&
    counts.failedRows === 0 &&
    counts.activeDocuments === expectedCounts.activeDocuments &&
    counts.docsWithMatter === expectedCounts.docsWithMatter &&
    counts.canonicalExtractionReady === expectedCounts.canonicalExtractionReady &&
    counts.searchIndexedDocuments === expectedCounts.searchIndexedDocuments &&
    counts.aiAllowedDocuments === expectedCounts.aiAllowedDocuments &&
    counts.docsWithAll4RealGemma === expectedCounts.docsWithAll4RealGemma &&
    counts.realGemmaOutputs === expectedCounts.realGemmaOutputs &&
    counts.fallbackPayloads === expectedCounts.fallbackPayloads
  );
}

function productionRefsPresent(args: ProductionPreflightCliArgs): boolean {
  return [
    args.productionDbRef,
    args.storageContainmentRef,
    args.rollbackSnapshotRef,
    args.operatorRoleRef,
    args.manifestRef,
    args.approvalRef,
  ].every((value) => typeof value === 'string' && value.length > 0);
}

function productionRefsSafe(args: ProductionPreflightCliArgs): boolean {
  return [
    args.productionDbRef,
    args.storageContainmentRef,
    args.rollbackSnapshotRef,
    args.operatorRoleRef,
    args.manifestRef,
    args.approvalRef,
  ]
    .filter((value): value is string => typeof value === 'string')
    .every((value) => safeRefPattern.test(value));
}

function allAcceptancePass(acceptance: Record<string, unknown> | undefined): boolean {
  if (!acceptance) return false;
  const values = Object.values(acceptance);
  return values.length > 0 && values.every((value) => value === 'PASS');
}

function evidenceLeakFindings(value: string): string[] {
  return forbiddenEvidencePatterns.some((pattern) => pattern.test(value))
    ? ['evidence_index_forbidden_pattern_detected']
    : [];
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function safeReceiptRef(filePath: string): string {
  return path.basename(filePath).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 160);
}

function safeOptionalHash(value: string | undefined): { present: boolean; hash_ref: string | null } {
  return {
    present: typeof value === 'string' && value.length > 0,
    hash_ref: typeof value === 'string' && value.length > 0 ? sha256(value).slice(0, 16) : null,
  };
}

function requiredArg(argv: readonly string[], name: string): string {
  const value = argValue(argv, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function main(): Promise<void> {
  let args: ProductionPreflightCliArgs;
  try {
    args = parseProductionPreflightArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runProductionPreflight(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        production_write_executed: report.production_write_executed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_PRODUCTION_PREFLIGHT_FAILED',
        message: error instanceof Error ? error.message : 'PRODUCTION_PREFLIGHT_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
