import { describe, expect, it, vi } from 'vitest';
import { getLocalAiOpsHealth, getLocalAiOpsMetrics } from './ai-ops';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
}));

describe('AI ops API client', () => {
  it('loads local file organization prep health without auth redirects', async () => {
    await getLocalAiOpsHealth();

    expect(apiFetch).toHaveBeenCalledWith('/ai/ops/health', {
      redirectOnAuthRequired: false,
    });
  });

  it('loads local file organization prep metrics without auth redirects', async () => {
    await getLocalAiOpsMetrics();

    expect(apiFetch).toHaveBeenCalledWith('/ai/ops/metrics', {
      redirectOnAuthRequired: false,
    });
  });
});
