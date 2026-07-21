import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { pgBossSchema } from '../db/pg-boss-runtime-options';
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

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const postgresIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

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

interface QueueMetricRow {
  queue: string;
  depth: string;
  dead_letter_count: string;
}

@Injectable()
export class PgBossQueueMetricsService implements OnModuleDestroy {
  private readonly logger = new Logger(PgBossQueueMetricsService.name);
  private readonly pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 500,
  });

  async collect(): Promise<QueueMetricSnapshot[]> {
    try {
      const result = await this.pool.query<QueueMetricRow>(
        `
          WITH queue_defs(metric_queue, main_queue, dead_queue) AS (
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
          )
          SELECT q.metric_queue AS queue,
            count(*) FILTER (
              WHERE j.name = q.main_queue
                AND j.state IN ('created', 'retry', 'active')
            )::text AS depth,
            count(*) FILTER (
              WHERE j.name = q.dead_queue
                AND j.state IN ('created', 'retry', 'active', 'failed')
            )::text AS dead_letter_count
          FROM queue_defs q
          LEFT JOIN ${pgBossJobTableSql()} j
            ON j.name IN (q.main_queue, q.dead_queue)
          GROUP BY q.metric_queue
          ORDER BY q.metric_queue ASC
        `,
        [
          queueDefinitions.map((definition) => definition.queue),
          queueDefinitions.map((definition) => definition.mainQueue),
          queueDefinitions.map((definition) => definition.deadLetterQueue),
        ],
      );
      return queueDefinitions.map((definition) => {
        const row = result.rows.find((item) => item.queue === definition.queue);
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

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
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

function pgBossJobTableSql(): string {
  const schema = pgBossSchema() ?? 'pgboss';
  assertPgIdentifier(schema);
  return `${quoteIdentifier(schema)}.${quoteIdentifier('job')}`;
}

function assertPgIdentifier(value: string): void {
  if (!postgresIdentifierPattern.test(value)) throw new Error('invalid pg-boss schema');
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
