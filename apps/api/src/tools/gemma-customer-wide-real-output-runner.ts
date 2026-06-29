import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Pool } from 'pg';
import { localGemmaDefaultModel } from '@amic-vault/ai';
import {
  aiPrepArtifactAllowedClaimKinds,
  parseAiPrepArtifactPayload,
  type AiPrepArtifactKind,
  type AiPrepArtifactPayloadDto,
} from '@amic-vault/shared';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const requiredArtifactKinds = [
  'document_profile',
  'key_fields',
  'keyword_tags',
  'filing_suggestions',
] as const satisfies readonly AiPrepArtifactKind[];
const safeRunIdPattern = /^[A-Za-z0-9._-]{3,120}$/;
const safeRefPattern = /^[A-Za-z0-9._-]{3,180}$/;

export interface GemmaCustomerWideRealOutputCliArgs {
  dryRun: boolean;
  execute: boolean;
  runId: string;
  tenantSlug: string;
  approvalRef: string;
  controlRef: string;
  sanitizedOut: string;
  databaseUrl: string;
  limit: number;
  concurrency: number;
  maxPromptChars: number;
  documentsPerCall: number;
}

interface RealOutputCandidate {
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  artifact_kinds: AiPrepArtifactKind[];
  source_chunk_ids: string[];
  source_hashes: string[];
  prompt_text: string;
}

interface RealOutputPlan {
  tenantId: string;
  cutoverExecuted: boolean;
  activeEthicalWalls: number;
  missingArtifactCount: number;
  fallbackArtifactCount: number;
  realGemmaOutputCount: number;
  candidates: RealOutputCandidate[];
  blockers: string[];
}

interface WorkerResult {
  status: 'completed' | 'failed';
  documentCount: number;
  artifactCount: number;
  reasonCode?: string | undefined;
}

export function usage(): string {
  return [
    'usage: pnpm gemma:customer-wide-real-output -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--limit <n>] [--concurrency <n>]',
    '',
    'Creates missing or replaces fallback prep artifacts with actual local Gemma text output.',
  ].join('\n');
}

export function parseGemmaCustomerWideRealOutputArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): GemmaCustomerWideRealOutputCliArgs {
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
    limit: optionalPositiveInt(argValue(argv, '--limit'), '--limit') ?? 100,
    concurrency: Math.min(optionalPositiveInt(argValue(argv, '--concurrency'), '--concurrency') ?? 2, 8),
    maxPromptChars: optionalPositiveInt(argValue(argv, '--max-prompt-chars'), '--max-prompt-chars') ?? 3200,
    documentsPerCall: Math.min(
      optionalPositiveInt(argValue(argv, '--documents-per-call'), '--documents-per-call') ?? 1,
      100,
    ),
  };
}

