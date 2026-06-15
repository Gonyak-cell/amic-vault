import { describe, expect, it } from 'vitest';
import { aiGroundedGenerationOutputSchema } from './generation';

const validOutput = {
  answer: '이 문서는 해지 조항의 통지 요건을 설명합니다.',
  sections: [
    {
      section_id: 'sec-1',
      heading: '핵심 요지',
      text: '해지 통지는 서면으로 해야 합니다.',
      source_refs: ['chunk:11111111-1111-4111-8111-111111111111'],
    },
  ],
  claims: [
    {
      claim_id: 'claim-1',
      kind: 'summary',
      text: '서면 통지 요건이 존재합니다.',
      source_refs: ['chunk:11111111-1111-4111-8111-111111111111'],
    },
  ],
};

describe('aiGroundedGenerationOutputSchema', () => {
  it('accepts cited grounded output', () => {
    expect(aiGroundedGenerationOutputSchema.parse(validOutput)).toEqual(validOutput);
  });

  it('rejects claims without source refs', () => {
    expect(() =>
      aiGroundedGenerationOutputSchema.parse({
        ...validOutput,
        claims: [{ ...validOutput.claims[0], source_refs: [] }],
      }),
    ).toThrow();
  });

  it('rejects unknown source ref shapes and raw extra fields', () => {
    expect(() =>
      aiGroundedGenerationOutputSchema.parse({
        ...validOutput,
        body: 'raw source body must not be accepted',
      }),
    ).toThrow();
    expect(() =>
      aiGroundedGenerationOutputSchema.parse({
        ...validOutput,
        claims: [{ ...validOutput.claims[0], source_refs: ['raw:abc'] }],
      }),
    ).toThrow();
  });
});
