import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PgBoss } from 'pg-boss';
import { ExtractionDispatcher } from './extraction-dispatcher';
import {
  ocrDeadLetterQueueName,
  ocrQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import { createStartedOcrBoss, isOcrQueueWorkerEnabled } from './ocr-queue.service';

@Injectable()
export class OcrQueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrQueueWorkerService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(@Inject(ExtractionDispatcher) private readonly dispatcher: ExtractionDispatcher) {}

  async onModuleInit(): Promise<void> {
    if (!isOcrQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureStarted();
    await boss.work<ExtractionJobPayload>(
      ocrQueueName,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (!job) return;
        await this.dispatcher.handleOcr(job.data);
      },
    );
    await boss.work<ExtractionJobPayload>(
      ocrDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.dispatcher.markOcrDeadLetter(job.data);
      },
    );
    this.workerRegistered = true;
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= createStartedOcrBoss(this.logger, 'amic-vault-ocr-worker');
    this.boss = await this.startPromise;
    return this.boss;
  }
}
