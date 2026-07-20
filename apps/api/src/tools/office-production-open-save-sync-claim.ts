import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OfficeOpenSaveSyncClaimCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  tenantSlug: string;
  actorEmail: string;
  approvalRef: string;
  controlRef: string;
  verificationReceiptPath?: string | undefined;
  sanitizedOut: string;
  databaseUrl: string;
}

interface OfficeOpenSaveSyncVerificationReceipt {
  receipt_type?: unknown;
  status?: unknown;
  office_open_save_sync_verified?: unknown;
  production_source_of_truth_cutover_executed?: unknown;
  verification_scope?: {
    production_surface_checked?: unknown;
    office_open_checked?: unknown;
    office_save_checked?: unknown;
    office_sync_checked?: unknown;
  };
  prohibited_claims?: {
    onedrive_connected_state_claim?: unknown;
    gemma_indexing_execution_claim?: unknown;
    customer_wide_go_live_claim?: unknown;
  };
  repo_safety?: {
    raw_path_saved?: unknown;
    document_body_saved?: unknown;
    ocr_excerpt_saved?: unknown;
    object_key_saved?: unknown;
    token_saved?: unknown;
    tenant_private_raw_value_saved?: unknown;
    secret_printed?: unknown;
  };
}

interface OfficeClaimCounts {
  sourceCutoverRows: number;
  connectedStateClaimedRows: number;
  officeSyncClaimedRows: number;
  gemmaIndexingExecutedRows: number;
}

interface OfficeClaimPlan {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  cutoverId: string;
  controlConstraintBlocksTrue: boolean;
  counts: OfficeClaimCounts;
  verification: OfficeOpenSaveSyncVerificationReceipt | null;
  verificationRef: string | null;
  blockers: string[];
}

interface ExecuteResult {
  cutoverId: string;
  auditEventId: string;
  tenantId: string;
  actorUserId: string;
  updatedCutoverRows: number;
}

interface OfficeClaimDb {
  plan(args: OfficeOpenSaveSyncClaimCliArgs): Promise<OfficeClaimPlan>;
  execute(
    args: OfficeOpenSaveSyncClaimCliArgs,
    plan: OfficeClaimPlan,
    receiptHash: string,
  ): Promise<ExecuteResult>;
}

export function usage(): string {
  return [
    'usage: pnpm office:production-open-save-sync-claim -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --actor-email <email> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--verification-receipt <office-open-save-sync-verification.json>]',
    '',
    'Records the approved production Office open/save/sync claim after source-of-truth cutover and Office verification pass.',
    'It does not claim OneDrive connected-state, Gemma indexing execution, or customer-wide go-live.',
  ].join('\n');
}

export function parseOfficeOpenSaveSyncClaimArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): OfficeOpenSaveSyncClaimCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');
  return {
    dryRun,
    execute,
    runId: requiredArg(argv, '--run-id'),
    tenantSlug: requiredArg(argv, '--tenant-slug'),
    actorEmail: requiredArg(argv, '--actor-email'),
    approvalRef: requiredArg(argv, '--approval-ref'),
    controlRef: requiredArg(argv, '--control-ref'),
    verificationReceiptPath: argValue(argv, '--verification-receipt'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    databaseUrl: argValue(argv, '--database-url') ?? env.DATABASE_URL ?? defaultDatabaseUrl,
  };
}

