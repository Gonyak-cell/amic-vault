import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

interface CutoverPreflightCliArgs {
  importReceiptPath: string;
  targetResolutionReceiptPath: string;
  sanitizedOut: string;
  cutoverApprovalRef?: string | undefined;
  sourceOfTruthControlRef?: string | undefined;
  executeRequested: boolean;
}

interface ImportReceipt {
  receipt_type?: unknown;
  mode?: unknown;
  gate_status?: unknown;
  summary?: {
    total_items?: unknown;
    status_counts?: Record<string, unknown>;
  };
  full_replay?: {
    already_imported?: unknown;
    allowed_skipped?: unknown;
    ready?: unknown;
    blocked?: unknown;
    failed?: unknown;
  };
}

interface TargetResolutionReceipt {
  status?: unknown;
  resolved_import_manifest_rows?: unknown;
  conflict_rows?: unknown;
}

export function usage(): string {
  return [
    'usage: pnpm onedrive:source-cutover-preflight -- --import-receipt <customer-wide-import.json> --target-resolution <target-resolution.json> --sanitized-out <out.json> --cutover-approval-ref <ref> --source-of-truth-control-ref <ref>',
    '',
    'Preflights source-of-truth cutover after customer-wide import.',
    'This tool does not mutate source-of-truth state or claim cutover execution.',
  ].join('\n');
}

export function parseSourceCutoverPreflightArgs(
  argv: readonly string[],
): CutoverPreflightCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  return {
    importReceiptPath: requiredArg(argv, '--import-receipt'),
    targetResolutionReceiptPath: requiredArg(argv, '--target-resolution'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    cutoverApprovalRef: argValue(argv, '--cutover-approval-ref'),
    sourceOfTruthControlRef: argValue(argv, '--source-of-truth-control-ref'),
    executeRequested: argv.includes('--execute'),
  };
}

