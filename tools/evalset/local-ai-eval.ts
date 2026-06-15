import { Client } from 'pg';
import {
  localAiEvalReportSchema,
  type LocalAiEvalArtifactKindMetricDto,
  type LocalAiEvalReportDto,
} from '../../packages/shared/src/ai/ops.ts';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const maxTechnicalFallbackRate = 0.5;
const maxTechnicalRejectedRate = 0.05;
const maxTechnicalPendingAgeSeconds = 900;
const minTechnicalEvaluationCaseCount = 100;
const minTechnicalGeneratedOutputCount = 5;
const aiPrepArtifactKinds = [
  'document_profile',
  'key_fields',
  'date_facts',
  'people_organizations',
  'keyword_tags',
  'filing_suggestions',
  'source_outline',
  'retrieval_hints',
] as const;
type AiPrepArtifactKind = (typeof aiPrepArtifactKinds)[number];
const minCompletedByArtifactKind: Record<AiPrepArtifactKind, number> = {
  document_profile: 20,
  key_fields: 0,
  date_facts: 0,
  people_organizations: 0,
  keyword_tags: 0,
  filing_suggestions: 0,
  source_outline: 0,
  retrieval_hints: 0,
};

export interface LocalAiEvalInput {
  tenantId: string;
  databaseUrl?: string | undefined;
}

interface EvaluationCaseRow {
  total_count: string;
  deidentified_count: string;
}

interface ArtifactEvalRow {
  output_count: string;
  fallback_count: string;
  rejected_count: string;
  generated_output_count: string;
  unsupported_count: string;
  leakage_count: string;
  prep_schema_violation_count: string;
  total_source_refs: string;
  matched_source_refs: string;
  korean_output_count: string;
  p95_latency_ms: string | null;
  pending_count: string;
  max_pending_age_seconds: string | null;
}

interface ArtifactKindEvalRow {
  artifact_kind: AiPrepArtifactKind;
  completed_count: string;
  fallback_count: string;
  rejected_count: string;
  generated_output_count: string;
  p95_latency_ms: string | null;
}