export async function runOfficeOpenSaveSyncClaim(
  args: OfficeOpenSaveSyncClaimCliArgs,
  db: OfficeClaimDb = new PgOfficeClaimDb(args.databaseUrl),
) {
  const plan = await db.plan(args);
  const blockers = validateReadiness(args, plan);
  const receiptHash = sha256(
    [
      args.runId,
      args.approvalRef,
      args.controlRef,
      hashRef(plan.tenantId),
      plan.verificationRef ?? 'verification-missing',
      plan.counts.sourceCutoverRows,
    ].join('|'),
  );
  let executeResult: ExecuteResult | null = null;
  if (args.execute && blockers.length === 0) {
    executeResult = await db.execute(args, plan, receiptHash);
  }
  const verificationPass = verificationReceiptPass(plan.verification);
  const report = {
    receipt_type: 'office_open_save_sync_claim',
    mode: args.dryRun ? 'dry-run' : 'execute',
    status: blockers.length === 0 ? (args.dryRun ? 'ready_for_execute' : 'executed') : 'blocked',
    run_id: args.runId,
    office_open_save_sync_claimed: Boolean(executeResult),
    db_write_executed: Boolean(executeResult),
    updated_cutover_rows: executeResult?.updatedCutoverRows ?? 0,
    audit_event_ref: executeResult ? hashRef(executeResult.auditEventId) : null,
    cutover_ref: executeResult ? hashRef(executeResult.cutoverId) : hashRef(plan.cutoverId),
    tenant_ref: plan.tenantId ? hashRef(plan.tenantId) : null,
    actor_ref: plan.actorUserId ? hashRef(plan.actorUserId) : null,
    counts: {
      source_cutover_rows: plan.counts.sourceCutoverRows,
      connected_state_claimed_rows_before: plan.counts.connectedStateClaimedRows,
      office_sync_claimed_rows_before: plan.counts.officeSyncClaimedRows,
      gemma_indexing_executed_rows_before: plan.counts.gemmaIndexingExecutedRows,
    },
    verification: {
      receipt_ref: plan.verificationRef,
      receipt_present: Boolean(plan.verification),
      verification_pass: verificationPass,
      production_surface_checked:
        plan.verification?.verification_scope?.production_surface_checked === true,
      office_open_checked: plan.verification?.verification_scope?.office_open_checked === true,
      office_save_checked: plan.verification?.verification_scope?.office_save_checked === true,
      office_sync_checked: plan.verification?.verification_scope?.office_sync_checked === true,
    },
    blockers,
    acceptance_checks: {
      source_of_truth_cutover_executed: plan.counts.sourceCutoverRows > 0,
      office_sync_not_already_claimed: plan.counts.officeSyncClaimedRows === 0,
      connected_state_not_claimed_by_this_lane: true,
      control_constraint_allows_true: !plan.controlConstraintBlocksTrue,
      actor_role_authorized: isAuthorizedActorRole(plan.actorRole),
      explicit_human_approval_ref_present: requiredRef(args.approvalRef),
      control_ref_present: requiredRef(args.controlRef),
      office_open_save_sync_verification_receipt_pass: verificationPass,
      execute_count_matches_target: !executeResult || executeResult.updatedCutoverRows === 1,
    },
    evidence_refs: {
      approval_ref: args.approvalRef,
      control_ref: args.controlRef,
      verification_ref: plan.verificationRef,
      receipt_hash: receiptHash,
    },
    prohibited_claims: {
      onedrive_connected_state_claim: false,
      gemma_indexing_execution_claim: false,
      customer_wide_go_live_claim: false,
    },
    repo_safety: {
      raw_path_saved: false,
      document_body_saved: false,
      ocr_excerpt_saved: false,
      object_key_saved: false,
      token_saved: false,
      tenant_private_raw_value_saved: false,
    },
    sanitization:
      'Receipt stores counts, hashes, safe refs, and reason codes only. Raw paths, document names, matter codes, client names, document contents, OCR excerpts, object keys, tokens, secrets, tenant-private raw labels, provider IDs, Graph payloads, Office document payloads, and connected account identifiers are omitted.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

class PgOfficeClaimDb implements OfficeClaimDb {
  constructor(private readonly databaseUrl: string) {}

  async plan(args: OfficeOpenSaveSyncClaimCliArgs): Promise<OfficeClaimPlan> {
    const client = new Client({ connectionString: this.databaseUrl });
    await client.connect();
    try {
      const tenantResult = await client.query<{ tenant_id: string }>(
        "SELECT tenant_id FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1",
        [args.tenantSlug],
      );
      const tenantId = tenantResult.rows[0]?.tenant_id;
      if (!tenantId) return emptyPlan('tenant_not_found');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const actorResult = await client.query<{ user_id: string; role: string }>(
        `
          SELECT user_id, role
          FROM users
          WHERE tenant_id = $1
            AND email = $2
            AND status = 'active'
          LIMIT 1
        `,
        [tenantId, args.actorEmail],
      );
      const actor = actorResult.rows[0];
      if (!actor) return { ...emptyPlan('actor_not_found'), tenantId };
      const cutover = await latestCutover(client, tenantId);
      const counts = await summarizeCounts(client, tenantId);
      const controlConstraintBlocksTrueValue = await controlConstraintBlocksTrue(client);
      const verification = await readVerificationReceipt(args.verificationReceiptPath);
      return {
        tenantId,
        actorUserId: actor.user_id,
        actorRole: actor.role,
        cutoverId: cutover.cutoverId,
        controlConstraintBlocksTrue: controlConstraintBlocksTrueValue,
        counts,
        verification: verification.receipt,
        verificationRef: verification.ref,
        blockers: cutover.cutoverId ? [] : ['source_of_truth_cutover_not_found'],
      };
    } finally {
      await client.end();
    }
  }

  async execute(
    args: OfficeOpenSaveSyncClaimCliArgs,
    plan: OfficeClaimPlan,
    receiptHash: string,
  ): Promise<ExecuteResult> {
    const client = new Client({ connectionString: this.databaseUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', plan.tenantId]);
      const updateResult = await client.query<{ cutover_id: string }>(
        `
          UPDATE onedrive_source_cutovers
          SET office_open_save_sync_claimed = true
          WHERE tenant_id = $1
            AND cutover_id = $2
            AND status = 'executed'
            AND vault_source_of_truth = true
            AND office_open_save_sync_claimed = false
          RETURNING cutover_id
        `,
        [plan.tenantId, plan.cutoverId],
      );
      const updatedCutoverRows = updateResult.rowCount ?? 0;
      if (updatedCutoverRows !== 1) {
        throw new Error('OFFICE_OPEN_SAVE_SYNC_UPDATE_COUNT_MISMATCH');
      }
      const auditResult = await client.query<{ event_id: string }>(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
            matter_id, result, metadata_json, correlation_id, retention_label
          )
          VALUES (
            $1, 'user', $2, NULL, 'COMPLIANCE_EVIDENCE_RECORDED',
            'office_open_save_sync', $3, NULL, 'success', $4::jsonb, NULL, 'PERMANENT'
          )
          RETURNING event_id
        `,
        [
          plan.tenantId,
          plan.actorUserId,
          plan.cutoverId,
          JSON.stringify({
            evidence_hash: receiptHash,
            approval_ref: args.approvalRef,
            control_ref: args.controlRef,
            verification_ref: plan.verificationRef,
            run_id: args.runId,
            status_after: 'production_office_open_save_sync_claimed',
            reason_code: 'source_cutover_and_office_open_save_sync_verification_pass',
          }),
        ],
      );
      const auditEventId = auditResult.rows[0]?.event_id;
      if (!auditEventId) throw new Error('OFFICE_OPEN_SAVE_SYNC_AUDIT_INSERT_RETURNED_NO_ROW');
      await client.query('COMMIT');
      return {
        cutoverId: plan.cutoverId,
        auditEventId,
        tenantId: plan.tenantId,
        actorUserId: plan.actorUserId,
        updatedCutoverRows,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }
}

async function latestCutover(client: Client, tenantId: string): Promise<{ cutoverId: string }> {
  const result = await client.query<{ cutover_id: string }>(
    `
      SELECT cutover_id
      FROM onedrive_source_cutovers
      WHERE tenant_id = $1
        AND status = 'executed'
        AND vault_source_of_truth = true
      ORDER BY executed_at DESC, created_at DESC
      LIMIT 1
    `,
    [tenantId],
  );
  return { cutoverId: result.rows[0]?.cutover_id ?? '' };
}

async function summarizeCounts(client: Client, tenantId: string): Promise<OfficeClaimCounts> {
  const result = await client.query<{
    source_cutover_rows: string;
    connected_state_claimed_rows: string;
    office_sync_claimed_rows: string;
    gemma_indexing_executed_rows: string;
  }>(
    `
      SELECT
        count(*) FILTER (
          WHERE status = 'executed'
            AND vault_source_of_truth = true
        ) AS source_cutover_rows,
        count(*) FILTER (
          WHERE status = 'executed'
            AND vault_source_of_truth = true
            AND onedrive_connected_state_claimed = true
        ) AS connected_state_claimed_rows,
        count(*) FILTER (
          WHERE status = 'executed'
            AND vault_source_of_truth = true
            AND office_open_save_sync_claimed = true
        ) AS office_sync_claimed_rows,
        count(*) FILTER (
          WHERE status = 'executed'
            AND vault_source_of_truth = true
            AND gemma_indexing_executed = true
        ) AS gemma_indexing_executed_rows
      FROM onedrive_source_cutovers
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    sourceCutoverRows: numberValue(row?.source_cutover_rows),
    connectedStateClaimedRows: numberValue(row?.connected_state_claimed_rows),
    officeSyncClaimedRows: numberValue(row?.office_sync_claimed_rows),
    gemmaIndexingExecutedRows: numberValue(row?.gemma_indexing_executed_rows),
  };
}

async function controlConstraintBlocksTrue(client: Client): Promise<boolean> {
  const result = await client.query<{ blocks_true: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'onedrive_source_cutovers'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%office_open_save_sync_claimed = false%'
      ) AS blocks_true
    `,
  );
  return result.rows[0]?.blocks_true === true;
}

async function readVerificationReceipt(
  filePath: string | undefined,
): Promise<{ receipt: OfficeOpenSaveSyncVerificationReceipt | null; ref: string | null }> {
  if (!filePath) return { receipt: null, ref: null };
  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as OfficeOpenSaveSyncVerificationReceipt;
  return { receipt: parsed, ref: safeReceiptRef(filePath) };
}

function validateReadiness(
  args: OfficeOpenSaveSyncClaimCliArgs,
  plan: OfficeClaimPlan,
): string[] {
  const blockers: string[] = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!requiredRef(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!requiredRef(args.controlRef)) blockers.push('control_ref_invalid');
  if (!args.tenantSlug.trim()) blockers.push('tenant_slug_missing');
  if (!args.actorEmail.includes('@')) blockers.push('actor_email_invalid');
  if (!isAuthorizedActorRole(plan.actorRole)) blockers.push('actor_role_not_authorized');
  if (plan.controlConstraintBlocksTrue) blockers.push('office_sync_control_constraint_not_migrated');
  if (plan.counts.sourceCutoverRows <= 0) blockers.push('source_of_truth_cutover_not_executed');
  if (plan.counts.officeSyncClaimedRows > 0) blockers.push('office_sync_already_claimed');
  if (!plan.verification) blockers.push('office_open_save_sync_verification_receipt_missing');
  if (plan.verification && !verificationReceiptPass(plan.verification)) {
    blockers.push('office_open_save_sync_verification_receipt_not_passed');
  }
  return [...new Set(blockers)];
}

function verificationReceiptPass(receipt: OfficeOpenSaveSyncVerificationReceipt | null): boolean {
  return (
    receipt?.receipt_type === 'office_open_save_sync_verification' &&
    (receipt.status === 'PASS' || receipt.status === 'pass') &&
    receipt.office_open_save_sync_verified === true &&
    receipt.production_source_of_truth_cutover_executed === true &&
    receipt.verification_scope?.production_surface_checked === true &&
    receipt.verification_scope?.office_open_checked === true &&
    receipt.verification_scope?.office_save_checked === true &&
    receipt.verification_scope?.office_sync_checked === true &&
    receipt.prohibited_claims?.onedrive_connected_state_claim === false &&
    receipt.prohibited_claims?.gemma_indexing_execution_claim === false &&
    receipt.prohibited_claims?.customer_wide_go_live_claim === false &&
    receipt.repo_safety?.raw_path_saved === false &&
    receipt.repo_safety?.document_body_saved === false &&
    receipt.repo_safety?.ocr_excerpt_saved === false &&
    receipt.repo_safety?.object_key_saved === false &&
    receipt.repo_safety?.token_saved === false &&
    receipt.repo_safety?.tenant_private_raw_value_saved === false &&
    receipt.repo_safety?.secret_printed === false
  );
}

function emptyPlan(blocker: string): OfficeClaimPlan {
  return {
    tenantId: '',
    actorUserId: '',
    actorRole: '',
    cutoverId: '',
    controlConstraintBlocksTrue: true,
    counts: {
      sourceCutoverRows: 0,
      connectedStateClaimedRows: 0,
      officeSyncClaimedRows: 0,
      gemmaIndexingExecutedRows: 0,
    },
    verification: null,
    verificationRef: null,
    blockers: [blocker],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function safeReceiptRef(filePath: string): string {
  return path.basename(filePath).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 160);
}

function isAuthorizedActorRole(role: string): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

function hashRef(value: string): string {
  if (!uuidPattern.test(value)) return '';
  return sha256(value).slice(0, 16);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function requiredRef(value: string): boolean {
  return safeRefPattern.test(value);
}

function numberValue(value: unknown): number {
  return typeof value === 'string' || typeof value === 'number' ? Number(value) : 0;
}

async function main(): Promise<void> {
  let args: OfficeOpenSaveSyncClaimCliArgs;
  try {
    args = parseOfficeOpenSaveSyncClaimArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runOfficeOpenSaveSyncClaim(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        office_open_save_sync_claimed: report.office_open_save_sync_claimed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'OFFICE_OPEN_SAVE_SYNC_CLAIM_FAILED',
        message: error instanceof Error ? error.message : 'OFFICE_OPEN_SAVE_SYNC_CLAIM_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
