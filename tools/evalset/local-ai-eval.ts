import { Client } from 'pg';
import {
  localAiEvalReportSchema,
  type LocalAiEvalReportDto,
} from '../../packages/shared/src/ai/ops.ts';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

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
  unsupported_count: string;
  leakage_count: string;
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
  unsupportedCount: number;
  leakageCount: number;
  totalSourceRefs: number;
  matchedSourceRefs: number;
  koreanOutputCount: number;
  p95LatencyMs: number | null;
}): LocalAiEvalReportDto {
  const citationAccuracy =
    input.totalSourceRefs === 0 ? 1 : input.matchedSourceRefs / input.totalSourceRefs;
  const unsupportedClaimRate =
    input.outputCount === 0 ? 0 : input.unsupportedCount / input.outputCount;
  const koreanLegalLanguagePass =
    input.outputCount === 0 ? true : input.koreanOutputCount === input.outputCount;
  const warnings: string[] = [];
  if (input.caseCount === 0) warnings.push('No evaluation_cases loaded for tenant.');
  if (input.outputCount === 0) warnings.push('No completed local AI outputs observed.');
  if (input.caseCount !== input.deidentifiedCaseCount) {
    warnings.push('Evaluation cases include non-deidentified rows.');
  }
  if (input.leakageCount > 0) warnings.push('Permission or raw-payload leakage observed.');
  if (!koreanLegalLanguagePass) warnings.push('Korean legal language heuristic failed.');

  return localAiEvalReportSchema.parse({
    tenantId: input.tenantId,
    caseCount: input.caseCount,
    deidentifiedCaseCount: input.deidentifiedCaseCount,
    permissionLeakageCount: input.leakageCount,
    citationAccuracy,
    unsupportedClaimRate,
    koreanLegalLanguagePass,
    p95LatencyMs: input.p95LatencyMs,
    technicalPass:
      input.caseCount === input.deidentifiedCaseCount &&
      input.leakageCount === 0 &&
      citationAccuracy >= 0.98 &&
      unsupportedClaimRate <= 0.05 &&
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
      unsupportedCount: Number(artifacts.unsupported_count),
      leakageCount: Number(artifacts.leakage_count),
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
        SELECT ai_prep_artifact_id, payload_json, source_chunk_ids, latency_ms
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND status = 'completed'
          AND is_stale = false
      ),
      refs AS (
        SELECT c.ai_prep_artifact_id, ref.value AS source_ref,
          ARRAY(
            SELECT 'chunk:' || chunk_id::text
            FROM unnest(c.source_chunk_ids) AS chunk_id
          ) AS allowed_refs
        FROM completed c
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(c.payload_json->'source_refs', '[]'::jsonb)
        ) AS ref(value)
      )
      SELECT
        (SELECT count(*)::text FROM completed) AS output_count,
        (
          SELECT count(*)::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND status = 'blocked'
            AND failure_reason_code = 'UNSUPPORTED_CLAIM'
        ) AS unsupported_count,
        (
          SELECT count(*)::text
          FROM ai_prep_artifacts
          WHERE tenant_id = $1
            AND (
              payload_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'prompt', 'response']
            )
        ) AS leakage_count,
        (SELECT count(*)::text FROM refs) AS total_source_refs,
        (
          SELECT count(*)::text
          FROM refs
          WHERE source_ref = ANY(allowed_refs)
        ) AS matched_source_refs,
        (
          SELECT count(*)::text
          FROM completed
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
      unsupported_count: '0',
      leakage_count: '0',
      total_source_refs: '0',
      matched_source_refs: '0',
      korean_output_count: '0',
      p95_latency_ms: null,
    }
  );
}