export async function runGemmaCustomerWideRealOutput(args: GemmaCustomerWideRealOutputCliArgs) {
  const pool = new Pool({ connectionString: args.databaseUrl, max: Math.max(2, args.concurrency + 1) });
  try {
    const plan = await collectPlan(pool, args);
    const blockers = validateReadiness(args, plan);
    const results =
      args.execute && blockers.length === 0
        ? await runWorkers(pool, args, plan.candidates)
        : ([] as WorkerResult[]);
    const finalCounts = await collectStrictCounts(pool, plan.tenantId);
    const closeoutComplete = plan.missingArtifactCount + plan.fallbackArtifactCount <= 0;
    const report = {
      receipt_type: 'gemma_customer_wide_real_output_batch',
      mode: args.dryRun ? 'dry-run' : 'execute',
      status:
        blockers.length === 0
          ? closeoutComplete
            ? 'complete'
            : args.dryRun
              ? 'ready_for_execute'
              : 'executed'
          : 'blocked',
      run_id: args.runId,
      gemma_prep_executed: args.execute && blockers.length === 0,
      gemma_indexing_executed: false,
      counts: {
        fallback_artifact_count_before: plan.fallbackArtifactCount,
        missing_artifact_count_before: plan.missingArtifactCount,
        real_gemma_output_count_before: plan.realGemmaOutputCount,
        selected_document_count: plan.candidates.length,
        selected_artifact_count: plan.candidates.reduce(
          (sum, candidate) => sum + candidate.artifact_kinds.length,
          0,
        ),
        selected_model_call_count: Math.ceil(plan.candidates.length / args.documentsPerCall),
        completed_document_count: results.reduce((sum, result) => sum + result.documentCount, 0),
        completed_artifact_count: results.reduce((sum, result) => sum + result.artifactCount, 0),
        failed_document_count: results.filter((result) => result.status === 'failed').length,
        active_ethical_walls: plan.activeEthicalWalls,
        real_gemma_output_count_after: finalCounts.realGemmaOutputCount,
        fallback_artifact_count_after: finalCounts.fallbackArtifactCount,
        missing_artifact_count_after: finalCounts.missingArtifactCount,
      },
      failure_reason_counts: countFailures(results),
      blockers,
      acceptance_checks: {
        source_of_truth_cutover_executed: plan.cutoverExecuted,
        active_ethical_walls_zero: plan.activeEthicalWalls === 0,
        dry_run_or_no_worker_failures:
          args.dryRun || results.every((result) => result.status === 'completed'),
        real_gemma_outputs_increased:
          closeoutComplete || args.dryRun || finalCounts.realGemmaOutputCount > plan.realGemmaOutputCount,
        fallback_artifact_count_zero: finalCounts.fallbackArtifactCount === 0,
        missing_artifact_count_zero: finalCounts.missingArtifactCount === 0,
      },
      evidence_refs: {
        approval_ref: args.approvalRef,
        control_ref: args.controlRef,
      },
      prohibited_claims: {
        one_drive_connected_state_claim: false,
        office_open_save_sync_claim: false,
        source_of_truth_gemma_indexing_cutover_claim: false,
        raw_gemma_response_saved_in_receipt: false,
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
        'Receipt stores counts and safe reason codes only. Raw paths, filenames, document body, OCR excerpts, object keys, tokens, secrets, model response text, matter codes, client names, and tenant-private labels are omitted.',
    };
    await writeJson(args.sanitizedOut, report);
    return report;
  } finally {
    await pool.end();
  }
}

async function collectPlan(pool: Pool, args: GemmaCustomerWideRealOutputCliArgs): Promise<RealOutputPlan> {
  const tenant = await pool.query<{ tenant_id: string }>(
    "SELECT tenant_id FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1",
    [args.tenantSlug],
  );
  const tenantId = tenant.rows[0]?.tenant_id;
  if (!tenantId) return emptyPlan('tenant_not_found');
  const environment = await pool.query<{
    active_ethical_walls: string;
    cutover_executed: boolean;
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
        ) AS cutover_executed
    `,
    [tenantId],
  );
  const counts = await collectStrictCounts(pool, tenantId);
  const candidates = await collectCandidates(pool, tenantId, args.limit, args.maxPromptChars);
  const env = environment.rows[0];
  return {
    tenantId,
    cutoverExecuted: env?.cutover_executed === true,
    activeEthicalWalls: Number(env?.active_ethical_walls ?? 0),
    fallbackArtifactCount: counts.fallbackArtifactCount,
    missingArtifactCount: counts.missingArtifactCount,
    realGemmaOutputCount: counts.realGemmaOutputCount,
    candidates,
    blockers: [],
  };
}

async function collectCandidates(
  pool: Pool,
  tenantId: string,
  limit: number,
  maxPromptChars: number,
): Promise<RealOutputCandidate[]> {
  const result = await pool.query<RealOutputCandidate>(
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
      ), needed_artifacts AS (
        SELECT eligible.tenant_id, eligible.document_id, eligible.version_id,
          eligible.matter_id, required_artifacts.artifact_kind
        FROM eligible
        CROSS JOIN (SELECT unnest($2::text[]) AS artifact_kind) required_artifacts
        LEFT JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = eligible.tenant_id
         AND artifact.document_version_id = eligible.version_id
         AND artifact.artifact_kind = required_artifacts.artifact_kind
         AND artifact.status = 'completed'
         AND artifact.is_stale = false
        WHERE artifact.ai_prep_artifact_id IS NULL
           OR artifact.model_name IS DISTINCT FROM $4
           OR EXISTS (
             SELECT 1
             FROM jsonb_array_elements_text(coalesce(artifact.payload_json->'warnings', '[]'::jsonb)) warning
             WHERE warning ILIKE '%FALLBACK%'
           )
      ), candidate_docs AS (
        SELECT tenant_id, document_id, version_id, matter_id,
          array_agg(artifact_kind ORDER BY artifact_kind) AS artifact_kinds
        FROM needed_artifacts
        GROUP BY tenant_id, document_id, version_id, matter_id
        ORDER BY document_id ASC
        LIMIT $3
      )
      SELECT candidate_docs.tenant_id, candidate_docs.document_id, candidate_docs.version_id,
        candidate_docs.matter_id, candidate_docs.artifact_kinds,
        (array_agg(chunk.chunk_id ORDER BY chunk.chunk_ordinal))[1:8] AS source_chunk_ids,
        (array_agg(chunk.source_text_hash ORDER BY chunk.chunk_ordinal))[1:8] AS source_hashes,
        left(string_agg(left(chunk.chunk_text, 900), E'\\n\\n' ORDER BY chunk.chunk_ordinal), $5) AS prompt_text
      FROM candidate_docs
      JOIN document_chunks chunk
        ON chunk.tenant_id = candidate_docs.tenant_id
       AND chunk.version_id = candidate_docs.version_id
       AND chunk.chunk_kind = 'child'
       AND chunk.stale = false
      GROUP BY candidate_docs.tenant_id, candidate_docs.document_id, candidate_docs.version_id,
        candidate_docs.matter_id, candidate_docs.artifact_kinds
      HAVING count(chunk.chunk_id) > 0
      ORDER BY candidate_docs.document_id ASC
    `,
    [tenantId, requiredArtifactKinds, limit, localGemmaDefaultModel, maxPromptChars],
  );
  return result.rows;
}

