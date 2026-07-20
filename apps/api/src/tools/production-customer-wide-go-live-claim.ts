import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export interface ProductionCustomerWideGoLiveClaimCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  tenantSlug: string;
  actorEmail: string;
  approvalRef: string;
  controlRef: string;
  sanitizedOut: string;
  databaseUrl: string;
  expectedActiveDocuments: number | null;
}

interface LatestCutoverState {
  cutoverId: string;
  onedriveConnectedStateClaimed: boolean;
  officeOpenSaveSyncClaimed: boolean;
  gemmaIndexingExecuted: boolean;
  customerWideGoLiveClaimed: boolean;
}

interface GoLiveCounts {
  sourceCutoverRows: number;
  prerequisiteReadyRows: number;
  goLiveClaimedRows: number;
  activeDocuments: number;
  documentVersions: number;
  fileObjects: number;
  auditEvents: number;
}

interface GoLivePlan {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  latestCutover: LatestCutoverState;
  goLiveColumnPresent: boolean;
  counts: GoLiveCounts;
  blockers: string[];
}

interface ExecuteResult {
  cutoverId: string;
  auditEventId: string;
  tenantId: string;
  actorUserId: string;
  updatedCutoverRows: number;
}

interface GoLiveClaimDb {
  plan(args: ProductionCustomerWideGoLiveClaimCliArgs): Promise<GoLivePlan>;
  execute(
    args: ProductionCustomerWideGoLiveClaimCliArgs,
    plan: GoLivePlan,
    receiptHash: string,
  ): Promise<ExecuteResult>;
}

export function usage(): string {
  return [
    'usage: pnpm production:customer-wide-go-live-claim -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --actor-email <email> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--expected-active-documents <n>]',
    '',
    'Records the approved production customer-wide go-live claim only after source-of-truth cutover, Gemma indexing, OneDrive connected-state, and Office open/save/sync gates are already passed.',
    'It does not implement OneDrive connected-state, implement Office open/save/sync, or execute Gemma indexing.',
  ].join('\n');
}

export function parseProductionCustomerWideGoLiveClaimArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ProductionCustomerWideGoLiveClaimCliArgs {
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
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    databaseUrl: argValue(argv, '--database-url') ?? env.DATABASE_URL ?? defaultDatabaseUrl,
    expectedActiveDocuments:
      optionalPositiveInt(argValue(argv, '--expected-active-documents'), '--expected-active-documents') ??
      null,
  };
}

