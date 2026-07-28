import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentBulkActionJobDto } from '@amic-vault/shared';
import { DocumentBulkActionJob } from './document-bulk-action.job';

const payload: DocumentBulkActionJobDto = {
  actorUserId: '11111111-1111-4111-8111-111111111101',
  batchId: '11111111-1111-4111-8111-111111111102',
  tenantId: '11111111-1111-4111-8111-111111111103',
  tenantSlug: 'tenant-alpha',
};

describe('DocumentBulkActionJob', () => {
  it('records explicit per-item success and permission-denied results before finalizing', async () => {
    const items = [
      {
        itemId: '11111111-1111-4111-8111-111111111201',
        documentId: '11111111-1111-4111-8111-111111111301',
      },
      {
        itemId: '11111111-1111-4111-8111-111111111202',
        documentId: '11111111-1111-4111-8111-111111111302',
      },
    ];
    const batchService = {
      claimBatch: vi.fn(async () => ({ action: { kind: 'add_tag', tag: 'reviewed' }, items })),
      finalizeBatch: vi.fn(async () => undefined),
      recordItemResult: vi.fn(async () => undefined),
    };
    const executor = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ForbiddenException({ code: 'PERMISSION_DENIED' })),
    };
    const job = new DocumentBulkActionJob(
      batchService as never,
      executor as never,
      { run: (_context: unknown, callback: () => unknown) => callback() } as never,
    );

    await job.process(payload);

    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(batchService.recordItemResult).toHaveBeenNthCalledWith(1, payload, items[0]?.itemId, {
      succeeded: true,
    });
    expect(batchService.recordItemResult).toHaveBeenNthCalledWith(2, payload, items[1]?.itemId, {
      errorCode: 'PERMISSION_DENIED',
    });
    expect(batchService.finalizeBatch).toHaveBeenCalledWith(payload);
  });

  it('does not rewrite a successful mutation as a failure when receipt persistence fails', async () => {
    const item = {
      itemId: '11111111-1111-4111-8111-111111111201',
      documentId: '11111111-1111-4111-8111-111111111301',
    };
    const batchService = {
      claimBatch: vi.fn(async () => ({
        action: { kind: 'add_tag', tag: 'reviewed' },
        items: [item],
      })),
      finalizeBatch: vi.fn(async () => undefined),
      recordItemResult: vi.fn(async () => {
        throw new Error('receipt unavailable');
      }),
    };
    const job = new DocumentBulkActionJob(
      batchService as never,
      { execute: vi.fn(async () => undefined) } as never,
      { run: (_context: unknown, callback: () => unknown) => callback() } as never,
    );

    await expect(job.process(payload)).rejects.toThrow('receipt unavailable');
    expect(batchService.recordItemResult).toHaveBeenCalledTimes(1);
    expect(batchService.recordItemResult).toHaveBeenCalledWith(payload, item.itemId, {
      succeeded: true,
    });
    expect(batchService.finalizeBatch).not.toHaveBeenCalled();
  });
});
