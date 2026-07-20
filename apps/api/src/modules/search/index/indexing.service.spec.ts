import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSearchIndexQueueWorkerEnabled,
  searchIndexDeadLetterQueueName,
  searchIndexQueueSendOptions,
} from './indexing.service';

describe('SearchIndexingService options', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

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

  it('uses PROCESS_ROLE as the default worker activation contract', () => {
    delete process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isSearchIndexQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isSearchIndexQueueWorkerEnabled()).toBe(false);

    delete process.env.PROCESS_ROLE;
    expect(isSearchIndexQueueWorkerEnabled()).toBe(false);
  });

  it('keeps the legacy search worker flag as an explicit override', () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED = 'yes';
    expect(isSearchIndexQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'worker';
    process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED = '0';
    expect(isSearchIndexQueueWorkerEnabled()).toBe(false);
  });
});
