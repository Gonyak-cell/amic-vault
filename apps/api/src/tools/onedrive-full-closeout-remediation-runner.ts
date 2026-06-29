import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Pool } from 'pg';
import { SearchIndexRepository } from '../modules/search/index/search-index.repository';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const safeRunIdPattern = /^[A-Za-z0-9._-]{3,120}$/;
const safeRefPattern = /^[A-Za-z0-9._-]{3,180}$/;

export interface FullCloseoutRemediationCliArgs {
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
}

interface CandidateRow {
  tenant_id: string;
  document_id: string;
  matter_id: string;
  version_id: string;
  previous_extraction_status: string;
  previous_failure_reason_code: string | null;
  mime_type: string;
  size_bytes: string;
  document_type: string;
}

interface CountsRow {
  active_documents: string;
  canonical_documents: string;
  extraction_ready: string;
  extraction_ocr_pending: string;
  extraction_failed: string;
  search_indexed_documents: string;
  ai_allowed_documents: string;
  active_child_chunks: string;
  real_gemma_outputs: string;
  fallback_payloads: string;
}

interface WorkerResult {
  status: 'completed' | 'failed';
  reasonCode?: string;
}

export function usage(): string {
  return [
    'usage: pnpm onedrive:full-closeout-remediate -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--limit <n>] [--concurrency <n>]',
    '',
    'Converts not-ready imported documents to metadata-only canonical ready text and backfills search index/chunks without storing raw paths, OCR excerpts, object keys, or source document body in receipts.',
  ].join('\n');
}

export function parseFullCloseoutRemediationArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): FullCloseoutRemediationCliArgs {
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
    limit: optionalPositiveInt(argValue(argv, '--limit'), '--limit') ?? 500,
    concurrency: Math.min(optionalPositiveInt(argValue(argv, '--concurrency'), '--concurrency') ?? 4, 16),
  };
}

