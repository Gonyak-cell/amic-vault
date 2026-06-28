import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

export interface GemmaAiAllowedPilotCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  tenantSlug: string;
  actorEmail: string;
  approvalRef: string;
  controlRef: string;
  sanitizedOut: string;
  databaseUrl: string;
  matterIds: string[];
  allowlistPath?: string | undefined;
  selectSmallest?: number | undefined;
  maxDocuments: number;
}

interface GemmaAiAllowedPilotPlan {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  matterPlans: PilotMatterPlan[];
  activeEthicalWalls: number;
  cutoverExecuted: boolean;
  gemmaIndexingAlreadyExecuted: boolean;
  aiAllowedTrueBefore: number;
  aiAllowedFalseBefore: number;
  blockers: string[];
}

interface PilotMatterPlan {
  matterId: string;
  matterIdHash: string;
  documentCount: number;
  targetDocumentCount: number;
  alreadyAllowedDocumentCount: number;
  legalHoldDocumentCount: number;
  deletedDocumentCount: number;
  missing: boolean;
}

interface GemmaAiAllowedPilotExecuteResult {
  updatedDocumentCount: number;
  auditEventId: string;
  targetMatterId: string;
}

interface GemmaAiAllowedPilotDb {
  plan(args: GemmaAiAllowedPilotCliArgs): Promise<GemmaAiAllowedPilotPlan>;
  execute(
    args: GemmaAiAllowedPilotCliArgs,
    plan: GemmaAiAllowedPilotPlan,
    receiptHash: string,
  ): Promise<GemmaAiAllowedPilotExecuteResult>;
}

interface AllowlistFile {
  matter_ids?: unknown;
  matterIds?: unknown;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export function usage(): string {
  return [
    'usage: pnpm gemma:ai-allowed-pilot -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --actor-email <email> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> (--matter-id <uuid>... | --allowlist <local.json> | --select-smallest <n>)',
    '',
    'Prepares or applies an ai_allowed=true pilot matter allowlist for Gemma readiness.',
    'This tool does not enqueue, start, or execute Gemma indexing.',
    '--select-smallest is dry-run only and is intended for pilot sizing.',
  ].join('\n');
}

export function parseGemmaAiAllowedPilotArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): GemmaAiAllowedPilotCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');

  const matterIds = repeatedArgValues(argv, '--matter-id');
  const allowlistPath = argValue(argv, '--allowlist');
  const selectSmallest = optionalPositiveInt(argValue(argv, '--select-smallest'), '--select-smallest');
  const selectionSourceCount =
    (matterIds.length > 0 ? 1 : 0) + (allowlistPath ? 1 : 0) + (selectSmallest ? 1 : 0);
  if (selectionSourceCount !== 1) {
    throw new Error('exactly one matter selection source is required');
  }
  if (execute && selectSmallest) {
    throw new Error('--select-smallest is dry-run only; execute requires an explicit allowlist');
  }

  const maxDocuments = optionalPositiveInt(argValue(argv, '--max-documents'), '--max-documents') ?? 25;
  if (maxDocuments > 500) throw new Error('--max-documents must be <= 500');

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
    matterIds,
    allowlistPath,
    selectSmallest,
    maxDocuments,
  };
}

