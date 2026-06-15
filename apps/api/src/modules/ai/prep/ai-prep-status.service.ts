import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  aiPrepDocumentStatusSchema,
  aiPrepFeedbackRequestSchema,
  aiPrepFeedbackResponseSchema,
  aiPrepMatterReadinessSchema,
  aiPrepMatterRetryResponseSchema,
  parseAiPrepArtifactPayload,
  type AiPrepStaleReason,
  type AiPrepArtifactKind,
  type AiPrepDocumentReadinessStatus,
  type AiPrepDocumentStatusDto,
  type AiPrepFeedbackRequestDto,
  type AiPrepFeedbackResponseDto,
  type AiPrepMatterReadinessDto,
  type AiPrepMatterRetryResponseDto,
  type AiPrepStatus,
  type PermissionContext,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { DocumentPermissionService } from '../../permission/document-permission.service';
import { AiPrepQueueService } from './ai-prep-queue.service';

interface CurrentVersionRow {
  document_id: string;
  version_id: string | null;
}

interface ArtifactRow {
  ai_prep_artifact_id: string;
  artifact_kind: AiPrepArtifactKind;
  status: AiPrepStatus;
  is_stale: boolean;
  stale_reason: AiPrepStaleReason | null;
  source_chunk_ids: string[];
  generated_at: Date | null;
  updated_at: Date;
  payload_json: unknown;
}

interface ArtifactFeedbackRow {
  ai_prep_artifact_id: string;
  matter_id: string;
  document_id: string;
  document_version_id: string;
}

interface FeedbackInsertRow {
  ai_prep_feedback_id: string;
  ai_prep_artifact_id: string;
  matter_id: string;
  document_id: string;
  actor_id: string;
  feedback_kind: string;
  reason_code: string;
  created_at: Date;
}

interface MatterReadinessRow {
  document_id: string;
  title: string;
  ai_allowed: boolean;
  version_id: string | null;
  total_artifact_count: number;
  completed_artifact_count: number;
  pending_artifact_count: number;
  blocked_artifact_count: number;
  failed_artifact_count: number;
  rejected_artifact_count: number;
  stale_artifact_count: number;
  fallback_artifact_count: number;
  updated_at: Date | null;
}

interface RetryDocumentRow {
  document_id: string;
  version_id: string;
  matter_id: string;
}

