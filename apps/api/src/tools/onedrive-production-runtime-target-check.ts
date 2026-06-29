import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runtimePresence } from './onedrive-production-pilot-import-runner';

export interface ProductionRuntimeTargetCheckCliArgs {
  dryRun: boolean;
  runId: string;
  approvalRef: string;
  manifestApprovalRef: string;
  productionPreflightPath: string;
  importDecisionReceiptPath: string;
  pilotGateReceiptPath: string;
  tenantSlug: string;
  actorUserId: string;
  sanitizedOut: string;
  awsProfile?: string | undefined;
  limit: number;
  offset: number;
}

interface ProductionRuntimeTargetCheckDependencies {
  env?: NodeJS.ProcessEnv | undefined;
}

interface GateReceipt {
  status?: unknown;
  gate?: unknown;
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
    'usage: pnpm onedrive:production-runtime-target-check -- --dry-run --run-id <id> --approval-ref <ref> --manifest-approval-ref <ref> --production-preflight <receipt.json> --import-decision <receipt.json> --pilot-gate <receipt.json> --tenant-slug <slug> --actor-user-id <uuid> --sanitized-out <out.json> [--aws-profile <profile>] [--limit <n>] [--offset <n>]',
    '',
    'Checks whether LC-ONEDRIVE-CLOSEOUT-05 has the production runtime target needed for bounded pilot execute without writing production data.',
  ].join('\n');
}

export function parseProductionRuntimeTargetCheckArgs(
  argv: readonly string[],
): ProductionRuntimeTargetCheckCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  if (!argv.includes('--dry-run') || argv.includes('--execute')) {
    throw new Error('only --dry-run is supported for production runtime target checks');
  }
  return {
    dryRun: true,
    runId: requiredArg(argv, '--run-id'),
    approvalRef: requiredArg(argv, '--approval-ref'),
    manifestApprovalRef: requiredArg(argv, '--manifest-approval-ref'),
    productionPreflightPath: requiredArg(argv, '--production-preflight'),
    importDecisionReceiptPath: requiredArg(argv, '--import-decision'),
    pilotGateReceiptPath: requiredArg(argv, '--pilot-gate'),
    tenantSlug: requiredArg(argv, '--tenant-slug'),
    actorUserId: requiredArg(argv, '--actor-user-id'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    awsProfile: argValue(argv, '--aws-profile'),
    limit: parseOptionalPositiveInt(argValue(argv, '--limit'), '--limit') ?? 1,
    offset: parseOptionalNonNegativeInt(argValue(argv, '--offset'), '--offset') ?? 0,
  };
}