export async function runFullCloseoutRemediation(args: FullCloseoutRemediationCliArgs) {
  const pool = new Pool({ connectionString: args.databaseUrl, max: args.concurrency + 2 });
  try {
    const tenantId = await findTenantId(pool, args.tenantSlug);
    const before = tenantId ? await collectCounts(pool, tenantId) : emptyCounts();
    const candidates = tenantId ? await collectCandidates(pool, tenantId, args.limit) : [];
    const blockers = validateReadiness(args, tenantId);
    const results =
      args.execute && blockers.length === 0
        ? await runWorkers(pool, args, candidates)
        : ([] as WorkerResult[]);
    const after = tenantId ? await collectCounts(pool, tenantId) : emptyCounts();
    const report = {
      receipt_type: 'full_closeout_metadata_remediation',
      mode: args.dryRun ? 'dry-run' : 'execute',
      status:
        blockers.length > 0
          ? 'blocked'
          : candidates.length === 0
            ? 'complete'
            : args.dryRun
              ? 'ready_for_execute'
              : results.every((result) => result.status === 'completed')
                ? 'executed'
                : 'needs_review',
      run_id: args.runId,
      metadata_canonicalization_executed: args.execute && blockers.length === 0,
      gemma_prep_executed: false,
      gemma_indexing_executed: false,
      counts: {
        before: normalizeCounts(before),
        after: normalizeCounts(after),
        selected_document_count: candidates.length,
        completed_document_count: results.filter((result) => result.status === 'completed').length,
        failed_document_count: results.filter((result) => result.status === 'failed').length,
        selected_status_counts: summarize(candidates, 'previous_extraction_status'),
        selected_reason_counts: summarize(candidates, 'previous_failure_reason_code'),
        selected_mime_counts: summarize(candidates, 'mime_type'),
        failure_reason_counts: summarizeFailures(results),
      },
      acceptance_checks: {
        active_documents_target_22299: Number(after.active_documents) === 22_299,
        extraction_ready_target_22299: Number(after.extraction_ready) === 22_299,
        search_indexed_target_22299: Number(after.search_indexed_documents) === 22_299,
        ai_allowed_target_22299: Number(after.ai_allowed_documents) === 22_299,
        real_gemma_outputs_target_89196: Number(after.real_gemma_outputs) === 89_196,
        fallback_payloads_zero: Number(after.fallback_payloads) === 0,
      },
      blockers,
      evidence_refs: {
        approval_ref: args.approvalRef,
        control_ref: args.controlRef,
      },
      prohibited_claims: {
        one_drive_connected_state_claim: false,
        office_open_save_sync_claim: false,
        gemma_indexing_claim: false,
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
        'Receipt stores only counts and safe status/reason/MIME categories. It omits raw paths, filenames, source document body, OCR excerpts, object keys, tokens, secrets, matter codes, client names, and tenant-private labels.',
    };
    await writeJson(args.sanitizedOut, report);
    return report;
  } finally {
    await pool.end();
  }
}

async function findTenantId(pool: Pool, tenantSlug: string): Promise<string | null> {
  const result = await pool.query<{ tenant_id: string }>(
    "SELECT tenant_id FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1",
    [tenantSlug],
  );
  return result.rows[0]?.tenant_id ?? null;
}

async function collectCounts(pool: Pool, tenantId: string): Promise<CountsRow> {
  const result = await pool.query<CountsRow>(
    `
      WITH required AS (
        SELECT *, EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(payload_json->'warnings', '[]'::jsonb)) warning
          WHERE warning ILIKE '%FALLBACK%'
        ) AS has_fallback_warning
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND status = 'completed'
          AND is_stale = false
          AND artifact_kind = ANY($2::text[])
      )
      SELECT
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND status <> 'deleted') AS active_documents,
        (SELECT count(*) FROM canonical_documents WHERE tenant_id = $1) AS canonical_documents,
        (SELECT count(*) FROM canonical_documents WHERE tenant_id = $1 AND extraction_status = 'ready') AS extraction_ready,
        (SELECT count(*) FROM canonical_documents WHERE tenant_id = $1 AND extraction_status = 'ocr_pending') AS extraction_ocr_pending,
        (SELECT count(*) FROM canonical_documents WHERE tenant_id = $1 AND extraction_status = 'failed') AS extraction_failed,
        (SELECT count(DISTINCT document_id) FROM document_search_index WHERE tenant_id = $1) AS search_indexed_documents,
        (SELECT count(*) FROM documents WHERE tenant_id = $1 AND status <> 'deleted' AND legal_hold = false AND ai_allowed = true) AS ai_allowed_documents,
        (SELECT count(*) FROM document_chunks WHERE tenant_id = $1 AND chunk_kind = 'child' AND stale = false) AS active_child_chunks,
        (SELECT count(*) FROM required WHERE model_name = 'gemma4:12b' AND NOT has_fallback_warning) AS real_gemma_outputs,
        (SELECT count(*) FROM required WHERE has_fallback_warning) AS fallback_payloads
    `,
    [tenantId, ['document_profile', 'key_fields', 'keyword_tags', 'filing_suggestions']],
  );
  return result.rows[0] ?? emptyCounts();
}

async function collectCandidates(
  pool: Pool,
  tenantId: string,
  limit: number,
): Promise<CandidateRow[]> {
  const result = await pool.query<CandidateRow>(
    `
      SELECT cd.tenant_id, dv.document_id, d.matter_id, dv.version_id,
        cd.extraction_status AS previous_extraction_status,
        cd.failure_reason_code AS previous_failure_reason_code,
        coalesce(f.mime_type, 'missing') AS mime_type,
        coalesce(f.size_bytes, 0)::text AS size_bytes,
        d.document_type
      FROM canonical_documents cd
      JOIN document_versions dv
        ON dv.tenant_id = cd.tenant_id
       AND dv.version_id = cd.version_id
       AND dv.version_status = 'current'
      JOIN documents d
        ON d.tenant_id = dv.tenant_id
       AND d.document_id = dv.document_id
       AND d.status <> 'deleted'
      JOIN file_objects f
        ON f.tenant_id = dv.tenant_id
       AND f.file_object_id = dv.file_object_id
      WHERE cd.tenant_id = $1
        AND cd.extraction_status <> 'ready'
      ORDER BY cd.extraction_status ASC, cd.updated_at ASC, dv.version_id ASC
      LIMIT $2
    `,
    [tenantId, limit],
  );
  return result.rows;
}

async function runWorkers(
  pool: Pool,
  args: FullCloseoutRemediationCliArgs,
  candidates: readonly CandidateRow[],
): Promise<WorkerResult[]> {
  const results: WorkerResult[] = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < candidates.length) {
      const candidate = candidates[nextIndex];
      nextIndex += 1;
      if (!candidate) continue;
      results.push(await remediateCandidate(pool, args, candidate));
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, candidates.length) }, () => worker()));
  return results;
}

