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
    expect(
      aiSummaryRequestSchema.parse({
        matterId,
        task: 'matter_qa',
        query: 'answer from authorized matter evidence only',
      }),
    ).toMatchObject({ matterId, task: 'matter_qa' });

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
      conclusion: 'Evidence-only summary text.',
      openQuestions: [],
      recommendedActions: [],
      excludedSourcesNotice: { count: 0 },
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

  it('requires the structured E3 answer fields and escalates recommended actions', () => {
    const parsed = aiSummaryResponseSchema.parse({
      ...summaryResponse(),
      conclusion: '검토 결과 계약 상대방은 인용 문서 기준 AMIC Holdings입니다.',
      openQuestions: [
        {
          question: '추가 송부본이 있는지는 현재 근거에서 확정할 수 없습니다.',
          neededEvidence: '최신 송부본 또는 체결본을 추가 확인해야 합니다.',
        },
      ],
      recommendedActions: [
        {
          action: '담당 변호사가 추가 송부본 존재 여부를 확인합니다.',
          reviewRequired: true,
        },
      ],
      excludedSourcesNotice: { count: 2 },
      status: 'escalated',
      escalationRequired: true,
    });

    expect(parsed.conclusion).toContain('AMIC Holdings');
    expect(parsed.openQuestions).toHaveLength(1);
    expect(parsed.excludedSourcesNotice.count).toBe(2);
    expect(() =>
      aiSummaryResponseSchema.parse({
        ...parsed,
        recommendedActions: [{ action: '검토합니다.', reviewRequired: true }],
        escalationRequired: false,
      }),
    ).toThrow(/recommendedActions require escalationRequired=true/u);
    expect(() => aiSummaryResponseSchema.parse({ ...parsed, conclusion: undefined })).toThrow();
  });
});

function summaryResponse() {
  return {
    sessionId: '11111111-1111-4111-8111-111111111115',
    matterId,
    task: 'document_summary',
    status: 'completed',
    modelRoute: 'local_gemma',
    evidencePackId: '11111111-1111-4111-8111-111111111116',
    conclusion: 'Evidence-only summary text.',
    openQuestions: [],
    recommendedActions: [],
    excludedSourcesNotice: { count: 0 },
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
  };
}