export async function runProductionRuntimeTargetCheck(
  args: ProductionRuntimeTargetCheckCliArgs,
  dependencies: ProductionRuntimeTargetCheckDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const productionPreflight = (await readJson(args.productionPreflightPath)) as GateReceipt;
  const importDecision = (await readJson(args.importDecisionReceiptPath)) as GateReceipt;
  const pilotGate = (await readJson(args.pilotGateReceiptPath)) as GateReceipt;
  const runtime = runtimePresence(env, args);
  const blockers = collectBlockers(args, productionPreflight, importDecision, pilotGate, runtime);
  const status = blockers.length === 0 ? 'ready_for_pilot_execute' : 'blocked';
  const missingRuntimeRequirements = missingRuntimeRequirementsFor(runtime);
  const report = {
    receipt_type: 'onedrive_production_runtime_target_check',
    mode: 'dry-run',
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
    },
    runtime_env_presence: runtime,
    missing_runtime_requirements: missingRuntimeRequirements,
    evidence_refs: {
      production_preflight_ref: safeReceiptRef(args.productionPreflightPath),
      import_decision_ref: safeReceiptRef(args.importDecisionReceiptPath),
      pilot_gate_ref: safeReceiptRef(args.pilotGateReceiptPath),
    },
    acceptance_checks: {
      production_runtime_target_present:
        runtime.databaseTargetPresent && runtime.sourceObjectAccessPresent,
      production_preflight_ready:
        productionPreflight.status === 'ready_for_production_import_decision',
      production_refs_present:
        productionPreflight.acceptance_checks?.production_refs_present === true,
      production_import_decision_ready:
        importDecision.gate === 'production-import-decision' &&
        importDecision.status === 'ready_for_next_gate',
      production_pilot_gate_ready:
        pilotGate.gate === 'production-pilot-import' && pilotGate.status === 'ready_for_next_gate',
      pilot_scope_bounded: args.limit > 0 && args.limit <= maxPilotLimit,
      forbidden_claims_false: forbiddenClaimsFalse(productionPreflight, importDecision, pilotGate),
    },
    production_write_executed: false,
    production_import_executed: false,
    production_source_of_truth_cutover_executed: false,
    onedrive_connected_state_claimed: false,
    office_open_save_sync_claimed: false,
    gemma_indexing_executed: false,
    execute_handoff: {
      status: status === 'ready_for_pilot_execute' ? 'ready' : 'blocked',
      required_receipt_ref: safeReceiptRef(args.sanitizedOut),
      required_wrapper_arg: '--runtime-target-check',
      bounded_scope: {
        limit: args.limit,
        offset: args.offset,
      },
      next_command:
        status === 'ready_for_pilot_execute'
          ? 'pnpm onedrive:production-pilot-import -- --execute ... --runtime-target-check <production-runtime-target-check.sanitized.json>'
          : null,
      blocked_by: status === 'ready_for_pilot_execute' ? [] : [...new Set(blockers)],
    },
    next_gate:
      status === 'ready_for_pilot_execute'
        ? 'run pnpm onedrive:production-pilot-import with --execute for the same bounded scope'
        : 'provide production DB runtime target and production source object access env, then rerun this check',
    sanitization:
      'Only booleans, counts, hashed refs, and sanitized evidence filenames are recorded.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

function collectBlockers(
  args: ProductionRuntimeTargetCheckCliArgs,
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
  if (!runtime.databaseTargetPresent || !runtime.sourceObjectAccessPresent) {
    blockers.push('production_runtime_target_env_missing');
  }
  if (!forbiddenClaimsFalse(productionPreflight, importDecision, pilotGate)) {
    blockers.push('forbidden_claim_state_not_false');
  }
  return [...new Set(blockers)];
}

function missingRuntimeRequirementsFor(runtime: ReturnType<typeof runtimePresence>): string[] {
  const missing: string[] = [];
  if (!runtime.databaseTargetPresent) {
    missing.push('database_target:DATABASE_URL_or_PGHOST_PGDATABASE_PGUSER');
  }
  if (!runtime.sourceObjectAccessPresent) {
    missing.push('source_object_access:AWS_PROFILE_or_aws_profile_arg_plus_AWS_REGION');
  }
  return missing;
}

function forbiddenClaimsFalse(...receipts: readonly GateReceipt[]): boolean {
  return receipts.every((receipt) => {
    const optionalFalseValues = [
      receipt.production_import_executed,
      receipt.production_source_of_truth_cutover_executed,
      receipt.onedrive_connected_state_claimed,
      receipt.office_open_save_sync_claimed,
      receipt.gemma_indexing_executed,
    ];
    return optionalFalseValues.every((value) => value === undefined || value === false);
  });
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

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function main(): Promise<void> {
  let args: ProductionRuntimeTargetCheckCliArgs;
  try {
    args = parseProductionRuntimeTargetCheckArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runProductionRuntimeTargetCheck(args);
    console.log(
      JSON.stringify({
        run_id: report.run_id,
        mode: report.mode,
        status: report.status,
        blockers: report.blockers,
        missing_runtime_requirements: report.missing_runtime_requirements,
        production_runtime_target_present:
          report.acceptance_checks.production_runtime_target_present,
      }),
    );
    if (report.status !== 'ready_for_pilot_execute') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_PRODUCTION_RUNTIME_TARGET_CHECK_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
