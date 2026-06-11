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
});
