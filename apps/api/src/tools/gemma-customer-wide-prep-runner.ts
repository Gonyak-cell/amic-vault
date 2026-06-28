import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from '../app.module';
import { StructuredLogger } from '../common/logging/logger';
import { AiPrepProcessor } from '../modules/ai/prep/ai-prep.processor';
import type { AiPrepJobPayload } from '../modules/ai/prep/ai-prep.types';
import { AuditService } from '../modules/audit/audit.service';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ?? 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const safeRunIdPattern = /^[A-Za-z0-9._-]{3,120}$/;
const safeRefPattern = /^[A-Za-z0-9._-]{3,180}$/;
const requiredArtifactKinds = [
  'document_profile',
  'key_fields',
  'keyword_tags',
  'filing_suggestions',
] as const;

export interface GemmaCustomerWidePrepCliArgs {
  dryRun: boolean;
  execute: boolean;
  replaceFallback: boolean;
  runId: string;
  tenantSlug: string;
  approvalRef: string;
  controlRef: string;
  sanitizedOut: string;
  databaseUrl: string;
  limit: number;
}

interface PrepCandidate {
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  artifact_kind: (typeof requiredArtifactKinds)[number];
}

interface PrepPlan {
  tenantId: string;
  cutoverExecuted: boolean;
  gemmaIndexingAlreadyExecuted: boolean;
  activeEthicalWalls: number;
  readyAiAllowedDocumentCount: number;
  missingArtifactCount: number;
  fallbackArtifactCount: number;
  candidates: PrepCandidate[];
  blockers: string[];
}

interface PrepExecuteResult {
  processedCount: number;
  failedCount: number;
}

interface ArtifactStatusCount {
  artifact_kind: string;
  status: string;
  count: string;
}

export function usage(): string {
  return [
    'usage: pnpm gemma:customer-wide-prep -- --dry-run|--execute --run-id <id> --tenant-slug <slug> --approval-ref <ref> --control-ref <ref> --sanitized-out <out.json> [--limit <n>]',
    '',
    'Processes missing Gemma prep artifacts for ready/search-indexed/ai_allowed documents in bounded batches.',
    'Use --replace-fallback to replace completed fallback artifacts with actual Gemma output.',
  ].join('\n');
}

export function parseGemmaCustomerWidePrepArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): GemmaCustomerWidePrepCliArgs {
  if (argv.includes('--help')) throw new Error(usage());
  const dryRun = argv.includes('--dry-run');
  const execute = argv.includes('--execute');
  if (dryRun === execute) throw new Error('exactly one of --dry-run or --execute is required');
  return {
    dryRun,
    execute,
    replaceFallback: argv.includes('--replace-fallback'),
    runId: requiredArg(argv, '--run-id'),
    tenantSlug: requiredArg(argv, '--tenant-slug'),
    approvalRef: requiredArg(argv, '--approval-ref'),
    controlRef: requiredArg(argv, '--control-ref'),
    sanitizedOut: requiredArg(argv, '--sanitized-out'),
    databaseUrl: argValue(argv, '--database-url') ?? env.DATABASE_URL ?? defaultDatabaseUrl,
    limit: optionalPositiveInt(argValue(argv, '--limit'), '--limit') ?? 25,
  };
}

