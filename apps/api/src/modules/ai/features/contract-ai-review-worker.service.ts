import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../../common/db/pg-boss-runtime-options';
import {
  contractAiReviewDeadLetterQueueName,
  contractAiReviewQueueExpireSeconds,
  contractAiReviewQueueName,
  contractAiReviewQueueWorkOptions,
  isContractAiReviewQueueWorkerEnabled,
  type ContractAiReviewJobPayload,
} from '../../contract-intel/contract-ai-review-queue.types';
import { AiSummaryService } from './ai-summary.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

@Injectable()
export class ContractAiReviewWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContractAiReviewWorkerService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(@Inject(AiSummaryService) private readonly summaries: AiSummaryService) {}

  async onModuleInit(): Promise<void> {
    if (!isContractAiReviewQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
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
    const boss = await this.ensureStarted();
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
        applicationName: 'amic-vault-contract-ai-review-worker',
        migrateEnvName: 'CONTRACT_AI_REVIEW_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'CONTRACT_AI_REVIEW_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'CONTRACT_AI_REVIEW_QUEUE_SUPERVISE_ENABLED',
      }),
    });
    boss.on('error', (error) => {
      this.logger.warn({
        code: 'CONTRACT_AI_REVIEW_WORKER_QUEUE_ERROR',
        message: String(error.message),
      });
    });
    await boss.start();
    await boss.createQueue(contractAiReviewDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(contractAiReviewQueueName, {
      expireInSeconds: contractAiReviewQueueExpireSeconds(),
      retryLimit: 5,
      retryDelay: 2,
      retryBackoff: true,
      deadLetter: contractAiReviewDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }
}

function contractAiReviewQuery(task: ContractAiReviewJobPayload['task']): string {
  if (task === 'risk_extraction') return '계약 리스크 1차 AI 검토';
  return '계약 조항 1차 AI 검토';
}
