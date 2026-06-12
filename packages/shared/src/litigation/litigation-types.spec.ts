import { describe, expect, it } from 'vitest';
import {
  createLitigationEvidenceRequestSchema,
  createLitigationFactRequestSchema,
  createLitigationPleadingRequestSchema,
  litigationCaseMapResponseSchema,
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
});
