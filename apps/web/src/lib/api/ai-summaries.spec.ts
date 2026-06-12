import { describe, expect, it, vi } from 'vitest';
import { createAiSummary } from './ai-summaries';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async () => ({ status: 'completed' })),
}));

describe('AI summaries API client', () => {
  it('posts summary requests without client-supplied evidence packs', async () => {
    await createAiSummary({
      matterId: '11111111-1111-4111-8111-111111111111',
      task: 'matter_summary',
      query: 'summarize authorized evidence',
    });

    expect(apiFetch).toHaveBeenCalledWith('/ai/summaries', {
      method: 'POST',
      body: JSON.stringify({
        matterId: '11111111-1111-4111-8111-111111111111',
        task: 'matter_summary',
        query: 'summarize authorized evidence',
      }),
    });
    expect(JSON.stringify(vi.mocked(apiFetch).mock.calls[0]?.[1])).not.toContain('evidencePack');
  });
});
