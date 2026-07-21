import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { aiPrepDeadLetterQueueName, aiPrepQueueName } from '../../modules/ai/prep/ai-prep.types';
import {
  auditAnchorDeadLetterQueueName,
  auditAnchorQueueName,
} from '../../modules/audit/audit-anchor-job.service';
import {
  extractionDeadLetterQueueName,
  extractionQueueName,
  ocrDeadLetterQueueName,
  ocrQueueName,
} from '../../modules/document/extraction/extraction.types';
import {
  retentionReviewDeadLetterQueueName,
  retentionReviewQueueName,
} from '../../modules/records/retention-scheduler.service';
import {
  searchIndexDeadLetterQueueName,
  searchIndexQueueName,
} from '../../modules/search/index/indexing.service';
import type { QueueMetricSnapshot } from './metrics.middleware';

const queueDefinitions = [
  {
    queue: 'audit-anchor',
    mainQueue: auditAnchorQueueName,
    deadLetterQueue: auditAnchorDeadLetterQueueName,
  },
  {
    queue: 'ai-prep',
    mainQueue: aiPrepQueueName,
    deadLetterQueue: aiPrepDeadLetterQueueName,
  },
  {
    queue: 'extraction',
    mainQueue: extractionQueueName,
    deadLetterQueue: extractionDeadLetterQueueName,
  },
  {
    queue: 'ocr',
    mainQueue: ocrQueueName,
    deadLetterQueue: ocrDeadLetterQueueName,
  },
  {
    queue: 'retention-review',
    mainQueue: retentionReviewQueueName,
    deadLetterQueue: retentionReviewDeadLetterQueueName,
  },
  {
    queue: 'indexing',
    mainQueue: searchIndexQueueName,
    deadLetterQueue: searchIndexDeadLetterQueueName,
  },
] as const;

@Injectable()
export class PgBossQueueMetricsService {
  private readonly logger = new Logger(PgBossQueueMetricsService.name);

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async collect(): Promise<QueueMetricSnapshot[]> {
    try {
      const rows = await this.databaseService.readPgBossQueueMetrics(queueDefinitions);
      return queueDefinitions.map((definition) => {
        const row = rows.find((item) => item.queue === definition.queue);
        return {
          queue: definition.queue,
          depth: parseMetricCount(row?.depth),
          deadLetterCount: parseMetricCount(row?.dead_letter_count),
        };
      });
    } catch {
      this.logger.warn({ code: 'PGBOSS_QUEUE_METRICS_UNAVAILABLE' });
      return zeroQueueSnapshots();
    }
  }

}

function zeroQueueSnapshots(): QueueMetricSnapshot[] {
  return queueDefinitions.map((definition) => ({
    queue: definition.queue,
    depth: 0,
    deadLetterCount: 0,
  }));
}

function parseMetricCount(raw: string | undefined): number {
  const parsed = Number(raw ?? '0');
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
