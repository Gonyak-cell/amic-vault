import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { contractAiReviewTasks } from '@amic-vault/shared';
import { QueueRegistry } from '../../common/queue/queue.registry';
import {
  contractAiReviewDeadLetterQueueName,
  contractAiReviewQueueExpireSeconds,
  contractAiReviewQueueName,
  contractAiReviewQueueSendOptions,
  type ContractAiReviewJobPayload,
} from './contract-ai-review-queue.types';

@Injectable()
export class ContractAiReviewQueueService implements OnModuleInit {
  private queueDefinitionsRegistered = false;

  constructor(@Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry) {}

  onModuleInit(): void {
    this.ensureQueueDefinitions();
  }

  ensureQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: contractAiReviewDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: contractAiReviewQueueName,
      options: {
        expireInSeconds: contractAiReviewQueueExpireSeconds(),
        retryLimit: 5,
        retryDelay: 2,
        retryBackoff: true,
        deadLetter: contractAiReviewDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  async enqueueFirstReview(
    input: Omit<ContractAiReviewJobPayload, 'task'>,
    client: PoolClient,
  ): Promise<string[]> {
    this.ensureQueueDefinitions();
    const boss = await this.queueRegistry.producer(contractAiReviewQueueName);
    const jobIds: string[] = [];
    for (const task of contractAiReviewTasks) {
      const payload: ContractAiReviewJobPayload = { ...input, task };
      const jobId = await boss.send(
        contractAiReviewQueueName,
        payload,
        contractAiReviewQueueSendOptions(payload, client),
      );
      if (!jobId) throw new Error('contract AI review enqueue returned no id');
      jobIds.push(jobId);
    }
    return jobIds;
  }

}
