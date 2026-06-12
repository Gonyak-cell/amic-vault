import { describe, expect, it } from 'vitest';
import {
  aiCitationSchema,
  aiCitationSourceRequestSchema,
  aiCitationVerificationRequestSchema,
} from './citation';

const matterId = '11111111-1111-4111-8111-111111111001';
const documentId = '11111111-1111-4111-8111-111111111002';
const versionId = '11111111-1111-4111-8111-111111111003';
const chunkId = '11111111-1111-4111-8111-111111111004';
const hash = 'a'.repeat(64);

function citation() {
  return {
    citationRef: `chunk:${chunkId}`,
    matterId,
    documentId,
    versionId,
    chunkId,
    quoteHash: hash,
    sourceTextHash: hash,
  };
}

describe('ai citation schemas', () => {
  it('accepts citation objects with required source ids and quote hash only', () => {
    const parsed = aiCitationSchema.parse(citation());

    expect(parsed).toMatchObject({
      documentId,
      versionId,
      chunkId,
      quoteHash: hash,
    });
    expect(JSON.stringify(parsed)).not.toContain('raw body');
  });

  it('rejects mismatched refs, raw body fields, and matter mismatches', () => {
    expect(() =>
      aiCitationSchema.parse({ ...citation(), citationRef: 'chunk:other' }),
    ).toThrow(/citationRef/u);
    expect(() =>
      aiCitationSchema.parse({ ...citation(), rawBody: 'raw body must not be accepted' }),
    ).toThrow();
    expect(() =>
      aiCitationSourceRequestSchema.parse({
        matterId,
        citations: [
          {
            ...citation(),
            matterId: '22222222-2222-4222-8222-222222222222',
          },
        ],
      }),
    ).toThrow(/citation matter mismatch/u);
  });

  it('accepts hashed claim verification input without claim text', () => {
    const parsed = aiCitationVerificationRequestSchema.parse({
      citations: [citation()],
      claims: [
        {
          claimId: 'claim-1',
          claimHash: 'b'.repeat(64),
          citationRefs: [`chunk:${chunkId}`],
          isLegalConclusion: true,
        },
      ],
    });

    expect(parsed.claims[0]?.claimHash).toBe('b'.repeat(64));
    expect(JSON.stringify(parsed)).not.toContain('claim text');
  });
});
