import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { QueueRegistry } from '../queue/queue.registry';
import type { QueueMetricSnapshot } from './metrics.middleware';

@Injectable()
export class PgBossQueueMetricsService {
  private readonly logger = new Logger(PgBossQueueMetricsService.name);

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async collect(): Promise<QueueMetricSnapshot[]> {
    const queueDefinitions = this.queueRegistry.registeredQueueDefinitions().map((definition) => ({
      queue: definition.name,
      mainQueue: definition.name,
      ...(definition.options?.deadLetter ? { deadLetterQueue: definition.options.deadLetter } : {}),
    }));
    try {
      const rows = await this.databaseService.readPgBossQueueMetrics(queueDefinitions);
      return queueDefinitions.map((definition) => {
        const row = rows.find((item) => item.queue === definition.queue);
        return {
          queue: definition.queue,
          depth: parseMetricCount(row?.depth),
          deadLetterCount: parseMetricCount(row?.dead_letter_count),
          oldestAgeSeconds: parseMetricNumber(row?.oldest_age_seconds),
        };
      });
    } catch {
      this.logger.warn({ code: 'PGBOSS_QUEUE_METRICS_UNAVAILABLE' });
      return zeroQueueSnapshots(queueDefinitions);
    }
  }
}

function zeroQueueSnapshots(definitions: readonly { queue: string }[]): QueueMetricSnapshot[] {
  return definitions.map((definition) => ({
    queue: definition.queue,
    depth: 0,
    deadLetterCount: 0,
    oldestAgeSeconds: 0,
  }));
}

function parseMetricCount(raw: string | undefined): number {
  const parsed = Number(raw ?? '0');
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function parseMetricNumber(raw: string | undefined): number {
  const parsed = Number(raw ?? '0');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
