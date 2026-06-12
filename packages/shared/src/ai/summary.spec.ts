import { describe, expect, it } from 'vitest';
import { aiSummaryRequestSchema, aiSummaryResponseSchema } from './summary';

const matterId = '11111111-1111-4111-8111-111111111111';
const documentId = '11111111-1111-4111-8111-111111111112';
const versionId = '11111111-1111-4111-8111-111111111113';
const chunkId = '11111111-1111-4111-8111-111111111114';
const hash = 'a'.repeat(64);

describe('AI summary schemas', () => {
  it('keeps summary requests matter-scoped', () => {
    expect(
      aiSummaryRequestSchema.parse({
        matterId,
        task: 'matter_summary',
        query: 'summarize the authorized matter evidence',
        filters: { matterId },
      }),
    ).toMatchObject({ matterId, task: 'matter_summary' });

    expect(() =>
      aiSummaryRequestSchema.parse({
        matterId,
        task: 'matter_summary',
        query: 'summarize',
        filters: { matterId: '22222222-2222-4222-8222-222222222222' },
      }),
    ).toThrow(/filters\.matterId/u);
  });

  it('requires cited evidence for successful outputs', () => {
    const parsed = aiSummaryResponseSchema.parse({
      sessionId: '11111111-1111-4111-8111-111111111115',
      matterId,
      task: 'document_summary',
      status: 'completed',
      modelRoute: 'local_gemma',
      evidencePackId: '11111111-1111-4111-8111-111111111116',
      citations: [
        {
          citationRef: `chunk:${chunkId}`,
          matterId,
          documentId,
          versionId,
          chunkId,
          quoteHash: hash,
          sourceTextHash: hash,
        },
      ],
      claims: [
        {
          claimId: 'document_summary-1',
          claimHash: hash,
          citationRefs: [`chunk:${chunkId}`],
        },
      ],
      sections: [
        {
          sectionId: 'document_summary-1',
          heading: 'Document evidence',
          text: 'Evidence-only summary text.',
          citationRefs: [`chunk:${chunkId}`],
        },
      ],
      warnings: ['EVIDENCE_ONLY_DEGRADED'],
      citationWarnings: [],
      escalationRequired: false,
      legalConclusionAutoApproval: false,
    });

    expect(parsed.citations).toHaveLength(1);
    expect(() => aiSummaryResponseSchema.parse({ ...parsed, citations: [] })).toThrow();
  });
});
