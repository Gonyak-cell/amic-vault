import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, PgBoss, SendOptions } from 'pg-boss';
import { ExtractionDispatcher } from './extraction-dispatcher';
import {
  extractionDeadLetterQueueName,
  extractionQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import { pgBossDbFromPoolClient } from './pool-client-db-adapter';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

function workerEnabled(): boolean {
  return ['1', 'true', 'yes'].includes(
    (process.env.EXTRACTION_QUEUE_WORKER_ENABLED ?? '').trim().toLowerCase(),
  );
}

export function extractionQueueSendOptions(versionId: string, client: PoolClient): SendOptions {
  return {
    singletonKey: versionId,
    retryLimit: 3,
    retryDelay: 1,
    retryBackoff: true,
    deadLetter: extractionDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

@Injectable()
export class ExtractionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExtractionQueueService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(@Inject(ExtractionDispatcher) private readonly dispatcher: ExtractionDispatcher) {}

  async onModuleInit(): Promise<void> {
    if (!workerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async enqueueVersionCreated(input: ExtractionJobPayload, client: PoolClient): Promise<string> {
    await this.createPendingCanonicalDocument(input, client);
    const boss = await this.ensureStarted();
    const jobId = await boss.send(
      extractionQueueName,
      input,
      extractionQueueSendOptions(input.versionId, client),
    );
    if (!jobId) throw new Error('extraction job enqueue returned no id');
    return jobId;
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureStarted();
    await boss.work<ExtractionJobPayload>(
      extractionQueueName,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (!job) return;
        await this.dispatcher.handle(job.data);
      },
    );
    await boss.work<ExtractionJobPayload>(
      extractionDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.dispatcher.markDeadLetter(job.data);
      },
    );
    this.workerRegistered = true;
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= this.createStartedBoss();
    this.boss = await this.startPromise;
    return this.boss;
  }

  private async createStartedBoss(): Promise<PgBoss> {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: databaseUrl,
      application_name: 'amic-vault-extraction-queue',
      supervise: true,
      migrate: true,
    });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'EXTRACTION_QUEUE_ERROR', message: String(error.message) });
    });
    await boss.start();
    await boss.createQueue(extractionDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(extractionQueueName, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: extractionDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }

  private async createPendingCanonicalDocument(
    input: ExtractionJobPayload,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO canonical_documents (
          tenant_id, version_id, body_text, extraction_status, extraction_method,
          confidence, failure_reason_code, extracted_at, updated_at
        )
        VALUES ($1, $2, '', 'pending', 'pending', 0, NULL, NULL, now())
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          body_text = '',
          extraction_status = 'pending',
          extraction_method = 'pending',
          confidence = 0,
          failure_reason_code = NULL,
          extracted_at = NULL,
          updated_at = now()
        WHERE canonical_documents.extraction_status = 'pending'
      `,
      [input.tenantId, input.versionId],
    );
  }
}

export type ExtractionJob = Job<ExtractionJobPayload>;
