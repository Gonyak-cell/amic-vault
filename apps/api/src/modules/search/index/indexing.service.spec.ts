import { describe, expect, it, vi } from 'vitest';
import {
  searchIndexDeadLetterQueueName,
  searchIndexQueueSendOptions,
} from './indexing.service';

describe('SearchIndexingService options', () => {
  it('uses five retries, exponential backoff, and a dead letter queue', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'queued' }] })),
    };
    const options = searchIndexQueueSendOptions(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        documentId: '11111111-1111-4111-8111-111111111122',
        versionId: '11111111-1111-4111-8111-111111111133',
      },
      client as never,
    );

    expect(options).toMatchObject({
      singletonKey: '11111111-1111-4111-8111-111111111133',
      retryLimit: 5,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: searchIndexDeadLetterQueueName,
    });
    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'queued' }],
    });
  });
});