export async function runGemmaAiAllowedPilot(
  args: GemmaAiAllowedPilotCliArgs,
  db: GemmaAiAllowedPilotDb = new PgGemmaAiAllowedPilotDb(args.databaseUrl),
) {
  const normalizedMatterIds = await resolveMatterIds(args);
  const resolvedArgs = { ...args, matterIds: normalizedMatterIds };
  const plan = await db.plan(resolvedArgs);
  const blockers = validateReadiness(resolvedArgs, plan);
  const receiptHash = sha256(
    [
      resolvedArgs.runId,
      resolvedArgs.approvalRef,
      resolvedArgs.controlRef,
      ...plan.matterPlans.map((matter) => matter.matterIdHash).sort(),
      targetDocumentCount(plan),
    ].join('|'),
  );
  let executeResult: GemmaAiAllowedPilotExecuteResult | null = null;

  if (resolvedArgs.execute && blockers.length === 0) {
    executeResult = await db.execute(resolvedArgs, plan, receiptHash);
  }

  const report = {
    receipt_type: 'gemma_ai_allowed_pilot_matter_allowlist',
    mode: resolvedArgs.dryRun ? 'dry-run' : 'execute',
    status:
      blockers.length === 0
        ? resolvedArgs.dryRun
          ? 'ready_for_execute'
          : 'executed'
        : 'blocked',
    run_id: resolvedArgs.runId,
    selection_mode: selectionMode(resolvedArgs),
    ai_allowed_write_executed: Boolean(executeResult),
    gemma_indexing_executed: false,
    audit_event_id: executeResult?.auditEventId ?? null,
    tenant_ref: hashRef(plan.tenantId),
    actor_ref: hashRef(plan.actorUserId),
    target_matter_ref: executeResult ? hashRef(executeResult.targetMatterId) : null,
    counts: {
      selected_matter_count: plan.matterPlans.length,
      target_document_count: targetDocumentCount(plan),
      updated_document_count: executeResult?.updatedDocumentCount ?? 0,
      already_ai_allowed_document_count: sum(plan.matterPlans, 'alreadyAllowedDocumentCount'),
      legal_hold_document_count: sum(plan.matterPlans, 'legalHoldDocumentCount'),
      deleted_document_count: sum(plan.matterPlans, 'deletedDocumentCount'),
      active_ethical_walls: plan.activeEthicalWalls,
      ai_allowed_true_before: plan.aiAllowedTrueBefore,
      ai_allowed_false_before: plan.aiAllowedFalseBefore,
    },
    matters: plan.matterPlans.map((matter) => ({
      matter_ref: matter.matterIdHash,
      document_count: matter.documentCount,
      target_document_count: matter.targetDocumentCount,
      already_ai_allowed_document_count: matter.alreadyAllowedDocumentCount,
      legal_hold_document_count: matter.legalHoldDocumentCount,
      deleted_document_count: matter.deletedDocumentCount,
      missing: matter.missing,
    })),
    blockers,
    acceptance_checks: {
      source_of_truth_cutover_executed: plan.cutoverExecuted,
      gemma_indexing_not_already_executed: !plan.gemmaIndexingAlreadyExecuted,
      actor_role_authorized: isAuthorizedActorRole(plan.actorRole),
      selected_matter_count_gt_zero: plan.matterPlans.length > 0,
      target_document_count_gt_zero: targetDocumentCount(plan) > 0,
      target_document_count_within_pilot_limit: targetDocumentCount(plan) <= resolvedArgs.maxDocuments,
      active_ethical_walls_zero: plan.activeEthicalWalls === 0,
      explicit_human_approval_ref_present: requiredRef(resolvedArgs.approvalRef),
      control_ref_present: requiredRef(resolvedArgs.controlRef),
    },
    evidence_refs: {
      allowlist_ref: resolvedArgs.allowlistPath
        ? safeReceiptRef(resolvedArgs.allowlistPath)
        : resolvedArgs.selectSmallest
          ? 'selection_policy:smallest_document_count'
          : 'cli:matter_id_args',
      receipt_hash: receiptHash,
    },
    safety_flags: {
      permission_before_ai_required_before_indexing: true,
      ethical_wall_gate_required_before_indexing: true,
      tenant_isolation_gate_required_before_indexing: true,
      gemma_indexing_executed: false,
      customer_document_content_logged: false,
    },
    not_executed: [
      'Gemma indexing execution',
      'AI prep queue enqueue',
      'document body extraction',
      'customer document content logging',
      'OneDrive connected state',
      'Office open/save/sync',
    ],
    sanitization:
      'No raw source paths, document names, matter codes, client names, document contents, object keys, tokens, secrets, or tenant-private raw labels are included.',
  };
  await writeJson(resolvedArgs.sanitizedOut, report);
  return report;
}

