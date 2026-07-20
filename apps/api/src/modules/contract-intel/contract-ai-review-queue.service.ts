import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { PgBoss } from 'pg-boss';
import { contractAiReviewTasks } from '@amic-vault/shared';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import {
  contractAiReviewDeadLetterQueueName,
  contractAiReviewQueueExpireSeconds,
  contractAiReviewQueueName,
  contractAiReviewQueueSendOptions,
  type ContractAiReviewJobPayload,
} from './contract-ai-review-queue.types';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

@Injectable()
export class ContractAiReviewQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ContractAiReviewQueueService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async enqueueFirstReview(
    input: Omit<ContractAiReviewJobPayload, 'task'>,
    client: PoolClient,
  ): Promise<string[]> {
    const boss = await this.ensureStarted();
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
        applicationName: 'amic-vault-contract-ai-review-queue',
        migrateEnvName: 'CONTRACT_AI_REVIEW_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'CONTRACT_AI_REVIEW_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'CONTRACT_AI_REVIEW_QUEUE_SUPERVISE_ENABLED',
      }),
    });
    boss.on('error', (error) => {
      this.logger.warn({
        code: 'CONTRACT_AI_REVIEW_QUEUE_ERROR',
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
