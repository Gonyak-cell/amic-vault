import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import { SearchService } from './search.service';

const ctx = {
  sessionId: '11111111-1111-4111-8111-111111111903',
  tenantId: '11111111-1111-4111-8111-111111111900',
  userId: '11111111-1111-4111-8111-111111111902',
};

const savedSearchRow = {
  can_revoke: true,
  created_at: new Date('2026-06-19T00:00:00.000Z'),
  filter_refs: 'target:body|matter_code_filter:present',
  last_opened_at: null,
  matter_id: null,
  name: 'Closing',
  opened_count: 0,
  query_hash: '0'.repeat(64),
  saved_search_id: '11111111-1111-4111-8111-111111111901',
  scope_type: 'personal',
  search_query_json: {
    filters: { matterCode: 'AMIC-2026-0001' },
    page: 1,
    pageSize: 10,
    query: 'closing',
    target: 'body',
  },
  updated_at: new Date('2026-06-19T00:10:00.000Z'),
};

function createService(
  query: QueryClient['query'],
  overrides: {
    queryBuilder?: unknown;
    scopeProvider?: unknown;
    snippetBuilder?: unknown;
  } = {},
) {
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
    (overrides.queryBuilder ?? {}) as never,
    (overrides.snippetBuilder ?? {}) as never,
    (overrides.scopeProvider ?? {}) as never,
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
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM saved_searches s'), [
      ctx.tenantId,
      ctx.userId,
      expect.any(Array),
      expect.any(Array),
    ]);
    const listCalls = vi.mocked(query).mock.calls as unknown[][];
    const [listSql] = listCalls[0] ?? [];
    expect(String(listSql)).toContain('matter_members');
    expect(String(listSql)).toContain("s.scope_type = 'admin-shared'");
    expect(String(listSql)).toContain('s.revoked_at IS NULL');
  });

  it('saves a search and audits hash/filter refs instead of raw snippets', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT role, status')) {
        return { rowCount: 1, rows: [{ role: 'matter_member', status: 'active' }] };
      }
      return { rowCount: 1, rows: [savedSearchRow] };
    });
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
    const auditPayload = JSON.stringify(auditCalls[0]?.[0]);
    expect(auditPayload).not.toContain('closing');
    expect(auditPayload).not.toContain('AMIC-2026-0001');
    expect(auditPayload).not.toMatch(/snippet|prompt|response|raw_snippet/i);
  });

  it('deletes only the caller-owned saved search and records a bounded audit ref', async () => {
    const query = vi.fn(async () => ({ rowCount: 1, rows: [savedSearchRow] }));
    const { auditService, service } = createService(query);

    await service.deleteSavedSearch(ctx, savedSearchRow.saved_search_id);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE saved_searches'), [
      ctx.tenantId,
      ctx.userId,
      savedSearchRow.saved_search_id,
      expect.any(Array),
      expect.any(Array),
    ]);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEARCH_EXECUTED',
        targetId: savedSearchRow.saved_search_id,
        targetType: 'saved_search',
        metadata: expect.objectContaining({
          filter_refs: expect.stringContaining('saved_search:revoke'),
        }),
      }),
      expect.any(Object),
    );
  });

  it('requires matter membership before saving a matter-team folder', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'matter_member', status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            ...savedSearchRow,
            matter_id: '11111111-1111-4111-8111-111111111921',
            scope_type: 'matter-team',
          },
        ],
      });
    const { service } = createService(query);

    await expect(
      service.saveSavedSearch(ctx, {
        matterId: '11111111-1111-4111-8111-111111111921',
        name: 'Team Closing',
        query: {
          filters: { matterId: '11111111-1111-4111-8111-111111111921' },
          page: 1,
          pageSize: 10,
          query: 'closing',
        },
        scope: 'matter-team',
      }),
    ).resolves.toMatchObject({ scope: 'matter-team' });
  });

  it('denies admin-shared folders for non-admin actors', async () => {
    const query = vi.fn(async () => ({
      rowCount: 1,
      rows: [{ role: 'matter_member', status: 'active' }],
    }));
    const { service } = createService(query);

    await expect(
      service.saveSavedSearch(ctx, {
        name: 'Tenant Closing',
        query: { page: 1, pageSize: 10, query: 'closing' },
        scope: 'admin-shared',
      }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('records aggregate-safe saved-search opens only through visible folders', async () => {
    const query = vi.fn(async () => ({
      rowCount: 1,
      rows: [{ ...savedSearchRow, last_opened_at: new Date('2026-06-19T01:00:00.000Z'), opened_count: 4 }],
    }));
    const { auditService, service } = createService(query);

    await expect(service.recordSavedSearchOpen(ctx, savedSearchRow.saved_search_id)).resolves.toMatchObject({
      openCount: 4,
      savedSearchId: savedSearchRow.saved_search_id,
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'saved_search',
        metadata: expect.objectContaining({
          filter_refs: expect.stringContaining('saved_search:open'),
          result_count: 0,
        }),
      }),
      expect.any(Object),
    );
    const auditCalls = vi.mocked(auditService.log).mock.calls as unknown[][];
    const auditPayload = JSON.stringify(auditCalls[0]?.[0]);
    expect(auditPayload).not.toContain('closing');
    expect(auditPayload).not.toMatch(/snippet|prompt|response|raw_snippet/i);
  });
});

describe('SearchService search privacy', () => {
  it('audits search execution with bounded refs instead of raw query or snippets', async () => {
    const privateQuery = 'privileged merger codeword';
    const privateSnippet = 'privileged clause body text';
    const query = vi.fn(async (sql: string) => {
      if (sql === 'facets-sql') {
        return { rowCount: 1, rows: [{ facets: {} }] };
      }
      return {
        rowCount: 1,
        rows: [
          {
            client_id: '11111111-1111-4111-8111-111111111922',
            client_name: 'Confidential Client',
            document_id: '11111111-1111-4111-8111-111111111923',
            document_type: 'contract',
            extraction_status: 'ready',
            matter_code: 'AMIC-2026-0001',
            matter_id: '11111111-1111-4111-8111-111111111921',
            matter_name: 'Secret Matter',
            raw_snippet: privateSnippet,
            score: 1,
            title: 'Secret acquisition plan',
            total: 1,
            updated_at: new Date('2026-06-19T00:00:00.000Z'),
            version_id: '11111111-1111-4111-8111-111111111924',
            version_status: 'current',
          },
        ],
      };
    });
    const { auditService, service } = createService(query, {
      queryBuilder: {
        build: vi.fn(() => ({ params: [], sql: 'search-sql' })),
        buildFacets: vi.fn(() => ({ params: [], sql: 'facets-sql' })),
      },
      scopeProvider: {
        scopeForSearch: vi.fn(async () => ({
          appliedRules: ['matter_member'],
          effect: 'ALLOW',
          scope: { params: [], sql: 'true' },
        })),
      },
      snippetBuilder: {
        parseHeadline: vi.fn(() => ({
          highlights: [{ end: 10, start: 0 }],
          snippet: privateSnippet,
        })),
      },
    });

    await expect(
      service.search(ctx, {
        filters: { matterCode: 'AMIC-2026-0001', title: 'Secret acquisition plan' },
        page: 1,
        pageSize: 10,
        query: privateQuery,
        target: 'body',
      }),
    ).resolves.toMatchObject({
      results: [
        expect.objectContaining({
          highlights: [{ anchorId: 'vph-1-0-10', end: 10, start: 0 }],
          snippet: privateSnippet,
        }),
      ],
      total: 1,
    });

    const auditCalls = vi.mocked(auditService.log).mock.calls as unknown[][];
    const auditEvent = (auditCalls[0]?.[0] ?? null) as
      | ({ metadata: Record<string, unknown> } & Record<string, unknown>)
      | null;
    expect(auditEvent).not.toBeNull();
    if (!auditEvent) throw new Error('missing search audit event');
    expect(auditEvent).toEqual(
      expect.objectContaining({
        action: 'SEARCH_EXECUTED',
        metadata: expect.objectContaining({
          filter_refs: expect.stringContaining('matter_code_filter:present'),
          query_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          query_length: privateQuery.length,
          result_count: 1,
          scope_type: 'keyword',
        }),
        targetType: 'search',
      }),
    );
    expect(Object.keys(auditEvent.metadata).sort()).toEqual([
      'duration_ms',
      'filter_refs',
      'query_hash',
      'query_length',
      'result_count',
      'scope_type',
    ]);
    const auditPayload = JSON.stringify(auditEvent);
    expect(auditPayload).not.toContain(privateQuery);
    expect(auditPayload).not.toContain(privateSnippet);
    expect(auditPayload).not.toContain('Secret acquisition plan');
    expect(auditPayload).not.toMatch(/raw_snippet|body text|prompt|response/i);
  });
});
