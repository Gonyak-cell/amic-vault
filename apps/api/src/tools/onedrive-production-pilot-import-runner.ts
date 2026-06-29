import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  runCustomerWideImport,
  type CustomerWideImportCliArgs,
} from './onedrive-customer-wide-import-runner';

export interface ProductionPilotImportCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  approvalRef: string;
  manifestApprovalRef: string;
  productionPreflightPath: string;
  importDecisionReceiptPath: string;
  pilotGateReceiptPath: string;
  manifestPath: string;
  scopePath: string;
  tenantSlug: string;
  actorUserId: string;
  sanitizedOut: string;
  localReceiptOut: string;
  statePath: string;
  uploadPreflightRef?: string | undefined;
  awsProfile?: string | undefined;
  limit: number;
  offset: number;
  maxFailures: number;
  cutoverPolicy: string;
}

interface ProductionPilotImportDependencies {
  env?: NodeJS.ProcessEnv | undefined;
  runImport?: (args: CustomerWideImportCliArgs) => Promise<ImportRunReport>;
}

interface ImportRunReport {
  gate_status?: unknown;
  mode?: unknown;
  processed_rows?: unknown;
  local_receipt_rows_written?: unknown;
  summary?: {
    status_counts?: Record<string, unknown>;
    reason_counts?: Record<string, unknown>;
    expected_created_counts?: Record<string, unknown>;
  };
}

interface GateReceipt {
  status?: unknown;
  gate?: unknown;
  blockers?: unknown;
  production_write_executed?: unknown;
  production_import_executed?: unknown;
  production_source_of_truth_cutover_executed?: unknown;
  onedrive_connected_state_claimed?: unknown;
  office_open_save_sync_claimed?: unknown;
  gemma_indexing_executed?: unknown;
  acceptance_checks?: Record<string, unknown>;
}

const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxPilotLimit = 100;

export function usage(): string {
  return [
    'usage: pnpm onedrive:production-pilot-import -- --dry-run|--execute --run-id <id> --approval-ref <ref> --manifest-approval-ref <ref> --production-preflight <receipt.json> --import-decision <receipt.json> --pilot-gate <receipt.json> --manifest <resolved.ndjson[.gz]> --scope <approved-scope.ndjson[.gz]> --tenant-slug <slug> --actor-user-id <uuid> --sanitized-out <out.json> --local-receipt-out <receipt.ndjson> --state <state.json> [--aws-profile <profile>] [--limit <n>] [--offset <n>] [--max-failures <n>]',
    '',
    'LC-ONEDRIVE-CLOSEOUT-05 production pilot/batch import wrapper.',
    'It gates production execute on production runtime target presence and never performs source-of-truth cutover, OneDrive connected-state, Office sync, or Gemma indexing.',
  ].join('\n');
}

export function parseProductionPilotImportArgs(
  argv: readonly string[],
): ProductionPilotImportCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');
  return {
    dryRun,
    execute,
    runId: requiredArg(argv, '--run-id'),
    approvalRef: requiredArg(argv, '--approval-ref'),
    manifestApprovalRef: requiredArg(argv, '--manifest-approval-ref'),
    productionPreflightPath: requiredArg(argv, '--production-preflight'),
    importDecisionReceiptPath: requiredArg(argv, '--import-decision'),
    pilotGateReceiptPath: requiredArg(argv, '--pilot-gate'),
    manifestPath: requiredArg(argv, '--manifest'),
    scopePath: requiredArg(argv, '--scope'),
    tenantSlug: requiredArg(argv, '--tenant-slug'),
    actorUserId: requiredArg(argv, '--actor-user-id'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    localReceiptOut: requiredArg(argv, '--local-receipt-out'),
    statePath: requiredArg(argv, '--state'),
    uploadPreflightRef: argValue(argv, '--upload-preflight-ref'),
    awsProfile: argValue(argv, '--aws-profile'),
    limit: parseOptionalPositiveInt(argValue(argv, '--limit'), '--limit') ?? 1,
    offset: parseOptionalNonNegativeInt(argValue(argv, '--offset'), '--offset') ?? 0,
    maxFailures: parseOptionalPositiveInt(argValue(argv, '--max-failures'), '--max-failures') ?? 1,
    cutoverPolicy: argValue(argv, '--cutover-policy') ?? 'not_requested',
  };
}

