import { describe, expect, it, vi } from 'vitest';
import { ContractAiReviewWorkerService } from './contract-ai-review-worker.service';
import { AiSummaryService } from './ai-summary.service';

describe('ContractAiReviewWorkerService', () => {
  it('runs the queued review through the existing AI summary path', async () => {
    const summaries = {
      createSummary: vi.fn(async () => ({
        sessionId: '11111111-1111-4111-8111-111111111201',
      })),
    };
    const worker = new ContractAiReviewWorkerService(
      summaries as unknown as AiSummaryService,
      { ensureQueueDefinitions: vi.fn() } as never,
      {} as never,
    );

    await worker.handle({
      tenantId: '11111111-1111-4111-8111-111111111111',
      matterId: '11111111-1111-4111-8111-111111111112',
      documentId: '11111111-1111-4111-8111-111111111113',
      versionId: '11111111-1111-4111-8111-111111111114',
      userId: '11111111-1111-4111-8111-111111111115',
      authSessionId: '11111111-1111-4111-8111-111111111116',
      task: 'clause_analysis',
    });

    expect(summaries.createSummary).toHaveBeenCalledWith(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        userId: '11111111-1111-4111-8111-111111111115',
        sessionId: '11111111-1111-4111-8111-111111111116',
      },
      {
        matterId: '11111111-1111-4111-8111-111111111112',
        task: 'clause_analysis',
        query: '계약 조항 1차 AI 검토',
        targetDocumentId: '11111111-1111-4111-8111-111111111113',
        filters: { matterId: '11111111-1111-4111-8111-111111111112' },
        maxChunks: 6,
        locale: 'ko-KR',
      },
    );
  });
});
