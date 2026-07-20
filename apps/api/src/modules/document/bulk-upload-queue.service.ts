import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import {
  bulkUploadDeadLetterQueueName,
  bulkUploadQueueName,
  type BulkUploadJobDto,
} from '@amic-vault/shared';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import { queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from './extraction/pool-client-db-adapter';
import { BulkUploadJob } from './bulk-upload.job';
import { BulkUploadBatchService } from './bulk-upload-batch.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export function isBulkUploadQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('BULK_UPLOAD_QUEUE_WORKER_ENABLED', env);
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? '');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function bulkUploadQueueSendOptions(
  payload: BulkUploadJobDto,
  client: PoolClient,
): SendOptions {
  const firstItemId = payload.items[0]?.itemId ?? 'empty';
  return {
    singletonKey: `${payload.batchId ?? 'adhoc'}:${payload.chunkIndex ?? 0}:${firstItemId}`,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: bulkUploadDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

export function bulkUploadQueueWorkOptions(): WorkOptions {
  return {
    batchSize: positiveInteger(process.env.BULK_UPLOAD_QUEUE_BATCH_SIZE, 1),
    localConcurrency: positiveInteger(process.env.BULK_UPLOAD_QUEUE_LOCAL_CONCURRENCY, 2),
    pollingIntervalSeconds: 1,
  };
}

@Injectable()
export class BulkUploadQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkUploadQueueService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(BulkUploadJob) private readonly jobProcessor: BulkUploadJob,
    @Inject(BulkUploadBatchService) private readonly batchService: BulkUploadBatchService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isBulkUploadQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async enqueueJob(payload: BulkUploadJobDto, client: PoolClient): Promise<string> {
    const boss = await this.ensureStarted();
    const jobId = await boss.send(bulkUploadQueueName, payload, bulkUploadQueueSendOptions(payload, client));
    if (!jobId) throw new Error('bulk upload job enqueue returned no id');
    return jobId;
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureStarted();
    await boss.work<BulkUploadJobDto>(
      bulkUploadQueueName,
      bulkUploadQueueWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleQueuedJob(job)));
      },
    );
    await boss.work<BulkUploadJobDto>(
      bulkUploadDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.batchService.markJobDeadLetter(job.data);
      },
    );
    this.workerRegistered = true;
  }

  private async handleQueuedJob(job: Job<BulkUploadJobDto>): Promise<void> {
    const report = await this.jobProcessor.process(job.data);
    await this.batchService.recordJobReport(job.data, report);
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
      ...pgBossRuntimeOptions({
        applicationName: 'amic-vault-bulk-upload-queue',
        migrateEnvName: 'BULK_UPLOAD_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'BULK_UPLOAD_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'BULK_UPLOAD_QUEUE_SUPERVISE_ENABLED',
      }),
    });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'BULK_UPLOAD_QUEUE_ERROR', message: String(error.message) });
    });
    await boss.start();
    await boss.createQueue(bulkUploadDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(bulkUploadQueueName, {
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
      deadLetter: bulkUploadDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }
}
