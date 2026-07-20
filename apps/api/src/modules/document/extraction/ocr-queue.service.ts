import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { PgBoss, SendOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../../common/db/pg-boss-runtime-options';
import { queueWorkerEnabled } from '../../../common/process-role';
import {
  ocrDeadLetterQueueName,
  ocrQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import { pgBossDbFromPoolClient } from './pool-client-db-adapter';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export function isOcrQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('OCR_QUEUE_WORKER_ENABLED', env);
}

export function ocrQueueSendOptions(versionId: string, client: PoolClient): SendOptions {
  return {
    singletonKey: versionId,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: ocrDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

export async function createStartedOcrBoss(
  logger: Pick<Logger, 'warn'>,
  applicationName: string,
): Promise<PgBoss> {
  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: databaseUrl,
    ...pgBossRuntimeOptions({
      applicationName,
      migrateEnvName: 'OCR_QUEUE_MIGRATE_ENABLED',
      createSchemaEnvName: 'OCR_QUEUE_CREATE_SCHEMA_ENABLED',
      superviseEnvName: 'OCR_QUEUE_SUPERVISE_ENABLED',
    }),
  });
  boss.on('error', (error) => {
    logger.warn({ code: 'OCR_QUEUE_ERROR', message: String(error.message) });
  });
  await boss.start();
  await boss.createQueue(ocrDeadLetterQueueName, {
    retryLimit: 0,
    retentionSeconds: 7 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.createQueue(ocrQueueName, {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: ocrDeadLetterQueueName,
    retentionSeconds: 14 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  return boss;
}

@Injectable()
export class OcrQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrQueueService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async enqueueOcrRequired(input: ExtractionJobPayload, client: PoolClient): Promise<string> {
    const boss = await this.ensureStarted();
    const jobId = await boss.send(
      ocrQueueName,
      input,
      ocrQueueSendOptions(input.versionId, client),
    );
    if (!jobId) throw new Error('ocr job enqueue returned no id');
    return jobId;
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= this.createStartedBoss();
    this.boss = await this.startPromise;
    return this.boss;
  }

  private async createStartedBoss(): Promise<PgBoss> {
    return createStartedOcrBoss(this.logger, 'amic-vault-ocr-queue');
  }
}
