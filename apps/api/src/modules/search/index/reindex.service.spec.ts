import { describe, expect, it, vi } from 'vitest';
import { ReindexService } from './reindex.service';

describe('ReindexService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorUserId = '11111111-1111-4111-8111-111111111100';
  const matterId = '11111111-1111-4111-8111-111111111122';

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
          tenantId,
          userId: actorUserId,
        }),
      } as never,
    );

    await expect(
      service.requestReindex(actorUserId, {
        scopeType: 'matter',
        scopeId: matterId,
      }),
    ).resolves.toMatchObject({ accepted: true, enqueuedJobCount: 2 });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEARCH_REINDEX_REQUESTED',
        metadata: {
          scope_type: 'matter',
          scope_id: matterId,
          enqueued_job_count: 2,
        },
      }),
      tx,
    );
  });

  it('enqueues bounded embedding backfill batches through the search queue contract', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ matter_id: matterId }] })
        .mockResolvedValueOnce({
          rows: [
            { document_id: '11111111-1111-4111-8111-111111111144', version_id: 'v-1' },
            { document_id: '11111111-1111-4111-8111-111111111155', version_id: 'v-2' },
          ],
        }),
    };
    const auditLog = vi.fn(async () => undefined);
    const enqueueVersion = vi.fn(async (payload: { versionId: string }) => `job-${payload.versionId}`);
    const service = new ReindexService(
      {
        transaction: vi.fn(async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) =>
          run(tx),
        ),
        log: auditLog,
      } as never,
      { enqueueVersion } as never,
      {
        require: () => ({ tenantId, userId: actorUserId }),
      } as never,
    );

    await expect(
      service.requestEmbeddingBackfill(actorUserId, {
        scopeType: 'matter',
        scopeId: matterId,
        batchSize: 2,
      }),
    ).resolves.toMatchObject({
      accepted: true,
      scopeType: 'matter',
      scopeId: matterId,
      batchSize: 2,
      candidateVersionCount: 2,
      enqueuedJobCount: 2,
    });

    expect(enqueueVersion).toHaveBeenCalledTimes(2);
    expect(enqueueVersion).toHaveBeenNthCalledWith(
      1,
      {
        tenantId,
        documentId: '11111111-1111-4111-8111-111111111144',
        versionId: 'v-1',
      },
      tx,
    );
    expect(tx.query.mock.calls[1]?.[1]).toEqual([tenantId, 'bge_m3', matterId, 2]);
    expect(String(tx.query.mock.calls[1]?.[0])).toContain('LIMIT $4');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEARCH_REINDEX_REQUESTED',
        metadata: expect.objectContaining({
          scope_type: 'embedding_backfill_matter',
          scope_id: matterId,
          batch_size: 2,
          candidate_version_count: 2,
          enqueued_job_count: 2,
          queue_name: 'search.index',
          dead_letter_queue: 'search.index.dead',
        }),
      }),
      tx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toMatch(/body_text|content_text|snippet/i);
  });

  it('rejects invalid embedding backfill batch sizes fail-closed', async () => {
    const service = new ReindexService(
      {
        transaction: vi.fn(),
        log: vi.fn(),
      } as never,
      { enqueueVersion: vi.fn() } as never,
      {
        require: () => ({ tenantId, userId: actorUserId }),
      } as never,
    );

    await expect(
      service.requestEmbeddingBackfill(actorUserId, {
        scopeType: 'tenant',
        batchSize: 501,
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'EMBEDDING_BACKFILL_BATCH_SIZE_INVALID' },
    });
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
              ocr_low_confidence_count: '1',
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
          tenantId,
          userId: actorUserId,
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
      ocrLowConfidenceCount: 1,
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

  it('returns embedding backfill progress using pending, stale, legacy, and dead-letter counts', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              pending_version_count: '2',
              missing_embedding_count: '3',
              stale_chunk_count: '4',
              stale_embedding_count: '5',
              legacy_embedding_count: '6',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ queue_depth: '7', dead_letter_count: '8' }],
        }),
    };
    const service = new ReindexService(
      {
        transaction: vi.fn(async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) =>
          run(tx),
        ),
        log: vi.fn(),
      } as never,
      { enqueueVersion: vi.fn() } as never,
      {
        require: () => ({ tenantId, userId: actorUserId }),
      } as never,
    );

    await expect(service.getEmbeddingBackfillProgress()).resolves.toEqual({
      pendingVersionCount: 2,
      missingEmbeddingCount: 3,
      staleChunkCount: 4,
      staleEmbeddingCount: 5,
      legacyEmbeddingCount: 6,
      queueDepth: 7,
      deadLetterJobCount: 8,
    });
    expect(tx.query.mock.calls.map(([sql]) => String(sql)).join('\n')).toContain('pgboss.job');
    expect(tx.query.mock.calls.map(([sql]) => String(sql)).join('\n')).not.toMatch(
      /content_text|body_text|snippet|prompt|response/i,
    );
  });
});
