import { describe, expect, it, vi } from 'vitest';
import {
  getDocumentAiPrepStatus,
  getMatterAiPrepReadiness,
  recordAiPrepFeedback,
  retryMatterAiPrep,
} from './ai-prep';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
}));

describe('AI prep API client', () => {
  it('loads document and matter readiness surfaces', async () => {
    await getDocumentAiPrepStatus('11111111-1111-4111-8111-111111111111');
    await getMatterAiPrepReadiness('11111111-1111-4111-8111-111111111112');

    expect(apiFetch).toHaveBeenCalledWith(
      '/documents/11111111-1111-4111-8111-111111111111/ai-prep',
    );
    expect(apiFetch).toHaveBeenCalledWith(
      '/matters/11111111-1111-4111-8111-111111111112/ai-prep',
    );
  });

  it('posts structured artifact feedback without free-form text', async () => {
    await recordAiPrepFeedback({
      artifactId: '11111111-1111-4111-8111-111111111113',
      feedbackKind: 'incorrect',
      reasonCode: 'missing_citation',
    });

    const init = vi.mocked(apiFetch).mock.calls.at(-1)?.[1];
    expect(apiFetch).toHaveBeenCalledWith('/ai/prep/feedback', expect.any(Object));
    expect(init?.body).toBe(
      JSON.stringify({
        artifactId: '11111111-1111-4111-8111-111111111113',
        feedbackKind: 'incorrect',
        reasonCode: 'missing_citation',
      }),
    );
    expect(String(init?.body)).not.toMatch(/comment|body|content|snippet|raw|prompt|response/i);
  });

  it('posts a matter retry command without user text', async () => {
    await retryMatterAiPrep('11111111-1111-4111-8111-111111111114');

    expect(apiFetch).toHaveBeenCalledWith(
      '/matters/11111111-1111-4111-8111-111111111114/ai-prep/retry',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
  });
});
