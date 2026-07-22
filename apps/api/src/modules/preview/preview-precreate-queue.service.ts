import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { PoolClient } from 'pg';
import type { Job, SendOptions } from 'pg-boss';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from '../document/extraction/pool-client-db-adapter';
import { previewConvertQueueName } from './preview-convert.job';
import {
  isOfficePreviewMimeType,
  PreviewService,
  type PreviewPrecreateInput,
} from './preview.service';

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
export class PreviewPrecreateQueueService implements OnModuleInit {
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(PreviewService) private readonly previewService: PreviewService,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isPreviewConvertQueueWorkerEnabled()) return;
    await this.registerWorkers();
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
    const boss = await this.ensureConsumerStarted();
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

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: previewConvertDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: previewConvertQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 1,
        retryBackoff: true,
        deadLetter: previewConvertDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.producer(previewConvertQueueName);
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(previewConvertQueueName);
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
