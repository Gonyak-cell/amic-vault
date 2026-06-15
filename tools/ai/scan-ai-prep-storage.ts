import { Client } from 'pg';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

interface ScanRow {
  artifact_count: string;
  completed_count: string;
  fallback_payload_warning_count: string;
  fallback_audit_reason_count: string;
  raw_payload_key_count: string;
  raw_audit_metadata_key_count: string;
  legal_claim_count: string;
  missing_claim_source_ref_count: string;
  source_ref_mismatch_count: string;
  external_model_route_count: string;
  disallowed_artifact_kind_count: string;
}

interface ScanReport {
  tenantId: string;
  artifactCount: number;
  completedCount: number;
  fallbackPayloadWarningCount: number;
  fallbackAuditReasonCount: number;
  rawPayloadKeyCount: number;
  rawAuditMetadataKeyCount: number;
  legalClaimCount: number;
  missingClaimSourceRefCount: number;
  sourceRefMismatchCount: number;
  externalModelRouteCount: number;
  disallowedArtifactKindCount: number;
  technicalPass: boolean;
}

const tenantId = readArg('--tenant-id') ?? '11111111-1111-4111-8111-111111111111';
const databaseUrl = readArg('--database-url') ?? defaultDatabaseUrl;

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const row = await collectScan(client, tenantId);
  const report = toReport(tenantId, row);
  console.log(JSON.stringify(report, null, 2));
  if (!report.technicalPass) process.exitCode = 1;
} finally {
  await client.end();
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function collectScan(client: Client, tenantId: string): Promise<ScanRow> {
  const result = await client.query<ScanRow>(
    `
      WITH artifacts AS (
        SELECT ai_prep_artifact_id, artifact_kind, status, model_route, payload_json
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND is_stale = false
      ),
      claims AS (
        SELECT a.ai_prep_artifact_id, a.artifact_kind, a.payload_json,
          claim.value AS claim_json,
          claim.value->>'kind' AS claim_kind
        FROM artifacts a
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(a.payload_json->'claims') = 'array'
            THEN a.payload_json->'claims'
            ELSE '[]'::jsonb
          END
        ) AS claim(value)
        WHERE a.status = 'completed'
      ),
      claim_source_refs AS (
        SELECT c.ai_prep_artifact_id, ref.value AS source_ref
        FROM claims c
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(c.claim_json->'source_refs') = 'array'
            THEN c.claim_json->'source_refs'
            ELSE '[]'::jsonb
          END
        ) AS ref(value)
      )
      SELECT
        (SELECT count(*)::text FROM artifacts) AS artifact_count,
        (SELECT count(*)::text FROM artifacts WHERE status = 'completed') AS completed_count,
        (
          SELECT count(*)::text
          FROM artifacts
          WHERE status = 'completed'
            AND jsonb_typeof(payload_json->'warnings') = 'array'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(payload_json->'warnings') AS warning(value)
              WHERE warning.value LIKE 'LOCAL_GEMMA_%_FALLBACK'
            )
        ) AS fallback_payload_warning_count,
        (
          SELECT count(*)::text
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'AI_PREP_COMPLETED'
            AND metadata_json->>'generation_result' = 'fallback'
            AND metadata_json ? 'fallback_reason_code'
        ) AS fallback_audit_reason_count,
        (
          SELECT count(*)::text
          FROM artifacts
          WHERE payload_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'prompt', 'response']
        ) AS raw_payload_key_count,
        (
          SELECT count(*)::text
          FROM audit_events
          WHERE tenant_id = $1
            AND action LIKE 'AI_PREP_%'
            AND metadata_json ?| ARRAY['body', 'content', 'text', 'snippet', 'raw', 'prompt', 'response']
        ) AS raw_audit_metadata_key_count,
        (
          SELECT count(*)::text
          FROM claims
          WHERE claim_kind IN ('risk', 'issue', 'clause')
            OR claim_json->>'is_legal_conclusion' = 'true'
        ) AS legal_claim_count,
        (
          SELECT count(*)::text
          FROM claims
          WHERE jsonb_typeof(claim_json->'source_refs') <> 'array'
            OR jsonb_array_length(claim_json->'source_refs') = 0
        ) AS missing_claim_source_ref_count,
        (
          SELECT count(*)::text
          FROM claim_source_refs csr
          WHERE csr.source_ref !~ '^chunk:[A-Za-z0-9:_-]+$'
            OR NOT EXISTS (
              SELECT 1
              FROM claims c
              CROSS JOIN LATERAL jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(c.payload_json->'source_refs') = 'array'
                  THEN c.payload_json->'source_refs'
                  ELSE '[]'::jsonb
                END
              ) AS payload_ref(value)
              WHERE c.ai_prep_artifact_id = csr.ai_prep_artifact_id
                AND payload_ref.value = csr.source_ref
            )
        ) AS source_ref_mismatch_count,
        (
          SELECT count(*)::text
          FROM artifacts
          WHERE model_route <> 'local_gemma'
        ) AS external_model_route_count,
        (
          SELECT count(*)::text
          FROM artifacts
          WHERE artifact_kind NOT IN (
            'document_profile',
            'key_fields',
            'date_facts',
            'people_organizations',
            'keyword_tags',
            'filing_suggestions',
            'source_outline',
            'retrieval_hints'
          )
        ) AS disallowed_artifact_kind_count
    `,
    [tenantId],
  );
  return (
    result.rows[0] ?? {
      artifact_count: '0',
      completed_count: '0',
      fallback_payload_warning_count: '0',
      fallback_audit_reason_count: '0',
      raw_payload_key_count: '0',
      raw_audit_metadata_key_count: '0',
      legal_claim_count: '0',
      missing_claim_source_ref_count: '0',
      source_ref_mismatch_count: '0',
      external_model_route_count: '0',
      disallowed_artifact_kind_count: '0',
    }
  );
}

function toReport(tenantId: string, row: ScanRow): ScanReport {
  const report = {
    tenantId,
    artifactCount: Number(row.artifact_count),
    completedCount: Number(row.completed_count),
    fallbackPayloadWarningCount: Number(row.fallback_payload_warning_count),
    fallbackAuditReasonCount: Number(row.fallback_audit_reason_count),
    rawPayloadKeyCount: Number(row.raw_payload_key_count),
    rawAuditMetadataKeyCount: Number(row.raw_audit_metadata_key_count),
    legalClaimCount: Number(row.legal_claim_count),
    missingClaimSourceRefCount: Number(row.missing_claim_source_ref_count),
    sourceRefMismatchCount: Number(row.source_ref_mismatch_count),
    externalModelRouteCount: Number(row.external_model_route_count),
    disallowedArtifactKindCount: Number(row.disallowed_artifact_kind_count),
  };
  return {
    ...report,
    technicalPass:
      report.completedCount >= 20 &&
      report.rawPayloadKeyCount === 0 &&
      report.rawAuditMetadataKeyCount === 0 &&
      report.legalClaimCount === 0 &&
      report.missingClaimSourceRefCount === 0 &&
      report.sourceRefMismatchCount === 0 &&
      report.externalModelRouteCount === 0 &&
      report.disallowedArtifactKindCount === 0,
  };
}
