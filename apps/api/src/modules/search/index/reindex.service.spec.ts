import { describe, expect, it, vi } from 'vitest';
import { ReindexService } from './reindex.service';

describe('ReindexService', () => {
  it('audits reindex requests with scope references and counts only', async () => {
    const tx = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ matter_id: 'matter' }] })),
    };
    const auditLog = vi.fn(async () => undefined);
    const service = new ReindexService(
      {
        transaction: vi.fn(async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) =>
          run(tx),
        ),
        log: auditLog,
      } as never,
      {
        enqueueTenantOrMatterVersions: vi.fn(async () => ['job-1', 'job-2']),
      } as never,
      {
        require: () => ({
          tenantId: '11111111-1111-4111-8111-111111111111',
          userId: '11111111-1111-4111-8111-111111111100',
        }),
      } as never,
    );

    await expect(
      service.requestReindex('11111111-1111-4111-8111-111111111100', {
        scopeType: 'matter',
        scopeId: '11111111-1111-4111-8111-111111111122',
      }),
    ).resolves.toMatchObject({ accepted: true, enqueuedJobCount: 2 });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEARCH_REINDEX_REQUESTED',
        metadata: {
          scope_type: 'matter',
          scope_id: '11111111-1111-4111-8111-111111111122',
          enqueued_job_count: 2,
        },
      }),
      tx,
    );
  });

  it('returns search health using counts and query hashes without raw search content', async () => {
    const lastSeenAt = new Date('2026-06-19T15:00:00.000Z');
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              current_version_count: '5',
              indexed_version_count: '4',
              missing_index_count: '1',
              stale_index_count: '2',
              extraction_ready_count: '2',
              extraction_pending_count: '1',
              ocr_pending_count: '1',
              extraction_failed_count: '1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ stale_chunk_count: '3', stale_embedding_count: '4' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              query_audit_count_24h: '9',
              no_result_query_count_24h: '2',
              p95_duration_ms_24h: '240',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              category: 'keyword',
              count: '2',
              last_seen_at: lastSeenAt,
              query_hash: 'A'.repeat(64),
            },
          ],
        }),
    };
    const service = new ReindexService(
      {
        transaction: vi.fn(async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) =>
          run(tx),
        ),
        log: vi.fn(),
      } as never,
      {
        enqueueTenantOrMatterVersions: vi.fn(),
      } as never,
      {
        require: () => ({
          tenantId: '11111111-1111-4111-8111-111111111111',
          userId: '11111111-1111-4111-8111-111111111100',
        }),
      } as never,
    );

    const result = await service.getSearchHealth();

    expect(result).toMatchObject({
      currentVersionCount: 5,
      indexedVersionCount: 4,
      missingIndexCount: 1,
      staleIndexCount: 2,
      extractionFailedCount: 1,
      ocrPendingCount: 1,
      queryAuditCount24h: 9,
      noResultQueryCount24h: 2,
      p95DurationMs24h: 240,
      noResultQueries: [
        {
          category: 'keyword',
          count: 2,
          lastSeenAt: '2026-06-19T15:00:00.000Z',
          queryHash: 'a'.repeat(64),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/raw|snippet|bodyText|sourceText|prompt|response/i);
    expect(tx.query.mock.calls.map(([sql]) => String(sql)).join('\n')).not.toMatch(
      /content_text|body_text/i,
    );
  });
});
