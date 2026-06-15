import {
  aiPrepStaleReasonSchema,
  type AiPrepArtifactKind,
  type AiPrepStaleReason,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';

export interface AiPrepStaleArtifactRow {
  ai_prep_artifact_id: string;
  artifact_kind: AiPrepArtifactKind;
  matter_id: string;
  document_id: string;
  document_version_id: string;
}

export interface MarkAiPrepArtifactsStaleInput {
  tenantId: string;
  staleReason: AiPrepStaleReason;
  matterId?: string | null | undefined;
  documentId?: string | null | undefined;
  versionId?: string | null | undefined;
  excludeVersionId?: string | null | undefined;
}

export interface MarkAndAuditAiPrepArtifactsStaleInput extends MarkAiPrepArtifactsStaleInput {
  actorId?: string | null | undefined;
  actorType?: 'user' | 'system' | undefined;
}

export function parseAiPrepStaleReason(input: string): AiPrepStaleReason {
  return aiPrepStaleReasonSchema.parse(input);
}

export async function markAiPrepArtifactsStale(
  client: QueryClient,
  input: MarkAiPrepArtifactsStaleInput,
): Promise<AiPrepStaleArtifactRow[]> {
  const staleReason = parseAiPrepStaleReason(input.staleReason);
  const params: unknown[] = [input.tenantId, staleReason];
  const filters = ['tenant_id = $1', 'is_stale = false'];

  if (input.matterId) {
    params.push(input.matterId);
    filters.push(`matter_id = $${params.length}`);
  }
  if (input.documentId) {
    params.push(input.documentId);
    filters.push(`document_id = $${params.length}`);
  }
  if (input.versionId) {
    params.push(input.versionId);
    filters.push(`document_version_id = $${params.length}`);
  }
  if (input.excludeVersionId) {
    params.push(input.excludeVersionId);
    filters.push(`document_version_id <> $${params.length}`);
  }

  const result = await client.query(
    `
      UPDATE ai_prep_artifacts
      SET is_stale = true,
        status = CASE WHEN status = 'pending' THEN 'stale' ELSE status END,
        stale_reason = $2,
        stale_at = now(),
        updated_at = now()
      WHERE ${filters.join('\n        AND ')}
      RETURNING ai_prep_artifact_id, artifact_kind, matter_id, document_id,
        document_version_id
    `,
    params,
  );
  return result.rows as AiPrepStaleArtifactRow[];
}

export async function markAndAuditAiPrepArtifactsStale(
  auditService: AuditService,
  client: QueryClient,
  input: MarkAndAuditAiPrepArtifactsStaleInput,
): Promise<AiPrepStaleArtifactRow[]> {
  const rows = await markAiPrepArtifactsStale(client, input);
  for (const row of rows) {
    const auditInput = {
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      action: 'AI_PREP_STALE' as const,
      targetType: 'ai_prep_artifact',
      targetId: row.ai_prep_artifact_id,
      matterId: row.matter_id,
      metadata: {
        ai_prep_artifact_id: row.ai_prep_artifact_id,
        ai_prep_kind: row.artifact_kind,
        ai_prep_status: 'stale',
        document_id: row.document_id,
        version_id: row.document_version_id,
        matter_id: row.matter_id,
        stale_reason: input.staleReason,
      },
      ...(input.actorType ? { actorType: input.actorType } : {}),
    };
    await auditService.log(
      auditInput,
      client,
    );
  }
  return rows;
}
