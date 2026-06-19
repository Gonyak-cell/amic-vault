import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import { SearchService } from './search.service';

const ctx = {
  sessionId: '11111111-1111-4111-8111-111111111903',
  tenantId: '11111111-1111-4111-8111-111111111900',
  userId: '11111111-1111-4111-8111-111111111902',
};

const savedSearchRow = {
  created_at: new Date('2026-06-19T00:00:00.000Z'),
  filter_refs: 'target:body|matter_code_filter:present',
  name: 'Closing',
  query_hash: '0'.repeat(64),
  saved_search_id: '11111111-1111-4111-8111-111111111901',
  search_query_json: {
    filters: { matterCode: 'AMIC-2026-0001' },
    page: 1,
    pageSize: 10,
    query: 'closing',
    target: 'body',
  },
  updated_at: new Date('2026-06-19T00:10:00.000Z'),
};

function createService(query: QueryClient['query']) {
  const client = { query };
  const auditService = {
    log: vi.fn(async () => ({
      createdAt: new Date('2026-06-19T00:00:00.000Z'),
      eventId: '11111111-1111-4111-8111-111111111904',
    })),
    transaction: vi.fn(async (_tenantId: string, run: (client: QueryClient) => Promise<unknown>) =>
      run(client),
    ),
  };
  const service = new SearchService(
    auditService as unknown as AuditService,
    {} as never,
    {} as never,
    {} as never,
  );
  return { auditService, service };
}

describe('SearchService saved searches', () => {
  it('lists saved searches scoped to the current user', async () => {
    const query = vi.fn(async () => ({ rowCount: 1, rows: [savedSearchRow] }));
    const { service } = createService(query);

    await expect(service.listSavedSearches(ctx)).resolves.toEqual({
      items: [
        expect.objectContaining({
          name: 'Closing',
          query: expect.objectContaining({ query: 'closing', target: 'body' }),
          savedSearchId: savedSearchRow.saved_search_id,
        }),
      ],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM saved_searches'), [
      ctx.tenantId,
      ctx.userId,
    ]);
  });

  it('saves a search and audits hash/filter refs instead of raw snippets', async () => {
    const query = vi.fn(async () => ({ rowCount: 1, rows: [savedSearchRow] }));
    const { auditService, service } = createService(query);

    const saved = await service.saveSavedSearch(ctx, {
      name: 'Closing',
      query: {
        filters: { matterCode: 'AMIC-2026-0001' },
        page: 1,
        pageSize: 10,
        query: 'closing',
        target: 'body',
      },
    });

    expect(saved.savedSearchId).toBe(savedSearchRow.saved_search_id);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEARCH_EXECUTED',
        targetId: savedSearchRow.saved_search_id,
        targetType: 'saved_search',
        metadata: expect.objectContaining({
          filter_refs: expect.stringContaining('saved_search:save'),
          query_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          query_length: 7,
          request_id: savedSearchRow.saved_search_id,
        }),
      }),
      expect.any(Object),
    );
    const auditCalls = vi.mocked(auditService.log).mock.calls as unknown[][];
    expect(JSON.stringify(auditCalls[0]?.[0])).not.toMatch(/snippet|prompt|response/i);
  });

  it('deletes only the caller-owned saved search and records a bounded audit ref', async () => {
    const query = vi.fn(async () => ({ rowCount: 1, rows: [savedSearchRow] }));
    const { auditService, service } = createService(query);

    await service.deleteSavedSearch(ctx, savedSearchRow.saved_search_id);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM saved_searches'), [
      ctx.tenantId,
      ctx.userId,
      savedSearchRow.saved_search_id,
    ]);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEARCH_EXECUTED',
        targetId: savedSearchRow.saved_search_id,
        targetType: 'saved_search',
        metadata: expect.objectContaining({
          filter_refs: expect.stringContaining('saved_search:delete'),
        }),
      }),
      expect.any(Object),
    );
  });
});
