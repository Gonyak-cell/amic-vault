import { describe, expect, it, vi } from 'vitest';
import { getSearchAdminHealth, requestTenantSearchReindex } from './search-admin';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
}));

describe('search admin API client', () => {
  it('requests tenant reindex through the admin endpoint without raw content', async () => {
    await requestTenantSearchReindex();

    expect(apiFetch).toHaveBeenCalledWith('/admin/search/reindex', {
      method: 'POST',
      body: JSON.stringify({ scopeType: 'tenant' }),
    });
    expect(String(vi.mocked(apiFetch).mock.calls[0]?.[1]?.body)).not.toMatch(
      /snippet|bodyText|raw|prompt|response/i,
    );
  });

  it('reads search health from the admin endpoint without posting search text', async () => {
    await getSearchAdminHealth();

    expect(apiFetch).toHaveBeenCalledWith('/admin/search/health');
  });
});