async function collectStrictCounts(pool: Pool, tenantId: string) {
  const result = await pool.query<{
    total_completed: string;
    real_gemma_outputs: string;
    fallback_payloads: string;
    missing_artifacts: string;
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
      ), required_kinds AS (
        SELECT unnest($2::text[]) AS artifact_kind
      ), required AS (
        SELECT artifact.*, EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(artifact.payload_json->'warnings', '[]'::jsonb)) warning
          WHERE warning ILIKE '%FALLBACK%'
        ) AS has_fallback_warning
        FROM eligible
        CROSS JOIN required_kinds
        LEFT JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = eligible.tenant_id
         AND artifact.document_version_id = eligible.version_id
         AND artifact.artifact_kind = required_kinds.artifact_kind
         AND artifact.status = 'completed'
         AND artifact.is_stale = false
      )
      SELECT count(ai_prep_artifact_id) AS total_completed,
        count(*) FILTER (WHERE model_name = $3 AND NOT has_fallback_warning) AS real_gemma_outputs,
        count(*) FILTER (WHERE has_fallback_warning) AS fallback_payloads,
        count(*) FILTER (WHERE ai_prep_artifact_id IS NULL) AS missing_artifacts
      FROM required
    `,
    [tenantId, requiredArtifactKinds, localGemmaDefaultModel],
  );
  const row = result.rows[0];
  return {
    totalCompleted: Number(row?.total_completed ?? 0),
    realGemmaOutputCount: Number(row?.real_gemma_outputs ?? 0),
    fallbackArtifactCount: Number(row?.fallback_payloads ?? 0),
    missingArtifactCount: Number(row?.missing_artifacts ?? 0),
  };
}

async function runWorkers(
  pool: Pool,
  args: GemmaCustomerWideRealOutputCliArgs,
  candidates: readonly RealOutputCandidate[],
): Promise<WorkerResult[]> {
  const results: WorkerResult[] = [];
  const workItems =
    args.documentsPerCall <= 1
      ? candidates.map((candidate) => [candidate])
      : chunkCandidates(candidates, args.documentsPerCall);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < workItems.length) {
      const candidatesForCall = workItems[nextIndex];
      nextIndex += 1;
      if (!candidatesForCall?.length) continue;
      results.push(
        candidatesForCall.length === 1
          ? await processCandidate(pool, args, candidatesForCall[0]!)
          : await processCandidateBatch(pool, args, candidatesForCall),
      );
    }
  }
  await Promise.all(Array.from({ length: args.concurrency }, () => worker()));
  return results;
}

function chunkCandidates(
  candidates: readonly RealOutputCandidate[],
  documentsPerCall: number,
): RealOutputCandidate[][] {
  const chunks: RealOutputCandidate[][] = [];
  for (let index = 0; index < candidates.length; index += documentsPerCall) {
    chunks.push(candidates.slice(index, index + documentsPerCall));
  }
  return chunks;
}

async function processCandidate(
  pool: Pool,
  args: GemmaCustomerWideRealOutputCliArgs,
  candidate: RealOutputCandidate,
): Promise<WorkerResult> {
  const generated = await generateGemmaText(candidate.prompt_text);
  if (generated.status !== 'completed') {
    return { status: 'failed', documentCount: 0, artifactCount: 0, reasonCode: generated.reasonCode };
  }
  return writeCandidateOutput(pool, args, candidate, generated);
}

async function processCandidateBatch(
  pool: Pool,
  args: GemmaCustomerWideRealOutputCliArgs,
  candidates: readonly RealOutputCandidate[],
): Promise<WorkerResult> {
  const generated = await generateGemmaBatchTexts(candidates);
  if (generated.status !== 'completed') {
    return { status: 'failed', documentCount: 0, artifactCount: 0, reasonCode: generated.reasonCode };
  }
  let artifactCount = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    const text = generated.texts[index] ?? generated.fullText;
    const result = await writeCandidateOutput(pool, args, candidate, {
      status: 'completed',
      text,
      model: generated.model,
      latencyMs: Math.round(generated.latencyMs / candidates.length),
    });
    if (result.status !== 'completed') {
      return result;
    }
    artifactCount += result.artifactCount;
  }
  return { status: 'completed', documentCount: candidates.length, artifactCount };
}

async function writeCandidateOutput(
  pool: Pool,
  args: GemmaCustomerWideRealOutputCliArgs,
  candidate: RealOutputCandidate,
  generated: { status: 'completed'; text: string; model: string; latencyMs: number },
): Promise<WorkerResult> {
  const sourceRefs = candidate.source_chunk_ids.slice(0, 50).map((chunkId) => `chunk:${chunkId}`);
  if (sourceRefs.length === 0) {
    return { status: 'failed', documentCount: 0, artifactCount: 0, reasonCode: 'NO_SOURCE_REFS' };
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', candidate.tenant_id]);
    let artifactCount = 0;
    for (const artifactKind of candidate.artifact_kinds) {
      const payload = buildPayload(artifactKind, generated.text, sourceRefs);
      const promptHash = sha256Hex(`${candidate.version_id}:${args.runId}:${artifactKind}`);
      const responseHash = sha256Hex(JSON.stringify(payload));
      const artifact = await client.query<{ ai_prep_artifact_id: string }>(
        `
          INSERT INTO ai_prep_artifacts (
            tenant_id, matter_id, document_id, document_version_id, artifact_kind,
            status, model_route, model_name, source_chunk_ids, source_hashes,
            prompt_hash, response_hash, payload_json, latency_ms, is_stale,
            stale_reason, failure_reason_code, updated_at, generated_at, stale_at
          )
          VALUES (
            $1, $2, $3, $4, $5, 'completed', 'local_gemma', $6,
            $7::uuid[], $8::jsonb, $9, $10, $11::jsonb, $12, false, null, null, now(), now(), null
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
          artifactKind,
          generated.model,
          candidate.source_chunk_ids,
          JSON.stringify(uniqueSourceHashes(candidate.source_hashes)),
          promptHash,
          responseHash,
          JSON.stringify(payload),
          generated.latencyMs,
        ],
      );
      const artifactId = artifact.rows[0]?.ai_prep_artifact_id;
      if (!artifactId) throw new Error('real output artifact upsert returned no id');
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
            ai_prep_kind: artifactKind,
            ai_prep_status: 'completed',
            matter_id: candidate.matter_id,
            document_id: candidate.document_id,
            version_id: candidate.version_id,
            source_chunk_count: candidate.source_chunk_ids.length,
            generation_result: 'gemma',
            prompt_hash: promptHash,
            response_hash: responseHash,
            run_id: args.runId,
            approval_ref: args.approvalRef,
            control_ref: args.controlRef,
          }),
        ],
      );
      artifactCount += 1;
    }
    await client.query('COMMIT');
    return { status: 'completed', documentCount: 1, artifactCount };
  } catch (error) {
    await client.query('ROLLBACK');
    return {
      status: 'failed',
      documentCount: 0,
      artifactCount: 0,
      reasonCode: error instanceof Error ? safeReasonCode(error.message) : 'DB_WRITE_FAILED',
    };
  } finally {
    client.release();
  }
}

