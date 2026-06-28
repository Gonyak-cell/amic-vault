import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

interface SourceCutoverExecuteCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  importReceiptPath: string;
  preflightReceiptPath: string;
  sanitizedOut: string;
  tenantSlug: string;
  actorEmail: string;
  cutoverApprovalRef: string;
  sourceOfTruthControlRef: string;
  databaseUrl: string;
}

interface CustomerWideImportCloseoutReceipt {
  receipt_type?: unknown;
  gate_status?: unknown;
  approved_scope_rows?: unknown;
  resolved_import_manifest_rows?: unknown;
  full_replay?: {
    already_imported?: unknown;
    allowed_skipped?: unknown;
    ready?: unknown;
    blocked?: unknown;
    failed?: unknown;
  };
}

interface SourceCutoverPreflightReceipt {
  status?: unknown;
  source_of_truth_cutover_executed?: unknown;
  blockers?: unknown;
  acceptance_checks?: {
    separate_cutover_approval_ref_present?: unknown;
    source_of_truth_control_ref_present?: unknown;
    customer_wide_import_execute_pass?: unknown;
    imported_or_reused_count_matches_resolved_manifest?: unknown;
  };
  counts?: {
    resolved_import_manifest_rows?: unknown;
    customer_wide_already_imported_rows?: unknown;
    customer_wide_allowed_skipped_rows?: unknown;
    customer_wide_accounted_rows?: unknown;
    customer_wide_ready_rows?: unknown;
    customer_wide_failed_rows?: unknown;
    customer_wide_blocked_rows?: unknown;
    target_resolution_conflict_rows?: unknown;
  };
}

interface CutoverReadiness {
  blockers: string[];
  approvedScopeRows: number;
  resolvedImportManifestRows: number;
  importedOrReusedCount: number;
  allowedSkippedCount: number;
  readyCount: number;
  blockedCount: number;
  failedCount: number;
  targetResolutionConflictRows: number;
  receiptHash: string;
}

interface DbCutoverResult {
  cutoverId: string;
  auditEventId: string;
  tenantId: string;
  actorUserId: string;
  reused: boolean;
}

interface CutoverDb {
  execute(input: {
    args: SourceCutoverExecuteCliArgs;
    readiness: CutoverReadiness;
    importCloseoutRef: string;
    preflightRef: string;
    evidenceRef: string;
  }): Promise<DbCutoverResult>;
}

const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export function usage(): string {
  return [
    'usage: pnpm onedrive:source-cutover-execute -- --dry-run|--execute --run-id <id> --import-receipt <customer-wide-closeout.json> --preflight-receipt <source-cutover-preflight.json> --tenant-slug <slug> --actor-email <email> --cutover-approval-ref <ref> --source-of-truth-control-ref <ref> --sanitized-out <out.json>',
    '',
    'Executes the local Vault source-of-truth cutover control surface.',
    'It does not claim OneDrive connected-state, Office open/save/sync, or run Gemma indexing.',
  ].join('\n');
}

export function parseSourceCutoverExecuteArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): SourceCutoverExecuteCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');
  return {
    dryRun,
    execute,
    runId: requiredArg(argv, '--run-id'),
    importReceiptPath: requiredArg(argv, '--import-receipt'),
    preflightReceiptPath: requiredArg(argv, '--preflight-receipt'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    tenantSlug: requiredArg(argv, '--tenant-slug'),
    actorEmail: requiredArg(argv, '--actor-email'),
    cutoverApprovalRef: requiredArg(argv, '--cutover-approval-ref'),
    sourceOfTruthControlRef: requiredArg(argv, '--source-of-truth-control-ref'),
    databaseUrl: argValue(argv, '--database-url') ?? env.DATABASE_URL ?? defaultDatabaseUrl,
  };
}