function validateReadiness(
  args: GemmaAiAllowedPilotCliArgs,
  plan: GemmaAiAllowedPilotPlan,
): string[] {
  const blockers: string[] = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!requiredRef(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!requiredRef(args.controlRef)) blockers.push('control_ref_invalid');
  if (!requiredString(args.tenantSlug)) blockers.push('tenant_slug_missing');
  if (!requiredString(args.actorEmail) || !args.actorEmail.includes('@')) {
    blockers.push('actor_email_invalid');
  }
  if (!isAuthorizedActorRole(plan.actorRole)) blockers.push('actor_role_not_authorized');
  if (!plan.cutoverExecuted) blockers.push('source_of_truth_cutover_not_executed');
  if (plan.gemmaIndexingAlreadyExecuted) blockers.push('gemma_indexing_already_executed');
  if (plan.activeEthicalWalls > 0) blockers.push('active_ethical_wall_review_required');
  if (plan.matterPlans.length === 0) blockers.push('pilot_matter_allowlist_empty');
  if (plan.matterPlans.some((matter) => matter.missing)) {
    blockers.push('pilot_matter_not_found_in_tenant');
  }
  if (targetDocumentCount(plan) <= 0) blockers.push('pilot_target_document_count_zero');
  if (targetDocumentCount(plan) > args.maxDocuments) {
    blockers.push('pilot_target_document_count_exceeds_limit');
  }
  return [...new Set(blockers)];
}

async function resolveMatterIds(args: GemmaAiAllowedPilotCliArgs): Promise<string[]> {
  if (args.allowlistPath) {
    const parsed = JSON.parse(await readFile(args.allowlistPath, 'utf8')) as AllowlistFile;
    const values = parsed.matter_ids ?? parsed.matterIds;
    if (!Array.isArray(values)) throw new Error('allowlist must include matter_ids array');
    return normalizeMatterIds(values);
  }
  if (args.matterIds.length > 0) return normalizeMatterIds(args.matterIds);
  return [];
}

function normalizeMatterIds(values: readonly unknown[]): string[] {
  const normalized = values.map((value) => {
    if (typeof value !== 'string') throw new Error('matter ids must be strings');
    const trimmed = value.trim();
    if (!uuidPattern.test(trimmed)) throw new Error('matter ids must be UUIDs');
    return trimmed.toLowerCase();
  });
  return [...new Set(normalized)];
}

class PgGemmaAiAllowedPilotDb implements GemmaAiAllowedPilotDb {
  constructor(private readonly databaseUrl: string) {}