export async function runProductionCustomerWideGoLiveClaim(
  args: ProductionCustomerWideGoLiveClaimCliArgs,
  db: GoLiveClaimDb = new PgGoLiveClaimDb(args.databaseUrl),
) {
  const plan = await db.plan(args);
  const blockers = validateReadiness(args, plan);
  const receiptHash = sha256(
    [
      args.runId,
      args.approvalRef,
      args.controlRef,
      hashRef(plan.tenantId),
      hashRef(plan.latestCutover.cutoverId),
      plan.counts.activeDocuments,
      plan.counts.prerequisiteReadyRows,
    ].join('|'),
  );
  let executeResult: ExecuteResult | null = null;
  if (args.execute && blockers.length === 0) {
    executeResult = await db.execute(args, plan, receiptHash);
  }
  const report = {
    receipt_type: 'production_customer_wide_go_live_claim',
    mode: args.dryRun ? 'dry-run' : 'execute',
    status: blockers.length === 0 ? (args.dryRun ? 'ready_for_execute' : 'executed') : 'blocked',
    run_id: args.runId,
    customer_wide_go_live_claimed: Boolean(executeResult),
    db_write_executed: Boolean(executeResult),
    updated_cutover_rows: executeResult?.updatedCutoverRows ?? 0,
    audit_event_ref: executeResult ? hashRef(executeResult.auditEventId) : null,
    cutover_ref: executeResult
      ? hashRef(executeResult.cutoverId)
      : hashRef(plan.latestCutover.cutoverId),
    tenant_ref: plan.tenantId ? hashRef(plan.tenantId) : null,
    actor_ref: plan.actorUserId ? hashRef(plan.actorUserId) : null,
    prerequisite_gates: {
      production_source_of_truth_cutover: Boolean(plan.latestCutover.cutoverId),
      gemma_indexing_executed: plan.latestCutover.gemmaIndexingExecuted,
      onedrive_connected_state_claimed: plan.latestCutover.onedriveConnectedStateClaimed,
      office_open_save_sync_claimed: plan.latestCutover.officeOpenSaveSyncClaimed,
    },
    counts: {
      source_cutover_rows: plan.counts.sourceCutoverRows,
      prerequisite_ready_rows: plan.counts.prerequisiteReadyRows,
      customer_wide_go_live_claimed_rows_before: plan.counts.goLiveClaimedRows,
      active_documents: plan.counts.activeDocuments,
      document_versions: plan.counts.documentVersions,
      file_objects: plan.counts.fileObjects,
      audit_events: plan.counts.auditEvents,
    },
    blockers,
    acceptance_checks: {
      source_of_truth_cutover_executed: Boolean(plan.latestCutover.cutoverId),
      gemma_indexing_executed_before_go_live: plan.latestCutover.gemmaIndexingExecuted,
      onedrive_connected_state_claimed_before_go_live:
        plan.latestCutover.onedriveConnectedStateClaimed,
      office_open_save_sync_claimed_before_go_live: plan.latestCutover.officeOpenSaveSyncClaimed,
      customer_wide_go_live_not_already_claimed: !plan.latestCutover.customerWideGoLiveClaimed,
      go_live_column_present: plan.goLiveColumnPresent,
      actor_role_authorized: isAuthorizedActorRole(plan.actorRole),
      explicit_human_approval_ref_present: requiredRef(args.approvalRef),
      control_ref_present: requiredRef(args.controlRef),
      active_documents_gt_zero: plan.counts.activeDocuments > 0,
      expected_active_documents_matches:
        args.expectedActiveDocuments === null || args.expectedActiveDocuments === plan.counts.activeDocuments,
      execute_count_matches_target: !executeResult || executeResult.updatedCutoverRows === 1,
    },
    evidence_refs: {
      approval_ref: args.approvalRef,
      control_ref: args.controlRef,
      receipt_hash: receiptHash,
    },
    not_executed_by_this_lane: {
      onedrive_connected_state_implementation: true,
      office_open_save_sync_implementation: true,
      gemma_indexing_execution: true,
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
      'Receipt stores counts, hashes, safe refs, and reason codes only. Raw paths, document names, matter codes, client names, document contents, OCR excerpts, object keys, tokens, secrets, tenant-private raw labels, provider payloads, Office document payloads, prompts, and model responses are omitted.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

class PgGoLiveClaimDb implements GoLiveClaimDb {
  constructor(private readonly databaseUrl: string) {}

  async plan(args: ProductionCustomerWideGoLiveClaimCliArgs): Promise<GoLivePlan> {
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
      const goLiveColumnPresentValue = await goLiveColumnPresent(client);
      const latestCutoverValue = await latestCutover(client, tenantId, goLiveColumnPresentValue);
      const counts = await summarizeCounts(client, tenantId, goLiveColumnPresentValue);
      return {
        tenantId,
        actorUserId: actor.user_id,
        actorRole: actor.role,
        latestCutover: latestCutoverValue,
        goLiveColumnPresent: goLiveColumnPresentValue,
        counts,
        blockers: latestCutoverValue.cutoverId ? [] : ['source_of_truth_cutover_not_found'],
      };
    } finally {
      await client.end();
    }
  }

  async execute(
    args: ProductionCustomerWideGoLiveClaimCliArgs,
    plan: GoLivePlan,
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
          SET customer_wide_go_live_claimed = true
          WHERE tenant_id = $1
            AND cutover_id = $2
            AND status = 'executed'
            AND vault_source_of_truth = true
            AND onedrive_connected_state_claimed = true
            AND office_open_save_sync_claimed = true
            AND gemma_indexing_executed = true
            AND customer_wide_go_live_claimed = false
          RETURNING cutover_id
        `,
        [plan.tenantId, plan.latestCutover.cutoverId],
      );
      const updatedCutoverRows = updateResult.rowCount ?? 0;
      if (updatedCutoverRows !== 1) throw new Error('CUSTOMER_WIDE_GO_LIVE_UPDATE_COUNT_MISMATCH');
      const auditResult = await client.query<{ event_id: string }>(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
            matter_id, result, metadata_json, correlation_id, retention_label
          )
          VALUES (
            $1, 'user', $2, NULL, 'COMPLIANCE_EVIDENCE_RECORDED',
            'customer_wide_go_live', $3, NULL, 'success', $4::jsonb, NULL, 'PERMANENT'
          )
          RETURNING event_id
        `,
        [
          plan.tenantId,
          plan.actorUserId,
          plan.latestCutover.cutoverId,
          JSON.stringify({
            evidence_hash: receiptHash,
            approval_ref: args.approvalRef,
            control_ref: args.controlRef,
            run_id: args.runId,
            status_after: 'production_customer_wide_go_live_claimed',
            reason_code: 'all_customer_wide_go_live_prerequisite_gates_passed',
          }),
        ],
      );
      const auditEventId = auditResult.rows[0]?.event_id;
      if (!auditEventId) throw new Error('CUSTOMER_WIDE_GO_LIVE_AUDIT_INSERT_RETURNED_NO_ROW');
      await client.query('COMMIT');
      return {
        cutoverId: plan.latestCutover.cutoverId,
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

async function latestCutover(
  client: Client,
  tenantId: string,
  includeGoLiveColumn: boolean,
): Promise<LatestCutoverState> {
  const goLiveSelect = includeGoLiveColumn ? 'customer_wide_go_live_claimed' : 'false';
  const result = await client.query<{
    cutover_id: string;
    onedrive_connected_state_claimed: boolean;
    office_open_save_sync_claimed: boolean;
    gemma_indexing_executed: boolean;
    customer_wide_go_live_claimed: boolean;
  }>(
    `
      SELECT
        cutover_id,
        onedrive_connected_state_claimed,
        office_open_save_sync_claimed,
        gemma_indexing_executed,
        ${goLiveSelect} AS customer_wide_go_live_claimed
      FROM onedrive_source_cutovers
      WHERE tenant_id = $1
        AND status = 'executed'
        AND vault_source_of_truth = true
      ORDER BY executed_at DESC, created_at DESC
      LIMIT 1
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    cutoverId: row?.cutover_id ?? '',
    onedriveConnectedStateClaimed: row?.onedrive_connected_state_claimed === true,
    officeOpenSaveSyncClaimed: row?.office_open_save_sync_claimed === true,
    gemmaIndexingExecuted: row?.gemma_indexing_executed === true,
    customerWideGoLiveClaimed: row?.customer_wide_go_live_claimed === true,
  };
}

async function summarizeCounts(
  client: Client,
  tenantId: string,
  includeGoLiveColumn: boolean,
): Promise<GoLiveCounts> {
  const goLiveCount = includeGoLiveColumn
    ? `count(*) FILTER (
          WHERE status = 'executed'
            AND vault_source_of_truth = true
            AND customer_wide_go_live_claimed = true
        )`
    : '0';
  const result = await client.query<{
    source_cutover_rows: string;
    prerequisite_ready_rows: string;
    go_live_claimed_rows: string;
    active_documents: string;
    document_versions: string;
    file_objects: string;
    audit_events: string;
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
            AND office_open_save_sync_claimed = true
            AND gemma_indexing_executed = true
        ) AS prerequisite_ready_rows,
        ${goLiveCount} AS go_live_claimed_rows,
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND status <> 'deleted') AS active_documents,
        (SELECT count(*) FROM document_versions WHERE tenant_id = $1) AS document_versions,
        (SELECT count(*) FROM file_objects WHERE tenant_id = $1) AS file_objects,
        (SELECT count(*) FROM audit_events WHERE tenant_id = $1) AS audit_events
      FROM onedrive_source_cutovers
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    sourceCutoverRows: numberValue(row?.source_cutover_rows),
    prerequisiteReadyRows: numberValue(row?.prerequisite_ready_rows),
    goLiveClaimedRows: numberValue(row?.go_live_claimed_rows),
    activeDocuments: numberValue(row?.active_documents),
    documentVersions: numberValue(row?.document_versions),
    fileObjects: numberValue(row?.file_objects),
    auditEvents: numberValue(row?.audit_events),
  };
}

async function goLiveColumnPresent(client: Client): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'onedrive_source_cutovers'
          AND column_name = 'customer_wide_go_live_claimed'
      ) AS present
    `,
  );
  return result.rows[0]?.present === true;
}

function validateReadiness(
  args: ProductionCustomerWideGoLiveClaimCliArgs,
  plan: GoLivePlan,
): string[] {
  const blockers: string[] = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!requiredRef(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!requiredRef(args.controlRef)) blockers.push('control_ref_invalid');
  if (!args.tenantSlug.trim()) blockers.push('tenant_slug_missing');
  if (!args.actorEmail.includes('@')) blockers.push('actor_email_invalid');
  if (!isAuthorizedActorRole(plan.actorRole)) blockers.push('actor_role_not_authorized');
  if (!plan.goLiveColumnPresent) blockers.push('customer_wide_go_live_control_column_not_migrated');
  if (!plan.latestCutover.cutoverId) blockers.push('source_of_truth_cutover_not_executed');
  if (!plan.latestCutover.gemmaIndexingExecuted) blockers.push('gemma_indexing_not_executed');
  if (!plan.latestCutover.onedriveConnectedStateClaimed) {
    blockers.push('onedrive_connected_state_not_claimed');
  }
  if (!plan.latestCutover.officeOpenSaveSyncClaimed) {
    blockers.push('office_open_save_sync_not_claimed');
  }
  if (plan.latestCutover.customerWideGoLiveClaimed) blockers.push('customer_wide_go_live_already_claimed');
  if (plan.counts.activeDocuments <= 0) blockers.push('active_documents_zero');
  if (
    args.expectedActiveDocuments !== null &&
    args.expectedActiveDocuments !== plan.counts.activeDocuments
  ) {
    blockers.push('expected_active_documents_mismatch');
  }
  return [...new Set(blockers)];
}

function emptyPlan(blocker: string): GoLivePlan {
  return {
    tenantId: '',
    actorUserId: '',
    actorRole: '',
    latestCutover: {
      cutoverId: '',
      onedriveConnectedStateClaimed: false,
      officeOpenSaveSyncClaimed: false,
      gemmaIndexingExecuted: false,
      customerWideGoLiveClaimed: false,
    },
    goLiveColumnPresent: false,
    counts: {
      sourceCutoverRows: 0,
      prerequisiteReadyRows: 0,
      goLiveClaimedRows: 0,
      activeDocuments: 0,
      documentVersions: 0,
      fileObjects: 0,
      auditEvents: 0,
    },
    blockers: [blocker],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
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

function optionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (!value) return undefined;
  if (!/^[1-9][0-9]*$/u.test(value)) throw new Error(`${name} must be a positive integer`);
  return Number(value);
}

function numberValue(value: unknown): number {
  return typeof value === 'string' || typeof value === 'number' ? Number(value) : 0;
}

async function main(): Promise<void> {
  let args: ProductionCustomerWideGoLiveClaimCliArgs;
  try {
    args = parseProductionCustomerWideGoLiveClaimArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runProductionCustomerWideGoLiveClaim(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        customer_wide_go_live_claimed: report.customer_wide_go_live_claimed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'CUSTOMER_WIDE_GO_LIVE_CLAIM_FAILED',
        message: error instanceof Error ? error.message : 'CUSTOMER_WIDE_GO_LIVE_CLAIM_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