export function computeLocalAiEvalReport(input: {
  tenantId: string;
  caseCount: number;
  deidentifiedCaseCount: number;
  outputCount: number;
  fallbackCount: number;
  rejectedCount?: number | undefined;
  generatedOutputCount?: number | undefined;
  unsupportedCount: number;
  leakageCount: number;
  prepSchemaViolationCount: number;
  totalSourceRefs: number;
  matchedSourceRefs: number;
  koreanOutputCount: number;
  p95LatencyMs: number | null;
  pendingPrepCount?: number | undefined;
  maxPendingAgeSeconds?: number | null | undefined;
  artifactKindMetrics?: readonly LocalAiEvalArtifactKindMetricDto[] | undefined;
}): LocalAiEvalReportDto {
  const citationAccuracy =
    input.totalSourceRefs === 0 ? 1 : input.matchedSourceRefs / input.totalSourceRefs;
  const generatedOutputCount =
    input.generatedOutputCount ?? Math.max(input.outputCount - input.fallbackCount, 0);
  const rejectedOutputCount = input.rejectedCount ?? 0;
  const unsupportedClaimRate =
    generatedOutputCount + input.unsupportedCount + rejectedOutputCount === 0
      ? 0
      : (input.unsupportedCount + rejectedOutputCount) /
        (generatedOutputCount + input.unsupportedCount + rejectedOutputCount);
  const fallbackRate = input.outputCount === 0 ? 0 : input.fallbackCount / input.outputCount;
  const rejectedRate =
    input.outputCount + rejectedOutputCount === 0
      ? 0
      : rejectedOutputCount / (input.outputCount + rejectedOutputCount);
  const koreanLegalLanguagePass =
    generatedOutputCount === 0 ? true : input.koreanOutputCount === generatedOutputCount;
  const pendingPrepCount = input.pendingPrepCount ?? 0;
  const maxPendingAgeSeconds = input.maxPendingAgeSeconds ?? null;
  const artifactKindMetrics = [...(input.artifactKindMetrics ?? [])];
  const warnings: string[] = [];
  if (input.caseCount === 0) warnings.push('No evaluation_cases loaded for tenant.');
  if (input.caseCount < minTechnicalEvaluationCaseCount) {
    warnings.push('Deidentified local AI eval corpus is below the 100-case technical threshold.');
  }
  if (input.outputCount === 0) warnings.push('No completed local AI outputs observed.');
  if (generatedOutputCount < minTechnicalGeneratedOutputCount) {
    warnings.push('Insufficient non-fallback generated local AI outputs observed.');
  }
  if (input.caseCount !== input.deidentifiedCaseCount) {
    warnings.push('Evaluation cases include non-deidentified rows.');
  }
  if (input.leakageCount > 0) warnings.push('Permission or raw-payload leakage observed.');
  if (input.prepSchemaViolationCount > 0) warnings.push('Prep artifact schema violations observed.');
  if (fallbackRate > maxTechnicalFallbackRate) {
    warnings.push('Fallback artifact rate exceeds the technical threshold.');
  }
  if (unsupportedClaimRate > 0.05) {
    warnings.push('Unsupported or rejected prep output rate exceeds the technical threshold.');
  }
  if (rejectedRate > maxTechnicalRejectedRate) {
    warnings.push('Rejected prep artifact rate exceeds the technical threshold.');
  }
  if (
    maxPendingAgeSeconds !== null &&
    pendingPrepCount > 0 &&
    maxPendingAgeSeconds > maxTechnicalPendingAgeSeconds
  ) {
    warnings.push('AI prep queue age exceeds the technical threshold.');
  }
  if (artifactKindMetrics.some((metric) => !metric.technicalPass)) {
    warnings.push('Per-artifact local AI prep threshold failed.');
  }
  if (!koreanLegalLanguagePass) warnings.push('Korean legal language heuristic failed.');

  return localAiEvalReportSchema.parse({
    tenantId: input.tenantId,
    caseCount: input.caseCount,
    deidentifiedCaseCount: input.deidentifiedCaseCount,
    completedOutputCount: input.outputCount,
    fallbackArtifactCount: input.fallbackCount,
    rejectedOutputCount,
    generatedOutputCount,
    permissionLeakageCount: input.leakageCount,
    prepSchemaViolationCount: input.prepSchemaViolationCount,
    citationAccuracy,
    unsupportedClaimRate,
    fallbackRate,
    rejectedRate,
    koreanLegalLanguagePass,
    p95LatencyMs: input.p95LatencyMs,
    pendingPrepCount,
    maxPendingAgeSeconds,
    artifactKindMetrics,
    technicalPass:
      input.outputCount > 0 &&
      input.caseCount >= minTechnicalEvaluationCaseCount &&
      generatedOutputCount >= minTechnicalGeneratedOutputCount &&
      input.caseCount === input.deidentifiedCaseCount &&
      input.leakageCount === 0 &&
      input.prepSchemaViolationCount === 0 &&
      citationAccuracy >= 0.98 &&
      unsupportedClaimRate <= 0.05 &&
      fallbackRate <= maxTechnicalFallbackRate &&
      rejectedRate <= maxTechnicalRejectedRate &&
      koreanLegalLanguagePass &&
      (input.p95LatencyMs === null || input.p95LatencyMs <= 30000) &&
      (maxPendingAgeSeconds === null ||
        pendingPrepCount === 0 ||
        maxPendingAgeSeconds <= maxTechnicalPendingAgeSeconds) &&
      artifactKindMetrics.every((metric) => metric.technicalPass),
    warnings,
  });
}

