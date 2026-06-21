import { describe, expect, it, vi } from 'vitest';
import {
  deleteSavedSearch,
  listSavedSearches,
  recordSavedSearchOpen,
  saveSavedSearch,
  searchDocuments,
} from './search';
import { apiFetch } from '../api-client';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
}));

describe('search API client', () => {
  it('executes search and saved-search commands without storing snippets', async () => {
    await searchDocuments({ page: 1, pageSize: 10, query: 'closing', target: 'body' });
    await listSavedSearches();
    await saveSavedSearch({
      name: 'Closing',
      query: {
        query: 'closing',
        filters: { matterCode: 'AMIC-2026-0001' },
        page: 1,
        pageSize: 10,
        target: 'body',
      },
    });
    await recordSavedSearchOpen('11111111-1111-4111-8111-111111111901');
    await deleteSavedSearch('11111111-1111-4111-8111-111111111901');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/search', {
      method: 'POST',
      body: JSON.stringify({ page: 1, pageSize: 10, query: 'closing', target: 'body' }),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/search/saved-searches');
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/search/saved-searches', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Closing',
        query: {
          query: 'closing',
          filters: { matterCode: 'AMIC-2026-0001' },
          page: 1,
          pageSize: 10,
          target: 'body',
        },
      }),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      '/search/saved-searches/11111111-1111-4111-8111-111111111901/open',
      { method: 'POST' },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      5,
      '/search/saved-searches/11111111-1111-4111-8111-111111111901',
      { method: 'DELETE' },
    );
    expect(String(vi.mocked(apiFetch).mock.calls[2]?.[1]?.body)).not.toMatch(
      /snippet|raw|prompt|response/i,
    );
  });
});