export async function runSourceCutoverExecute(
  args: SourceCutoverExecuteCliArgs,
  db: CutoverDb = new PgCutoverDb(args.databaseUrl),
) {
  const importReceipt = (await readJson(args.importReceiptPath)) as CustomerWideImportCloseoutReceipt;
  const preflightReceipt = (await readJson(args.preflightReceiptPath)) as SourceCutoverPreflightReceipt;
  const readiness = validateReadiness(args, importReceipt, preflightReceipt);
  const importCloseoutRef = safeReceiptRef(args.importReceiptPath);
  const preflightRef = safeReceiptRef(args.preflightReceiptPath);
  const evidenceRef = safeReceiptRef(args.sanitizedOut);
  let dbResult: DbCutoverResult | null = null;

  if (args.execute && readiness.blockers.length === 0) {
    dbResult = await db.execute({ args, readiness, importCloseoutRef, preflightRef, evidenceRef });
  }

  const sourceOfTruthCutoverExecuted = args.execute && readiness.blockers.length === 0;
  const report = {
    receipt_type: 'source_of_truth_cutover_execute',
    mode: args.dryRun ? 'dry-run' : 'execute',
    status: readiness.blockers.length === 0 ? (args.dryRun ? 'ready_for_execute' : 'executed') : 'blocked',
    source_of_truth_cutover_executed: sourceOfTruthCutoverExecuted,
    db_write_executed: Boolean(dbResult),
    idempotent_reuse: dbResult?.reused ?? false,
    run_id: args.runId,
    cutover_id: dbResult?.cutoverId ?? null,
    audit_event_id: dbResult?.auditEventId ?? null,
    tenant_ref: dbResult ? hashRef(dbResult.tenantId) : null,
    actor_ref: dbResult ? hashRef(dbResult.actorUserId) : null,
    counts: {
      approved_scope_rows: readiness.approvedScopeRows,
      resolved_import_manifest_rows: readiness.resolvedImportManifestRows,
      imported_or_reused_rows: readiness.importedOrReusedCount,
      allowed_skipped_rows: readiness.allowedSkippedCount,
      ready_rows: readiness.readyCount,
      blocked_rows: readiness.blockedCount,
      failed_rows: readiness.failedCount,
      target_resolution_conflict_rows: readiness.targetResolutionConflictRows,
    },
    blockers: readiness.blockers,
    acceptance_checks: {
      closeout_pass: importReceipt.gate_status === 'pass',
      preflight_ready: preflightReceipt.status === 'ready_for_manual_cutover_decision',
      preflight_has_no_blockers: blockerArray(preflightReceipt.blockers).length === 0,
      approval_ref_present: requiredRef(args.cutoverApprovalRef),
      source_control_ref_present: requiredRef(args.sourceOfTruthControlRef),
      imported_or_skipped_count_matches_scope:
        readiness.importedOrReusedCount + readiness.allowedSkippedCount === readiness.approvedScopeRows,
      no_ready_rows_remaining: readiness.readyCount === 0,
      no_blocked_rows_remaining: readiness.blockedCount === 0,
      no_failed_rows_remaining: readiness.failedCount === 0,
    },
    safety_flags: {
      onedrive_connected_state_claimed: false,
      office_open_save_sync_claimed: false,
      gemma_indexing_executed: false,
      customer_document_content_logged: false,
    },
    evidence_refs: {
      import_closeout_ref: importCloseoutRef,
      preflight_ref: preflightRef,
      receipt_hash: readiness.receiptHash,
    },
    not_executed: [
      'OneDrive connected state',
      'Office open/save/sync',
      'Gemma indexing execution',
      'customer document content logging',
    ],
    sanitization:
      'No raw source paths, document names, document contents, object keys, tokens, secrets, or tenant-private raw labels are included.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

function validateReadiness(
  args: SourceCutoverExecuteCliArgs,
  importReceipt: CustomerWideImportCloseoutReceipt,
  preflightReceipt: SourceCutoverPreflightReceipt,
): CutoverReadiness {
  const blockers: string[] = [];
  const approvedScopeRows = numberValue(importReceipt.approved_scope_rows);
  const resolvedImportManifestRows = numberValue(
    importReceipt.resolved_import_manifest_rows ?? preflightReceipt.counts?.resolved_import_manifest_rows,
  );
  const importedOrReusedCount = numberValue(
    importReceipt.full_replay?.already_imported ??
      preflightReceipt.counts?.customer_wide_already_imported_rows,
  );
  const allowedSkippedCount = numberValue(
    importReceipt.full_replay?.allowed_skipped ??
      preflightReceipt.counts?.customer_wide_allowed_skipped_rows,
  );
  const readyCount = numberValue(
    importReceipt.full_replay?.ready ?? preflightReceipt.counts?.customer_wide_ready_rows,
  );
  const blockedCount = numberValue(
    importReceipt.full_replay?.blocked ?? preflightReceipt.counts?.customer_wide_blocked_rows,
  );
  const failedCount = numberValue(
    importReceipt.full_replay?.failed ?? preflightReceipt.counts?.customer_wide_failed_rows,
  );
  const targetResolutionConflictRows = numberValue(
    preflightReceipt.counts?.target_resolution_conflict_rows,
  );
  const accountedRows = importedOrReusedCount + allowedSkippedCount;

  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!requiredRef(args.cutoverApprovalRef)) blockers.push('cutover_approval_ref_invalid');
  if (!requiredRef(args.sourceOfTruthControlRef)) {
    blockers.push('source_of_truth_control_ref_invalid');
  }
  if (!requiredString(args.tenantSlug)) blockers.push('tenant_slug_missing');
  if (!requiredString(args.actorEmail) || !args.actorEmail.includes('@')) blockers.push('actor_email_invalid');
  if (importReceipt.receipt_type !== 'customer_wide_import_closeout') {
    blockers.push('customer_wide_import_closeout_receipt_missing');
  }
  if (importReceipt.gate_status !== 'pass') blockers.push('customer_wide_import_closeout_not_passed');
  if (preflightReceipt.status !== 'ready_for_manual_cutover_decision') {
    blockers.push('source_cutover_preflight_not_ready');
  }
  if (preflightReceipt.source_of_truth_cutover_executed !== false) {
    blockers.push('preflight_must_not_have_executed_cutover');
  }
  if (blockerArray(preflightReceipt.blockers).length > 0) {
    blockers.push('source_cutover_preflight_has_blockers');
  }
  if (preflightReceipt.acceptance_checks?.customer_wide_import_execute_pass !== true) {
    blockers.push('customer_wide_import_execute_check_not_passed');
  }
  if (preflightReceipt.acceptance_checks?.imported_or_reused_count_matches_resolved_manifest !== true) {
    blockers.push('source_cutover_count_check_not_passed');
  }
  if (approvedScopeRows <= 0 || resolvedImportManifestRows <= 0) {
    blockers.push('cutover_scope_count_missing');
  }
  if (approvedScopeRows !== resolvedImportManifestRows || accountedRows !== approvedScopeRows) {
    blockers.push('cutover_scope_count_mismatch');
  }
  if (readyCount > 0) blockers.push('customer_wide_import_has_ready_rows');
  if (blockedCount > 0) blockers.push('customer_wide_import_has_blocked_rows');
  if (failedCount > 0) blockers.push('customer_wide_import_has_failed_rows');
  if (targetResolutionConflictRows > 0) blockers.push('target_resolution_has_conflicts');

  return {
    blockers: [...new Set(blockers)],
    approvedScopeRows,
    resolvedImportManifestRows,
    importedOrReusedCount,
    allowedSkippedCount,
    readyCount,
    blockedCount,
    failedCount,
    targetResolutionConflictRows,
    receiptHash: sha256(
      [
        args.runId,
        args.cutoverApprovalRef,
        args.sourceOfTruthControlRef,
        approvedScopeRows,
        resolvedImportManifestRows,
        importedOrReusedCount,
        allowedSkippedCount,
      ].join('|'),
    ),
  };
}

class PgCutoverDb implements CutoverDb {
  constructor(private readonly databaseUrl: string) {}

  async execute(input: {
    args: SourceCutoverExecuteCliArgs;
    readiness: CutoverReadiness;
    importCloseoutRef: string;
    preflightRef: string;
    evidenceRef: string;
  }): Promise<DbCutoverResult> {
    const client = new Client({ connectionString: this.databaseUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      const tenantResult = await client.query<{ tenant_id: string }>(
        "SELECT tenant_id FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1",
        [input.args.tenantSlug],
      );
      const tenantId = tenantResult.rows[0]?.tenant_id;
      if (!tenantId) throw new Error('CUTOVER_TENANT_NOT_FOUND');
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
        [tenantId, input.args.actorEmail],
      );
      const actor = actorResult.rows[0];
      if (!actor) throw new Error('CUTOVER_ACTOR_NOT_FOUND');
      if (actor.role !== 'firm_admin' && actor.role !== 'security_admin') {
        throw new Error('CUTOVER_ACTOR_ROLE_NOT_AUTHORIZED');
      }

      const insertResult = await client.query<{ cutover_id: string; reused: boolean }>(
        `
          WITH inserted AS (
            INSERT INTO onedrive_source_cutovers (
              tenant_id, run_id, status, cutover_approval_ref, source_of_truth_control_ref,
              import_closeout_ref, preflight_ref, approved_scope_rows,
              resolved_import_manifest_rows, imported_or_reused_count, allowed_skipped_count,
              ready_count, blocked_count, failed_count, receipt_hash, evidence_ref, executed_by
            )
            VALUES (
              $1, $2, 'executed', $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, 0, $11, $12, $13
            )
            ON CONFLICT (tenant_id, run_id) DO NOTHING
            RETURNING cutover_id, false AS reused
          )
          SELECT cutover_id, reused FROM inserted
          UNION ALL
          SELECT cutover_id, true AS reused
          FROM onedrive_source_cutovers
          WHERE tenant_id = $1
            AND run_id = $2
            AND NOT EXISTS (SELECT 1 FROM inserted)
          LIMIT 1
        `,
        [
          tenantId,
          input.args.runId,
          input.args.cutoverApprovalRef,
          input.args.sourceOfTruthControlRef,
          input.importCloseoutRef,
          input.preflightRef,
          input.readiness.approvedScopeRows,
          input.readiness.resolvedImportManifestRows,
          input.readiness.importedOrReusedCount,
          input.readiness.allowedSkippedCount,
          input.readiness.receiptHash,
          input.evidenceRef,
          actor.user_id,
        ],
      );
      const cutover = insertResult.rows[0];
      if (!cutover) throw new Error('CUTOVER_INSERT_RETURNED_NO_ROW');

      let auditEventId = '';
      if (!cutover.reused) {
        const auditResult = await client.query<{ event_id: string }>(
          `
            INSERT INTO audit_events (
              tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
              matter_id, result, metadata_json, correlation_id, retention_label
            )
            VALUES (
              $1, 'user', $2, NULL, 'COMPLIANCE_EVIDENCE_RECORDED',
              'onedrive_source_cutover', $3, NULL, 'success', $4::jsonb, NULL, 'PERMANENT'
            )
            RETURNING event_id
          `,
          [
            tenantId,
            actor.user_id,
            cutover.cutover_id,
            JSON.stringify({
              evidence_ref: input.evidenceRef,
              evidence_hash: input.readiness.receiptHash,
              control_hash: sha256(
                `${input.args.runId}|${input.args.sourceOfTruthControlRef}|${cutover.cutover_id}`,
              ),
              document_count: input.readiness.importedOrReusedCount,
              excluded_count: input.readiness.allowedSkippedCount,
              approval_scope: 'customer_wide_onedrive_import',
              executor_user_id: actor.user_id,
              status_after: 'vault_source_of_truth_cutover_executed',
              reason_code: 'customer_wide_import_closeout_pass',
            }),
          ],
        );
        auditEventId = auditResult.rows[0]?.event_id ?? '';
        if (!auditEventId) throw new Error('CUTOVER_AUDIT_INSERT_RETURNED_NO_ROW');
      } else {
        const auditResult = await client.query<{ event_id: string }>(
          `
            SELECT event_id
            FROM audit_events
            WHERE tenant_id = $1
              AND target_type = 'onedrive_source_cutover'
              AND target_id = $2
              AND action = 'COMPLIANCE_EVIDENCE_RECORDED'
            ORDER BY created_at ASC
            LIMIT 1
          `,
          [tenantId, cutover.cutover_id],
        );
        auditEventId = auditResult.rows[0]?.event_id ?? '';
      }

      await client.query('COMMIT');
      return {
        cutoverId: cutover.cutover_id,
        auditEventId,
        tenantId,
        actorUserId: actor.user_id,
        reused: cutover.reused,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }
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

function hashRef(value: string): string {
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

function requiredString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredRef(value: string | undefined): boolean {
  return typeof value === 'string' && safeRefPattern.test(value);
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function blockerArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function main(): Promise<void> {
  let args: SourceCutoverExecuteCliArgs;
  try {
    args = parseSourceCutoverExecuteArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runSourceCutoverExecute(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        source_of_truth_cutover_executed: report.source_of_truth_cutover_executed,
        db_write_executed: report.db_write_executed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'ONEDRIVE_SOURCE_CUTOVER_EXECUTE_FAILED',
        message: error instanceof Error ? error.message : 'SOURCE_CUTOVER_EXECUTE_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
