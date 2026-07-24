import { describe, expect, it, vi } from 'vitest';
import type { RequestWithSession } from '../auth/session.guard';
import { DlpController } from './dlp.controller';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111102';
const assessmentId = '11111111-1111-4111-8111-1111111111d1';

function request(): RequestWithSession {
  return {
    session: {
      tenantId,
      userId,
      sessionId: 'review-session',
    },
  } as RequestWithSession;
}

describe('DlpController', () => {
  it('passes only a closed review DTO and authenticated context to the service', async () => {
    const createReview = vi.fn().mockResolvedValue({
      assessmentId,
      reviewId: '11111111-1111-4111-8111-1111111111d2',
      decision: 'allow',
      reasonCode: 'verified_safe',
      expiresAt: '2026-07-24T00:00:00.000Z',
      reviewedAt: '2026-07-23T00:00:00.000Z',
    });
    const controller = new DlpController({} as never, { createReview } as never);

    await expect(
      controller.createReview(request(), assessmentId, {
        decision: 'allow',
        reasonCode: 'verified_safe',
        expiresAt: '2026-07-24T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ assessmentId, decision: 'allow' });
    expect(createReview).toHaveBeenCalledWith(
      { tenantId, userId, sessionId: 'review-session' },
      assessmentId,
      {
        decision: 'allow',
        reasonCode: 'verified_safe',
        expiresAt: '2026-07-24T00:00:00.000Z',
      },
    );
  });

  it('rejects unknown fields and invalid decision/reason combinations', () => {
    const controller = new DlpController({} as never, { createReview: vi.fn() } as never);

    expect(() =>
      controller.createReview(request(), assessmentId, {
        decision: 'allow',
        reasonCode: 'sensitive_content_denied',
        expiresAt: '2026-07-24T00:00:00.000Z',
        note: 'free-form content',
      }),
    ).toThrowError(expect.objectContaining({ response: { code: 'VALIDATION_FAILED' } }));
  });
});