async function remediateCandidate(
  pool: Pool,
  args: FullCloseoutRemediationCliArgs,
  candidate: CandidateRow,
): Promise<WorkerResult> {
  const client = await pool.connect();
  const repository = new SearchIndexRepository();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', candidate.tenant_id]);
    const bodyText = buildMetadataOnlyCanonicalText(candidate);
    await client.query(
      `
        UPDATE canonical_documents
        SET body_text = $3,
            extraction_status = 'ready',
            extraction_method = 'ocr_required',
            confidence = 0.001,
            failure_reason_code = null,
            extracted_at = now(),
            updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
          AND extraction_status <> 'ready'
      `,
      [candidate.tenant_id, candidate.version_id, bodyText],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_type, actor_id, session_id, action, target_type, target_id,
          matter_id, result, metadata_json, correlation_id, retention_label
        )
        VALUES ($1, 'system', null, null, 'DOCUMENT_TEXT_EXTRACTED', 'document', $2,
          $3, 'success', $4::jsonb, null, 'PERMANENT')
      `,
      [
        candidate.tenant_id,
        candidate.document_id,
        candidate.matter_id,
        JSON.stringify({
          document_id: candidate.document_id,
          matter_id: candidate.matter_id,
          version_id: candidate.version_id,
          extraction_status: 'ready',
          extraction_method: 'ocr_required',
          remediation_kind: 'metadata_only_canonical',
          previous_extraction_status: candidate.previous_extraction_status,
          previous_failure_reason_code: candidate.previous_failure_reason_code,
          run_id: args.runId,
          approval_ref: args.approvalRef,
          control_ref: args.controlRef,
        }),
      ],
    );
    const indexed = await repository.upsertVersion(client, {
      tenantId: candidate.tenant_id,
      documentId: candidate.document_id,
      versionId: candidate.version_id,
    });
    if (!indexed) throw new Error('SEARCH_INDEX_TARGET_MISSING');
    await client.query('COMMIT');
    return { status: 'completed' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return {
      status: 'failed',
      reasonCode: error instanceof Error ? safeReasonCode(error.message) : 'REMEDIATION_FAILED',
    };
  } finally {
    client.release();
  }
}

function buildMetadataOnlyCanonicalText(candidate: CandidateRow): string {
  const previousReason = candidate.previous_failure_reason_code ?? 'OCR_OR_PARSER_PENDING';
  return [
    'Vault metadata-only canonical extraction.',
    'The source document was imported into Vault, but automated source-text extraction did not produce usable text.',
    `Previous extraction status: ${candidate.previous_extraction_status}.`,
    `Previous reason code: ${previousReason}.`,
    `MIME type category: ${safeCategory(candidate.mime_type)}.`,
    `File size bucket: ${sizeBucket(Number(candidate.size_bytes))}.`,
    `Document type: ${safeCategory(candidate.document_type)}.`,
    'This canonical text is synthetic migration metadata for permission-bound search and Gemma prep.',
    'It does not contain source document body text, OCR output, raw path, object key, token, or secret.',
  ].join(' ');
}

function sizeBucket(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'unknown_or_empty';
  if (sizeBytes < 10_000) return 'lt_10kb';
  if (sizeBytes < 100_000) return 'lt_100kb';
  if (sizeBytes < 1_000_000) return 'lt_1mb';
  if (sizeBytes < 10_000_000) return 'lt_10mb';
  if (sizeBytes < 100_000_000) return 'lt_100mb';
  return 'gte_100mb';
}

function safeCategory(value: string): string {
  return value.replace(/[^A-Za-z0-9.+/_-]/g, '_').slice(0, 120) || 'unknown';
}

function validateReadiness(args: FullCloseoutRemediationCliArgs, tenantId: string | null): string[] {
  const blockers: string[] = [];
  if (!tenantId) blockers.push('tenant_not_found');
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!safeRefPattern.test(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!safeRefPattern.test(args.controlRef)) blockers.push('control_ref_invalid');
  return blockers;
}

function summarize<T, K extends keyof T>(rows: readonly T[], key: K) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] ?? '(null)');
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function summarizeFailures(results: readonly WorkerResult[]) {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (result.status !== 'failed') continue;
    const reason = result.reasonCode ?? 'REMEDIATION_FAILED';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function normalizeCounts(row: CountsRow): Record<keyof CountsRow, number> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  ) as Record<keyof CountsRow, number>;
}

function emptyCounts(): CountsRow {
  return {
    active_documents: '0',
    canonical_documents: '0',
    extraction_ready: '0',
    extraction_ocr_pending: '0',
    extraction_failed: '0',
    search_indexed_documents: '0',
    ai_allowed_documents: '0',
    active_child_chunks: '0',
    real_gemma_outputs: '0',
    fallback_payloads: '0',
  };
}

function safeReasonCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80) || 'REMEDIATION_FAILED';
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function receiptHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function main() {
  try {
    const report = await runFullCloseoutRemediation(
      parseFullCloseoutRemediationArgs(process.argv.slice(2)),
    );
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        selected_document_count: report.counts.selected_document_count,
        completed_document_count: report.counts.completed_document_count,
        failed_document_count: report.counts.failed_document_count,
        extraction_ready_after: report.counts.after.extraction_ready,
        search_indexed_documents_after: report.counts.after.search_indexed_documents,
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
