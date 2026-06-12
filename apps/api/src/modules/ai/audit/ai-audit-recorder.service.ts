import { Inject, Injectable } from '@nestjs/common';
import type { AiCitationSourceDto, AiSessionChunkLogDto } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';

export interface AiAuditContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

interface AiSessionAuditInput {
  aiSessionId: string;
  matterId: string;
}

export interface AiQuerySubmittedAuditInput extends AiSessionAuditInput {
  modelRoute: 'local_gemma';
}

export interface AiRetrievalAuditInput extends AiSessionAuditInput {
  chunks: readonly AiSessionChunkLogDto[];
}

export interface AiResponseAuditInput extends AiSessionAuditInput {
  responseHash: string;
  responseLength: number;
  responseTokenCount?: number | null;
  latencyMs?: number | null;
  status: 'responded' | 'blocked' | 'failed';
  blockedReason?: string | null;
  escalationRequired: boolean;
}

export interface AiCitedDocumentAuditInput {
  aiSessionId?: string | null;
  matterId: string;
  source: AiCitationSourceDto;
}

export interface AiFeedbackAuditInput extends AiSessionAuditInput {
  feedbackId: string;
  rating: number;
  helpful?: boolean | null;
  correctionType: string;
  errorTypes: readonly string[];
  editDistance: number;
}

@Injectable()
export class AiAuditRecorder {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  async recordQuerySubmitted(
    ctx: AiAuditContext,
    input: AiQuerySubmittedAuditInput,
    client?: QueryClient,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'AI_QUERY_SUBMITTED',
        targetType: 'ai_session',
        targetId: input.aiSessionId,
        matterId: input.matterId,
        metadata: {
          ai_session_id: input.aiSessionId,
          matter_id: input.matterId,
          model_route: input.modelRoute,
        },
      },
      client,
    );
  }

  async recordRetrieval(
    ctx: AiAuditContext,
    input: AiRetrievalAuditInput,
    client?: QueryClient,
  ): Promise<void> {
    const includedChunkIds = input.chunks
      .filter((chunk) => chunk.included)
      .map((chunk) => chunk.chunkId);
    const excludedChunkIds = input.chunks
      .filter((chunk) => !chunk.included)
      .map((chunk) => chunk.chunkId);

    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'AI_RETRIEVAL',
        targetType: 'ai_retrieval',
        targetId: input.aiSessionId,
        matterId: input.matterId,
        metadata: {
          ai_session_id: input.aiSessionId,
          matter_id: input.matterId,
          included_count: includedChunkIds.length,
          excluded_count: excludedChunkIds.length,
          included_chunk_ids: includedChunkIds,
          excluded_chunk_ids: excludedChunkIds,
        },
      },
      client,
    );

    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'AI_RETRIEVAL_EXCLUDED',
        targetType: 'ai_retrieval',
        targetId: input.aiSessionId,
        matterId: input.matterId,
        metadata: {
          ai_session_id: input.aiSessionId,
          matter_id: input.matterId,
          excluded_count: excludedChunkIds.length,
          excluded_chunk_ids: excludedChunkIds,
        },
      },
      client,
    );
  }

  async recordResponse(
    ctx: AiAuditContext,
    input: AiResponseAuditInput,
    client?: QueryClient,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'AI_RESPONSE',
        targetType: 'ai_response',
        targetId: input.aiSessionId,
        matterId: input.matterId,
        result:
          input.status === 'failed'
            ? 'failure'
            : input.status === 'blocked'
              ? 'denied'
              : 'success',
        metadata: {
          ai_session_id: input.aiSessionId,
          matter_id: input.matterId,
          hash: input.responseHash,
          response_length: input.responseLength,
          response_token_count: input.responseTokenCount ?? null,
          duration_ms: input.latencyMs ?? null,
          ai_response_status: input.status,
          blocked_reason: input.blockedReason ?? null,
          escalation_required: input.escalationRequired,
        },
      },
      client,
    );
  }

  async recordCitedDocument(
    ctx: AiAuditContext,
    input: AiCitedDocumentAuditInput,
    client?: QueryClient,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'AI_CITED_DOCUMENT',
        targetType: 'ai_cited_document',
        targetId: input.source.chunkId,
        matterId: input.matterId,
        metadata: {
          ...(input.aiSessionId ? { ai_session_id: input.aiSessionId } : {}),
          scope_type: 'ai_citation',
          scope_id: input.matterId,
          matter_id: input.matterId,
          document_id: input.source.documentId,
          version_id: input.source.versionId,
          chunk_id: input.source.chunkId,
          hash: input.source.sourceTextHash,
        },
      },
      client,
    );
  }

  async recordFeedback(
    ctx: AiAuditContext,
    input: AiFeedbackAuditInput,
    client?: QueryClient,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'AI_FEEDBACK_RECORDED',
        targetType: 'ai_feedback',
        targetId: input.feedbackId,
        matterId: input.matterId,
        metadata: {
          ai_session_id: input.aiSessionId,
          feedback_id: input.feedbackId,
          matter_id: input.matterId,
          rating: input.rating,
          helpful: input.helpful ?? null,
          correction_type: input.correctionType,
          error_types: input.errorTypes,
          edit_distance: input.editDistance,
        },
      },
      client,
    );
  }
}
