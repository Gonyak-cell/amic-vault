import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeRunIdPattern = /^[A-Za-z0-9._-]{3,120}$/;
const safeRefPattern = /^[A-Za-z0-9._-]{3,180}$/;
const requiredArtifactKinds = [
  'document_profile',
  'key_fields',
  'keyword_tags',
  'filing_suggestions',
] as const;

export interface GemmaCustomerWideCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  tenantSlug: string;
  actorEmail: string;
  approvalRef: string;
  controlRef: string;
  sanitizedOut: string;
  databaseUrl: string;
  maxDocuments: number;
}

interface EnvironmentPlan {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  activeEthicalWalls: number;
  cutoverExecuted: boolean;
  gemmaIndexingAlreadyExecuted: boolean;
  aiAllowedTrueBefore: number;
  blockers: string[];
}

interface CandidateCounts {
  documentsTotal: number;
  readyIndexedEligible: number;
  readyIndexedAlreadyAllowed: number;
  readyIndexedTargetUpdate: number;
  readyMissingIndex: number;
  ocrPending: number;
  failed: number;
  deleted: number;
  legalHold: number;
  expectedRequiredArtifacts: number;
  completedRequiredArtifacts: number;
}

interface GemmaCustomerWidePlan extends EnvironmentPlan {
  counts: CandidateCounts;
}

interface GemmaCustomerWideExecuteResult {
  updatedDocumentCount: number;
  auditEventId: string;
}

interface GemmaCustomerWideDb {
  plan(args: GemmaCustomerWideCliArgs): Promise<GemmaCustomerWidePlan>;
  execute(
    args: GemmaCustomerWideCliArgs,
    plan: GemmaCustomerWidePlan,
    receiptHash: string,
  ): Promise<GemmaCustomerWideExecuteResult>;
}

export function usage(): string {
  return [
    'usage: pnpm gemma:customer-wide -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --actor-email <email> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--max-documents <n>]',
    '',
    'Expands ai_allowed for all eligible ready/search-indexed customer-wide documents.',
    'This tool does not enqueue, start, or execute Gemma indexing.',
  ].join('\n');
}

export function parseGemmaCustomerWideArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): GemmaCustomerWideCliArgs {
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
    maxDocuments: optionalPositiveInt(argValue(argv, '--max-documents'), '--max-documents') ?? 20_000,
  };
}

