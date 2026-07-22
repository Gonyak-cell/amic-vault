import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { currentProcessRole } from '../../../common/process-role';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { ContractAiReviewQueueService } from '../../contract-intel/contract-ai-review-queue.service';
import {
  contractAiReviewDeadLetterQueueName,
  contractAiReviewQueueName,
  contractAiReviewQueueWorkOptions,
  isContractAiReviewQueueWorkerEnabled,
  type ContractAiReviewJobPayload,
} from '../../contract-intel/contract-ai-review-queue.types';
import { AiSummaryService } from './ai-summary.service';

@Injectable()
export class ContractAiReviewWorkerService implements OnModuleInit {
  private readonly logger = new Logger(ContractAiReviewWorkerService.name);
  private workerRegistered = false;

  constructor(
    @Inject(AiSummaryService) private readonly summaries: AiSummaryService,
    @Inject(ContractAiReviewQueueService)
    private readonly reviewQueue: ContractAiReviewQueueService,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.reviewQueue.ensureQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isContractAiReviewQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async handle(input: ContractAiReviewJobPayload): Promise<void> {
    await this.summaries.createSummary(
      {
        tenantId: input.tenantId,
        userId: input.userId,
        sessionId: input.authSessionId,
      },
      {
        matterId: input.matterId,
        task: input.task,
        query: contractAiReviewQuery(input.task),
        targetDocumentId: input.documentId,
        filters: { matterId: input.matterId },
        maxChunks: 6,
        locale: 'ko-KR',
      },
    );
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.queueRegistry.consumer(contractAiReviewQueueName);
    await boss.work<ContractAiReviewJobPayload>(
      contractAiReviewQueueName,
      contractAiReviewQueueWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleQueuedJob(job)));
      },
    );
    await boss.work<ContractAiReviewJobPayload>(
      contractAiReviewDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'CONTRACT_AI_REVIEW_DEAD_LETTER',
          documentId: job.data.documentId,
          versionId: job.data.versionId,
          task: job.data.task,
          deadLetterId: String(job.id),
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleQueuedJob(job: Job<ContractAiReviewJobPayload>): Promise<void> {
    try {
      await this.handle(job.data);
    } catch (error) {
      this.logger.warn({
        code: 'CONTRACT_AI_REVIEW_WORKER_EXCEPTION',
        documentId: job.data.documentId,
        versionId: job.data.versionId,
        task: job.data.task,
        message: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

}

function contractAiReviewQuery(task: ContractAiReviewJobPayload['task']): string {
  if (task === 'risk_extraction') return '계약 리스크 1차 AI 검토';
  return '계약 조항 1차 AI 검토';
}