export async function runProductionPilotImport(
  args: ProductionPilotImportCliArgs,
  dependencies: ProductionPilotImportDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const productionPreflight = (await readJson(args.productionPreflightPath)) as GateReceipt;
  const importDecision = (await readJson(args.importDecisionReceiptPath)) as GateReceipt;
  const pilotGate = (await readJson(args.pilotGateReceiptPath)) as GateReceipt;
  const runtime = runtimePresence(env, args);
  const blockers = collectBlockers(args, productionPreflight, importDecision, pilotGate, runtime);
  const runImport = dependencies.runImport ?? runCustomerWideImport;
  const importRunnerSanitizedOut = siblingReceiptPath(args.sanitizedOut, 'import-runner');
  const replaySanitizedOut = siblingReceiptPath(args.sanitizedOut, 'replay-dry-run');
  let importReport: ImportRunReport | null = null;
  let replayReport: ImportRunReport | null = null;

  if (blockers.length === 0) {
    importReport = await runImport(customerWideArgs(args, args.execute, importRunnerSanitizedOut));
    if (importReport.gate_status !== 'pass') blockers.push('pilot_import_runner_not_passed');
    if (args.execute && importReport.gate_status === 'pass') {
      replayReport = await runImport(customerWideArgs(args, false, replaySanitizedOut));
      if (replayReport.gate_status !== 'pass') blockers.push('pilot_import_replay_not_passed');
      if (statusCount(replayReport, 'ready') > 0) blockers.push('pilot_import_replay_has_ready_rows');
    }
  }

  const imported = statusCount(importReport, 'imported');
  const status = blockers.length > 0 ? 'blocked' : args.execute ? 'pass' : 'ready_for_execute';
  const report = {
    receipt_type: 'onedrive_production_pilot_import',
    mode: args.execute ? 'execute' : 'dry-run',
    status,
    run_id: args.runId,
    blockers: [...new Set(blockers)],
    approval_ref_hash: sha256Hex(args.approvalRef).slice(0, 16),
    manifest_approval_ref_hash: sha256Hex(args.manifestApprovalRef).slice(0, 16),
    scope: {
      bounded: args.limit > 0 && args.limit <= maxPilotLimit,
      limit: args.limit,
      offset: args.offset,
      tenant_slug_hash: sha256Hex(args.tenantSlug).slice(0, 16),
      actor_user_id_hash: sha256Hex(args.actorUserId).slice(0, 16),
      rollback_ref: 'PROD-BACKUP-AWS-001',
      operator_role_ref_hash: sha256Hex(args.approvalRef).slice(0, 16),
    },
    runtime_env_presence: runtime,
    evidence_refs: {
      production_preflight_ref: safeReceiptRef(args.productionPreflightPath),
      import_decision_ref: safeReceiptRef(args.importDecisionReceiptPath),
      pilot_gate_ref: safeReceiptRef(args.pilotGateReceiptPath),
      import_runner_sanitized_ref: importReport ? safeReceiptRef(importRunnerSanitizedOut) : null,
      replay_sanitized_ref: replayReport ? safeReceiptRef(replaySanitizedOut) : null,
    },
    import_runner: summarizeImportRun(importReport),
    replay_idempotency: summarizeReplay(replayReport),
    tuw_status: tuwStatus(args, blockers, importReport, replayReport),
    production_write_executed: args.execute && imported > 0,
    production_import_executed: args.execute && status === 'pass',
    production_source_of_truth_cutover_executed: false,
    onedrive_connected_state_claimed: false,
    office_open_save_sync_claimed: false,
    gemma_indexing_executed: false,
    not_executed: [
      ...(args.execute && imported > 0 ? [] : ['production import']),
      'production source-of-truth cutover',
      'OneDrive connected state',
      'Office open/save/sync',
      'Gemma indexing execution',
      'customer-wide go-live claim',
    ],
    sanitization:
      'Only booleans, counts, hashed refs, and sanitized evidence filenames are recorded.',
  };

  await writeJson(args.sanitizedOut, report);
  return report;
}

