import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, SendOptions } from 'pg-boss';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../../common/process-role';
import { ExtractionDispatcher } from './extraction-dispatcher';
import {
  extractionDeadLetterQueueName,
  extractionQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import { pgBossDbFromPoolClient } from './pool-client-db-adapter';

export function isExtractionQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('EXTRACTION_QUEUE_WORKER_ENABLED', env);
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
export class ExtractionQueueService implements OnModuleInit {
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(ExtractionDispatcher) private readonly dispatcher: ExtractionDispatcher,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isExtractionQueueWorkerEnabled()) return;
    await this.registerWorkers();
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
    const boss = await this.ensureConsumerStarted();
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

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: extractionDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: extractionQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 1,
        retryBackoff: true,
        deadLetter: extractionDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.producer(extractionQueueName);
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(extractionQueueName);
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
