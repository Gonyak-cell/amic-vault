import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAiSessionDetail } from './ai-sessions';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('../config', () => ({
  apiBaseUrl: () => 'http://api.test/v1',
}));

describe('ai session api client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('fetches session detail without posting prompt or response text', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sessionId: '11111111-1111-4111-8111-111111111111' }),
    });

    await getAiSessionDetail('11111111-1111-4111-8111-111111111111');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/ai/sessions/11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toContain('prompt');
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toContain('responseText');
  });
});