export async function collectLocalAiEval(input: LocalAiEvalInput): Promise<LocalAiEvalReportDto> {
  const client = new Client({ connectionString: input.databaseUrl ?? defaultDatabaseUrl });
  await client.connect();
  try {
    const cases = await countEvaluationCases(client, input.tenantId);
    const artifacts = await collectArtifactEval(client, input.tenantId);
    const artifactKindMetrics = await collectArtifactKindMetrics(client, input.tenantId);
    return computeLocalAiEvalReport({
      tenantId: input.tenantId,
      caseCount: Number(cases.total_count),
      deidentifiedCaseCount: Number(cases.deidentified_count),
      outputCount: Number(artifacts.output_count),
      fallbackCount: Number(artifacts.fallback_count),
      rejectedCount: Number(artifacts.rejected_count),
      generatedOutputCount: Number(artifacts.generated_output_count),
      unsupportedCount: Number(artifacts.unsupported_count),
      leakageCount: Number(artifacts.leakage_count),
      prepSchemaViolationCount: Number(artifacts.prep_schema_violation_count),
      totalSourceRefs: Number(artifacts.total_source_refs),
      matchedSourceRefs: Number(artifacts.matched_source_refs),
      koreanOutputCount: Number(artifacts.korean_output_count),
      p95LatencyMs:
        artifacts.p95_latency_ms === null ? null : Math.round(Number(artifacts.p95_latency_ms)),
      pendingPrepCount: Number(artifacts.pending_count),
      maxPendingAgeSeconds:
        artifacts.max_pending_age_seconds === null
          ? null
          : Math.round(Number(artifacts.max_pending_age_seconds)),
      artifactKindMetrics,
    });
  } finally {
    await client.end();
  }
}

async function countEvaluationCases(
  client: Client,
  tenantId: string,
): Promise<EvaluationCaseRow> {
  const result = await client.query<EvaluationCaseRow>(
    `
      SELECT count(*)::text AS total_count,
        count(*) FILTER (WHERE deidentified = true)::text AS deidentified_count
      FROM evaluation_cases
      WHERE tenant_id = $1
    `,
    [tenantId],
  );
  return result.rows[0] ?? { total_count: '0', deidentified_count: '0' };
}

