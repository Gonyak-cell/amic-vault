import { describe, expect, it, vi } from 'vitest';
import {
  documentBulkActionDeadLetterQueueName,
  type DocumentBulkActionJobDto,
} from '@amic-vault/shared';
import {
  documentBulkActionQueueSendOptions,
  documentBulkActionQueueWorkOptions,
  isDocumentBulkActionQueueWorkerEnabled,
} from './document-bulk-action-queue.service';

const payload: DocumentBulkActionJobDto = {
  actorUserId: '11111111-1111-4111-8111-111111111101',
  batchId: '11111111-1111-4111-8111-111111111102',
  tenantId: '11111111-1111-4111-8111-111111111103',
  tenantSlug: 'tenant-alpha',
};

describe('DocumentBulkActionQueueService contracts', () => {
  it('uses one durable idempotent job per batch with bounded retries', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'job-id' }] })),
    };
    const options = documentBulkActionQueueSendOptions(payload, client as never);

    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'job-id' }],
    });
    expect(options).toMatchObject({
      deadLetter: documentBulkActionDeadLetterQueueName,
      retryBackoff: true,
      retryDelay: 5,
      retryLimit: 3,
      singletonKey: payload.batchId,
    });
    expect(documentBulkActionQueueWorkOptions()).toEqual({
      batchSize: 1,
      localConcurrency: 2,
      pollingIntervalSeconds: 1,
    });
  });

  it('defaults workers on only in the worker process and honors an explicit disable', () => {
    expect(
      isDocumentBulkActionQueueWorkerEnabled({
        PROCESS_ROLE: 'api',
      }),
    ).toBe(false);
    expect(
      isDocumentBulkActionQueueWorkerEnabled({
        PROCESS_ROLE: 'worker',
      }),
    ).toBe(true);
    expect(
      isDocumentBulkActionQueueWorkerEnabled({
        DOCUMENT_BULK_ACTION_QUEUE_WORKER_ENABLED: 'false',
        PROCESS_ROLE: 'worker',
      }),
    ).toBe(false);
  });
});
