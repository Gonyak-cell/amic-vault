import { describe, expect, it, vi } from 'vitest';
import { getAiFeedbackMetrics, recordAiFeedback } from './ai-feedback';

describe('AI feedback API client', () => {
  it('posts structured feedback without free-form text fields', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          sessionId: '11111111-1111-4111-8111-111111111111',
          rating: 4,
          helpful: true,
          correctionType: 'minor_edit',
          errorTypes: ['incorrect_citation'],
          editDistance: 9,
        }),
      );
      expect(String(init?.body)).not.toMatch(/comment|body|content|snippet|raw|prompt|response/i);
      return new Response(
        JSON.stringify({
          feedbackId: '11111111-1111-4111-8111-111111111122',
          sessionId: '11111111-1111-4111-8111-111111111111',
          matterId: '11111111-1111-4111-8111-111111111133',
          recordedByUserId: '11111111-1111-4111-8111-111111111144',
          rating: 4,
          helpful: true,
          correctionType: 'minor_edit',
          errorTypes: ['incorrect_citation'],
          editDistance: 9,
          createdAt: '2026-06-12T00:00:00.000Z',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      recordAiFeedback({
        sessionId: '11111111-1111-4111-8111-111111111111',
        rating: 4,
        helpful: true,
        correctionType: 'minor_edit',
        errorTypes: ['incorrect_citation'],
        editDistance: 9,
      }),
    ).resolves.toMatchObject({ rating: 4 });
  });

  it('requests aggregate metrics with optional matter scope', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/ai/feedback/metrics?matterId=11111111-1111-4111-8111-111111111133');
      return new Response(
        JSON.stringify({
          tenantId: '11111111-1111-4111-8111-111111111111',
          matterId: '11111111-1111-4111-8111-111111111133',
          feedbackCount: 1,
          averageRating: 4,
          helpfulRate: 1,
          correctionRate: 0,
          hallucinationReportRate: 0,
          permissionConcernCount: 0,
          stopCriteria: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getAiFeedbackMetrics('11111111-1111-4111-8111-111111111133'),
    ).resolves.toMatchObject({ feedbackCount: 1 });
  });
});
