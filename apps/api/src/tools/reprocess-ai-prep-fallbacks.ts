import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import {
  aiPrepArtifactKindSchema,
  type AiPrepArtifactKind,
  type AiPrepStaleReason,
  type AuditMetadata,
} from '@amic-vault/shared';
import { AppModule } from '../app.module';
import { StructuredLogger } from '../common/logging/logger';
import { AiPrepProcessor } from '../modules/ai/prep/ai-prep.processor';
import type { AiPrepJobPayload } from '../modules/ai/prep/ai-prep.types';
import { AuditService } from '../modules/audit/audit.service';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const reprocessReasons = ['fallback', 'stale', 'rejected'] as const;

type ReprocessReason = (typeof reprocessReasons)[number];

export interface ReprocessArgs {
  tenantId: string;
  databaseUrl: string;
  limit: number;
  dryRun: boolean;
  include: readonly ReprocessReason[];
  documentId?: string | undefined;
  artifactKind?: AiPrepArtifactKind | undefined;
}

interface ReprocessCandidateRow {
  ai_prep_artifact_id: string;
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  artifact_kind: AiPrepArtifactKind;
  candidate_reason: ReprocessReason;
  reprocess_reason_code: string;
}

interface ReprocessResult {
  tenantId: string;
  dryRun: boolean;
  include: readonly ReprocessReason[];
  candidateCount: number;
  processedCount: number;
  failedCount: number;
  candidates: Array<{
    artifactId: string;
    documentId: string;
    versionId: string;
    matterId: string;
    artifactKind: AiPrepArtifactKind;
    candidateReason: ReprocessReason;
    reprocessReasonCode: string;
  }>;
}

export function parseReprocessArgs(argv: readonly string[]): ReprocessArgs {
  const tenantId = argValue(argv, '--tenant-id');
  if (!tenantId) {
    throw new Error(
      'usage: pnpm ai-prep:reprocess-fallbacks -- --tenant-id <tenant_uuid> [--limit 25] [--dry-run]',
    );
  }

  const rawLimit = argValue(argv, '--limit');
  const limit = rawLimit ? Number(rawLimit) : 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('--limit must be an integer between 1 and 200');
  }

  const rawArtifactKind = argValue(argv, '--artifact-kind');
  const artifactKind = rawArtifactKind
    ? aiPrepArtifactKindSchema.parse(rawArtifactKind)
    : undefined;

  return {
    tenantId,
    databaseUrl: argValue(argv, '--database-url') ?? defaultDatabaseUrl,
    limit,
    dryRun: hasFlag(argv, '--dry-run'),
    include: parseInclude(argValue(argv, '--include') ?? 'fallback'),
    documentId: argValue(argv, '--document-id'),
    artifactKind,
  };
}

