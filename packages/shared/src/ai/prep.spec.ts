import { describe, expect, it } from 'vitest';
import {
  aiPrepArtifactKindSchema,
  aiPrepArtifactAllowedClaimKinds,
  aiPrepDocumentStatusSchema,
  aiPrepArtifactPayloadSchema,
  aiPrepFeedbackRequestSchema,
  aiPrepMatterReadinessSchema,
  aiPrepPayloadBannedTopLevelKeys,
  aiPrepStaleReasonSchema,
  aiPrepStatusSchema,
  parseAiPrepArtifactPayload,
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
    expect(aiPrepArtifactKindSchema.parse('document_profile')).toBe('document_profile');
    expect(aiPrepArtifactKindSchema.parse('key_fields')).toBe('key_fields');
    expect(() => aiPrepArtifactKindSchema.parse('risk_candidates')).toThrow();
    expect(aiPrepStatusSchema.parse('completed')).toBe('completed');
    expect(aiPrepStatusSchema.parse('blocked')).toBe('blocked');
    expect(aiPrepStatusSchema.parse('rejected')).toBe('rejected');
    expect(aiPrepStaleReasonSchema.parse('new_version')).toBe('new_version');
    expect(aiPrepStaleReasonSchema.parse('permission_changed')).toBe('permission_changed');
    expect(() => aiPrepStaleReasonSchema.parse('operator free-form note')).toThrow();
  });

  it('accepts grounded payloads with source refs', () => {
    expect(aiPrepArtifactPayloadSchema.parse(validPayload)).toMatchObject({
      answer: validPayload.answer,
      source_refs: validPayload.source_refs,
    });
    expect(parseAiPrepArtifactPayload(validPayload, 'document_profile')).toMatchObject({
      answer: validPayload.answer,
    });
  });

  it('rejects legal-analysis claim kinds in prep payloads', () => {
    for (const kind of ['risk', 'issue', 'clause'] as const) {
      expect(() =>
        aiPrepArtifactPayloadSchema.parse({
          ...validPayload,
          claims: [{ ...validPayload.claims[0], kind }],
        }),
      ).toThrow();
    }
  });

  it('enforces artifact-specific prep claim kind allowlists', () => {
    expect(aiPrepArtifactAllowedClaimKinds('date_facts')).toContain('timeline');
    expect(
      parseAiPrepArtifactPayload(
        {
          ...validPayload,
          claims: [{ ...validPayload.claims[0], kind: 'timeline' }],
        },
        'date_facts',
      ).claims[0]?.kind,
    ).toBe('timeline');
    expect(() =>
      parseAiPrepArtifactPayload(
        {
          ...validPayload,
          claims: [{ ...validPayload.claims[0], kind: 'timeline' }],
        },
        'document_profile',
      ),
    ).toThrow();
  });

  it('rejects payload refs that are not declared in top-level source refs', () => {
    expect(() =>
      aiPrepArtifactPayloadSchema.parse({
        ...validPayload,
        source_refs: ['chunk:22222222-2222-4222-8222-222222222222'],
      }),
    ).toThrow();
  });

  it('rejects raw prompt, source body, or response top-level keys', () => {
    for (const key of aiPrepPayloadBannedTopLevelKeys) {
      expect(() => aiPrepArtifactPayloadSchema.parse({ ...validPayload, [key]: 'raw' })).toThrow();
    }
  });

  it('defines document prep readiness without raw source fields', () => {
    const parsed = aiPrepDocumentStatusSchema.parse({
      documentId: '11111111-1111-4111-8111-111111111100',
      versionId: '11111111-1111-4111-8111-111111111101',
      readinessStatus: 'ready',
      artifacts: [
        {
          artifactId: '11111111-1111-4111-8111-111111111102',
          artifactKind: 'document_profile',
          status: 'completed',
          isStale: false,
          staleReason: null,
          sourceChunkCount: 1,
          generatedAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:01.000Z',
          payload: validPayload,
        },
      ],
    });

    expect(parsed.readinessStatus).toBe('ready');
    expect(JSON.stringify(parsed)).not.toMatch(/prompt|response|raw|snippet/u);
  });

  it('allows rejected readiness without exposing a payload', () => {
    const parsed = aiPrepDocumentStatusSchema.parse({
      documentId: '11111111-1111-4111-8111-111111111100',
      versionId: '11111111-1111-4111-8111-111111111101',
      readinessStatus: 'rejected',
      artifacts: [
        {
          artifactId: '11111111-1111-4111-8111-111111111102',
          artifactKind: 'document_profile',
          status: 'rejected',
          isStale: false,
          staleReason: null,
          sourceChunkCount: 1,
          generatedAt: null,
          updatedAt: '2026-06-15T00:00:01.000Z',
          payload: null,
        },
      ],
    });

    expect(parsed.readinessStatus).toBe('rejected');
    expect(parsed.artifacts[0]?.payload).toBeNull();
  });

  it('accepts structured prep feedback without free-form comments', () => {
    const parsed = aiPrepFeedbackRequestSchema.parse({
      artifactId: '11111111-1111-4111-8111-111111111102',
      feedbackKind: 'incorrect',
      reasonCode: 'missing_source_ref',
    });

    expect(parsed.feedbackKind).toBe('incorrect');
    expect(parsed.reasonCode).toBe('missing_source_ref');
    expect(
      aiPrepFeedbackRequestSchema.parse({
        artifactId: '11111111-1111-4111-8111-111111111102',
        feedbackKind: 'incorrect',
        reasonCode: 'rejected_output',
      }).reasonCode,
    ).toBe('rejected_output');
    expect(() =>
      aiPrepFeedbackRequestSchema.parse({
        ...parsed,
        comment: 'would leak matter details',
      }),
    ).toThrow();
  });

  it('defines matter prep readiness aggregates', () => {
    const parsed = aiPrepMatterReadinessSchema.parse({
      matterId: '11111111-1111-4111-8111-111111111200',
      documentCount: 1,
      currentVersionCount: 1,
      readyDocumentCount: 1,
      pendingDocumentCount: 0,
      partialDocumentCount: 0,
      blockedDocumentCount: 0,
      failedDocumentCount: 0,
      rejectedDocumentCount: 0,
      staleDocumentCount: 0,
      notReadyDocumentCount: 0,
      pendingJobCount: 0,
      staleArtifactCount: 0,
      blockedArtifactCount: 0,
      rejectedArtifactCount: 0,
      fallbackArtifactCount: 0,
      documents: [
        {
          documentId: '11111111-1111-4111-8111-111111111201',
          title: '권한 범위 문서',
          currentVersionId: '11111111-1111-4111-8111-111111111202',
          aiAllowed: true,
          readinessStatus: 'ready',
          totalArtifactCount: 1,
          completedArtifactCount: 1,
          pendingArtifactCount: 0,
          blockedArtifactCount: 0,
          failedArtifactCount: 0,
          rejectedArtifactCount: 0,
          staleArtifactCount: 0,
          fallbackArtifactCount: 0,
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    });

    expect(parsed.readyDocumentCount).toBe(1);
  });
});
