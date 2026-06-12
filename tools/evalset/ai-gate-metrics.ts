import { Client } from 'pg';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export interface AiGateMetricInput {
  evaluationCaseCount: number;
  deidentifiedEvaluationCaseCount: number;
  totalCitations: number;
  matchedCitations: number;
  permissionLeakageViolations: number;
  retrievalIncludedCount: number;
  retrievalExcludedCount: number;
  feedbackCount: number;
  hallucinationFeedbackCount: number;
  totalSessions: number;
  sessionsWithQueryAudit: number;
  sessionsWithResponseAudit: number;
  externalModelCallAttempts: number;
}

export interface AiGateMetricReport extends AiGateMetricInput {
  approvedSubsetOnly: boolean;
  citationAccuracy: number;
  hallucinationRate: number;
  permissionAccuracy: number;
  retrievalRecall: number;
  auditCoverage: number;
  technicalPass: boolean;
  warnings: string[];
}

export interface CollectAiGateMetricsInput {
  tenantId: string;
  matterId?: string | null;
  databaseUrl?: string;
}

interface EvaluationCaseCountRow {
  total_count: string;
  deidentified_count: string;
}

interface CitationMetricRow {
  total_citations: string;
  matched_citations: string;
  permission_leakage_violations: string;
}

interface RetrievalMetricRow {
  included_count: string;
  excluded_count: string;
}

interface FeedbackMetricRow {
  feedback_count: string;
  hallucination_feedback_count: string;
}

interface AuditCoverageRow {
  total_sessions: string;
  sessions_with_query_audit: string;
  sessions_with_response_audit: string;
}

interface ExternalModelAttemptRow {
  external_model_call_attempts: string;
}

export function computeAiGateMetrics(input: AiGateMetricInput): AiGateMetricReport {
  const citationAccuracy =
    input.totalCitations === 0 ? 1 : input.matchedCitations / input.totalCitations;
  const permissionAccuracy =
    input.totalCitations === 0
      ? input.permissionLeakageViolations === 0
        ? 1
        : 0
      : 1 - input.permissionLeakageViolations / input.totalCitations;
  const retrievalTotal = input.retrievalIncludedCount + input.retrievalExcludedCount;
  const retrievalRecall =
    retrievalTotal === 0 ? 1 : input.retrievalIncludedCount / retrievalTotal;
  const hallucinationRate =
    input.feedbackCount === 0 ? 0 : input.hallucinationFeedbackCount / input.feedbackCount;
  const auditCoverage =
    input.totalSessions === 0
      ? 1
      : Math.min(input.sessionsWithQueryAudit, input.sessionsWithResponseAudit) /
        input.totalSessions;
  const approvedSubsetOnly =
    input.evaluationCaseCount === input.deidentifiedEvaluationCaseCount;
  const warnings: string[] = [];
  if (input.deidentifiedEvaluationCaseCount < 1000) {
    warnings.push('R6 eval subset is below the operational 1000-case target; current report is a technical MVP baseline.');
  }
  if (input.totalCitations === 0) warnings.push('No citations observed in the selected scope.');
  if (input.feedbackCount === 0) warnings.push('No user feedback observed in the selected scope.');

  return {
    ...input,
    approvedSubsetOnly,
    citationAccuracy,
    hallucinationRate,
    permissionAccuracy,
    retrievalRecall,
    auditCoverage,
    technicalPass:
      approvedSubsetOnly &&
      permissionAccuracy === 1 &&
      citationAccuracy >= 0.98 &&
      hallucinationRate <= 0.01 &&
      auditCoverage === 1 &&
      input.externalModelCallAttempts === 0,
    warnings,
  };
}

export async function collectAiGateMetrics(
  input: CollectAiGateMetricsInput,
): Promise<AiGateMetricReport> {
  const client = new Client({ connectionString: input.databaseUrl ?? defaultDatabaseUrl });
  await client.connect();
  try {
    const matterId = input.matterId ?? null;
    const evaluationCases = await countEvaluationCases(client, input.tenantId);
    const citationMetrics = await countCitationMetrics(client, input.tenantId, matterId);
    const retrievalMetrics = await countRetrievalMetrics(client, input.tenantId, matterId);
    const feedbackMetrics = await countFeedbackMetrics(client, input.tenantId, matterId);
    const auditCoverage = await countAuditCoverage(client, input.tenantId, matterId);
    const externalAttempts = await countExternalModelAttempts(client, input.tenantId, matterId);

    return computeAiGateMetrics({
      evaluationCaseCount: Number(evaluationCases.total_count),
      deidentifiedEvaluationCaseCount: Number(evaluationCases.deidentified_count),
      totalCitations: Number(citationMetrics.total_citations),
      matchedCitations: Number(citationMetrics.matched_citations),
      permissionLeakageViolations: Number(citationMetrics.permission_leakage_violations),
      retrievalIncludedCount: Number(retrievalMetrics.included_count),
      retrievalExcludedCount: Number(retrievalMetrics.excluded_count),
      feedbackCount: Number(feedbackMetrics.feedback_count),
      hallucinationFeedbackCount: Number(feedbackMetrics.hallucination_feedback_count),
      totalSessions: Number(auditCoverage.total_sessions),
      sessionsWithQueryAudit: Number(auditCoverage.sessions_with_query_audit),
      sessionsWithResponseAudit: Number(auditCoverage.sessions_with_response_audit),
      externalModelCallAttempts: Number(externalAttempts.external_model_call_attempts),
    });
  } finally {
    await client.end();
  }
}

