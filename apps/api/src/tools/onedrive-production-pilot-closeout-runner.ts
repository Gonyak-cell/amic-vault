import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export interface ProductionPilotCloseoutCliArgs {
  dryRun: boolean;
  runId: string;
  productionPilotImportPath: string;
  runtimeTargetCheckPath: string;
  sanitizedOut: string;
  expectedLimit: number | undefined;
  expectedOffset: number | undefined;
}

interface RuntimeTargetCheckReceipt {
  receipt_type?: unknown;
  status?: unknown;
  production_write_executed?: unknown;
  production_import_executed?: unknown;
  production_source_of_truth_cutover_executed?: unknown;
  onedrive_connected_state_claimed?: unknown;
  office_open_save_sync_claimed?: unknown;
  gemma_indexing_executed?: unknown;
  scope?: {
    limit?: unknown;
    offset?: unknown;
    tenant_slug_hash?: unknown;
    actor_user_id_hash?: unknown;
  };
  execute_handoff?: {
    status?: unknown;
    required_receipt_ref?: unknown;
    required_wrapper_arg?: unknown;
    bounded_scope?: {
      limit?: unknown;
      offset?: unknown;
    };
  };
}

interface ProductionPilotImportReceipt {
  receipt_type?: unknown;
  mode?: unknown;
  status?: unknown;
  production_write_executed?: unknown;
  production_import_executed?: unknown;
  production_source_of_truth_cutover_executed?: unknown;
  onedrive_connected_state_claimed?: unknown;
  office_open_save_sync_claimed?: unknown;
  gemma_indexing_executed?: unknown;
  scope?: {
    bounded?: unknown;
    limit?: unknown;
    offset?: unknown;
    tenant_slug_hash?: unknown;
    actor_user_id_hash?: unknown;
  };
  import_runner?: {
    gate_status?: unknown;
    processed_rows?: unknown;
    imported?: unknown;
    already_imported?: unknown;
    skipped?: unknown;
    blocked?: unknown;
    failed?: unknown;
    expected_created_counts?: Record<string, unknown>;
  } | null;
  replay_idempotency?: {
    status?: unknown;
    already_imported?: unknown;
    ready?: unknown;
    blocked?: unknown;
    failed?: unknown;
  };
}

const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;

export function usage(): string {
  return [
    'usage: pnpm onedrive:production-pilot-closeout -- --dry-run --run-id <id> --production-pilot-import <receipt.json> --runtime-target-check <receipt.json> --sanitized-out <out.json> [--expected-limit <n>] [--expected-offset <n>]',
    '',
    'Validates a bounded LC-ONEDRIVE-CLOSEOUT-05 execute receipt before production cutover preflight. It performs no production writes.',
  ].join('\n');
}

export function parseProductionPilotCloseoutArgs(
  argv: readonly string[],
): ProductionPilotCloseoutCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  if (!argv.includes('--dry-run') || argv.includes('--execute')) {
    throw new Error('only --dry-run is supported for production pilot closeout');
  }
  return {
    dryRun: true,
    runId: requiredArg(argv, '--run-id'),
    productionPilotImportPath: requiredArg(argv, '--production-pilot-import'),
    runtimeTargetCheckPath: requiredArg(argv, '--runtime-target-check'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    expectedLimit: parseOptionalPositiveInt(argValue(argv, '--expected-limit'), '--expected-limit'),
    expectedOffset: parseOptionalNonNegativeInt(
      argValue(argv, '--expected-offset'),
      '--expected-offset',
    ),
  };
}

