import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const gateValues = [
  'production-import-decision',
  'production-pilot-import',
  'production-cutover',
  'production-ai-backlog',
  'gemma-indexing-claim',
  'onedrive-connected-state',
  'office-sync',
] as const;

type CloseoutGate = (typeof gateValues)[number];

interface CloseoutGateCliArgs {
  dryRun: boolean;
  gate: CloseoutGate;
  runId: string;
  productionPreflightPath: string;
  tuwPlanPath: string;
  sanitizedOut: string;
  approvalRef: string | undefined;
  productionImportCloseoutPath: string | undefined;
  productionCutoverReceiptPath: string | undefined;
  indexingExecuteReceiptPath: string | undefined;
  connectedStateReceiptPath: string | undefined;
  officeSyncReceiptPath: string | undefined;
}

interface ProductionPreflightReceipt {
  status?: unknown;
  blockers?: unknown;
  production_write_executed?: unknown;
  production_import_executed?: unknown;
  production_source_of_truth_cutover_executed?: unknown;
  onedrive_connected_state_claimed?: unknown;
  office_open_save_sync_claimed?: unknown;
  gemma_indexing_executed?: unknown;
  counts?: Record<string, unknown>;
  acceptance_checks?: {
    local_import_closeout_pass?: unknown;
    local_full_closeout_pass?: unknown;
    matter_linkage_closeout_pass?: unknown;
    local_count_parity_pass?: unknown;
    production_refs_present?: unknown;
    evidence_index_leak_scan_pass?: unknown;
  };
}

interface OptionalReceipt {
  status?: unknown;
  gate_status?: unknown;
  gemma_indexing_executed?: unknown;
  onedrive_connected_state_claimed?: unknown;
  office_open_save_sync_claimed?: unknown;
  production_import_executed?: unknown;
  production_source_of_truth_cutover_executed?: unknown;
  audit_event_id?: unknown;
  audit_event_ref?: unknown;
  retrieval_smoke?: unknown;
  read_surface_smoke?: unknown;
  permission_smoke?: unknown;
}

interface OptionalReceipts {
  productionImportCloseout: OptionalReceipt | null;
  productionCutover: OptionalReceipt | null;
  indexingExecute: OptionalReceipt | null;
  connectedState: OptionalReceipt | null;
  officeSync: OptionalReceipt | null;
}

const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const forbiddenPlanPatterns = [
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
    `usage: pnpm onedrive:closeout-gate -- --dry-run --gate <${gateValues.join('|')}> --run-id <id> --production-preflight <receipt.json> --tuw-plan <plan.md> --sanitized-out <out.json> [--approval-ref <ref>] [--production-import-closeout <receipt.json>] [--production-cutover-receipt <receipt.json>] [--indexing-execute-receipt <receipt.json>] [--connected-state-receipt <receipt.json>] [--office-sync-receipt <receipt.json>]`,
    '',
    'Evaluates the remaining OneDrive closeout gates without executing production writes or product integration claims.',
  ].join('\n');
}

export function parseCloseoutGateArgs(argv: readonly string[]): CloseoutGateCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  if (!argv.includes('--dry-run') || argv.includes('--execute')) {
    throw new Error('only --dry-run is supported for closeout gates');
  }
  const gate = requiredArg(argv, '--gate');
  if (!isCloseoutGate(gate)) throw new Error(`unsupported gate: ${gate}`);
  return {
    dryRun: true,
    gate,
    runId: requiredArg(argv, '--run-id'),
    productionPreflightPath: requiredArg(argv, '--production-preflight'),
    tuwPlanPath: requiredArg(argv, '--tuw-plan'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    approvalRef: argValue(argv, '--approval-ref'),
    productionImportCloseoutPath: argValue(argv, '--production-import-closeout'),
    productionCutoverReceiptPath: argValue(argv, '--production-cutover-receipt'),
    indexingExecuteReceiptPath: argValue(argv, '--indexing-execute-receipt'),
    connectedStateReceiptPath: argValue(argv, '--connected-state-receipt'),
    officeSyncReceiptPath: argValue(argv, '--office-sync-receipt'),
  };
}

