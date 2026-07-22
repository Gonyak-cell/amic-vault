import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { SendOptions } from 'pg-boss';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { queueWorkerEnabled } from '../../../common/process-role';
import {
  ocrDeadLetterQueueName,
  ocrQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import { pgBossDbFromPoolClient } from './pool-client-db-adapter';

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

@Injectable()
export class OcrQueueService implements OnModuleInit {
  private queueDefinitionsRegistered = false;

  constructor(@Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry) {}

  onModuleInit(): void {
    this.registerQueueDefinitions();
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

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: ocrDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: ocrQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        deadLetter: ocrDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.producer(ocrQueueName);
  }
}