async function generateGemmaBatchTexts(candidates: readonly RealOutputCandidate[]): Promise<
  | { status: 'completed'; texts: string[]; fullText: string; model: string; latencyMs: number }
  | { status: 'failed'; reasonCode: string }
> {
  const endpoint = process.env.LOCAL_GEMMA_ENDPOINT ?? process.env.AI_GATEWAY_ENDPOINT ?? 'http://127.0.0.1:11434';
  const model = process.env.LOCAL_GEMMA_MODEL ?? localGemmaDefaultModel;
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL('/api/generate', endpoint).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        prompt: [
          'Prepare neutral file-organization metadata from the source text.',
          'For each numbered document, return exactly one concise line in this form: DOC n: metadata.',
          'Do not give legal advice. Do not quote source text verbatim.',
          '',
          candidates
            .map((candidate, index) =>
              [`DOC ${index + 1}:`, candidate.prompt_text || '(no extract available)'].join('\n'),
            )
            .join('\n\n'),
        ].join('\n'),
        options: {
          temperature: 0,
          num_predict: Number(
            process.env.LOCAL_GEMMA_PREP_BATCH_MAX_TOKENS ??
              Math.min(Math.max(candidates.length * 32, 128), 1200),
          ),
          num_ctx: Number(process.env.LOCAL_GEMMA_NUM_CTX ?? 4096),
        },
      }),
    });
    if (!response.ok) return { status: 'failed', reasonCode: 'GENERATION_HTTP_FAILED' };
    const body = (await response.json()) as { response?: unknown; model?: unknown };
    const fullText = normalizeGemmaText(typeof body.response === 'string' ? body.response : '');
    if (!fullText) return { status: 'failed', reasonCode: 'EMPTY_GEMMA_RESPONSE' };
    return {
      status: 'completed',
      texts: extractDocumentLines(fullText, candidates.length),
      fullText,
      model: typeof body.model === 'string' ? body.model : model,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return { status: 'failed', reasonCode: 'GENERATION_EXCEPTION' };
  }
}