export async function runCloseoutGate(args: CloseoutGateCliArgs) {
  const preflight = (await readJson(args.productionPreflightPath)) as ProductionPreflightReceipt;
  const planText = await readFile(args.tuwPlanPath, 'utf8');
  const optionalReceipts = await readOptionalReceipts(args);
  const blockers = collectBlockers(args, preflight, planText, optionalReceipts);
  const status = gateStatus(args.gate, blockers);
  const report = {
    receipt_type: 'onedrive_closeout_gate',
    mode: 'dry-run',
    gate: args.gate,
    run_id: args.runId,
    status,
    blockers,
    production_write_executed: false,
    production_import_executed: false,
    production_source_of_truth_cutover_executed: false,
    onedrive_connected_state_claimed: false,
    office_open_save_sync_claimed: false,
    gemma_indexing_executed: false,
    gate_inputs: {
      production_preflight_ref: safeReceiptRef(args.productionPreflightPath),
      tuw_plan_ref: safeReceiptRef(args.tuwPlanPath),
      production_import_closeout_ref: safeOptionalReceiptRef(args.productionImportCloseoutPath),
      production_cutover_receipt_ref: safeOptionalReceiptRef(args.productionCutoverReceiptPath),
      indexing_execute_receipt_ref: safeOptionalReceiptRef(args.indexingExecuteReceiptPath),
      connected_state_receipt_ref: safeOptionalReceiptRef(args.connectedStateReceiptPath),
      office_sync_receipt_ref: safeOptionalReceiptRef(args.officeSyncReceiptPath),
      approval_ref: safeOptionalHash(args.approvalRef),
    },
    local_preflight_summary: {
      status: stringValue(preflight.status),
      local_import_closeout_pass: preflight.acceptance_checks?.local_import_closeout_pass === true,
      local_full_closeout_pass: preflight.acceptance_checks?.local_full_closeout_pass === true,
      matter_linkage_closeout_pass: preflight.acceptance_checks?.matter_linkage_closeout_pass === true,
      local_count_parity_pass: preflight.acceptance_checks?.local_count_parity_pass === true,
      production_refs_present: preflight.acceptance_checks?.production_refs_present === true,
      evidence_index_leak_scan_pass: preflight.acceptance_checks?.evidence_index_leak_scan_pass === true,
    },
    counts: {
      approved_scope_rows: numberValue(preflight.counts?.approved_scope_rows),
      imported_or_reused_rows: numberValue(preflight.counts?.imported_or_reused_rows),
      allowed_skipped_rows: numberValue(preflight.counts?.allowed_skipped_rows),
      active_documents: numberValue(preflight.counts?.active_documents),
      docs_with_all_4_real_gemma: numberValue(preflight.counts?.docs_with_all_4_real_gemma),
      real_gemma_outputs: numberValue(preflight.counts?.real_gemma_outputs),
      fallback_payloads: numberValue(preflight.counts?.fallback_payloads),
    },
    acceptance_checks: acceptanceChecks(args, preflight, blockers, optionalReceipts),
    not_executed: [
      'production import',
      'production source-of-truth cutover',
      'OneDrive connected state',
      'Office open/save/sync',
      'Gemma indexing execution',
      'customer document content logging',
    ],
    receipt_hash: sha256(
      [
        args.runId,
        args.gate,
        stringValue(preflight.status),
        blockers.join(','),
        safeReceiptRef(args.productionPreflightPath),
      ].join('|'),
    ),
    sanitization:
      'Only counts, boolean gates, hashed refs, and sanitized evidence filenames are written.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

async function readOptionalReceipts(args: CloseoutGateCliArgs): Promise<OptionalReceipts> {
  return {
    productionImportCloseout: await readOptionalJson(args.productionImportCloseoutPath),
    productionCutover: await readOptionalJson(args.productionCutoverReceiptPath),
    indexingExecute: await readOptionalJson(args.indexingExecuteReceiptPath),
    connectedState: await readOptionalJson(args.connectedStateReceiptPath),
    officeSync: await readOptionalJson(args.officeSyncReceiptPath),
  };
}

function collectBlockers(
  args: CloseoutGateCliArgs,
  preflight: ProductionPreflightReceipt,
  planText: string,
  receipts: OptionalReceipts,
): string[] {
  const blockers: string[] = [];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (planLeakFindings(planText).length > 0) blockers.push('tuw_plan_forbidden_pattern_detected');
  if (preflight.production_write_executed !== false) blockers.push('preflight_must_not_execute_write');
  if (preflight.onedrive_connected_state_claimed !== false) blockers.push('onedrive_claim_must_remain_false');
  if (preflight.office_open_save_sync_claimed !== false) blockers.push('office_sync_claim_must_remain_false');
  if (preflight.gemma_indexing_executed !== false) blockers.push('gemma_indexing_claim_must_remain_false');

  if (preflight.status !== 'ready_for_production_import_decision') {
    blockers.push('production_preflight_not_ready');
  }
  if (preflight.acceptance_checks?.production_refs_present !== true) {
    blockers.push('production_external_refs_missing');
  }
  if (preflight.acceptance_checks?.local_count_parity_pass !== true) {
    blockers.push('local_count_parity_not_passed');
  }

  if (args.gate === 'production-pilot-import' && !safeOptionalRef(args.approvalRef)) {
    blockers.push('production_import_approval_ref_missing');
  }
  if (args.gate === 'production-cutover') {
    if (!safeOptionalRef(args.approvalRef)) blockers.push('production_cutover_approval_ref_missing');
    if (!receiptPass(receipts.productionImportCloseout)) {
      blockers.push('production_import_closeout_receipt_missing_or_not_passed');
    }
  }
  if (args.gate === 'production-ai-backlog' && !receiptPass(receipts.productionImportCloseout)) {
    blockers.push('production_import_closeout_required_for_ai_backlog_gate');
  }
  if (args.gate === 'gemma-indexing-claim') {
    const indexing = receipts.indexingExecute;
    if (!indexing || indexing.gemma_indexing_executed !== true) {
      blockers.push('gemma_indexing_execute_receipt_missing');
    }
    if (!hasAuditRef(indexing)) blockers.push('gemma_indexing_audit_receipt_missing');
    if (indexing?.retrieval_smoke !== 'PASS' && indexing?.permission_smoke !== 'PASS') {
      blockers.push('gemma_indexing_permission_smoke_missing');
    }
  }
  if (args.gate === 'onedrive-connected-state') {
    const connected = receipts.connectedState;
    if (!connected || connected.onedrive_connected_state_claimed !== true) {
      blockers.push('onedrive_connected_state_receipt_missing');
    }
  }
  if (args.gate === 'office-sync') {
    const office = receipts.officeSync;
    if (!office || office.office_open_save_sync_claimed !== true) {
      blockers.push('office_sync_receipt_missing');
    }
  }
  return [...new Set(blockers)];
}

function acceptanceChecks(
  args: CloseoutGateCliArgs,
  preflight: ProductionPreflightReceipt,
  blockers: readonly string[],
  receipts: OptionalReceipts,
) {
  return {
    no_write_mode: true,
    production_preflight_ready: preflight.status === 'ready_for_production_import_decision',
    production_refs_present: preflight.acceptance_checks?.production_refs_present === true,
    approval_ref_present: safeOptionalRef(args.approvalRef),
    gate_has_no_blockers: blockers.length === 0,
    production_import_closeout_present: Boolean(receipts.productionImportCloseout),
    production_cutover_receipt_present: Boolean(receipts.productionCutover),
    indexing_execute_receipt_present: Boolean(receipts.indexingExecute),
    connected_state_receipt_present: Boolean(receipts.connectedState),
    office_sync_receipt_present: Boolean(receipts.officeSync),
    forbidden_claims_false: true,
  };
}

function gateStatus(gate: CloseoutGate, blockers: readonly string[]): string {
  if (blockers.length === 0) return 'ready_for_next_gate';
  if (gate === 'onedrive-connected-state' || gate === 'office-sync') return 'deferred_product_gate';
  return 'blocked';
}

function receiptPass(receipt: OptionalReceipt | null): boolean {
  return receipt?.status === 'PASS' || receipt?.status === 'pass' || receipt?.gate_status === 'pass';
}

function hasAuditRef(receipt: OptionalReceipt | null): boolean {
  return typeof receipt?.audit_event_id === 'string' || typeof receipt?.audit_event_ref === 'string';
}

function isCloseoutGate(value: string): value is CloseoutGate {
  return gateValues.includes(value as CloseoutGate);
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function readOptionalJson(filePath: string | undefined): Promise<OptionalReceipt | null> {
  if (!filePath) return null;
  return (await readJson(filePath)) as OptionalReceipt;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function planLeakFindings(value: string): string[] {
  return forbiddenPlanPatterns.some((pattern) => pattern.test(value))
    ? ['tuw_plan_forbidden_pattern_detected']
    : [];
}

function safeReceiptRef(filePath: string): string {
  return path.basename(filePath).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 160);
}

function safeOptionalReceiptRef(filePath: string | undefined): { present: boolean; ref: string | null } {
  return {
    present: typeof filePath === 'string' && filePath.length > 0,
    ref: typeof filePath === 'string' && filePath.length > 0 ? safeReceiptRef(filePath) : null,
  };
}

function safeOptionalHash(value: string | undefined): { present: boolean; hash_ref: string | null } {
  const safeValue = typeof value === 'string' && safeRefPattern.test(value) ? value : null;
  return {
    present: typeof value === 'string' && value.length > 0,
    hash_ref: safeValue ? sha256(safeValue).slice(0, 16) : null,
  };
}

function safeOptionalRef(value: string | undefined): boolean {
  return typeof value === 'string' && safeRefPattern.test(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
  let args: CloseoutGateCliArgs;
  try {
    args = parseCloseoutGateArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runCloseoutGate(args);
    console.log(
      JSON.stringify({
        status: report.status,
        gate: report.gate,
        production_write_executed: report.production_write_executed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_CLOSEOUT_GATE_FAILED',
        message: error instanceof Error ? error.message : 'CLOSEOUT_GATE_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
