import { describe, expect, it } from 'vitest';
import {
  contractAiReviewDeadLetterQueueName,
  contractAiReviewQueueName,
  contractAiReviewQueueSendOptions,
  contractAiReviewQueueWorkOptions,
  isContractAiReviewQueueWorkerEnabled,
  type ContractAiReviewJobPayload,
} from './contract-ai-review-queue.types';

describe('contract AI review queue options', () => {
  it('uses singleton local Gemma review jobs with retry and dead-letter policy', () => {
    const payload: ContractAiReviewJobPayload = {
      tenantId: '11111111-1111-4111-8111-111111111111',
      matterId: '11111111-1111-4111-8111-111111111112',
      documentId: '11111111-1111-4111-8111-111111111113',
      versionId: '11111111-1111-4111-8111-111111111114',
      userId: '11111111-1111-4111-8111-111111111115',
      authSessionId: '11111111-1111-4111-8111-111111111116',
      task: 'risk_extraction',
    };

    const options = contractAiReviewQueueSendOptions(payload, {} as never);

    expect(contractAiReviewQueueName).toBe('contract.ai-review');
    expect(options).toMatchObject({
      singletonKey: `${payload.versionId}:risk_extraction`,
      group: { id: 'local_gemma' },
      retryLimit: 5,
      retryDelay: 2,
      retryBackoff: true,
      deadLetter: contractAiReviewDeadLetterQueueName,
    });
    expect(Number(options.expireInSeconds)).toBeGreaterThanOrEqual(420);
  });

  it('keeps workers disabled in api role unless explicitly enabled', () => {
    expect(isContractAiReviewQueueWorkerEnabled({ PROCESS_ROLE: 'api' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
    expect(
      isContractAiReviewQueueWorkerEnabled({
        CONTRACT_AI_REVIEW_QUEUE_WORKER_ENABLED: '1',
        PROCESS_ROLE: 'api',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(contractAiReviewQueueWorkOptions()).toMatchObject({
      batchSize: 1,
      localConcurrency: 1,
      groupConcurrency: 1,
      pollingIntervalSeconds: 1,
    });
  });
});
