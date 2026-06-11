import { describe, expect, it, vi } from 'vitest';
import { extractionDeadLetterQueueName } from './extraction.types';
import { extractionQueueSendOptions } from './extraction-queue.service';

describe('ExtractionQueueService options', () => {
  it('uses max three retries, exponential backoff, and dead letter queue', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'queued' }] })),
    };
    const options = extractionQueueSendOptions('version-id', client as never);

    expect(options).toMatchObject({
      singletonKey: 'version-id',
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: extractionDeadLetterQueueName,
    });
    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'queued' }],
    });
  });
});