@Injectable()
export class AiPrepStatusService {
  private readonly logger = new Logger(AiPrepStatusService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentPermissionService)
    private readonly documentPermission: Pick<DocumentPermissionService, 'canReadDocument'>,
    @Inject(AiPrepQueueService) private readonly queue: AiPrepQueueService,
  ) {}

  async getDocumentStatus(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<AiPrepDocumentStatusDto> {
    await this.assertCanReadDocument(ctx, documentId);
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const current = await this.findCurrentVersion(tx, ctx.tenantId, documentId);
      if (!current) throw new NotFoundException({ code: 'PERMISSION_DENIED' });
      if (!current.version_id) {
        return aiPrepDocumentStatusSchema.parse({
          documentId,
          versionId: null,
          readinessStatus: 'not_ready',
          artifacts: [],
        });
      }
      const artifacts = await this.listArtifacts(tx, ctx.tenantId, current.version_id);
      return aiPrepDocumentStatusSchema.parse({
        documentId,
        versionId: current.version_id,
        readinessStatus: readinessStatus(artifacts),
        artifacts: artifacts.map((artifact) => ({
          artifactId: artifact.ai_prep_artifact_id,
          artifactKind: artifact.artifact_kind,
          status: artifact.status,
          isStale: artifact.is_stale,
          staleReason: artifact.stale_reason ?? null,
          sourceChunkCount: artifact.source_chunk_ids.length,
          generatedAt: artifact.generated_at?.toISOString() ?? null,
          updatedAt: artifact.updated_at.toISOString(),
          payload:
            artifact.status === 'completed' && !artifact.is_stale
              ? parseAiPrepArtifactPayload(artifact.payload_json, artifact.artifact_kind)
              : null,
        })),
      });
    });
  }

  async getMatterReadiness(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<AiPrepMatterReadinessDto> {
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      await this.assertAdmin(tx, ctx);
      await this.assertMatterExists(tx, ctx.tenantId, matterId);
      const rows = await this.listMatterReadinessRows(tx, ctx.tenantId, matterId);
      const documents = rows.map((row) => {
        const readiness = matterDocumentReadiness(row);
        return {
          documentId: row.document_id,
          title: row.title,
          currentVersionId: row.version_id,
          aiAllowed: row.ai_allowed,
          readinessStatus: readiness,
          totalArtifactCount: row.total_artifact_count,
          completedArtifactCount: row.completed_artifact_count,
          pendingArtifactCount: row.pending_artifact_count,
          blockedArtifactCount: row.blocked_artifact_count,
          failedArtifactCount: row.failed_artifact_count,
          rejectedArtifactCount: row.rejected_artifact_count,
          staleArtifactCount: row.stale_artifact_count,
          fallbackArtifactCount: row.fallback_artifact_count,
          updatedAt: row.updated_at?.toISOString() ?? null,
        };
      });
      return aiPrepMatterReadinessSchema.parse({
        matterId,
        documentCount: documents.length,
        currentVersionCount: documents.filter((document) => document.currentVersionId).length,
        readyDocumentCount: documents.filter((document) => document.readinessStatus === 'ready')
          .length,
        pendingDocumentCount: documents.filter((document) => document.readinessStatus === 'pending')
          .length,
        partialDocumentCount: documents.filter((document) => document.readinessStatus === 'partial')
          .length,
        blockedDocumentCount: documents.filter((document) => document.readinessStatus === 'blocked')
          .length,
        failedDocumentCount: documents.filter((document) => document.readinessStatus === 'failed')
          .length,
        rejectedDocumentCount: documents.filter(
          (document) => document.readinessStatus === 'rejected',
        ).length,
        staleDocumentCount: documents.filter((document) => document.readinessStatus === 'stale')
          .length,
        notReadyDocumentCount: documents.filter(
          (document) => document.readinessStatus === 'not_ready',
        ).length,
        pendingJobCount: documents.reduce(
          (total, document) => total + document.pendingArtifactCount,
          0,
        ),
        staleArtifactCount: documents.reduce(
          (total, document) => total + document.staleArtifactCount,
          0,
        ),
        blockedArtifactCount: documents.reduce(
          (total, document) => total + document.blockedArtifactCount,
          0,
        ),
        rejectedArtifactCount: documents.reduce(
          (total, document) => total + document.rejectedArtifactCount,
          0,
        ),
        fallbackArtifactCount: documents.reduce(
          (total, document) => total + document.fallbackArtifactCount,
          0,
        ),
        documents,
      });
    });
  }

  async retryMatterPrep(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<AiPrepMatterRetryResponseDto> {
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      await this.assertAdmin(tx, ctx);
      await this.assertMatterExists(tx, ctx.tenantId, matterId);
      const documents = await this.listRetryableMatterDocuments(tx, ctx.tenantId, matterId);
      const jobIds: string[] = [];
      for (const document of documents) {
        const enqueued = await this.queue.enqueueVersionArtifacts(
          {
            tenantId: ctx.tenantId,
            documentId: document.document_id,
            versionId: document.version_id,
            matterId: document.matter_id,
          },
          tx as PoolClient,
        );
        jobIds.push(...enqueued);
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'AI_PREP_REQUESTED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            enqueued_job_count: jobIds.length,
            stale_reason: 'operator_retry' satisfies AiPrepStaleReason,
          },
        },
        tx,
      );
      return aiPrepMatterRetryResponseSchema.parse({
        matterId,
        documentCount: documents.length,
        enqueuedJobCount: jobIds.length,
        requestedAt: new Date().toISOString(),
      });
    });
  }

  async recordArtifactFeedback(
    ctx: PermissionContext,
    input: AiPrepFeedbackRequestDto,
  ): Promise<AiPrepFeedbackResponseDto> {
    const parsed = aiPrepFeedbackRequestSchema.parse(input);
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const artifact = await this.findArtifactForFeedback(tx, ctx.tenantId, parsed.artifactId);
      if (!artifact) throw permissionDenied();
      await this.assertCanReadDocument(ctx, artifact.document_id);
      const result = await tx.query(
        `
          INSERT INTO ai_prep_feedback_items (
            tenant_id, ai_prep_artifact_id, matter_id, document_id,
            document_version_id, actor_id, feedback_kind, reason_code
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING ai_prep_feedback_id, ai_prep_artifact_id, matter_id,
            document_id, actor_id, feedback_kind, reason_code, created_at
        `,
        [
          ctx.tenantId,
          artifact.ai_prep_artifact_id,
          artifact.matter_id,
          artifact.document_id,
          artifact.document_version_id,
          ctx.userId,
          parsed.feedbackKind,
          parsed.reasonCode,
        ],
      );
      const row = result.rows[0] as FeedbackInsertRow | undefined;
      if (!row) throw permissionDenied();
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'AI_FEEDBACK_RECORDED',
          targetType: 'ai_prep_feedback',
          targetId: row.ai_prep_feedback_id,
          matterId: row.matter_id,
          metadata: {
            feedback_id: row.ai_prep_feedback_id,
            feedback_kind: row.feedback_kind,
            feedback_reason_code: row.reason_code,
            ai_prep_artifact_id: row.ai_prep_artifact_id,
            document_id: row.document_id,
            version_id: artifact.document_version_id,
            matter_id: row.matter_id,
          },
        },
        tx,
      );
      return aiPrepFeedbackResponseSchema.parse({
        feedbackId: row.ai_prep_feedback_id,
        artifactId: row.ai_prep_artifact_id,
        matterId: row.matter_id,
        documentId: row.document_id,
        feedbackKind: row.feedback_kind,
        reasonCode: row.reason_code,
        recordedByUserId: row.actor_id,
        createdAt: row.created_at.toISOString(),
      });
    });
  }

  private async assertCanReadDocument(ctx: PermissionContext, documentId: string): Promise<void> {
    try {
      const decision = await this.documentPermission.canReadDocument(ctx, documentId);
      if (decision.effect === 'ALLOW') return;
    } catch {
      this.logger.warn({ code: 'AI_PREP_STATUS_PERM_EVAL_ERROR', documentId });
    }
    throw permissionDenied();
  }

  private async findCurrentVersion(
    tx: QueryClient,
    tenantId: string,
    documentId: string,
  ): Promise<CurrentVersionRow | null> {
    const result = await tx.query(
      `
        SELECT d.document_id, dv.version_id
        FROM documents d
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND d.status <> 'deleted'
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as CurrentVersionRow | undefined) ?? null;
  }

  private async listArtifacts(
    tx: QueryClient,
    tenantId: string,
    versionId: string,
  ): Promise<ArtifactRow[]> {
    const result = await tx.query(
      `
        SELECT ai_prep_artifact_id, artifact_kind, status, is_stale,
          stale_reason, source_chunk_ids, generated_at, updated_at, payload_json
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND document_version_id = $2
        ORDER BY artifact_kind ASC
      `,
      [tenantId, versionId],
    );
    return result.rows as ArtifactRow[];
  }

  private async assertAdmin(tx: QueryClient, ctx: PermissionContext): Promise<void> {
    const result = await tx.query(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    const actor = result.rows[0] as { role?: string; status?: string } | undefined;
    if (
      actor?.status !== 'active' ||
      (actor.role !== 'firm_admin' && actor.role !== 'security_admin')
    ) {
      throw permissionDenied();
    }
  }

  private async assertMatterExists(
    tx: QueryClient,
    tenantId: string,
    matterId: string,
  ): Promise<void> {
    const result = await tx.query(
      `
        SELECT matter_id
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    if (!result.rows[0]) throw permissionDenied();
  }

  private async findArtifactForFeedback(
    tx: QueryClient,
    tenantId: string,
    artifactId: string,
  ): Promise<ArtifactFeedbackRow | null> {
    const result = await tx.query(
      `
        SELECT ai_prep_artifact_id, matter_id, document_id, document_version_id
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND ai_prep_artifact_id = $2
        LIMIT 1
      `,
      [tenantId, artifactId],
    );
    return (result.rows[0] as ArtifactFeedbackRow | undefined) ?? null;
  }

  private async listMatterReadinessRows(
    tx: QueryClient,
    tenantId: string,
    matterId: string,
  ): Promise<MatterReadinessRow[]> {
    const result = await tx.query(
      `
        WITH fallback_audits AS (
          SELECT DISTINCT target_id AS ai_prep_artifact_id
          FROM audit_events
          WHERE tenant_id = $1
            AND action = 'AI_PREP_COMPLETED'
            AND target_type = 'ai_prep_artifact'
            AND target_id IS NOT NULL
            AND metadata_json->>'generation_result' = 'fallback'
            AND metadata_json ? 'fallback_reason_code'
        ),
        current_docs AS (
          SELECT d.document_id, d.title, d.ai_allowed, dv.version_id
          FROM documents d
          LEFT JOIN LATERAL (
            SELECT version_id
            FROM document_versions
            WHERE tenant_id = d.tenant_id
              AND document_id = d.document_id
              AND version_status = 'current'
            ORDER BY created_at DESC
            LIMIT 1
          ) dv ON true
          WHERE d.tenant_id = $1
            AND d.matter_id = $2
            AND d.status <> 'deleted'
          ORDER BY d.title ASC, d.document_id ASC
          LIMIT 100
        )
        SELECT cd.document_id, cd.title, cd.ai_allowed, cd.version_id,
          count(a.ai_prep_artifact_id)::int AS total_artifact_count,
          count(a.ai_prep_artifact_id) FILTER (
            WHERE a.status = 'completed' AND a.is_stale = false
          )::int AS completed_artifact_count,
          count(a.ai_prep_artifact_id) FILTER (
            WHERE a.status = 'pending' AND a.is_stale = false
          )::int AS pending_artifact_count,
          count(a.ai_prep_artifact_id) FILTER (
            WHERE a.status = 'blocked' AND a.is_stale = false
          )::int AS blocked_artifact_count,
          count(a.ai_prep_artifact_id) FILTER (
            WHERE a.status = 'failed' AND a.is_stale = false
          )::int AS failed_artifact_count,
          count(a.ai_prep_artifact_id) FILTER (
            WHERE a.status = 'rejected' AND a.is_stale = false
          )::int AS rejected_artifact_count,
          count(a.ai_prep_artifact_id) FILTER (
            WHERE a.status = 'stale' OR a.is_stale = true
          )::int AS stale_artifact_count,
          count(a.ai_prep_artifact_id) FILTER (
            WHERE a.status = 'completed'
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
          )::int AS fallback_artifact_count,
          max(a.updated_at) AS updated_at
        FROM current_docs cd
        LEFT JOIN ai_prep_artifacts a
          ON a.tenant_id = $1
          AND a.document_version_id = cd.version_id
        LEFT JOIN fallback_audits fa
          ON fa.ai_prep_artifact_id = a.ai_prep_artifact_id
        GROUP BY cd.document_id, cd.title, cd.ai_allowed, cd.version_id
        ORDER BY cd.title ASC, cd.document_id ASC
      `,
      [tenantId, matterId],
    );
    return result.rows as MatterReadinessRow[];
  }

  private async listRetryableMatterDocuments(
    tx: QueryClient,
    tenantId: string,
    matterId: string,
  ): Promise<RetryDocumentRow[]> {
    const result = await tx.query(
      `
        SELECT d.document_id, dv.version_id, d.matter_id
        FROM documents d
        JOIN LATERAL (
          SELECT version_id
          FROM document_versions
          WHERE tenant_id = d.tenant_id
            AND document_id = d.document_id
            AND version_status = 'current'
          ORDER BY created_at DESC
          LIMIT 1
        ) dv ON true
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND d.ai_allowed = true
          AND (
            NOT EXISTS (
              SELECT 1
              FROM ai_prep_artifacts a
              WHERE a.tenant_id = d.tenant_id
                AND a.document_version_id = dv.version_id
            )
            OR EXISTS (
              SELECT 1
              FROM ai_prep_artifacts a
              WHERE a.tenant_id = d.tenant_id
                AND a.document_version_id = dv.version_id
                AND (a.is_stale = true OR a.status IN ('stale', 'blocked', 'failed', 'rejected'))
            )
          )
        ORDER BY d.updated_at DESC, d.document_id ASC
        LIMIT 50
      `,
      [tenantId, matterId],
    );
    return result.rows as RetryDocumentRow[];
  }
}

