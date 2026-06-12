import { describe, expect, it } from 'vitest';
import { aiFeedbackRequestSchema, aiFeedbackResponseSchema } from './feedback';

const sessionId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const feedbackId = '11111111-1111-4111-8111-111111111133';
const userId = '11111111-1111-4111-8111-111111111144';

describe('AI feedback shared schemas', () => {
  it('accepts bounded structured feedback without free-form text', () => {
    const parsed = aiFeedbackRequestSchema.parse({
      sessionId,
      rating: 4,
      helpful: true,
      correctionType: 'minor_edit',
      errorTypes: ['incorrect_citation'],
      editDistance: 12,
    });

    expect(parsed.errorTypes).toEqual(['incorrect_citation']);
    expect(JSON.stringify(parsed)).not.toMatch(/comment|body|content|snippet|raw|prompt|response/i);
  });

  it('rejects unstructured text and inconsistent correction distance', () => {
    expect(() =>
      aiFeedbackRequestSchema.parse({
        sessionId,
        rating: 5,
        comment: 'free-form text is not allowed',
      }),
    ).toThrow();
    expect(() =>
      aiFeedbackRequestSchema.parse({
        sessionId,
        rating: 5,
        correctionType: 'none',
        editDistance: 1,
      }),
    ).toThrow();
  });

  it('keeps response references structured', () => {
    expect(
      aiFeedbackResponseSchema.parse({
        feedbackId,
        sessionId,
        matterId,
        recordedByUserId: userId,
        rating: 3,
        helpful: false,
        correctionType: 'citation_fixed',
        errorTypes: ['missing_source'],
        editDistance: 25,
        createdAt: '2026-06-12T00:00:00.000Z',
      }),
    ).toMatchObject({ feedbackId, sessionId, matterId });
  });
});