  async plan(args: GemmaAiAllowedPilotCliArgs): Promise<GemmaAiAllowedPilotPlan> {
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
      if (!actor) {
        return {
          ...emptyPlan('actor_not_found'),
          tenantId,
        };
      }

      const matterIds =
        args.selectSmallest !== undefined
          ? await selectSmallestMatterIds(client, tenantId, args.selectSmallest)
          : args.matterIds;
      const [matterPlans, environment] = await Promise.all([
        summarizeMatters(client, tenantId, matterIds),
        summarizeEnvironment(client, tenantId),
      ]);

      return {
        tenantId,
        actorUserId: actor.user_id,
        actorRole: actor.role,
        matterPlans,
        activeEthicalWalls: environment.activeEthicalWalls,
        cutoverExecuted: environment.cutoverExecuted,
        gemmaIndexingAlreadyExecuted: environment.gemmaIndexingAlreadyExecuted,
        aiAllowedTrueBefore: environment.aiAllowedTrueBefore,
        aiAllowedFalseBefore: environment.aiAllowedFalseBefore,
        blockers: [],
      };
    } finally {
      await client.end();
    }
  }

  async execute(
    args: GemmaAiAllowedPilotCliArgs,
    plan: GemmaAiAllowedPilotPlan,
    receiptHash: string,
  ): Promise<GemmaAiAllowedPilotExecuteResult> {
    const targetMatterIds = plan.matterPlans.map((matter) => matter.matterId);
    const client = new Client({ connectionString: this.databaseUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', plan.tenantId]);
      const updateResult = await client.query<{ document_id: string; matter_id: string }>(
        `
          UPDATE documents
          SET ai_allowed = true,
              updated_at = now()
          WHERE tenant_id = $1
            AND matter_id = ANY($2::uuid[])
            AND status <> 'deleted'
            AND legal_hold = false
            AND ai_allowed = false
          RETURNING document_id, matter_id
        `,
        [plan.tenantId, targetMatterIds],
      );
      const expected = targetDocumentCount(plan);
      if (updateResult.rowCount !== expected) {
        throw new Error('AI_ALLOWED_UPDATE_COUNT_MISMATCH');
      }
      const targetMatterId = targetMatterIds[0];
      if (!targetMatterId) throw new Error('AI_ALLOWED_TARGET_MATTER_MISSING');
      const auditResult = await client.query<{ event_id: string }>(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
            matter_id, result, metadata_json, correlation_id, retention_label
          )
          VALUES (
            $1, 'user', $2, NULL, 'COMPLIANCE_EVIDENCE_RECORDED',
            'ai_allowed_pilot_matter_allowlist', $3, $3, 'success', $4::jsonb, NULL, 'PERMANENT'
          )
          RETURNING event_id
        `,
        [
          plan.tenantId,
          plan.actorUserId,
          targetMatterId,
          JSON.stringify({
            evidence_hash: receiptHash,
            approval_ref: args.approvalRef,
            control_ref: args.controlRef,
            run_id: args.runId,
            target_matter_count: targetMatterIds.length,
            target_document_count: expected,
            status_after: 'ai_allowed_pilot_applied',
            reason_code: 'gemma_option_1_pilot_matter_allowlist',
          }),
        ],
      );
      const auditEventId = auditResult.rows[0]?.event_id;
      if (!auditEventId) throw new Error('AI_ALLOWED_AUDIT_INSERT_RETURNED_NO_ROW');
      await client.query('COMMIT');
      return {
        updatedDocumentCount: updateResult.rowCount ?? 0,
        auditEventId,
        targetMatterId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }
}

async function selectSmallestMatterIds(
  client: Client,
  tenantId: string,
  limit: number,
): Promise<string[]> {
  const result = await client.query<{ matter_id: string }>(
    `
      SELECT m.matter_id
      FROM matters m
      JOIN documents d
        ON d.tenant_id = m.tenant_id
       AND d.matter_id = m.matter_id
      WHERE m.tenant_id = $1
        AND d.status <> 'deleted'
        AND d.legal_hold = false
        AND d.ai_allowed = false
      GROUP BY m.matter_id, m.created_at
      ORDER BY count(d.document_id) ASC, m.created_at DESC, m.matter_id ASC
      LIMIT $2
    `,
    [tenantId, limit],
  );
  return result.rows.map((row) => row.matter_id);
}

async function summarizeMatters(
  client: Client,
  tenantId: string,
  matterIds: readonly string[],
): Promise<PilotMatterPlan[]> {
  if (matterIds.length === 0) return [];
  const result = await client.query<{
    matter_id: string;
    exists_in_tenant: boolean;
    document_count: string;
    target_document_count: string;
    already_allowed_document_count: string;
    legal_hold_document_count: string;
    deleted_document_count: string;
  }>(
    `
      WITH selected AS (
        SELECT unnest($2::uuid[]) AS matter_id
      )
      SELECT
        selected.matter_id,
        m.matter_id IS NOT NULL AS exists_in_tenant,
        count(d.document_id) FILTER (WHERE d.status <> 'deleted') AS document_count,
        count(d.document_id) FILTER (
          WHERE d.status <> 'deleted'
            AND d.legal_hold = false
            AND d.ai_allowed = false
        ) AS target_document_count,
        count(d.document_id) FILTER (
          WHERE d.status <> 'deleted'
            AND d.ai_allowed = true
        ) AS already_allowed_document_count,
        count(d.document_id) FILTER (
          WHERE d.status <> 'deleted'
            AND d.legal_hold = true
        ) AS legal_hold_document_count,
        count(d.document_id) FILTER (WHERE d.status = 'deleted') AS deleted_document_count
      FROM selected
      LEFT JOIN matters m
        ON m.tenant_id = $1
       AND m.matter_id = selected.matter_id
      LEFT JOIN documents d
        ON d.tenant_id = $1
       AND d.matter_id = selected.matter_id
      GROUP BY selected.matter_id, m.matter_id
      ORDER BY selected.matter_id ASC
    `,
    [tenantId, matterIds],
  );
  return result.rows.map((row) => ({
    matterId: row.matter_id,
    matterIdHash: hashRef(row.matter_id),
    documentCount: Number(row.document_count),
    targetDocumentCount: Number(row.target_document_count),
    alreadyAllowedDocumentCount: Number(row.already_allowed_document_count),
    legalHoldDocumentCount: Number(row.legal_hold_document_count),
    deletedDocumentCount: Number(row.deleted_document_count),
    missing: !row.exists_in_tenant,
  }));
}

async function summarizeEnvironment(client: Client, tenantId: string) {
  const result = await client.query<{
    active_ethical_walls: string;
    cutover_executed: boolean;
    gemma_indexing_already_executed: boolean;
    ai_allowed_true_before: string;
    ai_allowed_false_before: string;
  }>(
    `
      SELECT
        (SELECT count(*) FROM ethical_walls WHERE tenant_id = $1 AND status = 'active') AS active_ethical_walls,
        EXISTS (
          SELECT 1
          FROM onedrive_source_cutovers
          WHERE tenant_id = $1
            AND status = 'executed'
            AND vault_source_of_truth = true
        ) AS cutover_executed,
        EXISTS (
          SELECT 1
          FROM onedrive_source_cutovers
          WHERE tenant_id = $1
            AND status = 'executed'
            AND gemma_indexing_executed = true
        ) AS gemma_indexing_already_executed,
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND ai_allowed = true) AS ai_allowed_true_before,
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND coalesce(ai_allowed, false) = false) AS ai_allowed_false_before
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    activeEthicalWalls: Number(row?.active_ethical_walls ?? 0),
    cutoverExecuted: row?.cutover_executed === true,
    gemmaIndexingAlreadyExecuted: row?.gemma_indexing_already_executed === true,
    aiAllowedTrueBefore: Number(row?.ai_allowed_true_before ?? 0),
    aiAllowedFalseBefore: Number(row?.ai_allowed_false_before ?? 0),
  };
}