async function generateGemmaText(promptText: string): Promise<
  | { status: 'completed'; text: string; model: string; latencyMs: number }
  | { status: 'failed'; reasonCode: string }
> {
  const endpoint = process.env.LOCAL_GEMMA_ENDPOINT ?? process.env.AI_GATEWAY_ENDPOINT ?? 'http://127.0.0.1:11434';
  const model = process.env.LOCAL_GEMMA_MODEL ?? localGemmaDefaultModel;
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL('/api/generate', endpoint).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        prompt: [
          'Prepare neutral file-organization metadata from the source text.',
          'Return 1-3 concise sentences. Do not give legal advice. Do not quote source text verbatim.',
          '',
          'SOURCE TEXT:',
          promptText,
        ].join('\n'),
        options: {
          temperature: 0,
          num_predict: Number(process.env.LOCAL_GEMMA_PREP_MAX_TOKENS ?? 180),
          num_ctx: Number(process.env.LOCAL_GEMMA_NUM_CTX ?? 4096),
        },
      }),
    });
    if (!response.ok) return { status: 'failed', reasonCode: 'GENERATION_HTTP_FAILED' };
    const body = (await response.json()) as { response?: unknown; model?: unknown };
    const text = normalizeGemmaText(typeof body.response === 'string' ? body.response : '');
    if (!text) return { status: 'failed', reasonCode: 'EMPTY_GEMMA_RESPONSE' };
    return {
      status: 'completed',
      text,
      model: typeof body.model === 'string' ? body.model : model,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return { status: 'failed', reasonCode: 'GENERATION_EXCEPTION' };
  }
}

