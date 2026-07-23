import { describe, expect, it, vi } from 'vitest';
import { PgBossQueueMetricsService } from './queue-metrics.service';

describe('PgBossQueueMetricsService', () => {
  it('derives every queue and dead-letter relationship from the registry', async () => {
    const database = {
      readPgBossQueueMetrics: vi.fn(async () => [
        {
          queue: 'document.extract',
          depth: '2',
          dead_letter_count: '1',
          oldest_age_seconds: '45.5',
        },
        {
          queue: 'document.extract.dead',
          depth: '1',
          dead_letter_count: '0',
          oldest_age_seconds: '12',
        },
      ]),
    };
    const registry = {
      registeredQueueDefinitions: vi.fn(() => [
        {
          name: 'document.extract',
          options: { deadLetter: 'document.extract.dead', retryLimit: 3 },
        },
        { name: 'document.extract.dead', options: { retryLimit: 0 } },
      ]),
    };

    const result = await new PgBossQueueMetricsService(
      database as never,
      registry as never,
    ).collect();

    expect(database.readPgBossQueueMetrics).toHaveBeenCalledWith([
      {
        queue: 'document.extract',
        mainQueue: 'document.extract',
        deadLetterQueue: 'document.extract.dead',
      },
      {
        queue: 'document.extract.dead',
        mainQueue: 'document.extract.dead',
      },
    ]);
    expect(result).toEqual([
      {
        queue: 'document.extract',
        depth: 2,
        deadLetterCount: 1,
        oldestAgeSeconds: 45.5,
      },
      {
        queue: 'document.extract.dead',
        depth: 1,
        deadLetterCount: 0,
        oldestAgeSeconds: 12,
      },
    ]);
  });

  it('keeps the exact registry coverage and fails unavailable values closed to zero', async () => {
    const registry = {
      registeredQueueDefinitions: vi.fn(() => [{ name: 'queue.first' }, { name: 'queue.second' }]),
    };
    const database = {
      readPgBossQueueMetrics: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    };

    await expect(
      new PgBossQueueMetricsService(database as never, registry as never).collect(),
    ).resolves.toEqual([
      {
        queue: 'queue.first',
        depth: 0,
        deadLetterCount: 0,
        oldestAgeSeconds: 0,
      },
      {
        queue: 'queue.second',
        depth: 0,
        deadLetterCount: 0,
        oldestAgeSeconds: 0,
      },
    ]);
  });
});