function emptyPlan(blocker: string): GemmaAiAllowedPilotPlan {
  return {
    tenantId: '',
    actorUserId: '',
    actorRole: '',
    matterPlans: [],
    activeEthicalWalls: 0,
    cutoverExecuted: false,
    gemmaIndexingAlreadyExecuted: false,
    aiAllowedTrueBefore: 0,
    aiAllowedFalseBefore: 0,
    blockers: [blocker],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function targetDocumentCount(plan: GemmaAiAllowedPilotPlan): number {
  return sum(plan.matterPlans, 'targetDocumentCount');
}

function sum(
  matterPlans: readonly PilotMatterPlan[],
  key: keyof Pick<
    PilotMatterPlan,
    | 'targetDocumentCount'
    | 'alreadyAllowedDocumentCount'
    | 'legalHoldDocumentCount'
    | 'deletedDocumentCount'
  >,
): number {
  return matterPlans.reduce((total, matter) => total + matter[key], 0);
}

function selectionMode(args: GemmaAiAllowedPilotCliArgs): string {
  if (args.allowlistPath) return 'allowlist_file';
  if (args.selectSmallest) return 'dry_run_smallest_document_count';
  return 'explicit_matter_ids';
}

function isAuthorizedActorRole(role: string): boolean {
  return role === 'firm_admin' || role === 'security_admin';
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

function repeatedArgValues(argv: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${name} value is required`);
      values.push(value);
    }
  }
  return values;
}

function optionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer`);
  return parsed;
}

function requiredString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredRef(value: string | undefined): boolean {
  return typeof value === 'string' && safeRefPattern.test(value);
}

async function main(): Promise<void> {
  let args: GemmaAiAllowedPilotCliArgs;
  try {
    args = parseGemmaAiAllowedPilotArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runGemmaAiAllowedPilot(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        target_document_count: report.counts.target_document_count,
        ai_allowed_write_executed: report.ai_allowed_write_executed,
        gemma_indexing_executed: report.gemma_indexing_executed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'GEMMA_AI_ALLOWED_PILOT_FAILED',
        message: error instanceof Error ? error.message : 'GEMMA_AI_ALLOWED_PILOT_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