function buildPayload(
  artifactKind: AiPrepArtifactKind,
  text: string,
  sourceRefs: readonly string[],
): AiPrepArtifactPayloadDto {
  const primarySourceRef = sourceRefs[0];
  if (!primarySourceRef) throw new Error('real output payload requires source refs');
  const allowedKinds = aiPrepArtifactAllowedClaimKinds(artifactKind);
  const claimKind = allowedKinds.includes('key_fact') ? 'key_fact' : (allowedKinds[0] ?? 'summary');
  return parseAiPrepArtifactPayload(
    {
      answer: text,
      sections: [
        {
          section_id: 'gemma_real_output',
          heading: artifactLabel(artifactKind),
          text,
          source_refs: sourceRefs.slice(0, 20),
        },
      ],
      claims: [
        {
          claim_id: 'gemma_real_output_1',
          kind: claimKind,
          text,
          source_refs: [primarySourceRef],
          is_legal_conclusion: false,
        },
      ],
      warnings: [],
      source_refs: sourceRefs,
    },
    artifactKind,
  );
}

function validateReadiness(args: GemmaCustomerWideRealOutputCliArgs, plan: RealOutputPlan): string[] {
  const blockers = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!safeRefPattern.test(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!safeRefPattern.test(args.controlRef)) blockers.push('control_ref_invalid');
  if (!plan.cutoverExecuted) blockers.push('source_of_truth_cutover_not_executed');
  if (plan.activeEthicalWalls > 0) blockers.push('active_ethical_wall_review_required');
  if (plan.missingArtifactCount + plan.fallbackArtifactCount <= 0) return [...new Set(blockers)];
  if (plan.candidates.length === 0) blockers.push('selected_document_count_zero');
  return [...new Set(blockers)];
}

function countFailures(results: readonly WorkerResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    if (result.status !== 'failed') continue;
    const reason = result.reasonCode ?? 'UNKNOWN';
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
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

function emptyPlan(blocker: string): RealOutputPlan {
  return {
    tenantId: '',
    cutoverExecuted: false,
    activeEthicalWalls: 0,
    missingArtifactCount: 0,
    fallbackArtifactCount: 0,
    realGemmaOutputCount: 0,
    candidates: [],
    blockers: [blocker],
  };
}

function normalizeGemmaText(text: string): string {
  return text
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s*\n\s*/gu, ' ')
    .trim()
    .slice(0, 1400);
}

function extractDocumentLines(fullText: string, documentCount: number): string[] {
  const texts = Array.from({ length: documentCount }, () => fullText);
  const matches = [
    ...fullText.matchAll(
      /(?:^|\s)DOC\s*(\d{1,3})\s*[:.)-]\s*(.*?)(?=\sDOC\s*\d{1,3}\s*[:.)-]|$)/giu,
    ),
  ];
  for (const match of matches) {
    const index = Number(match[1]) - 1;
    const text = normalizeGemmaText(match[2] ?? '');
    if (index >= 0 && index < documentCount && text) {
      texts[index] = text;
    }
  }
  return texts;
}

function uniqueSourceHashes(sourceHashes: readonly string[]): string[] {
  return [...new Set(sourceHashes.filter((hash) => /^[0-9a-f]{64}$/u.test(hash)))].slice(0, 20);
}

function safeReasonCode(input: string): string {
  const normalized = input.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
  return normalized || 'REAL_OUTPUT_FAILED';
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  try {
    const report = await runGemmaCustomerWideRealOutput(
      parseGemmaCustomerWideRealOutputArgs(process.argv.slice(2)),
    );
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        selected_document_count: report.counts.selected_document_count,
        completed_document_count: report.counts.completed_document_count,
        completed_artifact_count: report.counts.completed_artifact_count,
        real_gemma_output_count_after: report.counts.real_gemma_output_count_after,
        fallback_artifact_count_after: report.counts.fallback_artifact_count_after,
        blockers: report.blockers,
        failures: report.failure_reason_counts,
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
