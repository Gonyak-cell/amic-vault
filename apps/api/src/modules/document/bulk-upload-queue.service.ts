import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, SendOptions, WorkOptions } from 'pg-boss';
import {
  bulkUploadDeadLetterQueueName,
  bulkUploadQueueName,
  type BulkUploadJobDto,
} from '@amic-vault/shared';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from './extraction/pool-client-db-adapter';
import { BulkUploadJob } from './bulk-upload.job';
import { BulkUploadBatchService } from './bulk-upload-batch.service';

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
export class BulkUploadQueueService implements OnModuleInit {
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(BulkUploadJob) private readonly jobProcessor: BulkUploadJob,
    @Inject(BulkUploadBatchService) private readonly batchService: BulkUploadBatchService,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isBulkUploadQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async enqueueJob(payload: BulkUploadJobDto, client: PoolClient): Promise<string> {
    const boss = await this.ensureStarted();
    const jobId = await boss.send(bulkUploadQueueName, payload, bulkUploadQueueSendOptions(payload, client));
    if (!jobId) throw new Error('bulk upload job enqueue returned no id');
    return jobId;
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureConsumerStarted();
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

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: bulkUploadDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: bulkUploadQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        deadLetter: bulkUploadDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.producer(bulkUploadQueueName);
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(bulkUploadQueueName);
  }
}
