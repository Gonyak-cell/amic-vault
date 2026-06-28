import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';
import {
  aiPrepArtifactAllowedClaimKinds,
  parseAiPrepArtifactPayload,
  type AiPrepArtifactKind,
  type AiPrepArtifactPayloadDto,
} from '@amic-vault/shared';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const safeRunIdPattern = /^[A-Za-z0-9._-]{3,120}$/;
const safeRefPattern = /^[A-Za-z0-9._-]{3,180}$/;
const requiredArtifactKinds = [
  'document_profile',
  'key_fields',
  'keyword_tags',
  'filing_suggestions',
] as const satisfies readonly AiPrepArtifactKind[];
const fallbackReasonCode = 'BULK_COMPLETION_FALLBACK';

export interface GemmaCustomerWideFallbackCloseoutCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  tenantSlug: string;
  approvalRef: string;
  controlRef: string;
  sanitizedOut: string;
  databaseUrl: string;
  limit: number;
}

interface CloseoutCandidate {
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  artifact_kind: (typeof requiredArtifactKinds)[number];
  source_chunk_ids: string[];
  source_hashes: string[];
}

interface CloseoutPlan {
  tenantId: string;
  cutoverExecuted: boolean;
  gemmaIndexingAlreadyExecuted: boolean;
  activeEthicalWalls: number;
  readyAiAllowedDocumentCount: number;
  missingArtifactCount: number;
  candidates: CloseoutCandidate[];
  blockers: string[];
}

interface ArtifactStatusCount {
  artifact_kind: string;
  status: string;
  count: string;
}

export function usage(): string {
  return [
    'usage: pnpm gemma:customer-wide-fallback-closeout -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--limit <n>]',
    '',
    'Completes missing Gemma prep artifacts with sanitized deterministic fallback payloads for ready/search-indexed/ai_allowed documents.',
  ].join('\n');
}

export function parseGemmaCustomerWideFallbackCloseoutArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): GemmaCustomerWideFallbackCloseoutCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');
  return {
    dryRun,
    execute,
    runId: requiredArg(argv, '--run-id'),
    tenantSlug: requiredArg(argv, '--tenant-slug'),
    approvalRef: requiredArg(argv, '--approval-ref'),
    controlRef: requiredArg(argv, '--control-ref'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    databaseUrl: argValue(argv, '--database-url') ?? env.DATABASE_URL ?? defaultDatabaseUrl,
    limit: optionalPositiveInt(argValue(argv, '--limit'), '--limit') ?? 5000,
  };
}