function customerWideArgs(
  args: ProductionPilotImportCliArgs,
  execute: boolean,
  sanitizedOut: string,
): CustomerWideImportCliArgs {
  return {
    runId: `${args.runId}-${execute ? 'execute' : 'dry-run'}`,
    manifestPath: args.manifestPath,
    scopePath: args.scopePath,
    tenantSlug: args.tenantSlug,
    actorUserId: args.actorUserId,
    uploadPreflightRef: args.uploadPreflightRef,
    importApprovalRef: args.approvalRef,
    manifestApprovalRef: args.manifestApprovalRef,
    sanitizedOut,
    localReceiptOut: args.localReceiptOut,
    statePath: args.statePath,
    awsProfile: args.awsProfile,
    dryRun: !execute,
    execute,
    limit: args.limit,
    offset: args.offset,
    maxFailures: args.maxFailures,
    cutoverPolicy: args.cutoverPolicy,
    documentDefaults: {
      documentType: 'other',
      confidentialityLevel: 'standard',
      privilegeStatus: 'none',
      aiAllowed: false,
    },
  };
}

function collectBlockers(
  args: ProductionPilotImportCliArgs,
  productionPreflight: GateReceipt,
  importDecision: GateReceipt,
  pilotGate: GateReceipt,
  runtime: ReturnType<typeof runtimePresence>,
): string[] {
  const blockers: string[] = [];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!safeRefPattern.test(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!safeRefPattern.test(args.manifestApprovalRef)) blockers.push('manifest_approval_ref_invalid');
  if (!uuidPattern.test(args.actorUserId)) blockers.push('actor_user_id_missing_or_invalid');
  if (args.cutoverPolicy !== 'not_requested') blockers.push('source_of_truth_cutover_must_not_be_requested');
  if (args.limit <= 0 || args.limit > maxPilotLimit) blockers.push('pilot_scope_limit_out_of_bounds');
  if (args.offset < 0) blockers.push('pilot_scope_offset_invalid');
  if (productionPreflight.status !== 'ready_for_production_import_decision') {
    blockers.push('production_preflight_not_ready');
  }
  if (productionPreflight.production_write_executed !== false) {
    blockers.push('production_preflight_must_be_no_write');
  }
  if (productionPreflight.acceptance_checks?.production_refs_present !== true) {
    blockers.push('production_external_refs_missing');
  }
  if (importDecision.gate !== 'production-import-decision' || importDecision.status !== 'ready_for_next_gate') {
    blockers.push('production_import_decision_not_ready');
  }
  if (pilotGate.gate !== 'production-pilot-import' || pilotGate.status !== 'ready_for_next_gate') {
    blockers.push('production_pilot_gate_not_ready');
  }
  if (pilotGate.production_write_executed !== false) blockers.push('pilot_gate_must_be_no_write');
  if (args.execute && (!runtime.databaseTargetPresent || !runtime.sourceObjectAccessPresent)) {
    blockers.push('production_runtime_target_env_missing');
  }
  return [...new Set(blockers)];
}

export function runtimePresence(
  env: NodeJS.ProcessEnv,
  args: { awsProfile?: string | undefined },
) {
  const pgTuplePresent =
    Boolean(env.PGHOST) && Boolean(env.PGDATABASE) && Boolean(env.PGUSER);
  const databaseTargetPresent = Boolean(env.DATABASE_URL) || pgTuplePresent;
  const awsIdentityPresent = Boolean(args.awsProfile) || Boolean(env.AWS_PROFILE);
  const sourceObjectAccessPresent = awsIdentityPresent && Boolean(env.AWS_REGION);
  return {
    DATABASE_URL: Boolean(env.DATABASE_URL),
    PGHOST: Boolean(env.PGHOST),
    PGDATABASE: Boolean(env.PGDATABASE),
    PGUSER: Boolean(env.PGUSER),
    AWS_PROFILE: Boolean(args.awsProfile) || Boolean(env.AWS_PROFILE),
    AWS_REGION: Boolean(env.AWS_REGION),
    databaseTargetPresent,
    sourceObjectAccessPresent,
  };
}