function readinessStatus(artifacts: readonly ArtifactRow[]): AiPrepDocumentReadinessStatus {
  if (artifacts.length === 0) return 'pending';
  if (artifacts.some((artifact) => artifact.is_stale || artifact.status === 'stale'))
    return 'stale';
  if (artifacts.every((artifact) => artifact.status === 'completed')) return 'ready';
  if (artifacts.some((artifact) => artifact.status === 'completed')) return 'partial';
  if (artifacts.every((artifact) => artifact.status === 'blocked')) return 'blocked';
  if (artifacts.every((artifact) => artifact.status === 'failed')) return 'failed';
  if (artifacts.every((artifact) => artifact.status === 'rejected')) return 'rejected';
  return 'pending';
}

function matterDocumentReadiness(row: MatterReadinessRow): AiPrepDocumentReadinessStatus {
  if (!row.ai_allowed || !row.version_id) return 'not_ready';
  if (row.total_artifact_count === 0) return 'pending';
  if (row.stale_artifact_count > 0) return 'stale';
  if (row.completed_artifact_count === row.total_artifact_count) return 'ready';
  if (row.completed_artifact_count > 0) return 'partial';
  if (row.blocked_artifact_count === row.total_artifact_count) return 'blocked';
  if (row.failed_artifact_count === row.total_artifact_count) return 'failed';
  if (row.rejected_artifact_count === row.total_artifact_count) return 'rejected';
  return 'pending';
}

function permissionDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}