async function collectArtifactEval(client: Client, tenantId: string): Promise<ArtifactEvalRow> {
  const result = await client.query<ArtifactEvalRow>(
    `
      WITH completed AS (
        SELECT ai_prep_artifact_id, artifact_kind, payload_json, source_chunk_ids, latency_ms
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND status = 'completed'
          AND is_stale = false
      ),
      fallback_audits AS (
        SELECT DISTINCT target_id AS ai_prep_artifact_id
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'AI_PREP_COMPLETED'
          AND target_type = 'ai_prep_artifact'
          AND target_id IS NOT NULL
          AND metadata_json->>'generation_result' = 'fallback'
          AND metadata_json ? 'fallback_reason_code'
      ),
      completed_with_signal AS (
        SELECT c.*,
          (
            (
              jsonb_typeof(c.payload_json->'warnings') = 'array'
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(c.payload_json->'warnings') AS warning(value)
                WHERE warning.value LIKE 'LOCAL_GEMMA_%_FALLBACK'
              )
            )
            OR fa.ai_prep_artifact_id IS NOT NULL
          ) AS is_fallback
        FROM completed c
        LEFT JOIN fallback_audits fa
          ON fa.ai_prep_artifact_id = c.ai_prep_artifact_id
      ),
      generated AS (
        SELECT *
        FROM completed_with_signal
        WHERE is_fallback = false
      ),
      refs AS (
        SELECT c.ai_prep_artifact_id, ref.value AS source_ref,
          ARRAY(
            SELECT 'chunk:' || chunk_id::text
            FROM unnest(c.source_chunk_ids) AS chunk_id
          ) AS allowed_refs
        FROM generated c
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(c.payload_json->'source_refs') = 'array'
            THEN c.payload_json->'source_refs'
            ELSE '[]'::jsonb
          END
        ) AS ref(value)
      ),
      claim_refs AS (
        SELECT c.ai_prep_artifact_id, c.artifact_kind,
          c.payload_json->'source_refs' AS payload_source_refs,
          claim.value AS claim_json,
          claim.value->>'kind' AS claim_kind
        FROM completed c
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(c.payload_json->'claims') = 'array'
            THEN c.payload_json->'claims'
            ELSE '[]'::jsonb
          END
        ) AS claim(value)
      )
      SELECT
        (SELECT count(*)::text FROM completed) AS output_count,
        (SELECT count(*)::text FROM completed_with_signal WHERE is_fallback = true) AS fallback_count,
        (
          SELECT count(*)::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND status = 'rejected'
            AND is_stale = false
        ) AS rejected_count,
        (SELECT count(*)::text FROM generated) AS generated_output_count,
        (
          SELECT count(*)::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND status IN ('blocked', 'rejected')
            AND failure_reason_code IN ('UNSUPPORTED_CLAIM', 'AI_PREP_VALIDATION_FAILED')
        ) AS unsupported_count,
        (
          SELECT count(*)::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND (
              payload_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'prompt', 'response']
            )
        ) AS leakage_count,
        (
          SELECT count(DISTINCT c.ai_prep_artifact_id)::text
          FROM completed c
          WHERE jsonb_typeof(c.payload_json) <> 'object'
            OR CASE
              WHEN jsonb_typeof(c.payload_json->'source_refs') = 'array'
              THEN jsonb_array_length(c.payload_json->'source_refs') = 0
              ELSE true
            END
            OR CASE
              WHEN jsonb_typeof(c.payload_json->'claims') = 'array'
              THEN jsonb_array_length(c.payload_json->'claims') = 0
              ELSE true
            END
            OR EXISTS (
              SELECT 1
              FROM claim_refs cr
              WHERE cr.ai_prep_artifact_id = c.ai_prep_artifact_id
                AND (
                  cr.claim_kind IS NULL
                  OR cr.claim_kind IN ('risk', 'issue', 'clause')
                  OR cr.claim_json->>'is_legal_conclusion' = 'true'
                  OR CASE
                    WHEN jsonb_typeof(cr.claim_json->'source_refs') = 'array'
                    THEN jsonb_array_length(cr.claim_json->'source_refs') = 0
                    ELSE true
                  END
                  OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(
                      CASE
                        WHEN jsonb_typeof(cr.claim_json->'source_refs') = 'array'
                        THEN cr.claim_json->'source_refs'
                        ELSE '[]'::jsonb
                      END
                    ) AS claim_ref(value)
                    WHERE claim_ref.value IS NULL
                      OR claim_ref.value !~ '^chunk:[A-Za-z0-9:_-]+$'
                      OR NOT EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements_text(
                        CASE
                          WHEN jsonb_typeof(cr.payload_source_refs) = 'array'
                          THEN cr.payload_source_refs
                          ELSE '[]'::jsonb
                        END
                      ) AS payload_ref(value)
                      WHERE payload_ref.value = claim_ref.value
                    )
                  )
                  OR NOT coalesce((
                    (cr.artifact_kind = 'document_profile' AND cr.claim_kind IN ('summary', 'key_fact'))
                    OR (cr.artifact_kind = 'key_fields' AND cr.claim_kind = 'key_fact')
                    OR (cr.artifact_kind = 'date_facts' AND cr.claim_kind IN ('timeline', 'key_fact'))
                    OR (cr.artifact_kind = 'people_organizations' AND cr.claim_kind = 'key_fact')
                    OR (cr.artifact_kind = 'keyword_tags' AND cr.claim_kind = 'key_fact')
                    OR (cr.artifact_kind = 'filing_suggestions' AND cr.claim_kind IN ('answer', 'key_fact'))
                    OR (cr.artifact_kind = 'source_outline' AND cr.claim_kind IN ('summary', 'key_fact'))
                    OR (cr.artifact_kind = 'retrieval_hints' AND cr.claim_kind IN ('question', 'answer', 'key_fact'))
                  ), false)
                )
            )
        ) AS prep_schema_violation_count,
        (SELECT count(*)::text FROM refs) AS total_source_refs,
        (
          SELECT count(*)::text
          FROM refs
          WHERE source_ref = ANY(allowed_refs)
        ) AS matched_source_refs,
        (
          SELECT count(*)::text
          FROM generated
          WHERE payload_json::text ~ '[가-힣]'
        ) AS korean_output_count,
        (
          SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)::text
          FROM completed
          WHERE latency_ms IS NOT NULL
        ) AS p95_latency_ms,
        (
          SELECT count(*)::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND status = 'pending'
            AND is_stale = false
        ) AS pending_count,
        (
          SELECT floor(extract(epoch FROM now() - min(updated_at)))::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND status = 'pending'
            AND is_stale = false
        ) AS max_pending_age_seconds
    `,
    [tenantId],
  );
  return (
    result.rows[0] ?? {
      output_count: '0',
      fallback_count: '0',
      rejected_count: '0',
      generated_output_count: '0',
      unsupported_count: '0',
      leakage_count: '0',
      prep_schema_violation_count: '0',
      total_source_refs: '0',
      matched_source_refs: '0',
      korean_output_count: '0',
      p95_latency_ms: null,
      pending_count: '0',
      max_pending_age_seconds: null,
    }
  );
}