function summarizeImportRun(report: ImportRunReport | null) {
  if (!report) return null;
  return {
    gate_status: stringValue(report.gate_status),
    mode: stringValue(report.mode),
    processed_rows: numberValue(report.processed_rows),
    local_receipt_rows_written: numberValue(report.local_receipt_rows_written),
    ready: statusCount(report, 'ready'),
    imported: statusCount(report, 'imported'),
    already_imported: statusCount(report, 'already_imported'),
    skipped: statusCount(report, 'skipped'),
    blocked: statusCount(report, 'blocked'),
    failed: statusCount(report, 'failed'),
    expected_created_counts: report.summary?.expected_created_counts ?? {},
  };
}

function summarizeReplay(report: ImportRunReport | null) {
  if (!report) return { status: 'not_run' };
  return {
    status: report.gate_status === 'pass' && statusCount(report, 'ready') === 0 ? 'PASS' : 'BLOCKED',
    already_imported: statusCount(report, 'already_imported'),
    ready: statusCount(report, 'ready'),
    blocked: statusCount(report, 'blocked'),
    failed: statusCount(report, 'failed'),
  };
}

function tuwStatus(
  args: ProductionPilotImportCliArgs,
  blockers: readonly string[],
  importReport: ImportRunReport | null,
  replayReport: ImportRunReport | null,
) {
  const runnerPass = importReport?.gate_status === 'pass';
  const executed = args.execute && runnerPass;
  const blockedOnlyByRuntimeTarget =
    blockers.length === 1 && blockers.includes('production_runtime_target_env_missing');
  return {
    'PROD-IMPORT-001': safeRefPattern.test(args.approvalRef) ? 'PASS' : 'BLOCKED',
    'PROD-IMPORT-002': runnerPass || blockers.length === 0 || blockedOnlyByRuntimeTarget ? 'PASS' : 'BLOCKED',
    'PROD-IMPORT-003': args.limit > 0 && args.limit <= maxPilotLimit ? 'PASS' : 'BLOCKED',
    'PROD-IMPORT-004': executed ? 'PASS' : args.execute ? 'BLOCKED' : 'READY_NOT_EXECUTED',
    'PROD-IMPORT-005': executed && statusCount(importReport, 'blocked') === 0 && statusCount(importReport, 'failed') === 0 ? 'PASS' : 'DEFERRED_UNTIL_EXECUTE',
    'PROD-IMPORT-006': replayReport ? summarizeReplay(replayReport).status : 'DEFERRED_UNTIL_EXECUTE',
    'PROD-IMPORT-007': 'PASS',
    'PROD-IMPORT-008': executed ? 'READY_FOR_NEXT_GATE' : 'WAITING_FOR_PRODUCTION_RUNTIME_TARGET',
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function siblingReceiptPath(filePath: string, label: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.${label}.sanitized.json`);
}

function safeReceiptRef(filePath: string): string {
  return path.basename(filePath).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 160);
}

function statusCount(report: ImportRunReport | null, name: string): number {
  return numberValue(report?.summary?.status_counts?.[name]);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

function parseOptionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseOptionalNonNegativeInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function main(): Promise<void> {
  let args: ProductionPilotImportCliArgs;
  try {
    args = parseProductionPilotImportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runProductionPilotImport(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        production_import_executed: report.production_import_executed,
        blockers: report.blockers,
        import_runner: report.import_runner,
        replay_idempotency: report.replay_idempotency,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_PRODUCTION_PILOT_IMPORT_FAILED',
        message: error instanceof Error ? error.message : 'PRODUCTION_PILOT_IMPORT_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