export async function runGemmaCustomerWidePrep(args: GemmaCustomerWidePrepCliArgs) {
  const plan = await collectPrepPlan(args);
  const blockers = validateReadiness(args, plan);
  let executeResult: PrepExecuteResult | null = null;
  if (args.execute && blockers.length === 0) {
    executeResult = await executePrepCandidates(plan.candidates);
  }
  const finalStatusCounts = await collectArtifactStatusCounts(args.databaseUrl, plan.tenantId);
  const report = {
    receipt_type: 'gemma_customer_wide_prep_batch',
    mode: args.dryRun ? 'dry-run' : 'execute',
    status: blockers.length === 0 ? (args.dryRun ? 'ready_for_execute' : 'executed') : 'blocked',
    run_id: args.runId,
    gemma_prep_executed: Boolean(executeResult),
    gemma_indexing_executed: false,
    counts: {
      ready_ai_allowed_document_count: plan.readyAiAllowedDocumentCount,
      missing_artifact_count_before: plan.missingArtifactCount,
      fallback_artifact_count_before: plan.fallbackArtifactCount,
      selected_candidate_count: plan.candidates.length,
      processed_candidate_count: executeResult?.processedCount ?? 0,
      failed_candidate_count: executeResult?.failedCount ?? 0,
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
      selected_candidate_count_gt_zero: plan.candidates.length > 0,
      dry_run_or_processed_without_runner_failure:
        args.dryRun || (executeResult !== null && executeResult.failedCount === 0),
    },
    next_gate: {
      rerun_until_missing_artifact_count_zero: true,
      rerun_replace_fallback_until_fallback_artifact_count_zero: args.replaceFallback,
      ocr_pending_requires_ocr_lane: true,
      failed_requires_remediation_or_exclusion_lane: true,
    },
    evidence_refs: {
      approval_ref: args.approvalRef,
      control_ref: args.controlRef,
    },
    prohibited_claims: {
      one_drive_connected_state_claim: false,
      office_open_save_sync_claim: false,
      source_of_truth_gemma_indexing_cutover_claim: false,
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

async function collectPrepPlan(args: GemmaCustomerWidePrepCliArgs): Promise<PrepPlan> {
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
    const candidates = await collectCandidates(client, tenantId, args.limit, args.replaceFallback);
    return {
      tenantId,
      ...environment,
      readyAiAllowedDocumentCount: counts.readyAiAllowedDocumentCount,
      missingArtifactCount: counts.missingArtifactCount,
      fallbackArtifactCount: counts.fallbackArtifactCount,
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
    fallback_artifact_count: string;
  }>(
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
        SELECT eligible.document_id, eligible.version_id, required_artifacts.artifact_kind
        FROM eligible
        CROSS JOIN required_artifacts
        LEFT JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = eligible.tenant_id
         AND artifact.document_version_id = eligible.version_id
         AND artifact.artifact_kind = required_artifacts.artifact_kind
         AND artifact.status = 'completed'
         AND artifact.is_stale = false
        WHERE artifact.ai_prep_artifact_id IS NULL
      ), fallback AS (
        SELECT artifact.ai_prep_artifact_id
        FROM eligible
        CROSS JOIN required_artifacts
        JOIN ai_prep_artifacts artifact
          ON artifact.tenant_id = eligible.tenant_id
         AND artifact.document_version_id = eligible.version_id
         AND artifact.artifact_kind = required_artifacts.artifact_kind
         AND artifact.status = 'completed'
         AND artifact.is_stale = false
        WHERE artifact.model_name IS DISTINCT FROM 'gemma4:12b'
           OR EXISTS (
             SELECT 1
             FROM jsonb_array_elements_text(coalesce(artifact.payload_json->'warnings', '[]'::jsonb)) warning
             WHERE warning ILIKE '%FALLBACK%'
           )
      )
      SELECT
        (SELECT count(*) FROM eligible) AS ready_ai_allowed_document_count,
        (SELECT count(*) FROM missing) AS missing_artifact_count,
        (SELECT count(*) FROM fallback) AS fallback_artifact_count
    `,
    [tenantId, requiredArtifactKinds],
  );
  const row = result.rows[0];
  return {
    readyAiAllowedDocumentCount: Number(row?.ready_ai_allowed_document_count ?? 0),
    missingArtifactCount: Number(row?.missing_artifact_count ?? 0),
    fallbackArtifactCount: Number(row?.fallback_artifact_count ?? 0),
  };
}

async function collectCandidates(
  client: Client,
  tenantId: string,
  limit: number,
  replaceFallback: boolean,
): Promise<PrepCandidate[]> {
  const result = await client.query<PrepCandidate>(
    replaceFallback ? fallbackCandidateSql() : missingCandidateSql(),
    [tenantId, requiredArtifactKinds, limit],
  );
  return result.rows;
}

function eligibleSql(): string {
  return `
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
      )`;
}

function fallbackCandidateSql(): string {
  return `
      ${eligibleSql()}
      SELECT eligible.tenant_id, eligible.document_id, eligible.version_id,
        eligible.matter_id, artifact.artifact_kind
      FROM eligible
      CROSS JOIN required_artifacts
      JOIN ai_prep_artifacts artifact
        ON artifact.tenant_id = eligible.tenant_id
       AND artifact.document_version_id = eligible.version_id
       AND artifact.artifact_kind = required_artifacts.artifact_kind
       AND artifact.status = 'completed'
       AND artifact.is_stale = false
      WHERE artifact.model_name IS DISTINCT FROM 'gemma4:12b'
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(coalesce(artifact.payload_json->'warnings', '[]'::jsonb)) warning
           WHERE warning ILIKE '%FALLBACK%'
         )
      ORDER BY eligible.document_id ASC, artifact.artifact_kind ASC
      LIMIT $3
    `;
}

function missingCandidateSql(): string {
  return `
      ${eligibleSql()}
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
      ORDER BY eligible.document_id ASC, required_artifacts.artifact_kind ASC
      LIMIT $3
    `;
}

async function executePrepCandidates(candidates: readonly PrepCandidate[]): Promise<PrepExecuteResult> {
  if (candidates.length === 0) return { processedCount: 0, failedCount: 0 };
  process.env.AI_PREP_QUEUE_WORKER_ENABLED = 'false';
  process.env.AI_PREP_ENABLED ??= 'true';
  process.env.LOCAL_GEMMA_ENABLED ??= 'true';
  process.env.LOCAL_GEMMA_PREP_FORMAT ??= 'text';
  process.env.AI_PREP_DETERMINISTIC_FALLBACK_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StructuredLogger(),
  });
  try {
    const auditService = app.get(AuditService);
    const processor = app.get(AiPrepProcessor);
    let processedCount = 0;
    let failedCount = 0;
    for (const candidate of candidates) {
      const payload: AiPrepJobPayload = {
        tenantId: candidate.tenant_id,
        documentId: candidate.document_id,
        versionId: candidate.version_id,
        matterId: candidate.matter_id,
        artifactKind: candidate.artifact_kind,
      };
      try {
        await auditService.log({
          tenantId: payload.tenantId,
          actorType: 'system',
          actorId: null,
          action: 'AI_PREP_REQUESTED',
          targetType: 'document_version',
          targetId: payload.versionId,
          matterId: payload.matterId ?? null,
          metadata: {
            document_id: payload.documentId,
            version_id: payload.versionId,
            matter_id: payload.matterId ?? null,
            ai_prep_kind: payload.artifactKind,
            ai_prep_status: 'pending',
            reason_code: 'gemma_customer_wide_ready_lane',
          },
        });
        await processor.handle(payload);
        processedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(
          JSON.stringify({
            code: 'GEMMA_CUSTOMER_WIDE_PREP_CANDIDATE_FAILED',
            artifactKind: payload.artifactKind,
            message: error instanceof Error ? error.message : 'GEMMA_CUSTOMER_WIDE_PREP_FAILED',
          }),
        );
      }
    }
    return { processedCount, failedCount };
  } finally {
    await app.close();
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

function validateReadiness(args: GemmaCustomerWidePrepCliArgs, plan: PrepPlan): string[] {
  const blockers: string[] = [...plan.blockers];
  if (!safeRunIdPattern.test(args.runId)) blockers.push('run_id_invalid');
  if (!safeRefPattern.test(args.approvalRef)) blockers.push('approval_ref_invalid');
  if (!safeRefPattern.test(args.controlRef)) blockers.push('control_ref_invalid');
  if (!plan.cutoverExecuted) blockers.push('source_of_truth_cutover_not_executed');
  if (plan.gemmaIndexingAlreadyExecuted) blockers.push('gemma_indexing_already_recorded_in_cutover');
  if (plan.activeEthicalWalls > 0) blockers.push('active_ethical_wall_review_required');
  if (plan.readyAiAllowedDocumentCount <= 0) blockers.push('ready_ai_allowed_document_count_zero');
  if (!args.replaceFallback && plan.missingArtifactCount <= 0) {
    blockers.push('missing_artifact_count_zero');
  }
  if (args.replaceFallback && plan.fallbackArtifactCount <= 0) {
    blockers.push('fallback_artifact_count_zero');
  }
  if (plan.candidates.length === 0) blockers.push('selected_candidate_count_zero');
  return [...new Set(blockers)];
}

function emptyPlan(blocker: string): PrepPlan {
  return {
    tenantId: '',
    cutoverExecuted: false,
    gemmaIndexingAlreadyExecuted: false,
    activeEthicalWalls: 0,
    readyAiAllowedDocumentCount: 0,
    missingArtifactCount: 0,
    fallbackArtifactCount: 0,
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
  return index >= 0 ? argv[index + 1] : undefined;
}

function optionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer`);
  return parsed;
}

async function main(): Promise<void> {
  let args: GemmaCustomerWidePrepCliArgs;
  try {
    args = parseGemmaCustomerWidePrepArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof Error && error.message === usage() ? 0 : 2;
    return;
  }

  try {
    const report = await runGemmaCustomerWidePrep(args);
    console.log(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        missing_artifact_count_before: report.counts.missing_artifact_count_before,
        selected_candidate_count: report.counts.selected_candidate_count,
        processed_candidate_count: report.counts.processed_candidate_count,
        failed_candidate_count: report.counts.failed_candidate_count,
        gemma_prep_executed: report.gemma_prep_executed,
        blockers: report.blockers,
      }),
    );
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'GEMMA_CUSTOMER_WIDE_PREP_FAILED',
        message: error instanceof Error ? error.message : 'GEMMA_CUSTOMER_WIDE_PREP_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
