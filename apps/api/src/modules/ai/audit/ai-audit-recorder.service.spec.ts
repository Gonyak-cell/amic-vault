import { describe, expect, it } from 'vitest';
import type { AuditLogInput, AuditLogResult, AuditService } from '../../audit/audit.service';
import { AiAuditRecorder } from './ai-audit-recorder.service';

const ctx = {
  tenantId: '11111111-1111-4111-8111-111111111001',
  userId: '11111111-1111-4111-8111-111111111002',
  sessionId: '11111111-1111-4111-8111-111111111003',
};
const aiSessionId = '11111111-1111-4111-8111-111111111004';
const matterId = '11111111-1111-4111-8111-111111111005';
const chunkId = '11111111-1111-4111-8111-111111111006';
const excludedChunkId = '11111111-1111-4111-8111-111111111007';
const documentId = '11111111-1111-4111-8111-111111111008';
const versionId = '11111111-1111-4111-8111-111111111009';
const hash = 'a'.repeat(64);

describe('AiAuditRecorder', () => {
  it('records the five AI audit events as reference-only metadata', async () => {
    const inputs: AuditLogInput[] = [];
    const recorder = new AiAuditRecorder({
      async log(input: AuditLogInput): Promise<AuditLogResult> {
        inputs.push(input);
        return { eventId: `event-${inputs.length}`, createdAt: new Date() };
      },
    } as unknown as AuditService);

    await recorder.recordQuerySubmitted(ctx, {
      aiSessionId,
      matterId,
      modelRoute: 'local_gemma',
    });
    await recorder.recordRetrieval(ctx, {
      aiSessionId,
      matterId,
      chunks: [
        {
          documentId,
          versionId,
          chunkId,
          included: true,
          reasonCode: 'included',
          rankIndex: 0,
          score: 1,
          quoteHash: hash,
          sourceTextHash: hash,
        },
        {
          documentId,
          versionId,
          chunkId: excludedChunkId,
          included: false,
          reasonCode: 'permission_denied',
          quoteHash: hash,
          sourceTextHash: hash,
        },
      ],
    });
    await recorder.recordResponse(ctx, {
      aiSessionId,
      matterId,
      responseHash: hash,
      responseLength: 64,
      responseTokenCount: 12,
      latencyMs: 25,
      status: 'responded',
      escalationRequired: false,
    });
    await recorder.recordCitedDocument(ctx, {
      matterId,
      source: {
        citationRef: `chunk:${chunkId}`,
        matterId,
        documentId,
        versionId,
        chunkId,
        title: 'not audited',
        documentType: 'memo',
        documentStatus: 'draft',
        versionStatus: 'current',
        quoteHash: hash,
        sourceTextHash: hash,
        citationAllowed: true,
        included: true,
      },
    });

    expect(inputs.map((input) => input.action)).toEqual([
      'AI_QUERY_SUBMITTED',
      'AI_RETRIEVAL',
      'AI_RETRIEVAL_EXCLUDED',
      'AI_RESPONSE',
      'AI_CITED_DOCUMENT',
    ]);
    expect(inputs[1]?.metadata).toMatchObject({
      included_count: 1,
      excluded_count: 1,
      included_chunk_ids: [chunkId],
      excluded_chunk_ids: [excludedChunkId],
    });
    expect(inputs[3]?.metadata).toMatchObject({
      hash,
      response_length: 64,
      response_token_count: 12,
      ai_response_status: 'responded',
    });
    const serialized = JSON.stringify(inputs.map((input) => input.metadata));
    expect(serialized).not.toContain('not audited');
    expect(serialized).not.toMatch(/body|content|snippet|prompt|responseText|raw/i);
  });
});