export async function runGemmaCustomerWideFallbackCloseout(
  args: GemmaCustomerWideFallbackCloseoutCliArgs,
) {
  const plan = await collectCloseoutPlan(args);
  const blockers = validateReadiness(args, plan);
  let executedCount = 0;
  if (args.execute && blockers.length === 0) {
    executedCount = await executeCloseoutCandidates(args, plan.candidates);
  }
  const finalStatusCounts = await collectArtifactStatusCounts(args.databaseUrl, plan.tenantId);
  const report = {
    receipt_type: 'gemma_customer_wide_fallback_closeout',
    mode: args.dryRun ? 'dry-run' : 'execute',
    status: blockers.length === 0 ? (args.dryRun ? 'ready_for_execute' : 'executed') : 'blocked',
    run_id: args.runId,
    gemma_prep_executed: false,
    gemma_indexing_executed: false,
    deterministic_fallback_closeout_executed: args.execute && blockers.length === 0,
    counts: {
      ready_ai_allowed_document_count: plan.readyAiAllowedDocumentCount,
      missing_artifact_count_before: plan.missingArtifactCount,
      selected_candidate_count: plan.candidates.length,
      completed_fallback_candidate_count: executedCount,
      active_ethical_walls: plan.activeEthicalWalls,
    },
    artifact_status_counts: finalStatusCounts.map((row) => ({
      artifact_kind: row.artifact_kind,
      status: row.status,
      count: Number(row.count),
    })),
    required_artifact_kinds: requiredArtifactKinds,
    blockers,
    acceptance_checks: {
      source_of_truth_cutover_executed: plan.cutoverExecuted,
      gemma_indexing_not_already_recorded_in_cutover: !plan.gemmaIndexingAlreadyExecuted,
      active_ethical_walls_zero: plan.activeEthicalWalls === 0,
      selected_candidate_count_within_limit: plan.candidates.length <= args.limit,
      dry_run_or_completed_selected: args.dryRun || executedCount === plan.candidates.length,
    },
    evidence_refs: {
      approval_ref: args.approvalRef,
      control_ref: args.controlRef,
    },
    prohibited_claims: {
      one_drive_connected_state_claim: false,
      office_open_save_sync_claim: false,
      source_of_truth_gemma_indexing_cutover_claim: false,
      raw_gemma_response_saved: false,
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

async function collectCloseoutPlan(
  args: GemmaCustomerWideFallbackCloseoutCliArgs,
): Promise<CloseoutPlan> {
  const client = new Client({ connectionString: args.databaseUrl });
  await client.connect();
  try {
    const tenantResult = await client.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1",
      [args.tenantSlug],
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) return emptyPlan('tenant_not_found');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const environment = await collectEnvironment(client, tenantId);
    const counts = await collectPrepCounts(client, tenantId);
    const candidates = await collectCandidates(client, tenantId, args.limit);
    return {
      tenantId,
      ...environment,
      readyAiAllowedDocumentCount: counts.readyAiAllowedDocumentCount,
      missingArtifactCount: counts.missingArtifactCount,
      candidates,
      blockers: [],
    };
  } finally {
    await client.end();
  }
}

async function collectEnvironment(client: Client, tenantId: string) {
  const result = await client.query<{
    active_ethical_walls: string;
    cutover_executed: boolean;
    gemma_indexing_already_executed: boolean;
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
        ) AS gemma_indexing_already_executed
    `,
    [tenantId],
  );
  const row = result.rows[0];
  return {
    activeEthicalWalls: Number(row?.active_ethical_walls ?? 0),
    cutoverExecuted: row?.cutover_executed === true,
    gemmaIndexingAlreadyExecuted: row?.gemma_indexing_already_executed === true,
  };
}

async function collectPrepCounts(client: Client, tenantId: string) {
  const result = await client.query<{
    ready_ai_allowed_document_count: string;
    missing_artifact_count: string;
  }>(
    `
      WITH eligible AS (
        SELECT d.tenant_id, d.document_id, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
         AND cd.version_id = dv.version_id
         AND cd.extraction_status = 'ready'
        JOIN document_search_index idx
          ON idx.tenant_id = dv.tenant_id
         AND idx.document_id = dv.document_id
         AND idx.version_id = dv.version_id
        WHERE d.tenant_id = $1
          AND d.status <> 'deleted'
          AND d.legal_hold = false
          AND d.ai_allowed = true
      ), required_artifacts AS (
        SELECT unnest($2::text[]) AS artifact_kind
      ), missing AS (
        SELECT eligible.document_id, eligible.version_id, required_artifacts.artifact_kind
        FROM eligible
        CROSS JOIN required_artifacts
        LEFT JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = $1
         AND artifact.document_version_id = eligible.version_id
         AND artifact.artifact_kind = required_artifacts.artifact_kind
         AND artifact.status = 'completed'
         AND artifact.is_stale = false
        WHERE artifact.ai_prep_artifact_id IS NULL
      )
      SELECT
        (SELECT count(*) FROM eligible) AS ready_ai_allowed_document_count,
        (SELECT count(*) FROM missing) AS missing_artifact_count
    `,
    [tenantId, requiredArtifactKinds],
  );
  const row = result.rows[0];
  return {
    readyAiAllowedDocumentCount: Number(row?.ready_ai_allowed_document_count ?? 0),
    missingArtifactCount: Number(row?.missing_artifact_count ?? 0),
  };
}

async function collectCandidates(
  client: Client,
  tenantId: string,
  limit: number,
): Promise<CloseoutCandidate[]> {
  const result = await client.query<CloseoutCandidate>(
    `
      WITH eligible AS (
        SELECT d.tenant_id, d.document_id, d.matter_id, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
         AND cd.version_id = dv.version_id
         AND cd.extraction_status = 'ready'
        JOIN document_search_index idx
          ON idx.tenant_id = dv.tenant_id
         AND idx.document_id = dv.document_id
         AND idx.version_id = dv.version_id
        WHERE d.tenant_id = $1
          AND d.status <> 'deleted'
          AND d.legal_hold = false
          AND d.ai_allowed = true
      ), required_artifacts AS (
        SELECT unnest($2::text[]) AS artifact_kind
      ), missing AS (
        SELECT eligible.tenant_id, eligible.document_id, eligible.version_id,
          eligible.matter_id, required_artifacts.artifact_kind
        FROM eligible
        CROSS JOIN required_artifacts
        LEFT JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = eligible.tenant_id
         AND artifact.document_version_id = eligible.version_id
         AND artifact.artifact_kind = required_artifacts.artifact_kind
         AND artifact.status = 'completed'
         AND artifact.is_stale = false
        WHERE artifact.ai_prep_artifact_id IS NULL
      ), candidate_ids AS (
        SELECT *
        FROM missing
        ORDER BY document_id ASC, artifact_kind ASC
        LIMIT $3
      )
      SELECT candidate_ids.tenant_id, candidate_ids.document_id, candidate_ids.version_id,
        candidate_ids.matter_id, candidate_ids.artifact_kind,
        (array_agg(chunk.chunk_id ORDER BY chunk.chunk_ordinal))[1:12] AS source_chunk_ids,
        (array_agg(chunk.source_text_hash ORDER BY chunk.chunk_ordinal))[1:12] AS source_hashes
      FROM candidate_ids
      JOIN document_chunks chunk
        ON chunk.tenant_id = candidate_ids.tenant_id
       AND chunk.version_id = candidate_ids.version_id
       AND chunk.chunk_kind = 'child'
       AND chunk.stale = false
      GROUP BY candidate_ids.tenant_id, candidate_ids.document_id, candidate_ids.version_id,
        candidate_ids.matter_id, candidate_ids.artifact_kind
      HAVING count(chunk.chunk_id) > 0
      ORDER BY candidate_ids.document_id ASC, candidate_ids.artifact_kind ASC
    `,
    [tenantId, requiredArtifactKinds, limit],
  );
  return result.rows;
}

async function executeCloseoutCandidates(
  args: GemmaCustomerWideFallbackCloseoutCliArgs,
  candidates: readonly CloseoutCandidate[],
): Promise<number> {
  if (candidates.length === 0) return 0;
  const client = new Client({ connectionString: args.databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      candidates[0]?.tenant_id,
    ]);
    let completed = 0;
    for (const candidate of candidates) {
      const sourceRefs = candidate.source_chunk_ids.slice(0, 50).map((chunkId) => `chunk:${chunkId}`);
      const sourceHashes = uniqueSourceHashes(candidate.source_hashes);
      const payload = buildFallbackPayload(candidate.artifact_kind, sourceRefs);
      const promptHash = sha256Hex(
        `${args.runId}:${candidate.version_id}:${candidate.artifact_kind}:${fallbackReasonCode}`,
      );
      const responseHash = sha256Hex(JSON.stringify(payload));
      const artifactResult = await client.query<{ ai_prep_artifact_id: string }>(
        `
          INSERT INTO ai_prep_artifacts (
            tenant_id, matter_id, document_id, document_version_id, artifact_kind,
            status, model_route, model_name, source_chunk_ids, source_hashes,
            prompt_hash, response_hash, payload_json, latency_ms, is_stale,
            stale_reason, failure_reason_code, updated_at, generated_at, stale_at
          )
          VALUES (
            $1, $2, $3, $4, $5, 'completed', 'local_gemma', 'deterministic-fallback',
            $6::uuid[], $7::jsonb, $8, $9, $10::jsonb, 0, false, null, null, now(), now(), null
          )
          ON CONFLICT (tenant_id, document_version_id, artifact_kind)
          DO UPDATE SET
            status = 'completed',
            model_route = 'local_gemma',
            model_name = EXCLUDED.model_name,
            source_chunk_ids = EXCLUDED.source_chunk_ids,
            source_hashes = EXCLUDED.source_hashes,
            prompt_hash = EXCLUDED.prompt_hash,
            response_hash = EXCLUDED.response_hash,
            payload_json = EXCLUDED.payload_json,
            latency_ms = EXCLUDED.latency_ms,
            is_stale = false,
            stale_reason = null,
            failure_reason_code = null,
            updated_at = now(),
            generated_at = now(),
            stale_at = null
          RETURNING ai_prep_artifact_id
        `,
        [
          candidate.tenant_id,
          candidate.matter_id,
          candidate.document_id,
          candidate.version_id,
          candidate.artifact_kind,
          candidate.source_chunk_ids,
          JSON.stringify(sourceHashes),
          promptHash,
          responseHash,
          JSON.stringify(payload),
        ],
      );
      const artifactId = artifactResult.rows[0]?.ai_prep_artifact_id;
      if (!artifactId) throw new Error('ai prep fallback closeout upsert returned no id');
      await client.query(
        `
          INSERT INTO audit_events (
            tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
            matter_id, result, metadata_json, correlation_id, retention_label
          )
          VALUES ($1, 'system', null, null, 'AI_PREP_COMPLETED', 'ai_prep_artifact', $2,
            $3, 'success', $4::jsonb, null, 'PERMANENT')
        `,
        [
          candidate.tenant_id,
          artifactId,
          candidate.matter_id,
          JSON.stringify({
            ai_prep_artifact_id: artifactId,
            ai_prep_kind: candidate.artifact_kind,
            ai_prep_status: 'completed',
            matter_id: candidate.matter_id,
            document_id: candidate.document_id,
            version_id: candidate.version_id,
            source_chunk_count: candidate.source_chunk_ids.length,
            generation_result: 'fallback',
            fallback_reason_code: fallbackReasonCode,
            prompt_hash: promptHash,
            response_hash: responseHash,
            run_id: args.runId,
            approval_ref: args.approvalRef,
            control_ref: args.controlRef,
          }),
        ],
      );
      completed += 1;
    }
    await client.query('COMMIT');
    return completed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function collectArtifactStatusCounts(
  databaseUrl: string,
  tenantId: string,
): Promise<ArtifactStatusCount[]> {
  if (!tenantId) return [];
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const result = await client.query<ArtifactStatusCount>(
      `
        SELECT artifact_kind, status, count(*) AS count
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND artifact_kind = ANY($2::text[])
        GROUP BY artifact_kind, status
        ORDER BY artifact_kind, status
      `,
      [tenantId, requiredArtifactKinds],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function validateReadiness(
  args: GemmaCustomerWideFallbackCloseoutCliArgs,
  plan: CloseoutPlan,
): string[] {
  const blockers: string[] = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!safeRefPattern.test(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!safeRefPattern.test(args.controlRef)) blockers.push('control_ref_invalid');
  if (!plan.cutoverExecuted) blockers.push('source_of_truth_cutover_not_executed');
  if (plan.gemmaIndexingAlreadyExecuted) blockers.push('gemma_indexing_already_recorded_in_cutover');
  if (plan.activeEthicalWalls > 0) blockers.push('active_ethical_wall_review_required');
  if (plan.readyAiAllowedDocumentCount <= 0) blockers.push('ready_ai_allowed_document_count_zero');
  if (plan.missingArtifactCount > 0 && plan.candidates.length === 0) {
    blockers.push('selected_candidate_count_zero');
  }
  return [...new Set(blockers)];
}

function buildFallbackPayload(
  artifactKind: AiPrepArtifactKind,
  sourceRefs: readonly string[],
): AiPrepArtifactPayloadDto {
  const primarySourceRef = sourceRefs[0];
  if (!primarySourceRef) throw new Error('fallback closeout requires at least one source ref');
  const sectionRefs = sourceRefs.slice(0, 20);
  const allowedKinds = aiPrepArtifactAllowedClaimKinds(artifactKind);
  const claimKind = allowedKinds.includes('key_fact') ? 'key_fact' : (allowedKinds[0] ?? 'summary');
  const label = artifactLabel(artifactKind);
  return parseAiPrepArtifactPayload(
    {
      answer: `${label} prep is complete with permission-filtered source references.`,
      sections: [
        {
          section_id: 'bulk_completion_fallback',
          heading: 'File organization prep',
          text: `${label} prep was completed with deterministic fallback metadata. Raw document text and raw model responses were not stored.`,
          source_refs: sectionRefs,
        },
      ],
      claims: [
        {
          claim_id: 'bulk_completion_fallback_1',
          kind: claimKind,
          text: `${label} fallback artifact is linked to permission-filtered source references and contains no legal conclusion.`,
          source_refs: [primarySourceRef],
          is_legal_conclusion: false,
        },
      ],
      warnings: [`LOCAL_GEMMA_${fallbackReasonCode}_FALLBACK`],
      source_refs: sourceRefs,
    },
    artifactKind,
  );
}

function artifactLabel(artifactKind: AiPrepArtifactKind): string {
  switch (artifactKind) {
    case 'document_profile':
      return 'Document profile';
    case 'key_fields':
      return 'Key fields';
    case 'date_facts':
      return 'Date facts';
    case 'people_organizations':
      return 'People and organizations';
    case 'keyword_tags':
      return 'Keyword tags';
    case 'filing_suggestions':
      return 'Filing suggestions';
    case 'source_outline':
      return 'Source outline';
    case 'retrieval_hints':
      return 'Retrieval hints';
  }
}

function uniqueSourceHashes(sourceHashes: readonly string[]): string[] {
  return [...new Set(sourceHashes.filter((hash) => /^[0-9a-f]{64}$/u.test(hash)))].slice(0, 20);
}

function emptyPlan(blocker: string): CloseoutPlan {
  return {
    tenantId: '',
    cutoverExecuted: false,
    gemmaIndexingAlreadyExecuted: false,
    activeEthicalWalls: 0,
    readyAiAllowedDocumentCount: 0,
    missingArtifactCount: 0,
    candidates: [],
    blockers: [blocker],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function requiredArg(argv: readonly string[], name: string): string {
  const value = argValue(argv, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function optionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function main() {
  try {
    const report = await runGemmaCustomerWideFallbackCloseout(
      parseGemmaCustomerWideFallbackCloseoutArgs(process.argv.slice(2)),
    );
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        missing_artifact_count_before: report.counts.missing_artifact_count_before,
        selected_candidate_count: report.counts.selected_candidate_count,
        completed_fallback_candidate_count: report.counts.completed_fallback_candidate_count,
        deterministic_fallback_closeout_executed: report.deterministic_fallback_closeout_executed,
        blockers: report.blockers,
      }),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
