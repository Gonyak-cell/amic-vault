import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import {
  aiPrepArtifactKindSchema,
  type AiPrepArtifactKind,
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

export interface ReprocessArgs {
  tenantId: string;
  databaseUrl: string;
  limit: number;
  dryRun: boolean;
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
  fallback_reason_code: string;
}

interface ReprocessResult {
  tenantId: string;
  dryRun: boolean;
  candidateCount: number;
  processedCount: number;
  failedCount: number;
  candidates: Array<{
    artifactId: string;
    documentId: string;
    versionId: string;
    matterId: string;
    artifactKind: AiPrepArtifactKind;
    fallbackReasonCode: string;
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
        SELECT a.ai_prep_artifact_id, a.tenant_id, a.document_id,
          a.document_version_id AS version_id, a.matter_id, a.artifact_kind,
          COALESCE(fa.fallback_reason_code, 'LOCAL_GEMMA_PAYLOAD_FALLBACK') AS fallback_reason_code
        FROM ai_prep_artifacts a
        JOIN document_versions dv
          ON dv.tenant_id = a.tenant_id
          AND dv.document_id = a.document_id
          AND dv.version_id = a.document_version_id
          AND dv.version_status = 'current'
        JOIN documents d
          ON d.tenant_id = a.tenant_id
          AND d.document_id = a.document_id
          AND d.status <> 'deleted'
          AND d.ai_allowed = true
        LEFT JOIN fallback_audits fa
          ON fa.ai_prep_artifact_id = a.ai_prep_artifact_id
        WHERE ${filters.join('\n          AND ')}
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
        ORDER BY a.updated_at ASC, a.ai_prep_artifact_id ASC
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
  return {
    document_id: candidate.document_id,
    version_id: candidate.version_id,
    matter_id: candidate.matter_id,
    ai_prep_artifact_id: candidate.ai_prep_artifact_id,
    ai_prep_kind: candidate.artifact_kind,
    ai_prep_status: 'pending',
    reason_code: 'AI_PREP_FALLBACK_REPROCESS',
    fallback_reason_code: candidate.fallback_reason_code,
    stale_reason: 'operator_reprocess_fallback',
  };
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
    candidateCount: candidates.length,
    processedCount,
    failedCount,
    candidates: candidates.map((candidate) => ({
      artifactId: candidate.ai_prep_artifact_id,
      documentId: candidate.document_id,
      versionId: candidate.version_id,
      matterId: candidate.matter_id,
      artifactKind: candidate.artifact_kind,
      fallbackReasonCode: candidate.fallback_reason_code,
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

if (require.main === module) {
  void main();
}