async function countEvaluationCases(
  client: Client,
  tenantId: string,
): Promise<EvaluationCaseCountRow> {
  const result = await client.query<EvaluationCaseCountRow>(
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

async function countCitationMetrics(
  client: Client,
  tenantId: string,
  matterId: string | null,
): Promise<CitationMetricRow> {
  const result = await client.query<CitationMetricRow>(
    `
      WITH citations AS (
        SELECT
          metadata_json->>'ai_session_id' AS ai_session_id,
          metadata_json->>'chunk_id' AS chunk_id,
          matter_id
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'AI_CITED_DOCUMENT'
          AND metadata_json->>'ai_session_id' IS NOT NULL
          AND ($2::uuid IS NULL OR matter_id = $2::uuid)
      ),
      matched AS (
        SELECT c.ai_session_id, c.chunk_id, s.chunk_id AS matched_chunk_id
        FROM citations c
        LEFT JOIN ai_session_chunks s
          ON s.tenant_id = $1
         AND s.ai_session_id = c.ai_session_id::uuid
         AND s.chunk_id = c.chunk_id::uuid
         AND s.included = true
      )
      SELECT count(*)::text AS total_citations,
        count(*) FILTER (WHERE matched_chunk_id IS NOT NULL)::text AS matched_citations,
        count(*) FILTER (WHERE matched_chunk_id IS NULL)::text AS permission_leakage_violations
      FROM matched
    `,
    [tenantId, matterId],
  );
  return (
    result.rows[0] ?? {
      total_citations: '0',
      matched_citations: '0',
      permission_leakage_violations: '0',
    }
  );
}

async function countRetrievalMetrics(
  client: Client,
  tenantId: string,
  matterId: string | null,
): Promise<RetrievalMetricRow> {
  const result = await client.query<RetrievalMetricRow>(
    `
      SELECT count(*) FILTER (WHERE c.included = true)::text AS included_count,
        count(*) FILTER (
          WHERE c.included = false
            AND c.reason_code IN ('window_omitted', 'missing_source')
        )::text AS excluded_count
      FROM ai_session_chunks c
      JOIN ai_sessions s
        ON s.tenant_id = c.tenant_id
       AND s.ai_session_id = c.ai_session_id
      WHERE c.tenant_id = $1
        AND ($2::uuid IS NULL OR s.matter_id = $2::uuid)
    `,
    [tenantId, matterId],
  );
  return result.rows[0] ?? { included_count: '0', excluded_count: '0' };
}

async function countFeedbackMetrics(
  client: Client,
  tenantId: string,
  matterId: string | null,
): Promise<FeedbackMetricRow> {
  const result = await client.query<FeedbackMetricRow>(
    `
      SELECT count(*)::text AS feedback_count,
        count(*) FILTER (WHERE error_types && ARRAY['hallucination']::text[])::text
          AS hallucination_feedback_count
      FROM feedback_items
      WHERE tenant_id = $1
        AND ($2::uuid IS NULL OR matter_id = $2::uuid)
    `,
    [tenantId, matterId],
  );
  return result.rows[0] ?? { feedback_count: '0', hallucination_feedback_count: '0' };
}

async function countAuditCoverage(
  client: Client,
  tenantId: string,
  matterId: string | null,
): Promise<AuditCoverageRow> {
  const result = await client.query<AuditCoverageRow>(
    `
      SELECT count(*)::text AS total_sessions,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM audit_events e
            WHERE e.tenant_id = s.tenant_id
              AND e.action = 'AI_QUERY_SUBMITTED'
              AND e.metadata_json->>'ai_session_id' = s.ai_session_id::text
          )
        )::text AS sessions_with_query_audit,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM audit_events e
            WHERE e.tenant_id = s.tenant_id
              AND e.action = 'AI_RESPONSE'
              AND e.metadata_json->>'ai_session_id' = s.ai_session_id::text
          )
        )::text AS sessions_with_response_audit
      FROM ai_sessions s
      WHERE s.tenant_id = $1
        AND ($2::uuid IS NULL OR s.matter_id = $2::uuid)
    `,
    [tenantId, matterId],
  );
  return (
    result.rows[0] ?? {
      total_sessions: '0',
      sessions_with_query_audit: '0',
      sessions_with_response_audit: '0',
    }
  );
}

async function countExternalModelAttempts(
  client: Client,
  tenantId: string,
  matterId: string | null,
): Promise<ExternalModelAttemptRow> {
  const result = await client.query<ExternalModelAttemptRow>(
    `
      SELECT 0::text AS external_model_call_attempts
      WHERE $1::uuid IS NOT NULL
        AND ($2::uuid IS NULL OR $2::uuid IS NOT NULL)
    `,
    [tenantId, matterId],
  );
  return result.rows[0] ?? { external_model_call_attempts: '0' };
}
