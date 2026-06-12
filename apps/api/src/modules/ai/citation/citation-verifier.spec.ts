import { describe, expect, it } from 'vitest';
import type { AiCitationDto } from '@amic-vault/shared';
import { AiCitationVerifier } from './citation-verifier';

const citation: AiCitationDto = {
  citationRef: 'chunk:11111111-1111-4111-8111-111111111004',
  matterId: '11111111-1111-4111-8111-111111111001',
  documentId: '11111111-1111-4111-8111-111111111002',
  versionId: '11111111-1111-4111-8111-111111111003',
  chunkId: '11111111-1111-4111-8111-111111111004',
  quoteHash: 'a'.repeat(64),
  sourceTextHash: 'b'.repeat(64),
};

describe('AiCitationVerifier', () => {
  it('flags uncited, unknown, and legal-conclusion claims without auto approval', () => {
    const result = new AiCitationVerifier().verify({
      citations: [citation],
      claims: [
        {
          claimId: 'claim-uncited',
          claimHash: 'c'.repeat(64),
          citationRefs: [],
        },
        {
          claimId: 'claim-unknown',
          claimHash: 'd'.repeat(64),
          citationRefs: ['chunk:11111111-1111-4111-8111-111111111099'],
        },
        {
          claimId: 'claim-legal',
          claimHash: 'e'.repeat(64),
          citationRefs: [citation.citationRef],
          isLegalConclusion: true,
        },
      ],
    });

    expect(result.legalConclusionAutoApproval).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'UNCITED_CLAIM',
      'UNKNOWN_CITATION',
      'LEGAL_CONCLUSION_REQUIRES_REVIEW',
    ]);
    expect(JSON.stringify(result)).not.toContain('claim text');
  });
});
