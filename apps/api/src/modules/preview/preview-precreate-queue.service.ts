import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { PoolClient } from 'pg';
import type { Job, PgBoss, SendOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import { queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from '../document/extraction/pool-client-db-adapter';
import { previewConvertQueueName } from './preview-convert.job';
import {
  isOfficePreviewMimeType,
  PreviewService,
  type PreviewPrecreateInput,
} from './preview.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export const previewConvertDeadLetterQueueName = 'document.preview-convert.dead';

export type PreviewPrecreateJobPayload = PreviewPrecreateInput;

export function isPreviewConvertQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('PREVIEW_CONVERT_QUEUE_WORKER_ENABLED', env);
}

export function previewConvertQueueSendOptions(
  payload: PreviewPrecreateJobPayload,
  client: PoolClient,
): SendOptions {
  return {
    singletonKey: payload.versionId,
    retryLimit: 3,
    retryDelay: 1,
    retryBackoff: true,
    deadLetter: previewConvertDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

@Injectable()
export class PreviewPrecreateQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PreviewPrecreateQueueService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(@Inject(PreviewService) private readonly previewService: PreviewService) {}

  async onModuleInit(): Promise<void> {
    if (!isPreviewConvertQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async enqueueVersionCreated(
    input: PreviewPrecreateJobPayload,
    client: PoolClient,
  ): Promise<string | null> {
    if (!(await this.isOfficeVersion(input.tenantId, input.fileObjectId, client))) return null;
    const boss = await this.ensureStarted();
    const jobId = await boss.send(
      previewConvertQueueName,
      input,
      previewConvertQueueSendOptions(input, client),
    );
    if (!jobId) throw new Error('preview convert job enqueue returned no id');
    return jobId;
  }

  async handle(input: PreviewPrecreateJobPayload): Promise<void> {
    await this.previewService.precreatePreview(input);
  }

  async markDeadLetter(input: PreviewPrecreateJobPayload): Promise<void> {
    await this.previewService.markPrecreateFailed(input);
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureStarted();
    await boss.work<PreviewPrecreateJobPayload>(
      previewConvertQueueName,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (!job) return;
        await this.handle(job.data);
      },
    );
    await boss.work<PreviewPrecreateJobPayload>(
      previewConvertDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.markDeadLetter(job.data);
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
      ...pgBossRuntimeOptions({
        applicationName: 'amic-vault-preview-convert-queue',
        migrateEnvName: 'PREVIEW_CONVERT_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'PREVIEW_CONVERT_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'PREVIEW_CONVERT_QUEUE_SUPERVISE_ENABLED',
      }),
    });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'PREVIEW_CONVERT_QUEUE_ERROR', message: String(error.message) });
    });
    await boss.start();
    await boss.createQueue(previewConvertDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(previewConvertQueueName, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: previewConvertDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }

  private async isOfficeVersion(
    tenantId: TenantId,
    fileObjectId: string,
    client: PoolClient,
  ): Promise<boolean> {
    const result = await client.query<{ mime_type: string }>(
      `
        SELECT mime_type
        FROM file_objects
        WHERE tenant_id = $1
          AND file_object_id = $2
        LIMIT 1
      `,
      [tenantId, fileObjectId],
    );
    const mimeType = result.rows[0]?.mime_type;
    return typeof mimeType === 'string' && isOfficePreviewMimeType(mimeType);
  }
}

export type PreviewPrecreateJob = Job<PreviewPrecreateJobPayload>;
