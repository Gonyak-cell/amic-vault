import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { currentProcessRole } from '../../../common/process-role';
import { ExtractionDispatcher } from './extraction-dispatcher';
import {
  ocrDeadLetterQueueName,
  ocrQueueName,
  type ExtractionJobPayload,
} from './extraction.types';
import { isOcrQueueWorkerEnabled } from './ocr-queue.service';

@Injectable()
export class OcrQueueWorkerService implements OnModuleInit {
  private workerRegistered = false;

  constructor(
    @Inject(ExtractionDispatcher) private readonly dispatcher: ExtractionDispatcher,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    if (currentProcessRole() !== 'worker' || !isOcrQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.queueRegistry.consumer(ocrQueueName);
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

}
