import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { bulkUploadDeadLetterQueueName, bulkUploadQueueName, type BulkUploadJobDto } from '@amic-vault/shared';
import { BulkUploadJob } from './bulk-upload.job';
import {
  BulkUploadQueueService,
  bulkUploadQueueSendOptions,
  isBulkUploadQueueWorkerEnabled,
} from './bulk-upload-queue.service';

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
      { registerChildren: vi.fn() } as never,
      { intake: vi.fn() } as never,
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

  it('separates duplicate-decision items for batch user action', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          reason: 'DUPLICATE_DECISION_REQUIRED',
        }),
      );
    const job = new BulkUploadJob(
      { upload } as never,
      { run: (_context: unknown, callback: () => unknown) => callback() } as never,
      { registerChildren: vi.fn() } as never,
      { intake: vi.fn() } as never,
    );

    const report = await job.process({ items: [item('dupe')] });

    expect(report.items).toEqual([
      {
        itemId: 'dupe',
        status: 'duplicate',
        code: 'VALIDATION_FAILED',
        reason: 'DUPLICATE_DECISION_REQUIRED',
      },
    ]);
  });

  it('publishes pg-boss jobs and consumes them through BulkUploadJob.process', async () => {
    const previousEnv = { ...process.env };
    process.env.PROCESS_ROLE = 'worker';
    delete process.env.BULK_UPLOAD_QUEUE_WORKER_ENABLED;
    const payload: BulkUploadJobDto = {
      batchId: '11111111-1111-4111-8111-111111111177',
      chunkIndex: 0,
      items: [item('queued')],
    };
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'queued-job' }] })),
    };
    const options = bulkUploadQueueSendOptions(payload, client as never);
    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'queued-job' }],
    });
    expect(options).toMatchObject({
      singletonKey: `${payload.batchId}:0:queued`,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      deadLetter: bulkUploadDeadLetterQueueName,
    });
    expect(isBulkUploadQueueWorkerEnabled()).toBe(true);

    const report = {
      queueName: bulkUploadQueueName,
      total: 1,
      succeeded: 1,
      failed: 0,
      items: [
        {
          itemId: 'queued',
          status: 'success' as const,
          document: {
            documentId: 'doc-queued',
            matterId,
            fileObjectId: 'file-queued',
            status: 'draft' as const,
            title: 'Queued',
            documentType: 'other' as const,
            subtype: null,
            confidentialityLevel: 'standard' as const,
            privilegeStatus: 'not_privileged' as const,
            source: 'upload' as const,
            aiAllowed: false,
            versionLabel: null,
            versionSignificance: 'internal_draft' as const,
            renditionType: 'clean' as const,
            metadataSuggestion: {},
            duplicates: [],
          },
        },
      ],
    };
    const processor = { process: vi.fn(async () => report) };
    const batchService = {
      recordJobReport: vi.fn(async () => undefined),
      markJobDeadLetter: vi.fn(async () => undefined),
    };
    const handlers = new Map<
      string,
      (jobs: Array<{ data: BulkUploadJobDto; id: string }>) => Promise<void>
    >();
    const boss = {
      work: vi.fn(
        async (
          queueName: string,
          _options: unknown,
          handler: (jobs: Array<{ data: BulkUploadJobDto; id: string }>) => Promise<void>,
        ) => {
          handlers.set(queueName, handler);
        },
      ),
      stop: vi.fn(async () => undefined),
    };
    const queueRegistry = {
      register: vi.fn(),
      producer: vi.fn(async () => boss),
      consumer: vi.fn(async () => boss),
    };
    const service = new BulkUploadQueueService(
      processor as never,
      batchService as never,
      queueRegistry as never,
    );

    try {
      await service.onModuleInit();

      expect(queueRegistry.register).toHaveBeenCalledTimes(2);
      expect(queueRegistry.consumer).toHaveBeenCalledWith(bulkUploadQueueName);
      expect(boss.work).toHaveBeenCalledTimes(2);
      await handlers.get(bulkUploadQueueName)?.([{ data: payload, id: 'job-1' }]);
      await handlers.get(bulkUploadDeadLetterQueueName)?.([{ data: payload, id: 'job-dead' }]);

      expect(processor.process).toHaveBeenCalledWith(payload);
      expect(batchService.recordJobReport).toHaveBeenCalledWith(payload, report);
      expect(batchService.markJobDeadLetter).toHaveBeenCalledWith(payload);
    } finally {
      process.env = previousEnv;
    }
  });

  it('does not create a document or ZIP children when quarantine ingress is enabled', async () => {
    const previous = process.env.FILE_SECURITY_QUARANTINE_ENABLED;
    process.env.FILE_SECURITY_QUARANTINE_ENABLED = 'true';
    const upload = vi.fn();
    const intake = vi.fn(async () => ({
      status: 'quarantined' as const,
      matterId,
      quarantineRef: '11111111-1111-4111-8111-111111111188',
    }));
    const zipChildService = { registerChildren: vi.fn() };
    const job = new BulkUploadJob(
      { upload } as never,
      { run: (_context: unknown, callback: () => unknown) => callback() } as never,
      zipChildService as never,
      { intake } as never,
    );

    try {
      const report = await job.process({ items: [item('quarantine')] });
      expect(upload).not.toHaveBeenCalled();
      expect(zipChildService.registerChildren).not.toHaveBeenCalled();
      expect(report.items).toEqual([
        {
          itemId: 'quarantine',
          status: 'quarantined',
          quarantineRef: '11111111-1111-4111-8111-111111111188',
        },
      ]);
    } finally {
      if (previous === undefined) delete process.env.FILE_SECURITY_QUARANTINE_ENABLED;
      else process.env.FILE_SECURITY_QUARANTINE_ENABLED = previous;
    }
  });
});