export async function runProductionPilotCloseout(args: ProductionPilotCloseoutCliArgs) {
  const productionPilotImport = (await readJson(
    args.productionPilotImportPath,
  )) as ProductionPilotImportReceipt;
  const runtimeTargetCheck = (await readJson(
    args.runtimeTargetCheckPath,
  )) as RuntimeTargetCheckReceipt;
  const blockers = collectBlockers(args, productionPilotImport, runtimeTargetCheck);
  const status = blockers.length === 0 ? 'PASS' : 'BLOCKED';
  const report = {
    receipt_type: 'onedrive_production_pilot_closeout',
    mode: 'dry-run',
    status,
    run_id: args.runId,
    blockers,
    evidence_refs: {
      production_pilot_import_ref: safeReceiptRef(args.productionPilotImportPath),
      runtime_target_check_ref: safeReceiptRef(args.runtimeTargetCheckPath),
    },
    scope: {
      limit: numberValue(productionPilotImport.scope?.limit),
      offset: numberValue(productionPilotImport.scope?.offset),
      expected_limit: args.expectedLimit ?? null,
      expected_offset: args.expectedOffset ?? null,
      tenant_slug_hash: stringValue(productionPilotImport.scope?.tenant_slug_hash),
      actor_user_id_hash: stringValue(productionPilotImport.scope?.actor_user_id_hash),
    },
    import_counts: summarizeImportCounts(productionPilotImport),
    replay_idempotency: summarizeReplay(productionPilotImport),
    acceptance_checks: {
      no_write_mode: true,
      production_pilot_import_passed: productionPilotImport.status === 'pass',
      production_import_executed: productionPilotImport.production_import_executed === true,
      import_runner_passed: productionPilotImport.import_runner?.gate_status === 'pass',
      no_blocked_rows: numberValue(productionPilotImport.import_runner?.blocked) === 0,
      no_failed_rows: numberValue(productionPilotImport.import_runner?.failed) === 0,
      replay_passed: productionPilotImport.replay_idempotency?.status === 'PASS',
      replay_ready_zero: numberValue(productionPilotImport.replay_idempotency?.ready) === 0,
      runtime_target_ready: runtimeTargetCheck.status === 'ready_for_pilot_execute',
      forbidden_claims_false:
        importForbiddenClaimsFalse(productionPilotImport) &&
        runtimeForbiddenClaimsFalse(runtimeTargetCheck),
      gate_has_no_blockers: blockers.length === 0,
    },
    production_write_executed: false,
    production_import_executed: productionPilotImport.production_import_executed === true,
    production_source_of_truth_cutover_executed: false,
    onedrive_connected_state_claimed: false,
    office_open_save_sync_claimed: false,
    gemma_indexing_executed: false,
    next_gate:
      status === 'PASS'
        ? 'production-cutover preflight may be evaluated with this closeout receipt'
        : 'resolve blockers and rerun after a successful bounded production pilot execute',
    receipt_hash: sha256Hex(
      [
        args.runId,
        status,
        safeReceiptRef(args.productionPilotImportPath),
        safeReceiptRef(args.runtimeTargetCheckPath),
        blockers.join(','),
      ].join('|'),
    ),
    sanitization:
      'Only booleans, counts, hashed refs, and sanitized evidence filenames are recorded.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

function collectBlockers(
  args: ProductionPilotCloseoutCliArgs,
  productionPilotImport: ProductionPilotImportReceipt,
  runtimeTargetCheck: RuntimeTargetCheckReceipt,
): string[] {
  const blockers: string[] = [];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (productionPilotImport.receipt_type !== 'onedrive_production_pilot_import') {
    blockers.push('production_pilot_import_receipt_invalid');
  }
  if (productionPilotImport.mode !== 'execute') blockers.push('production_pilot_import_not_execute');
  if (productionPilotImport.status !== 'pass') blockers.push('production_pilot_import_not_passed');
  if (productionPilotImport.production_write_executed !== true) {
    blockers.push('production_write_not_executed');
  }
  if (productionPilotImport.production_import_executed !== true) {
    blockers.push('production_import_not_executed');
  }
  if (productionPilotImport.import_runner?.gate_status !== 'pass') {
    blockers.push('production_import_runner_not_passed');
  }
  if (numberValue(productionPilotImport.import_runner?.blocked) > 0) {
    blockers.push('production_import_has_blocked_rows');
  }
  if (numberValue(productionPilotImport.import_runner?.failed) > 0) {
    blockers.push('production_import_has_failed_rows');
  }
  if (productionPilotImport.replay_idempotency?.status !== 'PASS') {
    blockers.push('production_import_replay_not_passed');
  }
  if (numberValue(productionPilotImport.replay_idempotency?.ready) > 0) {
    blockers.push('production_import_replay_has_ready_rows');
  }
  if (numberValue(productionPilotImport.replay_idempotency?.blocked) > 0) {
    blockers.push('production_import_replay_has_blocked_rows');
  }
  if (numberValue(productionPilotImport.replay_idempotency?.failed) > 0) {
    blockers.push('production_import_replay_has_failed_rows');
  }
  if (productionPilotImport.scope?.bounded !== true) blockers.push('production_scope_not_bounded');
  if (args.expectedLimit !== undefined && productionPilotImport.scope?.limit !== args.expectedLimit) {
    blockers.push('production_scope_limit_mismatch');
  }
  if (args.expectedOffset !== undefined && productionPilotImport.scope?.offset !== args.expectedOffset) {
    blockers.push('production_scope_offset_mismatch');
  }
  blockers.push(...runtimeTargetBlockers(productionPilotImport, runtimeTargetCheck));
  if (!importForbiddenClaimsFalse(productionPilotImport)) {
    blockers.push('production_pilot_import_forbidden_claim_state');
  }
  if (!runtimeForbiddenClaimsFalse(runtimeTargetCheck)) {
    blockers.push('runtime_target_check_forbidden_claim_state');
  }
  return [...new Set(blockers)];
}

function runtimeTargetBlockers(
  productionPilotImport: ProductionPilotImportReceipt,
  runtimeTargetCheck: RuntimeTargetCheckReceipt,
): string[] {
  const blockers: string[] = [];
  if (runtimeTargetCheck.receipt_type !== 'onedrive_production_runtime_target_check') {
    blockers.push('runtime_target_check_receipt_invalid');
  }
  if (runtimeTargetCheck.status !== 'ready_for_pilot_execute') {
    blockers.push('runtime_target_check_not_ready');
  }
  if (runtimeTargetCheck.execute_handoff?.status !== 'ready') {
    blockers.push('runtime_target_check_handoff_not_ready');
  }
  if (runtimeTargetCheck.execute_handoff?.required_wrapper_arg !== '--runtime-target-check') {
    blockers.push('runtime_target_check_handoff_arg_invalid');
  }
  if (runtimeTargetCheck.scope?.limit !== productionPilotImport.scope?.limit) {
    blockers.push('runtime_target_check_limit_mismatch');
  }
  if (runtimeTargetCheck.scope?.offset !== productionPilotImport.scope?.offset) {
    blockers.push('runtime_target_check_offset_mismatch');
  }
  if (
    runtimeTargetCheck.scope?.tenant_slug_hash !== productionPilotImport.scope?.tenant_slug_hash
  ) {
    blockers.push('runtime_target_check_tenant_mismatch');
  }
  if (
    runtimeTargetCheck.scope?.actor_user_id_hash !== productionPilotImport.scope?.actor_user_id_hash
  ) {
    blockers.push('runtime_target_check_actor_mismatch');
  }
  return blockers;
}

function summarizeImportCounts(receipt: ProductionPilotImportReceipt) {
  return {
    processed_rows: numberValue(receipt.import_runner?.processed_rows),
    imported: numberValue(receipt.import_runner?.imported),
    already_imported: numberValue(receipt.import_runner?.already_imported),
    skipped: numberValue(receipt.import_runner?.skipped),
    blocked: numberValue(receipt.import_runner?.blocked),
    failed: numberValue(receipt.import_runner?.failed),
    expected_created_counts: receipt.import_runner?.expected_created_counts ?? {},
  };
}

function summarizeReplay(receipt: ProductionPilotImportReceipt) {
  return {
    status: stringValue(receipt.replay_idempotency?.status),
    already_imported: numberValue(receipt.replay_idempotency?.already_imported),
    ready: numberValue(receipt.replay_idempotency?.ready),
    blocked: numberValue(receipt.replay_idempotency?.blocked),
    failed: numberValue(receipt.replay_idempotency?.failed),
  };
}

function importForbiddenClaimsFalse(receipt: ProductionPilotImportReceipt): boolean {
  return (
    receipt.production_source_of_truth_cutover_executed === false &&
    receipt.onedrive_connected_state_claimed === false &&
    receipt.office_open_save_sync_claimed === false &&
    receipt.gemma_indexing_executed === false
  );
}

function runtimeForbiddenClaimsFalse(receipt: RuntimeTargetCheckReceipt): boolean {
  return (
    receipt.production_write_executed === false &&
    receipt.production_import_executed === false &&
    receipt.production_source_of_truth_cutover_executed === false &&
    receipt.onedrive_connected_state_claimed === false &&
    receipt.office_open_save_sync_claimed === false &&
    receipt.gemma_indexing_executed === false
  );
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

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function main(): Promise<void> {
  let args: ProductionPilotCloseoutCliArgs;
  try {
    args = parseProductionPilotCloseoutArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runProductionPilotCloseout(args);
    console.log(
      JSON.stringify({
        run_id: report.run_id,
        mode: report.mode,
        status: report.status,
        blockers: report.blockers,
        production_import_executed: report.production_import_executed,
        next_gate: report.next_gate,
      }),
    );
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_PRODUCTION_PILOT_CLOSEOUT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
