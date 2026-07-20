import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { localGemmaDefaultModel } from '@amic-vault/ai';
import { Client } from 'pg';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const safeRunIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requiredArtifactKinds = [
  'document_profile',
  'key_fields',
  'keyword_tags',
  'filing_suggestions',
] as const;

export interface GemmaProductionIndexingExecuteCliArgs {
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

interface IndexingCounts {
  activeDocuments: number;
  canonicalExtractionReady: number;
  searchIndexedDocuments: number;
  aiAllowedDocuments: number;
  readyMissingSearchIndex: number;
  ocrPending: number;
  extractionFailed: number;
  completedRequiredArtifacts: number;
  realGemmaOutputs: number;
  fallbackPayloads: number;
  missingRequiredArtifacts: number;
  staleRequiredArtifacts: number;
  failedRequiredArtifacts: number;
  docsWithAll4RealGemma: number;
  activeChildChunks: number;
  activeEmbeddings: number;
  sourceCutoverRows: number;
  gemmaIndexingExecutedRows: number;
  activeEthicalWalls: number;
}

interface PermissionSmokeCounts {
  permissionFilteredVisibleDocuments: number;
  permissionFilteredMatterCount: number;
  documentsWithoutMatterMembership: number;
  explicitDeniedOrUnsupportedConditionDocuments: number;
}

interface IndexingPlan {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  cutoverId: string;
  controlConstraintBlocksTrue: boolean;
  counts: IndexingCounts;
  permissionSmoke: PermissionSmokeCounts;
  blockers: string[];
}

interface ExecuteResult {
  cutoverId: string;
  auditEventId: string;
  tenantId: string;
  actorUserId: string;
  updatedCutoverRows: number;
}

interface GemmaProductionIndexingDb {
  plan(args: GemmaProductionIndexingExecuteCliArgs): Promise<IndexingPlan>;
  execute(
    args: GemmaProductionIndexingExecuteCliArgs,
    plan: IndexingPlan,
    receiptHash: string,
  ): Promise<ExecuteResult>;
}

export function usage(): string {
  return [
    'usage: pnpm gemma:production-indexing-execute -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --actor-email <email> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--expected-active-documents <n>]',
    '',
    'Records the approved production Gemma indexing execute receipt after source-of-truth cutover and full extraction/search/Gemma reconciliation pass.',
    'It does not claim OneDrive connected-state, Office open/save/sync, or customer-wide go-live.',
  ].join('\n');
}

export function parseGemmaProductionIndexingExecuteArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): GemmaProductionIndexingExecuteCliArgs {
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

export async function runGemmaProductionIndexingExecute(
  args: GemmaProductionIndexingExecuteCliArgs,
  db: GemmaProductionIndexingDb = new PgGemmaProductionIndexingDb(args.databaseUrl),
) {
  const plan = await db.plan(args);
  const blockers = validateReadiness(args, plan);
  const receiptHash = sha256(
    [
      args.runId,
      args.approvalRef,
      args.controlRef,
      hashRef(plan.tenantId),
      plan.counts.activeDocuments,
      plan.counts.realGemmaOutputs,
      plan.permissionSmoke.permissionFilteredVisibleDocuments,
    ].join('|'),
  );
  let executeResult: ExecuteResult | null = null;
  if (args.execute && blockers.length === 0) {
    executeResult = await db.execute(args, plan, receiptHash);
  }

  const report = {
    receipt_type: 'production_gemma_indexing_execute',
    mode: args.dryRun ? 'dry-run' : 'execute',
    status: blockers.length === 0 ? (args.dryRun ? 'ready_for_execute' : 'executed') : 'blocked',
    run_id: args.runId,
    gemma_indexing_executed: Boolean(executeResult),
    db_write_executed: Boolean(executeResult),
    updated_cutover_rows: executeResult?.updatedCutoverRows ?? 0,
    audit_event_ref: executeResult ? hashRef(executeResult.auditEventId) : null,
    cutover_ref: executeResult ? hashRef(executeResult.cutoverId) : hashRef(plan.cutoverId),
    tenant_ref: plan.tenantId ? hashRef(plan.tenantId) : null,
    actor_ref: plan.actorUserId ? hashRef(plan.actorUserId) : null,
    counts: {
      active_documents: plan.counts.activeDocuments,
      canonical_extraction_ready: plan.counts.canonicalExtractionReady,
      search_indexed_documents: plan.counts.searchIndexedDocuments,
      ai_allowed_documents: plan.counts.aiAllowedDocuments,
      ready_missing_search_index: plan.counts.readyMissingSearchIndex,
      ocr_pending: plan.counts.ocrPending,
      extraction_failed: plan.counts.extractionFailed,
      completed_required_artifacts: plan.counts.completedRequiredArtifacts,
      real_gemma_outputs: plan.counts.realGemmaOutputs,
      expected_real_gemma_outputs: plan.counts.activeDocuments * requiredArtifactKinds.length,
      fallback_payloads: plan.counts.fallbackPayloads,
      missing_required_artifacts: plan.counts.missingRequiredArtifacts,
      stale_required_artifacts: plan.counts.staleRequiredArtifacts,
      failed_required_artifacts: plan.counts.failedRequiredArtifacts,
      docs_with_all_4_real_gemma: plan.counts.docsWithAll4RealGemma,
      active_child_chunks: plan.counts.activeChildChunks,
      active_embeddings: plan.counts.activeEmbeddings,
      source_cutover_rows: plan.counts.sourceCutoverRows,
      gemma_indexing_executed_rows_before: plan.counts.gemmaIndexingExecutedRows,
      active_ethical_walls: plan.counts.activeEthicalWalls,
    },
    required_artifact_kinds: requiredArtifactKinds,
    permission_filtered_smoke: {
      sql_stage_permission_filter_used: true,
      membership_required_in_query: true,
      ai_allowed_required_in_query: true,
      search_index_required_in_query: true,
      real_gemma_artifacts_required_in_query: true,
      explicit_denies_and_unsupported_conditions_excluded_in_query: true,
      ethical_wall_active_count_checked: plan.counts.activeEthicalWalls,
      visible_documents: plan.permissionSmoke.permissionFilteredVisibleDocuments,
      visible_matters: plan.permissionSmoke.permissionFilteredMatterCount,
      documents_without_matter_membership: plan.permissionSmoke.documentsWithoutMatterMembership,
      explicit_denied_or_unsupported_condition_documents:
        plan.permissionSmoke.explicitDeniedOrUnsupportedConditionDocuments,
    },
    blockers,
    acceptance_checks: {
      source_of_truth_cutover_executed: plan.counts.sourceCutoverRows > 0,
      gemma_indexing_not_already_executed: plan.counts.gemmaIndexingExecutedRows === 0,
      control_constraint_allows_true: !plan.controlConstraintBlocksTrue,
      actor_role_authorized: isAuthorizedActorRole(plan.actorRole),
      explicit_human_approval_ref_present: requiredRef(args.approvalRef),
      control_ref_present: requiredRef(args.controlRef),
      active_documents_gt_zero: plan.counts.activeDocuments > 0,
      expected_active_documents_matches:
        args.expectedActiveDocuments === null || args.expectedActiveDocuments === plan.counts.activeDocuments,
      extraction_ready_all_active: plan.counts.canonicalExtractionReady === plan.counts.activeDocuments,
      search_indexed_all_active: plan.counts.searchIndexedDocuments === plan.counts.activeDocuments,
      ai_allowed_all_active: plan.counts.aiAllowedDocuments === plan.counts.activeDocuments,
      all_4_real_gemma_all_active: plan.counts.docsWithAll4RealGemma === plan.counts.activeDocuments,
      real_gemma_outputs_equals_active_times_4:
        plan.counts.realGemmaOutputs === plan.counts.activeDocuments * requiredArtifactKinds.length,
      fallback_payloads_zero: plan.counts.fallbackPayloads === 0,
      missing_required_artifacts_zero: plan.counts.missingRequiredArtifacts === 0,
      stale_required_artifacts_zero: plan.counts.staleRequiredArtifacts === 0,
      failed_required_artifacts_zero: plan.counts.failedRequiredArtifacts === 0,
      active_chunks_and_embeddings_present:
        plan.counts.activeChildChunks > 0 && plan.counts.activeEmbeddings > 0,
      active_ethical_walls_zero: plan.counts.activeEthicalWalls === 0,
      permission_smoke_positive: plan.permissionSmoke.permissionFilteredVisibleDocuments > 0,
      permission_smoke_no_membership_gap:
        plan.permissionSmoke.documentsWithoutMatterMembership === 0,
      permission_smoke_no_denied_or_unsupported_documents:
        plan.permissionSmoke.explicitDeniedOrUnsupportedConditionDocuments === 0,
      execute_count_matches_target: !executeResult || executeResult.updatedCutoverRows === 1,
    },
    evidence_refs: {
      approval_ref: args.approvalRef,
      control_ref: args.controlRef,
      receipt_hash: receiptHash,
    },
    prohibited_claims: {
      one_drive_connected_state_claim: false,
      office_open_save_sync_claim: false,
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
      'Receipt stores counts, hashes, safe refs, and reason codes only. Raw paths, document names, matter codes, client names, document contents, OCR excerpts, object keys, tokens, secrets, tenant-private raw labels, prompts, and model responses are omitted.',
  };
  await writeJson(args.sanitizedOut, report);
  return report;
}

class PgGemmaProductionIndexingDb implements GemmaProductionIndexingDb {
  constructor(private readonly databaseUrl: string) {}

  async plan(args: GemmaProductionIndexingExecuteCliArgs): Promise<IndexingPlan> {
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
      const permissionSmoke = await summarizePermissionSmoke(client, tenantId, actor.user_id, actor.role);
      const controlConstraintBlocksTrueValue = await controlConstraintBlocksTrue(client);
      return {
        tenantId,
        actorUserId: actor.user_id,
        actorRole: actor.role,
        cutoverId: cutover.cutoverId,
        controlConstraintBlocksTrue: controlConstraintBlocksTrueValue,
        counts,
        permissionSmoke,
        blockers: cutover.cutoverId ? [] : ['source_of_truth_cutover_not_found'],
      };
    } finally {
      await client.end();
    }
  }

  async execute(
    args: GemmaProductionIndexingExecuteCliArgs,
    plan: IndexingPlan,
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
          SET gemma_indexing_executed = true
          WHERE tenant_id = $1
            AND cutover_id = $2
            AND status = 'executed'
            AND vault_source_of_truth = true
            AND gemma_indexing_executed = false
          RETURNING cutover_id
        `,
        [plan.tenantId, plan.cutoverId],
      );
      const updatedCutoverRows = updateResult.rowCount ?? 0;
      if (updatedCutoverRows !== 1) {
        throw new Error('GEMMA_INDEXING_CUTOVER_UPDATE_COUNT_MISMATCH');
      }
      const auditResult = await client.query<{ event_id: string }>(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
            matter_id, result, metadata_json, correlation_id, retention_label
          )
          VALUES (
            $1, 'user', $2, NULL, 'COMPLIANCE_EVIDENCE_RECORDED',
            'gemma_indexing_execute', $3, NULL, 'success', $4::jsonb, NULL, 'PERMANENT'
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
            run_id: args.runId,
            active_document_count: plan.counts.activeDocuments,
            real_gemma_output_count: plan.counts.realGemmaOutputs,
            required_artifact_kind_count: requiredArtifactKinds.length,
            permission_filtered_visible_document_count:
              plan.permissionSmoke.permissionFilteredVisibleDocuments,
            status_after: 'production_gemma_indexing_executed',
            reason_code: 'source_cutover_and_full_gemma_reconciliation_pass',
          }),
        ],
      );
      const auditEventId = auditResult.rows[0]?.event_id;
      if (!auditEventId) throw new Error('GEMMA_INDEXING_AUDIT_INSERT_RETURNED_NO_ROW');
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

async function controlConstraintBlocksTrue(client: Client): Promise<boolean> {
  const result = await client.query<{ blocks_true: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'onedrive_source_cutovers'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%gemma_indexing_executed = false%'
      ) AS blocks_true
    `,
  );
  return result.rows[0]?.blocks_true === true;
}

async function summarizeCounts(client: Client, tenantId: string): Promise<IndexingCounts> {
  const result = await client.query<Record<keyof SnakeIndexingCounts, string>>(
    `
      WITH current_versions AS (
        SELECT tenant_id, document_id, version_id
        FROM document_versions
        WHERE tenant_id = $1
          AND version_status = 'current'
      ), active_docs AS (
        SELECT d.tenant_id, d.document_id, cv.version_id, d.ai_allowed, d.status, d.legal_hold
        FROM documents d
        JOIN current_versions cv
          ON cv.tenant_id = d.tenant_id
         AND cv.document_id = d.document_id
        WHERE d.tenant_id = $1
          AND d.status <> 'deleted'
          AND d.legal_hold = false
      ), ready_docs AS (
        SELECT ad.*
        FROM active_docs ad
        JOIN canonical_documents cd
          ON cd.tenant_id = ad.tenant_id
         AND cd.version_id = ad.version_id
         AND cd.extraction_status = 'ready'
      ), ready_indexed AS (
        SELECT rd.*
        FROM ready_docs rd
        JOIN document_search_index idx
          ON idx.tenant_id = rd.tenant_id
         AND idx.document_id = rd.document_id
         AND idx.version_id = rd.version_id
      ), required_kinds AS (
        SELECT unnest($2::text[]) AS artifact_kind
      ), required AS (
        SELECT ri.document_id, ri.version_id, required_kinds.artifact_kind,
          artifact.ai_prep_artifact_id, artifact.status, artifact.model_name, artifact.is_stale,
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(coalesce(artifact.payload_json->'warnings', '[]'::jsonb)) warning
            WHERE warning ILIKE '%FALLBACK%'
          ) AS has_fallback_warning
        FROM ready_indexed ri
        CROSS JOIN required_kinds
        LEFT JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = ri.tenant_id
         AND artifact.document_version_id = ri.version_id
         AND artifact.artifact_kind = required_kinds.artifact_kind
      ), current_real AS (
        SELECT *
        FROM required
        WHERE ai_prep_artifact_id IS NOT NULL
          AND status = 'completed'
          AND is_stale = false
          AND model_name = $3
          AND NOT has_fallback_warning
      )
      SELECT
        (SELECT count(*) FROM active_docs) AS active_documents,
        (SELECT count(*) FROM ready_docs) AS canonical_extraction_ready,
        (SELECT count(*) FROM ready_indexed) AS search_indexed_documents,
        (SELECT count(*) FROM ready_indexed WHERE ai_allowed = true) AS ai_allowed_documents,
        (
          SELECT count(*)
          FROM ready_docs rd
          LEFT JOIN document_search_index idx
            ON idx.tenant_id = rd.tenant_id
           AND idx.document_id = rd.document_id
           AND idx.version_id = rd.version_id
          WHERE idx.document_id IS NULL
        ) AS ready_missing_search_index,
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
        ) AS extraction_failed,
        (
          SELECT count(*)
          FROM required
          WHERE ai_prep_artifact_id IS NOT NULL
            AND status = 'completed'
            AND is_stale = false
        ) AS completed_required_artifacts,
        (SELECT count(*) FROM current_real) AS real_gemma_outputs,
        (
          SELECT count(*)
          FROM required
          WHERE ai_prep_artifact_id IS NOT NULL
            AND has_fallback_warning
        ) AS fallback_payloads,
        (
          SELECT count(*)
          FROM required
          WHERE ai_prep_artifact_id IS NULL
        ) AS missing_required_artifacts,
        (
          SELECT count(*)
          FROM required
          WHERE ai_prep_artifact_id IS NOT NULL
            AND is_stale = true
        ) AS stale_required_artifacts,
        (
          SELECT count(*)
          FROM required
          WHERE ai_prep_artifact_id IS NOT NULL
            AND status IN ('failed', 'blocked', 'stale')
        ) AS failed_required_artifacts,
        (
          SELECT count(*)
          FROM (
            SELECT document_id
            FROM current_real
            GROUP BY document_id
            HAVING count(*) = 4
          ) docs
        ) AS docs_with_all_4_real_gemma,
        (
          SELECT count(*)
          FROM document_chunks
          WHERE tenant_id = $1
            AND chunk_kind = 'child'
            AND stale = false
        ) AS active_child_chunks,
        (
          SELECT count(*)
          FROM document_chunk_embeddings
          WHERE tenant_id = $1
            AND stale = false
            AND model_route = 'local_gemma'
        ) AS active_embeddings,
        (
          SELECT count(*)
          FROM onedrive_source_cutovers
          WHERE tenant_id = $1
            AND status = 'executed'
            AND vault_source_of_truth = true
        ) AS source_cutover_rows,
        (
          SELECT count(*)
          FROM onedrive_source_cutovers
          WHERE tenant_id = $1
            AND status = 'executed'
            AND vault_source_of_truth = true
            AND gemma_indexing_executed = true
        ) AS gemma_indexing_executed_rows,
        (
          SELECT count(*)
          FROM ethical_walls
          WHERE tenant_id = $1
            AND status = 'active'
        ) AS active_ethical_walls
      FROM (SELECT 1) one
    `,
    [tenantId, requiredArtifactKinds, localGemmaDefaultModel],
  );
  const row = result.rows[0] ?? ({} as Record<keyof SnakeIndexingCounts, string>);
  return {
    activeDocuments: numberValue(row.active_documents),
    canonicalExtractionReady: numberValue(row.canonical_extraction_ready),
    searchIndexedDocuments: numberValue(row.search_indexed_documents),
    aiAllowedDocuments: numberValue(row.ai_allowed_documents),
    readyMissingSearchIndex: numberValue(row.ready_missing_search_index),
    ocrPending: numberValue(row.ocr_pending),
    extractionFailed: numberValue(row.extraction_failed),
    completedRequiredArtifacts: numberValue(row.completed_required_artifacts),
    realGemmaOutputs: numberValue(row.real_gemma_outputs),
    fallbackPayloads: numberValue(row.fallback_payloads),
    missingRequiredArtifacts: numberValue(row.missing_required_artifacts),
    staleRequiredArtifacts: numberValue(row.stale_required_artifacts),
    failedRequiredArtifacts: numberValue(row.failed_required_artifacts),
    docsWithAll4RealGemma: numberValue(row.docs_with_all_4_real_gemma),
    activeChildChunks: numberValue(row.active_child_chunks),
    activeEmbeddings: numberValue(row.active_embeddings),
    sourceCutoverRows: numberValue(row.source_cutover_rows),
    gemmaIndexingExecutedRows: numberValue(row.gemma_indexing_executed_rows),
    activeEthicalWalls: numberValue(row.active_ethical_walls),
  };
}

async function summarizePermissionSmoke(
  client: Client,
  tenantId: string,
  actorUserId: string,
  actorRole: string,
): Promise<PermissionSmokeCounts> {
  const result = await client.query<Record<keyof SnakePermissionSmokeCounts, string>>(
    `
      WITH current_versions AS (
        SELECT tenant_id, document_id, version_id
        FROM document_versions
        WHERE tenant_id = $1
          AND version_status = 'current'
      ), eligible AS (
        SELECT d.tenant_id, d.document_id, d.matter_id, cv.version_id
        FROM documents d
        JOIN current_versions cv
          ON cv.tenant_id = d.tenant_id
         AND cv.document_id = d.document_id
        JOIN canonical_documents cd
          ON cd.tenant_id = cv.tenant_id
         AND cd.version_id = cv.version_id
         AND cd.extraction_status = 'ready'
        JOIN document_search_index idx
          ON idx.tenant_id = d.tenant_id
         AND idx.document_id = d.document_id
         AND idx.version_id = cv.version_id
        WHERE d.tenant_id = $1
          AND d.status <> 'deleted'
          AND d.legal_hold = false
          AND d.ai_allowed = true
      ), required_kinds AS (
        SELECT unnest($4::text[]) AS artifact_kind
      ), complete_real AS (
        SELECT eligible.document_id
        FROM eligible
        CROSS JOIN required_kinds
        JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = eligible.tenant_id
         AND artifact.document_version_id = eligible.version_id
         AND artifact.artifact_kind = required_kinds.artifact_kind
         AND artifact.status = 'completed'
         AND artifact.is_stale = false
         AND artifact.model_name = $5
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(coalesce(artifact.payload_json->'warnings', '[]'::jsonb)) warning
           WHERE warning ILIKE '%FALLBACK%'
         )
        GROUP BY eligible.document_id
        HAVING count(*) = 4
      ), permission_filtered AS (
        SELECT eligible.document_id, eligible.matter_id
        FROM eligible
        JOIN complete_real
          ON complete_real.document_id = eligible.document_id
        JOIN matter_members mm
          ON mm.tenant_id = eligible.tenant_id
         AND mm.matter_id = eligible.matter_id
         AND mm.user_id = $2::uuid
        WHERE $3::text IN ('firm_admin', 'security_admin', 'matter_owner', 'lawyer', 'staff')
          AND NOT EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.tenant_id = eligible.tenant_id
              AND p.resource_type = 'matter'
              AND p.resource_id = eligible.matter_id
              AND p.action = 'read'
              AND (p.valid_from IS NULL OR p.valid_from <= now())
              AND (p.valid_to IS NULL OR p.valid_to > now())
              AND p.condition_json IS NOT NULL
              AND p.condition_json <> '{}'::jsonb
              AND (
                (p.subject_type = 'user' AND p.subject_id = $2::text)
                OR (p.subject_type = 'role' AND p.subject_id = $3::text)
                OR (
                  p.subject_type = 'group'
                  AND p.subject_id IN (
                    SELECT gm.group_id::text
                    FROM group_members gm
                    WHERE gm.tenant_id = p.tenant_id
                      AND gm.user_id = $2::uuid
                  )
                )
              )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.tenant_id = eligible.tenant_id
              AND p.resource_type = 'matter'
              AND p.resource_id = eligible.matter_id
              AND p.action = 'read'
              AND p.effect = 'DENY'
              AND (p.valid_from IS NULL OR p.valid_from <= now())
              AND (p.valid_to IS NULL OR p.valid_to > now())
              AND (
                (p.subject_type = 'user' AND p.subject_id = $2::text)
                OR (p.subject_type = 'role' AND p.subject_id = $3::text)
                OR (
                  p.subject_type = 'group'
                  AND p.subject_id IN (
                    SELECT gm.group_id::text
                    FROM group_members gm
                    WHERE gm.tenant_id = p.tenant_id
                      AND gm.user_id = $2::uuid
                  )
                )
              )
          )
      )
      SELECT
        (SELECT count(*) FROM permission_filtered) AS permission_filtered_visible_documents,
        (SELECT count(DISTINCT matter_id) FROM permission_filtered) AS permission_filtered_matter_count,
        (
          SELECT count(*)
          FROM eligible
          JOIN complete_real
            ON complete_real.document_id = eligible.document_id
          WHERE NOT EXISTS (
            SELECT 1
            FROM matter_members mm
            WHERE mm.tenant_id = eligible.tenant_id
              AND mm.matter_id = eligible.matter_id
              AND mm.user_id = $2::uuid
          )
        ) AS documents_without_matter_membership,
        (
          SELECT count(*)
          FROM eligible
          JOIN complete_real
            ON complete_real.document_id = eligible.document_id
          WHERE EXISTS (
            SELECT 1
            FROM permissions p
            WHERE p.tenant_id = eligible.tenant_id
              AND p.resource_type = 'matter'
              AND p.resource_id = eligible.matter_id
              AND p.action = 'read'
              AND (p.valid_from IS NULL OR p.valid_from <= now())
              AND (p.valid_to IS NULL OR p.valid_to > now())
              AND (
                p.effect = 'DENY'
                OR (p.condition_json IS NOT NULL AND p.condition_json <> '{}'::jsonb)
              )
              AND (
                (p.subject_type = 'user' AND p.subject_id = $2::text)
                OR (p.subject_type = 'role' AND p.subject_id = $3::text)
                OR (
                  p.subject_type = 'group'
                  AND p.subject_id IN (
                    SELECT gm.group_id::text
                    FROM group_members gm
                    WHERE gm.tenant_id = p.tenant_id
                      AND gm.user_id = $2::uuid
                  )
                )
              )
          )
        ) AS explicit_denied_or_unsupported_condition_documents
      FROM (SELECT 1) one
    `,
    [tenantId, actorUserId, actorRole, requiredArtifactKinds, localGemmaDefaultModel],
  );
  const row = result.rows[0] ?? ({} as Record<keyof SnakePermissionSmokeCounts, string>);
  return {
    permissionFilteredVisibleDocuments: numberValue(row.permission_filtered_visible_documents),
    permissionFilteredMatterCount: numberValue(row.permission_filtered_matter_count),
    documentsWithoutMatterMembership: numberValue(row.documents_without_matter_membership),
    explicitDeniedOrUnsupportedConditionDocuments: numberValue(
      row.explicit_denied_or_unsupported_condition_documents,
    ),
  };
}

function validateReadiness(
  args: GemmaProductionIndexingExecuteCliArgs,
  plan: IndexingPlan,
): string[] {
  const blockers: string[] = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!requiredRef(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!requiredRef(args.controlRef)) blockers.push('control_ref_invalid');
  if (!args.tenantSlug.trim()) blockers.push('tenant_slug_missing');
  if (!args.actorEmail.includes('@')) blockers.push('actor_email_invalid');
  if (!isAuthorizedActorRole(plan.actorRole)) blockers.push('actor_role_not_authorized');
  if (plan.controlConstraintBlocksTrue) blockers.push('gemma_indexing_control_constraint_not_migrated');
  if (plan.counts.sourceCutoverRows <= 0) blockers.push('source_of_truth_cutover_not_executed');
  if (plan.counts.gemmaIndexingExecutedRows > 0) blockers.push('gemma_indexing_already_executed');
  if (plan.counts.activeDocuments <= 0) blockers.push('active_documents_zero');
  if (
    args.expectedActiveDocuments !== null &&
    args.expectedActiveDocuments !== plan.counts.activeDocuments
  ) {
    blockers.push('expected_active_documents_mismatch');
  }
  if (plan.counts.canonicalExtractionReady !== plan.counts.activeDocuments) {
    blockers.push('canonical_extraction_not_complete');
  }
  if (plan.counts.searchIndexedDocuments !== plan.counts.activeDocuments) {
    blockers.push('search_index_not_complete');
  }
  if (plan.counts.aiAllowedDocuments !== plan.counts.activeDocuments) {
    blockers.push('ai_allowed_not_complete');
  }
  if (plan.counts.readyMissingSearchIndex > 0) blockers.push('ready_missing_search_index');
  if (plan.counts.docsWithAll4RealGemma !== plan.counts.activeDocuments) {
    blockers.push('docs_with_all_4_real_gemma_mismatch');
  }
  if (plan.counts.realGemmaOutputs !== plan.counts.activeDocuments * requiredArtifactKinds.length) {
    blockers.push('real_gemma_output_count_mismatch');
  }
  if (plan.counts.fallbackPayloads > 0) blockers.push('fallback_payloads_present');
  if (plan.counts.missingRequiredArtifacts > 0) blockers.push('missing_required_artifacts_present');
  if (plan.counts.staleRequiredArtifacts > 0) blockers.push('stale_required_artifacts_present');
  if (plan.counts.failedRequiredArtifacts > 0) blockers.push('failed_required_artifacts_present');
  if (plan.counts.activeChildChunks <= 0 || plan.counts.activeEmbeddings <= 0) {
    blockers.push('chunk_embedding_presence_check_failed');
  }
  if (plan.counts.activeEthicalWalls > 0) blockers.push('active_ethical_wall_review_required');
  if (plan.permissionSmoke.permissionFilteredVisibleDocuments <= 0) {
    blockers.push('permission_smoke_visible_document_count_zero');
  }
  if (plan.permissionSmoke.documentsWithoutMatterMembership > 0) {
    blockers.push('permission_smoke_membership_gap');
  }
  if (plan.permissionSmoke.explicitDeniedOrUnsupportedConditionDocuments > 0) {
    blockers.push('permission_smoke_denied_or_unsupported_documents_present');
  }
  return [...new Set(blockers)];
}

function emptyPlan(blocker: string): IndexingPlan {
  return {
    tenantId: '',
    actorUserId: '',
    actorRole: '',
    cutoverId: '',
    controlConstraintBlocksTrue: true,
    counts: {
      activeDocuments: 0,
      canonicalExtractionReady: 0,
      searchIndexedDocuments: 0,
      aiAllowedDocuments: 0,
      readyMissingSearchIndex: 0,
      ocrPending: 0,
      extractionFailed: 0,
      completedRequiredArtifacts: 0,
      realGemmaOutputs: 0,
      fallbackPayloads: 0,
      missingRequiredArtifacts: 0,
      staleRequiredArtifacts: 0,
      failedRequiredArtifacts: 0,
      docsWithAll4RealGemma: 0,
      activeChildChunks: 0,
      activeEmbeddings: 0,
      sourceCutoverRows: 0,
      gemmaIndexingExecutedRows: 0,
      activeEthicalWalls: 0,
    },
    permissionSmoke: {
      permissionFilteredVisibleDocuments: 0,
      permissionFilteredMatterCount: 0,
      documentsWithoutMatterMembership: 0,
      explicitDeniedOrUnsupportedConditionDocuments: 0,
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

function numberValue(value: unknown): number {
  return typeof value === 'string' || typeof value === 'number' ? Number(value) : 0;
}

interface SnakeIndexingCounts {
  active_documents: string;
  canonical_extraction_ready: string;
  search_indexed_documents: string;
  ai_allowed_documents: string;
  ready_missing_search_index: string;
  ocr_pending: string;
  extraction_failed: string;
  completed_required_artifacts: string;
  real_gemma_outputs: string;
  fallback_payloads: string;
  missing_required_artifacts: string;
  stale_required_artifacts: string;
  failed_required_artifacts: string;
  docs_with_all_4_real_gemma: string;
  active_child_chunks: string;
  active_embeddings: string;
  source_cutover_rows: string;
  gemma_indexing_executed_rows: string;
  active_ethical_walls: string;
}

interface SnakePermissionSmokeCounts {
  permission_filtered_visible_documents: string;
  permission_filtered_matter_count: string;
  documents_without_matter_membership: string;
  explicit_denied_or_unsupported_condition_documents: string;
}

async function main(): Promise<void> {
  let args: GemmaProductionIndexingExecuteCliArgs;
  try {
    args = parseGemmaProductionIndexingExecuteArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runGemmaProductionIndexingExecute(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        gemma_indexing_executed: report.gemma_indexing_executed,
        active_documents: report.counts.active_documents,
        real_gemma_outputs: report.counts.real_gemma_outputs,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'GEMMA_PRODUCTION_INDEXING_EXECUTE_FAILED',
        message: error instanceof Error ? error.message : 'GEMMA_PRODUCTION_INDEXING_EXECUTE_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
