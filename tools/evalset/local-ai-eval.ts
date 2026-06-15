import { Client } from 'pg';
import {
  localAiEvalReportSchema,
  type LocalAiEvalReportDto,
} from '../../packages/shared/src/ai/ops.ts';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const maxTechnicalFallbackRate = 0.5;
const minTechnicalGeneratedOutputCount = 5;

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
  generated_output_count: string;
  unsupported_count: string;
  leakage_count: string;
  prep_schema_violation_count: string;
  total_source_refs: string;
  matched_source_refs: string;
  korean_output_count: string;
  p95_latency_ms: string | null;
}

export function computeLocalAiEvalReport(input: {
  tenantId: string;
  caseCount: number;
  deidentifiedCaseCount: number;
  outputCount: number;
  fallbackCount: number;
  generatedOutputCount?: number | undefined;
  unsupportedCount: number;
  leakageCount: number;
  prepSchemaViolationCount: number;
  totalSourceRefs: number;
  matchedSourceRefs: number;
  koreanOutputCount: number;
  p95LatencyMs: number | null;
}): LocalAiEvalReportDto {
  const citationAccuracy =
    input.totalSourceRefs === 0 ? 1 : input.matchedSourceRefs / input.totalSourceRefs;
  const generatedOutputCount =
    input.generatedOutputCount ?? Math.max(input.outputCount - input.fallbackCount, 0);
  const unsupportedClaimRate =
    generatedOutputCount + input.unsupportedCount === 0
      ? 0
      : input.unsupportedCount / (generatedOutputCount + input.unsupportedCount);
  const fallbackRate = input.outputCount === 0 ? 0 : input.fallbackCount / input.outputCount;
  const koreanLegalLanguagePass =
    generatedOutputCount === 0 ? true : input.koreanOutputCount === generatedOutputCount;
  const warnings: string[] = [];
  if (input.caseCount === 0) warnings.push('No evaluation_cases loaded for tenant.');
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
  if (!koreanLegalLanguagePass) warnings.push('Korean legal language heuristic failed.');

  return localAiEvalReportSchema.parse({
    tenantId: input.tenantId,
    caseCount: input.caseCount,
    deidentifiedCaseCount: input.deidentifiedCaseCount,
    completedOutputCount: input.outputCount,
    fallbackArtifactCount: input.fallbackCount,
    generatedOutputCount,
    permissionLeakageCount: input.leakageCount,
    prepSchemaViolationCount: input.prepSchemaViolationCount,
    citationAccuracy,
    unsupportedClaimRate,
    fallbackRate,
    koreanLegalLanguagePass,
    p95LatencyMs: input.p95LatencyMs,
    technicalPass:
      input.outputCount > 0 &&
      generatedOutputCount >= minTechnicalGeneratedOutputCount &&
      input.caseCount === input.deidentifiedCaseCount &&
      input.leakageCount === 0 &&
      input.prepSchemaViolationCount === 0 &&
      citationAccuracy >= 0.98 &&
      unsupportedClaimRate <= 0.05 &&
      fallbackRate <= maxTechnicalFallbackRate &&
      koreanLegalLanguagePass &&
      (input.p95LatencyMs === null || input.p95LatencyMs <= 30000),
    warnings,
  });
}

export async function collectLocalAiEval(input: LocalAiEvalInput): Promise<LocalAiEvalReportDto> {
  const client = new Client({ connectionString: input.databaseUrl ?? defaultDatabaseUrl });
  await client.connect();
  try {
    const cases = await countEvaluationCases(client, input.tenantId);
    const artifacts = await collectArtifactEval(client, input.tenantId);
    return computeLocalAiEvalReport({
      tenantId: input.tenantId,
      caseCount: Number(cases.total_count),
      deidentifiedCaseCount: Number(cases.deidentified_count),
      outputCount: Number(artifacts.output_count),
      fallbackCount: Number(artifacts.fallback_count),
      generatedOutputCount: Number(artifacts.generated_output_count),
      unsupportedCount: Number(artifacts.unsupported_count),
      leakageCount: Number(artifacts.leakage_count),
      prepSchemaViolationCount: Number(artifacts.prep_schema_violation_count),
      totalSourceRefs: Number(artifacts.total_source_refs),
      matchedSourceRefs: Number(artifacts.matched_source_refs),
      koreanOutputCount: Number(artifacts.korean_output_count),
      p95LatencyMs:
        artifacts.p95_latency_ms === null ? null : Math.round(Number(artifacts.p95_latency_ms)),
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
        (SELECT count(*)::text FROM generated) AS generated_output_count,
        (
          SELECT count(*)::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND status = 'blocked'
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
        ) AS p95_latency_ms
    `,
    [tenantId],
  );
  return (
    result.rows[0] ?? {
      output_count: '0',
      fallback_count: '0',
      generated_output_count: '0',
      unsupported_count: '0',
      leakage_count: '0',
      prep_schema_violation_count: '0',
      total_source_refs: '0',
      matched_source_refs: '0',
      korean_output_count: '0',
      p95_latency_ms: null,
    }
  );
}