export async function runGemmaCustomerWide(
  args: GemmaCustomerWideCliArgs,
  db: GemmaCustomerWideDb = new PgGemmaCustomerWideDb(args.databaseUrl),
) {
  const plan = await db.plan(args);
  const blockers = validateReadiness(args, plan);
  const receiptHash = sha256(
    [
      args.runId,
      args.approvalRef,
      args.controlRef,
      hashRef(plan.tenantId),
      plan.counts.readyIndexedEligible,
      plan.counts.readyIndexedTargetUpdate,
      plan.counts.completedRequiredArtifacts,
    ].join('|'),
  );
  let executeResult: GemmaCustomerWideExecuteResult | null = null;
  if (args.execute && blockers.length === 0) {
    executeResult = await db.execute(args, plan, receiptHash);
  }

  const expectedRequiredArtifacts =
    plan.counts.readyIndexedEligible * requiredArtifactKinds.length;
  const completedRequiredArtifacts = plan.counts.completedRequiredArtifacts;
  const report = {
    receipt_type: 'gemma_customer_wide_ready_ai_allowed',
    mode: args.dryRun ? 'dry-run' : 'execute',
    status: blockers.length === 0 ? (args.dryRun ? 'ready_for_execute' : 'executed') : 'blocked',
    run_id: args.runId,
    ai_allowed_write_executed: Boolean(executeResult),
    gemma_prep_executed: false,
    gemma_indexing_executed: false,
    audit_event_id: executeResult?.auditEventId ?? null,
    tenant_ref: plan.tenantId ? hashRef(plan.tenantId) : null,
    actor_ref: plan.actorUserId ? hashRef(plan.actorUserId) : null,
    counts: {
      documents_total: plan.counts.documentsTotal,
      ready_indexed_eligible_document_count: plan.counts.readyIndexedEligible,
      ready_indexed_already_ai_allowed_document_count: plan.counts.readyIndexedAlreadyAllowed,
      ready_indexed_target_update_document_count: plan.counts.readyIndexedTargetUpdate,
      updated_document_count: executeResult?.updatedDocumentCount ?? 0,
      ready_missing_search_index_count: plan.counts.readyMissingIndex,
      ocr_pending_count: plan.counts.ocrPending,
      failed_count: plan.counts.failed,
      deleted_count: plan.counts.deleted,
      legal_hold_count: plan.counts.legalHold,
      active_ethical_walls: plan.activeEthicalWalls,
      ai_allowed_true_before: plan.aiAllowedTrueBefore,
      expected_required_artifact_count: expectedRequiredArtifacts,
      completed_required_artifact_count: completedRequiredArtifacts,
      missing_required_artifact_count: Math.max(
        0,
        expectedRequiredArtifacts - completedRequiredArtifacts,
      ),
    },
    required_artifact_kinds: requiredArtifactKinds,
    blockers,
    acceptance_checks: {
      source_of_truth_cutover_executed: plan.cutoverExecuted,
      gemma_indexing_not_already_executed: !plan.gemmaIndexingAlreadyExecuted,
      actor_role_authorized: isAuthorizedActorRole(plan.actorRole),
      active_ethical_walls_zero: plan.activeEthicalWalls === 0,
      ready_indexed_candidate_count_gt_zero: plan.counts.readyIndexedEligible > 0,
      target_update_count_within_limit: plan.counts.readyIndexedTargetUpdate <= args.maxDocuments,
      ready_missing_search_index_count_zero: plan.counts.readyMissingIndex === 0,
      explicit_human_approval_ref_present: requiredRef(args.approvalRef),
      control_ref_present: requiredRef(args.controlRef),
      execute_count_matches_target:
        !executeResult || executeResult.updatedDocumentCount === plan.counts.readyIndexedTargetUpdate,
    },
    next_gate: {
      gemma_prep_preflight_required: true,
      gemma_prep_target_documents_after_execute:
        plan.counts.readyIndexedAlreadyAllowed +
        (executeResult?.updatedDocumentCount ?? plan.counts.readyIndexedTargetUpdate),
      ocr_pending_requires_ocr_lane: plan.counts.ocrPending > 0,
      failed_requires_remediation_or_exclusion_lane: plan.counts.failed > 0,
    },
    evidence_refs: {
      receipt_hash: receiptHash,
      approval_ref: args.approvalRef,
      control_ref: args.controlRef,
    },
    prohibited_claims: {
      one_drive_connected_state_claim: false,
      office_open_save_sync_claim: false,
      customer_wide_gemma_indexing_claim: false,
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
      'No raw source paths, document names, matter codes, client names, document contents, object keys, tokens, secrets, or tenant-private raw labels are included.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

class PgGemmaCustomerWideDb implements GemmaCustomerWideDb {
  constructor(private readonly databaseUrl: string) {}

  async plan(args: GemmaCustomerWideCliArgs): Promise<GemmaCustomerWidePlan> {
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

      const [environment, counts] = await Promise.all([
        summarizeEnvironment(client, tenantId),
        summarizeCounts(client, tenantId),
      ]);

      return {
        tenantId,
        actorUserId: actor.user_id,
        actorRole: actor.role,
        ...environment,
        counts,
        blockers: [],
      };
    } finally {
      await client.end();
    }
  }

  async execute(
    args: GemmaCustomerWideCliArgs,
    plan: GemmaCustomerWidePlan,
    receiptHash: string,
  ): Promise<GemmaCustomerWideExecuteResult> {
    const client = new Client({ connectionString: this.databaseUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', plan.tenantId]);
      const updateResult = await client.query(
        `
          WITH current_versions AS (
            SELECT dv.tenant_id, dv.document_id, dv.version_id
            FROM document_versions dv
            WHERE dv.tenant_id = $1
              AND dv.version_status = 'current'
          ), eligible AS (
            SELECT d.document_id
            FROM documents d
            JOIN current_versions cv
              ON cv.tenant_id = d.tenant_id
             AND cv.document_id = d.document_id
            JOIN canonical_documents cd
              ON cd.tenant_id = cv.tenant_id
             AND cd.version_id = cv.version_id
             AND cd.extraction_status = 'ready'
            JOIN document_search_index idx
              ON idx.tenant_id = cv.tenant_id
             AND idx.document_id = cv.document_id
             AND idx.version_id = cv.version_id
            WHERE d.tenant_id = $1
              AND d.status <> 'deleted'
              AND d.legal_hold = false
              AND d.ai_allowed = false
          )
          UPDATE documents d
          SET ai_allowed = true,
              updated_at = now()
          FROM eligible
          WHERE d.tenant_id = $1
            AND d.document_id = eligible.document_id
          RETURNING d.document_id
        `,
        [plan.tenantId],
      );
      const updatedDocumentCount = updateResult.rowCount ?? 0;
      if (updatedDocumentCount !== plan.counts.readyIndexedTargetUpdate) {
        throw new Error('GEMMA_CUSTOMER_WIDE_AI_ALLOWED_UPDATE_COUNT_MISMATCH');
      }
      const auditResult = await client.query<{ event_id: string }>(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
            matter_id, result, metadata_json, correlation_id, retention_label
          )
          VALUES (
            $1, 'user', $2, NULL, 'COMPLIANCE_EVIDENCE_RECORDED',
            'gemma_customer_wide_ready_ai_allowed', $1, NULL, 'success', $3::jsonb, NULL, 'PERMANENT'
          )
          RETURNING event_id
        `,
        [
          plan.tenantId,
          plan.actorUserId,
          JSON.stringify({
            evidence_hash: receiptHash,
            approval_ref: args.approvalRef,
            control_ref: args.controlRef,
            run_id: args.runId,
            target_document_count: plan.counts.readyIndexedTargetUpdate,
            updated_document_count: updatedDocumentCount,
            ready_indexed_eligible_document_count: plan.counts.readyIndexedEligible,
            required_artifact_kind_count: requiredArtifactKinds.length,
            status_after: 'ready_documents_ai_allowed_expanded',
            reason_code: 'gemma_customer_wide_ready_lane',
          }),
        ],
      );
      const auditEventId = auditResult.rows[0]?.event_id;
      if (!auditEventId) throw new Error('GEMMA_CUSTOMER_WIDE_AUDIT_INSERT_RETURNED_NO_ROW');
      await client.query('COMMIT');
      return { updatedDocumentCount, auditEventId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }
}

async function summarizeEnvironment(client: Client, tenantId: string) {
  const result = await client.query<{
    active_ethical_walls: string;
    cutover_executed: boolean;
    gemma_indexing_already_executed: boolean;
    ai_allowed_true_before: string;
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
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND ai_allowed = true) AS ai_allowed_true_before
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    activeEthicalWalls: Number(row?.active_ethical_walls ?? 0),
    cutoverExecuted: row?.cutover_executed === true,
    gemmaIndexingAlreadyExecuted: row?.gemma_indexing_already_executed === true,
    aiAllowedTrueBefore: Number(row?.ai_allowed_true_before ?? 0),
  };
}

async function summarizeCounts(client: Client, tenantId: string): Promise<CandidateCounts> {
  const result = await client.query<{
    documents_total: string;
    ready_indexed_eligible: string;
    ready_indexed_already_allowed: string;
    ready_indexed_target_update: string;
    ready_missing_index: string;
    ocr_pending: string;
    failed: string;
    deleted: string;
    legal_hold: string;
    completed_required_artifacts: string;
  }>(
    `
      WITH current_versions AS (
        SELECT dv.tenant_id, dv.document_id, dv.version_id
        FROM document_versions dv
        WHERE dv.tenant_id = $1
          AND dv.version_status = 'current'
      ), ready_docs AS (
        SELECT d.tenant_id, d.document_id, cv.version_id, d.ai_allowed, d.status, d.legal_hold
        FROM documents d
        JOIN current_versions cv
          ON cv.tenant_id = d.tenant_id
         AND cv.document_id = d.document_id
        JOIN canonical_documents cd
          ON cd.tenant_id = cv.tenant_id
         AND cd.version_id = cv.version_id
         AND cd.extraction_status = 'ready'
        WHERE d.tenant_id = $1
      ), ready_indexed AS (
        SELECT rd.*
        FROM ready_docs rd
        JOIN document_search_index idx
          ON idx.tenant_id = rd.tenant_id
         AND idx.document_id = rd.document_id
         AND idx.version_id = rd.version_id
        WHERE rd.status <> 'deleted'
          AND rd.legal_hold = false
      ), required_artifacts AS (
        SELECT unnest($2::text[]) AS artifact_kind
      )
      SELECT
        (SELECT count(*) FROM documents WHERE tenant_id = $1) AS documents_total,
        (SELECT count(*) FROM ready_indexed) AS ready_indexed_eligible,
        (SELECT count(*) FROM ready_indexed WHERE ai_allowed = true) AS ready_indexed_already_allowed,
        (SELECT count(*) FROM ready_indexed WHERE ai_allowed = false) AS ready_indexed_target_update,
        (
          SELECT count(*)
          FROM ready_docs rd
          LEFT JOIN document_search_index idx
            ON idx.tenant_id = rd.tenant_id
           AND idx.document_id = rd.document_id
           AND idx.version_id = rd.version_id
          WHERE rd.status <> 'deleted'
            AND rd.legal_hold = false
            AND idx.document_id IS NULL
        ) AS ready_missing_index,
        (
          SELECT count(*)
          FROM canonical_documents
          WHERE tenant_id = $1
            AND extraction_status = 'ocr_pending'
        ) AS ocr_pending,
        (
          SELECT count(*)
          FROM canonical_documents
          WHERE tenant_id = $1
            AND extraction_status = 'failed'
        ) AS failed,
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND status = 'deleted') AS deleted,
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND legal_hold = true) AS legal_hold,
        (
          SELECT count(*)
          FROM ready_indexed ri
          JOIN ai_prep_artifacts artifact
            ON artifact.tenant_id = ri.tenant_id
           AND artifact.document_id = ri.document_id
           AND artifact.document_version_id = ri.version_id
           AND artifact.artifact_kind IN (SELECT artifact_kind FROM required_artifacts)
           AND artifact.status = 'completed'
           AND artifact.is_stale = false
        ) AS completed_required_artifacts
    `,
    [tenantId, requiredArtifactKinds],
  );
  const row = result.rows[0];
  const readyIndexedEligible = Number(row?.ready_indexed_eligible ?? 0);
  return {
    documentsTotal: Number(row?.documents_total ?? 0),
    readyIndexedEligible,
    readyIndexedAlreadyAllowed: Number(row?.ready_indexed_already_allowed ?? 0),
    readyIndexedTargetUpdate: Number(row?.ready_indexed_target_update ?? 0),
    readyMissingIndex: Number(row?.ready_missing_index ?? 0),
    ocrPending: Number(row?.ocr_pending ?? 0),
    failed: Number(row?.failed ?? 0),
    deleted: Number(row?.deleted ?? 0),
    legalHold: Number(row?.legal_hold ?? 0),
    expectedRequiredArtifacts: readyIndexedEligible * requiredArtifactKinds.length,
    completedRequiredArtifacts: Number(row?.completed_required_artifacts ?? 0),
  };
}

function validateReadiness(args: GemmaCustomerWideCliArgs, plan: GemmaCustomerWidePlan): string[] {
  const blockers: string[] = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!requiredRef(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!requiredRef(args.controlRef)) blockers.push('control_ref_invalid');
  if (!args.tenantSlug.trim()) blockers.push('tenant_slug_missing');
  if (!args.actorEmail.includes('@')) blockers.push('actor_email_invalid');
  if (!isAuthorizedActorRole(plan.actorRole)) blockers.push('actor_role_not_authorized');
  if (!plan.cutoverExecuted) blockers.push('source_of_truth_cutover_not_executed');
  if (plan.gemmaIndexingAlreadyExecuted) blockers.push('gemma_indexing_already_executed');
  if (plan.activeEthicalWalls > 0) blockers.push('active_ethical_wall_review_required');
  if (plan.counts.readyIndexedEligible <= 0) blockers.push('ready_indexed_candidate_count_zero');
  if (plan.counts.readyMissingIndex > 0) blockers.push('ready_missing_search_index_review_required');
  if (plan.counts.readyIndexedTargetUpdate > args.maxDocuments) {
    blockers.push('target_document_count_exceeds_limit');
  }
  return [...new Set(blockers)];
}

function emptyPlan(blocker: string): GemmaCustomerWidePlan {
  return {
    tenantId: '',
    actorUserId: '',
    actorRole: '',
    activeEthicalWalls: 0,
    cutoverExecuted: false,
    gemmaIndexingAlreadyExecuted: false,
    aiAllowedTrueBefore: 0,
    counts: {
      documentsTotal: 0,
      readyIndexedEligible: 0,
      readyIndexedAlreadyAllowed: 0,
      readyIndexedTargetUpdate: 0,
      readyMissingIndex: 0,
      ocrPending: 0,
      failed: 0,
      deleted: 0,
      legalHold: 0,
      expectedRequiredArtifacts: 0,
      completedRequiredArtifacts: 0,
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

function optionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer`);
  return parsed;
}

function requiredRef(value: string): boolean {
  return safeRefPattern.test(value);
}

async function main(): Promise<void> {
  let args: GemmaCustomerWideCliArgs;
  try {
    args = parseGemmaCustomerWideArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runGemmaCustomerWide(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        target_document_count: report.counts.ready_indexed_target_update_document_count,
        updated_document_count: report.counts.updated_document_count,
        ai_allowed_write_executed: report.ai_allowed_write_executed,
        gemma_prep_executed: report.gemma_prep_executed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'GEMMA_CUSTOMER_WIDE_FAILED',
        message: error instanceof Error ? error.message : 'GEMMA_CUSTOMER_WIDE_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
