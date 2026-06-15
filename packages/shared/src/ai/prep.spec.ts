import { describe, expect, it } from 'vitest';
import {
  aiPrepArtifactKindSchema,
  aiPrepArtifactPayloadSchema,
  aiPrepPayloadBannedTopLevelKeys,
  aiPrepStatusSchema,
} from './prep';

const validPayload = {
  answer: '업로드 문서의 핵심 내용입니다.',
  sections: [
    {
      section_id: 'brief',
      heading: '요약',
      text: '문서에 근거한 준비 요약입니다.',
      source_refs: ['chunk:11111111-1111-4111-8111-111111111111'],
    },
  ],
  claims: [
    {
      claim_id: 'claim-1',
      kind: 'summary',
      text: '문서에 근거한 claim입니다.',
      source_refs: ['chunk:11111111-1111-4111-8111-111111111111'],
      is_legal_conclusion: false,
    },
  ],
  source_refs: ['chunk:11111111-1111-4111-8111-111111111111'],
};

describe('ai prep shared contract', () => {
  it('defines bounded artifact kinds and statuses', () => {
    expect(aiPrepArtifactKindSchema.parse('document_brief')).toBe('document_brief');
    expect(aiPrepArtifactKindSchema.parse('risk_candidates')).toBe('risk_candidates');
    expect(aiPrepStatusSchema.parse('completed')).toBe('completed');
    expect(aiPrepStatusSchema.parse('blocked')).toBe('blocked');
  });

  it('accepts grounded payloads with source refs', () => {
    expect(aiPrepArtifactPayloadSchema.parse(validPayload)).toMatchObject({
      answer: validPayload.answer,
      source_refs: validPayload.source_refs,
    });
  });

  it('rejects raw prompt, source body, or response top-level keys', () => {
    for (const key of aiPrepPayloadBannedTopLevelKeys) {
      expect(() => aiPrepArtifactPayloadSchema.parse({ ...validPayload, [key]: 'raw' })).toThrow();
    }
  });
});