async function main(): Promise<void> {
  let args: ReprocessArgs;
  try {
    args = parseReprocessArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const candidates = await collectReprocessCandidates(args);
  if (args.dryRun || candidates.length === 0) {
    printResult(args, candidates, 0, 0);
    return;
  }

  process.env.AI_PREP_QUEUE_WORKER_ENABLED ??= 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StructuredLogger(),
  });
  try {
    const auditService = app.get(AuditService);
    const processor = app.get(AiPrepProcessor);
    let processedCount = 0;
    let failedCount = 0;

    for (const candidate of candidates) {
      try {
        await auditService.log({
          tenantId: candidate.tenant_id,
          actorType: 'system',
          actorId: null,
          action: 'AI_PREP_REQUESTED',
          targetType: 'document_version',
          targetId: candidate.version_id,
          matterId: candidate.matter_id,
          metadata: prepReprocessAuditMetadata(candidate),
        });
        await processor.handle(toJobPayload(candidate));
        processedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(
          JSON.stringify({
            code: 'AI_PREP_REPROCESS_FAILED',
            artifactId: candidate.ai_prep_artifact_id,
            documentId: candidate.document_id,
            versionId: candidate.version_id,
            artifactKind: candidate.artifact_kind,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    printResult(args, candidates, processedCount, failedCount);
    if (failedCount > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

async function collectReprocessCandidates(
  args: ReprocessArgs,
): Promise<ReprocessCandidateRow[]> {
  const client = new Client({ connectionString: args.databaseUrl });
  await client.connect();
  try {
    const params: unknown[] = [args.tenantId];
    const filters = ['a.tenant_id = $1'];

    if (args.documentId) {
      params.push(args.documentId);
      filters.push(`a.document_id = $${params.length}`);
    }
    if (args.artifactKind) {
      params.push(args.artifactKind);
      filters.push(`a.artifact_kind = $${params.length}`);
    }
    params.push(
      args.include.includes('fallback'),
      args.include.includes('stale'),
      args.include.includes('rejected'),
    );
    const includeFallbackPlaceholder = `$${params.length - 2}`;
    const includeStalePlaceholder = `$${params.length - 1}`;
    const includeRejectedPlaceholder = `$${params.length}`;

    params.push(args.limit);
    const limitPlaceholder = `$${params.length}`;

    const result = await client.query<ReprocessCandidateRow>(
      `
        WITH fallback_audits AS (
          SELECT DISTINCT target_id AS ai_prep_artifact_id,
            metadata_json->>'fallback_reason_code' AS fallback_reason_code
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'AI_PREP_COMPLETED'
            AND target_type = 'ai_prep_artifact'
            AND target_id IS NOT NULL
            AND metadata_json->>'generation_result' = 'fallback'
            AND metadata_json ? 'fallback_reason_code'
        )
        SELECT DISTINCT ON (a.document_id, current_dv.version_id, a.artifact_kind)
          a.ai_prep_artifact_id, a.tenant_id, a.document_id,
          current_dv.version_id, d.matter_id, a.artifact_kind,
          CASE
            WHEN a.is_stale = true OR a.status = 'stale' THEN 'stale'
            WHEN a.status = 'rejected' THEN 'rejected'
            ELSE 'fallback'
          END AS candidate_reason,
          CASE
            WHEN a.is_stale = true OR a.status = 'stale' THEN COALESCE(a.stale_reason, 'operator_rebuild')
            WHEN a.status = 'rejected' THEN COALESCE(a.failure_reason_code, 'AI_PREP_REJECTED')
            ELSE COALESCE(fa.fallback_reason_code, 'LOCAL_GEMMA_PAYLOAD_FALLBACK')
          END AS reprocess_reason_code
        FROM ai_prep_artifacts a
        JOIN documents d
          ON d.tenant_id = a.tenant_id
          AND d.document_id = a.document_id
          AND d.status <> 'deleted'
          AND d.ai_allowed = true
        JOIN LATERAL (
          SELECT version_id
          FROM document_versions
          WHERE tenant_id = d.tenant_id
            AND document_id = d.document_id
            AND version_status = 'current'
          ORDER BY created_at DESC
          LIMIT 1
        ) current_dv ON true
        LEFT JOIN fallback_audits fa
          ON fa.ai_prep_artifact_id = a.ai_prep_artifact_id
        WHERE ${filters.join('\n          AND ')}
          AND (
            (
              ${includeFallbackPlaceholder}::boolean = true
              AND a.status = 'completed'
              AND a.is_stale = false
              AND (
                fa.ai_prep_artifact_id IS NOT NULL
                OR (
                  jsonb_typeof(a.payload_json->'warnings') = 'array'
                  AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(a.payload_json->'warnings') AS warning(value)
                    WHERE warning.value LIKE 'LOCAL_GEMMA_%_FALLBACK'
                  )
                )
              )
            )
            OR (${includeStalePlaceholder}::boolean = true AND (a.is_stale = true OR a.status = 'stale'))
            OR (${includeRejectedPlaceholder}::boolean = true AND a.status = 'rejected' AND a.is_stale = false)
          )
        ORDER BY a.document_id, current_dv.version_id, a.artifact_kind, a.updated_at ASC,
          a.ai_prep_artifact_id ASC
        LIMIT ${limitPlaceholder}
      `,
      params,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function prepReprocessAuditMetadata(candidate: ReprocessCandidateRow): AuditMetadata {
  const metadata: AuditMetadata = {
    document_id: candidate.document_id,
    version_id: candidate.version_id,
    matter_id: candidate.matter_id,
    ai_prep_artifact_id: candidate.ai_prep_artifact_id,
    ai_prep_kind: candidate.artifact_kind,
    ai_prep_status: 'pending',
    reason_code: reprocessAuditReasonCode(candidate.candidate_reason),
    stale_reason: reprocessStaleReason(candidate.candidate_reason),
  };
  if (candidate.candidate_reason === 'fallback') {
    metadata.fallback_reason_code = candidate.reprocess_reason_code;
  }
  return metadata;
}

function toJobPayload(candidate: ReprocessCandidateRow): AiPrepJobPayload {
  return {
    tenantId: candidate.tenant_id,
    documentId: candidate.document_id,
    versionId: candidate.version_id,
    matterId: candidate.matter_id,
    artifactKind: candidate.artifact_kind,
  };
}

function printResult(
  args: ReprocessArgs,
  candidates: readonly ReprocessCandidateRow[],
  processedCount: number,
  failedCount: number,
): void {
  const result: ReprocessResult = {
    tenantId: args.tenantId,
    dryRun: args.dryRun,
    include: args.include,
    candidateCount: candidates.length,
    processedCount,
    failedCount,
    candidates: candidates.map((candidate) => ({
      artifactId: candidate.ai_prep_artifact_id,
      documentId: candidate.document_id,
      versionId: candidate.version_id,
      matterId: candidate.matter_id,
      artifactKind: candidate.artifact_kind,
      candidateReason: candidate.candidate_reason,
      reprocessReasonCode: candidate.reprocess_reason_code,
    })),
  };
  console.log(JSON.stringify(result, null, 2));
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

function parseInclude(raw: string): ReprocessReason[] {
  const values = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (values.includes('all')) return [...reprocessReasons];
  const parsed = [...new Set(values)];
  if (
    parsed.length === 0 ||
    parsed.some((value) => !(reprocessReasons as readonly string[]).includes(value))
  ) {
    throw new Error('--include must be fallback, stale, rejected, or all');
  }
  return parsed as ReprocessReason[];
}

function reprocessAuditReasonCode(reason: ReprocessReason): string {
  switch (reason) {
    case 'fallback':
      return 'AI_PREP_FALLBACK_REPROCESS';
    case 'stale':
      return 'AI_PREP_STALE_REBUILD';
    case 'rejected':
      return 'AI_PREP_REJECTED_REPROCESS';
  }
}

function reprocessStaleReason(reason: ReprocessReason): AiPrepStaleReason {
  switch (reason) {
    case 'fallback':
      return 'operator_reprocess_fallback';
    case 'stale':
      return 'operator_rebuild';
    case 'rejected':
      return 'operator_reprocess_rejected';
  }
}

if (require.main === module) {
  void main();
}
