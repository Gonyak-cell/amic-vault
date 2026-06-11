import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BulkUploadJob } from './bulk-upload.job';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';

function item(id: string) {
  return {
    itemId: id,
    tenantId,
    tenantSlug: 'tenant-alpha',
    actorUserId,
    matterId,
    fields: {},
    file: {
      path: `/tmp/${id}.pdf`,
      originalname: `${id}.pdf`,
      mimetype: 'application/pdf',
      size: 12,
    },
  };
}

describe('BulkUploadJob', () => {
  it('reuses the single upload pipeline and reports per-item permission failures', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({
        documentId: 'doc-1',
        matterId,
        fileObjectId: 'file-1',
        status: 'draft',
        title: 'One',
        duplicates: [],
      })
      .mockRejectedValueOnce(new ForbiddenException({ code: 'PERMISSION_DENIED' }))
      .mockResolvedValueOnce({
        documentId: 'doc-3',
        matterId,
        fileObjectId: 'file-3',
        status: 'draft',
        title: 'Three',
        duplicates: [],
      });
    const job = new BulkUploadJob(
      { upload } as never,
      { run: (_context: unknown, callback: () => unknown) => callback() } as never,
    );

    const report = await job.process({ items: [item('one'), item('two'), item('three')] });

    expect(upload).toHaveBeenCalledTimes(3);
    expect(report).toMatchObject({
      queueName: 'document.bulk-upload',
      total: 3,
      succeeded: 2,
      failed: 1,
    });
    expect(report.items[1]).toEqual({
      itemId: 'two',
      status: 'failed',
      code: 'PERMISSION_DENIED',
    });
  });
});
