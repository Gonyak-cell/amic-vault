import { describe, expect, it } from 'vitest';
import {
  createLitigationAiSuggestionRequestSchema,
  createLitigationEvidenceRequestSchema,
  createLitigationFactRequestSchema,
  createLitigationHearingRequestSchema,
  createLitigationPleadingRequestSchema,
  litigationAiSuggestionSchema,
  litigationCaseMapResponseSchema,
  litigationEvidenceNextCodeResponseSchema,
  litigationFactSchema,
  litigationHearingSchema,
  updateLitigationFactRequestSchema,
  updateLitigationHearingRequestSchema,
} from './litigation-types';

const matterId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';

describe('litigation shared schemas', () => {
  it('requires version references to include their document reference', () => {
    expect(() =>
      createLitigationEvidenceRequestSchema.parse({
        matterId,
        versionId,
        evidenceCode: 'EV-001',
      }),
    ).toThrow();
    expect(
      createLitigationEvidenceRequestSchema.parse({
        matterId,
        documentId,
        versionId,
        evidenceCode: 'EV-001',
      }).versionId,
    ).toBe(versionId);
  });

  it('accepts direction-scoped Korean exhibit code suggestions separately from evidence_code', () => {
    const input = createLitigationEvidenceRequestSchema.parse({
      matterId,
      evidenceCode: 'GAP-003',
      evidenceDirection: 'gap',
      evidenceSequence: 3,
      exhibitLabel: '갑 제3호증',
    });
    expect(input).toMatchObject({
      evidenceCode: 'GAP-003',
      evidenceDirection: 'gap',
      evidenceSequence: 3,
      exhibitLabel: '갑 제3호증',
    });
    expect(() =>
      createLitigationEvidenceRequestSchema.parse({
        matterId,
        evidenceCode: '갑 제3호증',
      }),
    ).toThrow();

    expect(
      litigationEvidenceNextCodeResponseSchema.parse({
        matterId,
        direction: 'eul',
        evidenceCode: 'EUL-001',
        exhibitLabel: '을 제1호증',
        nextSequence: 1,
      }).exhibitLabel,
    ).toBe('을 제1호증');
  });

  it('rejects unsafe fact and citation reference strings', () => {
    expect(() =>
      createLitigationFactRequestSchema.parse({
        matterId,
        factCode: 'FACT-001',
        factSummary: 'The secret token says something',
      }),
    ).toThrow();
    expect(() =>
      createLitigationFactRequestSchema.parse({
        matterId,
        factCode: 'FACT-001',
        factSummary: 'Board met on the agreed date.',
        citationRefs: ['document:raw-content'],
      }),
    ).toThrow();
  });

  it('requires citation references for verified facts', () => {
    expect(() =>
      createLitigationFactRequestSchema.parse({
        matterId,
        factCode: 'FACT-002',
        factSummary: 'Board met on the agreed date.',
        status: 'verified',
      }),
    ).toThrow('FACT_CITATION_REQUIRED');

    expect(
      createLitigationFactRequestSchema.parse({
        matterId,
        factCode: 'FACT-003',
        factSummary: 'Board met on the agreed date.',
        status: 'verified',
        citationRefs: [`document:${documentId}`],
      }).status,
    ).toBe('verified');

    expect(() =>
      litigationFactSchema.parse({
        factId: '55555555-5555-4555-8555-555555555555',
        matterId,
        evidenceId: null,
        factCode: 'FACT-004',
        factSummary: 'Board met on the agreed date.',
        factDate: null,
        status: 'verified',
        materiality: 'medium',
        citationRefs: [],
        createdAt: '2026-06-28T00:00:00.000Z',
        updatedAt: '2026-06-28T00:00:00.000Z',
      }),
    ).toThrow('FACT_CITATION_REQUIRED');

    expect(() =>
      updateLitigationFactRequestSchema.parse({
        status: 'verified',
        citationRefs: [],
      }),
    ).toThrow('FACT_CITATION_REQUIRED');

    expect(
      updateLitigationFactRequestSchema.parse({
        status: 'verified',
        citationRefs: [`document:${documentId}`],
      }).status,
    ).toBe('verified');
  });

  it('keeps pleading status internal and non-transmitting', () => {
    expect(
      createLitigationPleadingRequestSchema.parse({
        matterId,
        pleadingCode: 'PLD-001',
        pleadingType: 'brief',
        filingStatus: 'approved_internal',
      }).filingStatus,
    ).toBe('approved_internal');
    expect(() =>
      createLitigationPleadingRequestSchema.parse({
        matterId,
        pleadingCode: 'PLD-002',
        filingStatus: 'efile_submitted',
      }),
    ).toThrow();
  });

  it('accepts internal hearing dates and rejects unsafe labels', () => {
    const hearing = createLitigationHearingRequestSchema.parse({
      matterId,
      title: '준비서면 제출기한',
      hearingType: 'deadline',
      scheduledAt: '2026-07-10T00:00:00.000Z',
      courtName: '서울중앙지방법원',
      internalDeadline: '2026-07-03',
    });
    expect(hearing.hearingType).toBe('deadline');
    expect(() =>
      createLitigationHearingRequestSchema.parse({
        matterId,
        title: 'secret hearing',
        scheduledAt: '2026-07-10T00:00:00.000Z',
      }),
    ).toThrow();
    expect(() => updateLitigationHearingRequestSchema.parse({})).toThrow();
    expect(
      litigationHearingSchema.parse({
        hearingId: '88888888-8888-4888-8888-888888888888',
        matterId,
        pleadingId: null,
        title: '준비서면 제출기한',
        hearingType: 'deadline',
        scheduledAt: '2026-07-10T00:00:00.000Z',
        courtName: null,
        location: null,
        internalDeadline: '2026-07-03',
        status: 'scheduled',
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z',
      }).status,
    ).toBe('scheduled');
  });

  it('accepts bounded case-map references only', () => {
    const parsed = litigationCaseMapResponseSchema.parse({
      matterId,
      evidenceCount: 1,
      factCount: 1,
      issueCount: 1,
      pleadingCount: 1,
      caseMap: [
        {
          evidenceId: '44444444-4444-4444-8444-444444444444',
          factId: '55555555-5555-4555-8555-555555555555',
          issueId: '66666666-6666-4666-8666-666666666666',
          pleadingId: '77777777-7777-4777-8777-777777777777',
          documentId,
          statusRefs: ['evidence:reviewed', 'pleading:internal_draft'],
          citationRefs: [`document:${documentId}`],
        },
      ],
    });
    expect(parsed.caseMap).toHaveLength(1);
  });

  it('accepts bounded AI classification suggestions and rejects raw-content labels', () => {
    const parsed = createLitigationAiSuggestionRequestSchema.parse({
      matterId,
      documentId,
      versionId,
      suggestionKind: 'issue_evidence_mapping',
      suggestedEvidenceDirection: 'gap',
      suggestedEvidenceType: 'document',
      suggestedIssueTitle: '손해액 입증',
      confidence: '0.82',
      sourceHash: 'a'.repeat(64),
    });
    expect(parsed.confidence).toBe(0.82);
    expect(parsed.suggestedIssueTitle).toBe('손해액 입증');

    expect(() =>
      createLitigationAiSuggestionRequestSchema.parse({
        matterId,
        documentId,
        suggestedIssueTitle: 'raw content summary',
        confidence: 0.7,
        sourceHash: 'b'.repeat(64),
      }),
    ).toThrow();

    expect(
      litigationAiSuggestionSchema.parse({
        suggestionId: '99999999-9999-4999-8999-999999999999',
        matterId,
        documentId,
        versionId,
        suggestionKind: 'evidence_classification',
        suggestedEvidenceDirection: 'eul',
        suggestedEvidenceType: 'email',
        suggestedIssueTitle: null,
        confidence: 0.91,
        sourceArtifactId: null,
        sourceHash: 'c'.repeat(64),
        status: 'pending',
        createdAt: '2026-07-05T00:00:00.000Z',
        updatedAt: '2026-07-05T00:00:00.000Z',
      }).status,
    ).toBe('pending');
  });
});
