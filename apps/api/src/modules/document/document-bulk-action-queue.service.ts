import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, SendOptions, WorkOptions } from 'pg-boss';
import {
  documentBulkActionDeadLetterQueueName,
  documentBulkActionQueueName,
  type DocumentBulkActionJobDto,
} from '@amic-vault/shared';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from './extraction/pool-client-db-adapter';
import { DocumentBulkActionBatchService } from './document-bulk-action-batch.service';
import { DocumentBulkActionJob } from './document-bulk-action.job';

export function isDocumentBulkActionQueueWorkerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return queueWorkerEnabled('DOCUMENT_BULK_ACTION_QUEUE_WORKER_ENABLED', env);
}

export function documentBulkActionQueueSendOptions(
  payload: DocumentBulkActionJobDto,
  client: PoolClient,
): SendOptions {
  return {
    singletonKey: payload.batchId,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: documentBulkActionDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

export function documentBulkActionQueueWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 2,
    pollingIntervalSeconds: 1,
  };
}

@Injectable()
export class DocumentBulkActionQueueService implements OnModuleInit {
  private definitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(DocumentBulkActionBatchService)
    private readonly batchService: DocumentBulkActionBatchService,
    @Inject(DocumentBulkActionJob)
    private readonly job: DocumentBulkActionJob,
    @Inject(QueueRegistry)
    private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerDefinitions();
    if (currentProcessRole() !== 'worker' || !isDocumentBulkActionQueueWorkerEnabled()) {
      return;
    }
    await this.registerWorkers();
  }

  async enqueue(payload: DocumentBulkActionJobDto, client: PoolClient): Promise<string> {
    const boss = await this.producer();
    const jobId = await boss.send(
      documentBulkActionQueueName,
      payload,
      documentBulkActionQueueSendOptions(payload, client),
    );
    if (!jobId) throw new Error('document bulk action enqueue returned no id');
    return jobId;
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.consumer();
    await boss.work<DocumentBulkActionJobDto>(
      documentBulkActionQueueName,
      documentBulkActionQueueWorkOptions(),
      async (jobs) => {
        await Promise.all(
          jobs.map((job: Job<DocumentBulkActionJobDto>) => this.job.process(job.data)),
        );
      },
    );
    await boss.work<DocumentBulkActionJobDto>(
      documentBulkActionDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.batchService.markDeadLetter(job.data);
      },
    );
    this.workerRegistered = true;
  }

  private registerDefinitions(): void {
    if (this.definitionsRegistered) return;
    this.queueRegistry.register({
      name: documentBulkActionDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 30 * 24 * 60 * 60,
        deleteAfterSeconds: 30 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: documentBulkActionQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        deadLetter: documentBulkActionDeadLetterQueueName,
        retentionSeconds: 30 * 24 * 60 * 60,
        deleteAfterSeconds: 30 * 24 * 60 * 60,
      },
    });
    this.definitionsRegistered = true;
  }

  private async producer() {
    this.registerDefinitions();
    return this.queueRegistry.producer(documentBulkActionQueueName);
  }

  private async consumer() {
    this.registerDefinitions();
    return this.queueRegistry.consumer(documentBulkActionQueueName);
  }
}