async function collectArtifactKindMetrics(
  client: Client,
  tenantId: string,
): Promise<LocalAiEvalArtifactKindMetricDto[]> {
  const result = await client.query<ArtifactKindEvalRow>(
    `
      WITH base AS (
        SELECT ai_prep_artifact_id, artifact_kind, status, payload_json, latency_ms
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND is_stale = false
      ),
      fallback_audits AS (
        SELECT DISTINCT target_id AS ai_prep_artifact_id
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'AI_PREP_COMPLETED'
          AND target_type = 'ai_prep_artifact'
          AND target_id IS NOT NULL
          AND metadata_json->>'generation_result' = 'fallback'
          AND metadata_json ? 'fallback_reason_code'
      ),
      with_signal AS (
        SELECT b.*,
          (
            b.status = 'completed'
            AND (
              (
                jsonb_typeof(b.payload_json->'warnings') = 'array'
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(b.payload_json->'warnings') AS warning(value)
                  WHERE warning.value LIKE 'LOCAL_GEMMA_%_FALLBACK'
                )
              )
              OR fa.ai_prep_artifact_id IS NOT NULL
            )
          ) AS is_fallback
        FROM base b
        LEFT JOIN fallback_audits fa
          ON fa.ai_prep_artifact_id = b.ai_prep_artifact_id
      )
      SELECT artifact_kind,
        count(*) FILTER (WHERE status = 'completed')::text AS completed_count,
        count(*) FILTER (WHERE status = 'completed' AND is_fallback = true)::text AS fallback_count,
        count(*) FILTER (WHERE status = 'rejected')::text AS rejected_count,
        count(*) FILTER (WHERE status = 'completed' AND is_fallback = false)::text AS generated_output_count,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)
          FILTER (WHERE status = 'completed' AND latency_ms IS NOT NULL)::text AS p95_latency_ms
      FROM with_signal
      GROUP BY artifact_kind
    `,
    [tenantId],
  );
  const byKind = new Map(result.rows.map((row) => [row.artifact_kind, row]));
  return aiPrepArtifactKinds.map((artifactKind) => {
    const row = byKind.get(artifactKind);
    const completedCount = Number(row?.completed_count ?? '0');
    const fallbackArtifactCount = Number(row?.fallback_count ?? '0');
    const rejectedOutputCount = Number(row?.rejected_count ?? '0');
    const generatedOutputCount = Number(row?.generated_output_count ?? '0');
    const fallbackRate = completedCount === 0 ? 0 : fallbackArtifactCount / completedCount;
    const rejectedRate =
      completedCount + rejectedOutputCount === 0
        ? 0
        : rejectedOutputCount / (completedCount + rejectedOutputCount);
    const p95LatencyMs =
      row?.p95_latency_ms === null || row?.p95_latency_ms === undefined
        ? null
        : Math.round(Number(row.p95_latency_ms));
    const minimumCompletedCount = minCompletedByArtifactKind[artifactKind];
    return {
      artifactKind,
      minimumCompletedCount,
      completedCount,
      generatedOutputCount,
      fallbackArtifactCount,
      rejectedOutputCount,
      fallbackRate,
      rejectedRate,
      p95LatencyMs,
      technicalPass:
        completedCount >= minimumCompletedCount &&
        fallbackRate <= maxTechnicalFallbackRate &&
        rejectedRate <= maxTechnicalRejectedRate &&
        (p95LatencyMs === null || p95LatencyMs <= 30000),
    };
  });
}
