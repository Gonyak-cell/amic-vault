import { describe, expect, it, vi } from 'vitest';
import type { AuditLogInput, AuditLogResult, AuditService } from '../../audit/audit.service';
import type { DocumentPermissionService } from '../../permission/document-permission.service';
import type { AiAuditRecorder } from '../audit/ai-audit-recorder.service';
import { AiCitationMapperService, type AiCitationRequestContext } from './citation-mapper.service';

const ctx: AiCitationRequestContext = {
  tenantId: '11111111-1111-4111-8111-111111111001',
  userId: '11111111-1111-4111-8111-111111111002',
  sessionId: '11111111-1111-4111-8111-111111111003',
};
const citation = {
  citationRef: 'chunk:11111111-1111-4111-8111-111111111004',
  matterId: '11111111-1111-4111-8111-111111111005',
  documentId: '11111111-1111-4111-8111-111111111006',
  versionId: '11111111-1111-4111-8111-111111111007',
  chunkId: '11111111-1111-4111-8111-111111111004',
  quoteHash: 'a'.repeat(64),
  sourceTextHash: 'b'.repeat(64),
};

describe('AiCitationMapperService', () => {
  it('fails closed and logs citation set hashes only when document permission denies', async () => {
    const auditInputs: AuditLogInput[] = [];
    const aiAuditRecorder = {
      recordCitedDocument: vi.fn(),
    } as unknown as AiAuditRecorder;
    const service = new AiCitationMapperService(
      {
        async transaction<T>(_tenantId: string, run: () => Promise<T>): Promise<T> {
          return run();
        },
        async log(input: AuditLogInput): Promise<AuditLogResult> {
          auditInputs.push(input);
          return { eventId: 'event-1', createdAt: new Date('2026-06-12T00:00:00.000Z') };
        },
      } as unknown as AuditService,
      aiAuditRecorder,
      {
        canReadDocument: vi.fn(async () => ({ effect: 'DENY', reason: 'PERMISSION_DENIED' })),
      } as unknown as DocumentPermissionService,
    );

    await expect(
      service.resolveSources(ctx, { matterId: citation.matterId, citations: [citation] }),
    ).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });

    expect(auditInputs).toHaveLength(1);
    expect(auditInputs[0]).toMatchObject({
      action: 'SEARCH_EXECUTED',
      targetType: 'ai_citation',
      result: 'denied',
      metadata: {
        scope_type: 'ai_citation',
        result_count: 0,
        document_count: 1,
      },
    });
    expect(JSON.stringify(auditInputs[0]?.metadata)).not.toContain(citation.documentId);
    expect(JSON.stringify(auditInputs[0]?.metadata)).not.toContain(citation.chunkId);
    expect(aiAuditRecorder.recordCitedDocument).not.toHaveBeenCalled();
  });
});
