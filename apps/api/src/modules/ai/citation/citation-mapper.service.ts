import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  aiCitationSourceResponseSchema,
  type AiCitationDto,
  type AiCitationSourceDto,
  type AiCitationSourceRequestDto,
  type AiCitationSourceResponseDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { DocumentPermissionService } from '../../permission/document-permission.service';
import { AiAuditRecorder } from '../audit/ai-audit-recorder.service';

export interface AiCitationRequestContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

interface CitationSourceRow {
  chunk_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  title: string;
  document_type: string;
  document_status: string;
  version_status: string;
  text_hash: string;
  source_text_hash: string;
}

@Injectable()
export class AiCitationMapperService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AiAuditRecorder) private readonly aiAuditRecorder: AiAuditRecorder,
    @Inject(DocumentPermissionService)
    private readonly documentPermissionService: DocumentPermissionService,
  ) {}

  async resolveSources(
    ctx: AiCitationRequestContext,
    input: AiCitationSourceRequestDto,
    aiSessionId?: string | null,
  ): Promise<AiCitationSourceResponseDto> {
    try {
      return await this.auditService.transaction(ctx.tenantId, async (client) => {
        const sources: AiCitationSourceDto[] = [];
        for (const citation of input.citations) {
          await this.assertCanReadCitation(ctx, citation);
          sources.push(await this.resolveCitationSource(client, ctx.tenantId, citation));
        }
        for (const source of sources) {
          await this.aiAuditRecorder.recordCitedDocument(
            ctx,
            { aiSessionId: aiSessionId ?? null, matterId: input.matterId, source },
            client,
          );
        }
        await this.recordCitationLog(client, ctx, input, 'success', sources.length);
        return aiCitationSourceResponseSchema.parse({ sources });
      });
    } catch {
      await this.recordCitationLog(undefined, ctx, input, 'denied', 0);
      throw permissionDenied();
    }
  }

  private async assertCanReadCitation(
    ctx: AiCitationRequestContext,
    citation: AiCitationDto,
  ): Promise<void> {
    let decision: Awaited<ReturnType<DocumentPermissionService['canReadDocument']>> | undefined;
    try {
      decision = await this.documentPermissionService.canReadDocument(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        },
        citation.documentId,
      );
    } catch {
      decision = undefined;
    }
    if (decision?.effect !== 'ALLOW') {
      throw permissionDenied();
    }
  }

  private async resolveCitationSource(
    client: PoolClient,
    tenantId: string,
    citation: AiCitationDto,
  ): Promise<AiCitationSourceDto> {
    const result = await client.query<CitationSourceRow>(
      `
        SELECT dc.chunk_id, dc.document_id, dc.version_id, d.matter_id,
          d.title, d.document_type, d.status AS document_status,
          dv.version_status, dc.text_hash, dc.source_text_hash
        FROM document_chunks dc
        JOIN documents d
          ON d.tenant_id = dc.tenant_id
         AND d.document_id = dc.document_id
        JOIN document_versions dv
          ON dv.tenant_id = dc.tenant_id
         AND dv.version_id = dc.version_id
        WHERE dc.tenant_id = $1
          AND d.matter_id = $2
          AND dc.document_id = $3
          AND dc.version_id = $4
          AND dc.chunk_id = $5
          AND dc.stale = false
          AND d.status <> 'deleted'
        LIMIT 1
      `,
      [
        tenantId,
        citation.matterId,
        citation.documentId,
        citation.versionId,
        citation.chunkId,
      ],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.text_hash !== citation.quoteHash ||
      row.source_text_hash !== citation.sourceTextHash
    ) {
      throw permissionDenied();
    }

    return {
      citationRef: citation.citationRef,
      matterId: row.matter_id,
      documentId: row.document_id,
      versionId: row.version_id,
      chunkId: row.chunk_id,
      title: row.title,
      documentType: row.document_type,
      documentStatus: row.document_status,
      versionStatus: row.version_status,
      quoteHash: citation.quoteHash,
      sourceTextHash: row.source_text_hash,
      citationAllowed: true,
      included: true,
    };
  }

  private async recordCitationLog(
    client: QueryClient | undefined,
    ctx: AiCitationRequestContext,
    input: AiCitationSourceRequestDto,
    result: 'success' | 'denied',
    includedCount: number,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'SEARCH_EXECUTED',
        targetType: 'ai_citation',
        matterId: input.matterId,
        result,
        metadata: {
          scope_type: 'ai_citation',
          scope_id: input.matterId,
          hash: citationSetHash(input.citations),
          document_count: new Set(input.citations.map((citation) => citation.documentId)).size,
          result_count: includedCount,
          filter_refs: `included:${result === 'success'}|citation_count:${input.citations.length}`,
        },
      },
      client,
    );
  }
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function citationSetHash(citations: readonly AiCitationDto[]): string {
  const canonical = citations
    .map((citation) =>
      [
        citation.matterId,
        citation.documentId,
        citation.versionId,
        citation.chunkId,
        citation.quoteHash,
        citation.sourceTextHash,
      ].join(':'),
    )
    .sort()
    .join('|');
  return createHash('sha256').update(canonical).digest('hex');
}
