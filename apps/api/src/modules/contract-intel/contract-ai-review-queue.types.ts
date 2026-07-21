import type { PoolClient } from 'pg';
import type { SendOptions, WorkOptions } from 'pg-boss';
import type { ContractAiReviewTask } from '@amic-vault/shared';
import { queueWorkerEnabled } from '../../common/process-role';
import { pgBossDbFromPoolClient } from '../document/extraction/pool-client-db-adapter';

export const contractAiReviewQueueName = 'contract.ai-review';
export const contractAiReviewDeadLetterQueueName = 'contract.ai-review.dead';

export interface ContractAiReviewJobPayload {
  tenantId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  userId: string;
  authSessionId: string | null;
  task: ContractAiReviewTask;
}

export function isContractAiReviewQueueWorkerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return queueWorkerEnabled('CONTRACT_AI_REVIEW_QUEUE_WORKER_ENABLED', env);
}

export function contractAiReviewQueueExpireSeconds(): number {
  const configured = Number(process.env.CONTRACT_AI_REVIEW_QUEUE_EXPIRE_SECONDS ?? '');
  if (Number.isInteger(configured) && configured > 0) return configured;
  const timeoutMs = Number(process.env.LOCAL_GEMMA_TIMEOUT_MS ?? '');
  const fallbackTimeoutMs = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300_000;
  return Math.max(420, Math.ceil(fallbackTimeoutMs / 1000) + 60);
}

export function contractAiReviewQueueSendOptions(
  payload: ContractAiReviewJobPayload,
  client: PoolClient,
): SendOptions {
  return {
    singletonKey: `${payload.versionId}:${payload.task}`,
    group: { id: 'local_gemma' },
    expireInSeconds: contractAiReviewQueueExpireSeconds(),
    retryLimit: 5,
    retryDelay: 2,
    retryBackoff: true,
    deadLetter: contractAiReviewDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

export function contractAiReviewQueueWorkOptions(): WorkOptions {
  const configured = Number(process.env.CONTRACT_AI_REVIEW_QUEUE_BATCH_SIZE ?? '');
  const batchSize = Number.isInteger(configured) && configured > 0 ? configured : 1;
  return {
    batchSize,
    localConcurrency: 1,
    groupConcurrency: 1,
    pollingIntervalSeconds: 1,
  };
}