export async function runSourceCutoverPreflight(args: CutoverPreflightCliArgs) {
  const importReceipt = (await readJson(args.importReceiptPath)) as ImportReceipt;
  const targetResolution = (await readJson(
    args.targetResolutionReceiptPath,
  )) as TargetResolutionReceipt;
  const blockers = validateCutoverPreflight(args, importReceipt, targetResolution);
  const readiness = importReadiness(importReceipt);
  const resolvedRows = numberValue(targetResolution.resolved_import_manifest_rows);
  const report = {
    generated_at: new Date().toISOString(),
    status: blockers.length === 0 ? 'ready_for_manual_cutover_decision' : 'blocked',
    source_of_truth_cutover_executed: false,
    counts: {
      resolved_import_manifest_rows: resolvedRows,
      customer_wide_imported_rows: readiness.importedRows,
      customer_wide_already_imported_rows: readiness.alreadyImportedRows,
      customer_wide_allowed_skipped_rows: readiness.allowedSkippedRows,
      customer_wide_accounted_rows: readiness.accountedRows,
      customer_wide_ready_rows: readiness.readyRows,
      customer_wide_failed_rows: readiness.failedRows,
      customer_wide_blocked_rows: readiness.blockedRows,
      target_resolution_conflict_rows: numberValue(targetResolution.conflict_rows),
    },
    blockers,
    acceptance_checks: {
      separate_cutover_approval_ref_present: requiredRef(args.cutoverApprovalRef),
      source_of_truth_control_ref_present: requiredRef(args.sourceOfTruthControlRef),
      customer_wide_import_execute_pass: readiness.executeReceiptPresent && readiness.gatePass,
      imported_or_reused_count_matches_resolved_manifest:
        resolvedRows > 0 && readiness.accountedRows === resolvedRows,
    },
    not_executed: [
      'source-of-truth cutover mutation',
      'OneDrive connected state',
      'Office open/save/sync',
      'Gemma indexing execution',
      'customer document content logging',
    ],
    sanitization:
      'No raw source paths, document names, document contents, private tenant identifiers, account IDs, ARNs, cookies, tokens, or secrets are included.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

function validateCutoverPreflight(
  args: CutoverPreflightCliArgs,
  importReceipt: ImportReceipt,
  targetResolution: TargetResolutionReceipt,
): string[] {
  const blockers: string[] = [];
  const readiness = importReadiness(importReceipt);
  const resolvedRows = numberValue(targetResolution.resolved_import_manifest_rows);
  if (args.executeRequested) blockers.push('source_of_truth_cutover_execution_not_implemented');
  if (!requiredRef(args.cutoverApprovalRef)) blockers.push('cutover_approval_ref_missing');
  if (!requiredRef(args.sourceOfTruthControlRef)) blockers.push('source_of_truth_control_ref_missing');
  if (targetResolution.status !== 'ready_for_pilot_import_dry_run') {
    blockers.push('target_resolution_receipt_not_ready');
  }
  if (!readiness.executeReceiptPresent) {
    blockers.push('customer_wide_import_execute_receipt_missing');
  }
  if (!readiness.gatePass) blockers.push('customer_wide_import_not_passed');
  if (readiness.readyRows > 0) blockers.push('customer_wide_import_has_ready_rows');
  if (readiness.failedRows > 0) blockers.push('customer_wide_import_has_failed_rows');
  if (readiness.blockedRows > 0) blockers.push('customer_wide_import_has_blocked_rows');
  if (resolvedRows <= 0 || readiness.accountedRows !== resolvedRows) {
    blockers.push('customer_wide_import_count_mismatch');
  }
  return [...new Set(blockers)];
}

function importReadiness(importReceipt: ImportReceipt): {
  executeReceiptPresent: boolean;
  gatePass: boolean;
  importedRows: number;
  alreadyImportedRows: number;
  allowedSkippedRows: number;
  accountedRows: number;
  readyRows: number;
  failedRows: number;
  blockedRows: number;
} {
  if (importReceipt.receipt_type === 'customer_wide_import_closeout') {
    const replay = importReceipt.full_replay ?? {};
    const alreadyImportedRows = numberValue(replay.already_imported);
    const allowedSkippedRows = numberValue(replay.allowed_skipped);
    return {
      executeReceiptPresent: true,
      gatePass: importReceipt.gate_status === 'pass',
      importedRows: 0,
      alreadyImportedRows,
      allowedSkippedRows,
      accountedRows: alreadyImportedRows + allowedSkippedRows,
      readyRows: numberValue(replay.ready),
      failedRows: numberValue(replay.failed),
      blockedRows: numberValue(replay.blocked),
    };
  }

  const statusCounts = importReceipt.summary?.status_counts ?? {};
  const importedRows = numberValue(statusCounts.imported);
  const alreadyImportedRows = numberValue(statusCounts.already_imported);
  return {
    executeReceiptPresent: importReceipt.mode === 'customer-wide-import',
    gatePass: importReceipt.gate_status === 'pass',
    importedRows,
    alreadyImportedRows,
    allowedSkippedRows: numberValue(statusCounts.skipped),
    accountedRows: importedRows + alreadyImportedRows,
    readyRows: numberValue(statusCounts.ready),
    failedRows: numberValue(statusCounts.failed),
    blockedRows: numberValue(statusCounts.blocked),
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
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

function requiredRef(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0 && !isPlaceholder(value);
}

function isPlaceholder(value: string): boolean {
  return (
    value === 'PENDING_EXTERNAL_REF' ||
    value === 'PENDING_LOCAL_UUID' ||
    value.startsWith('PENDING_LOCAL_') ||
    /^<[^>]+>$/.test(value) ||
    /^ONEDRIVE-[A-Z0-9-]+-REF$/.test(value)
  );
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function main(): Promise<void> {
  let args: CutoverPreflightCliArgs;
  try {
    args = parseSourceCutoverPreflightArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runSourceCutoverPreflight(args);
    console.log(
      JSON.stringify({
        status: report.status,
        source_of_truth_cutover_executed: report.source_of_truth_cutover_executed,
        blockers: report.blockers,
      }),
    );
    if (report.status !== 'ready_for_manual_cutover_decision') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_SOURCE_CUTOVER_PREFLIGHT_FAILED',
        message: error instanceof Error ? error.message : 'SOURCE_CUTOVER_PREFLIGHT_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
