import { describe, expect, it, vi } from 'vitest';
import {
  aiPrepQueueSendOptions,
  aiPrepTenantConcurrencyAllows,
  defaultAiPrepArtifactKinds,
} from './ai-prep-queue.service';
import type { AiPrepJobPayload } from './ai-prep.types';

const payload: AiPrepJobPayload = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  matterId: '11111111-1111-4111-8111-111111111112',
  documentId: '11111111-1111-4111-8111-111111111113',
  versionId: '11111111-1111-4111-8111-111111111114',
  artifactKind: 'document_brief',
};

describe('AiPrepQueueService options', () => {
  it('uses singleton jobs, retries, exponential backoff, and a dead letter queue', () => {
    const client = { query: vi.fn() };
    expect(aiPrepQueueSendOptions(payload, client as never)).toMatchObject({
      singletonKey: `${payload.versionId}:document_brief`,
      retryLimit: 5,
      retryDelay: 2,
      retryBackoff: true,
      deadLetter: 'ai.prep.dead',
    });
  });

  it('defaults to bounded high-value artifact kinds', () => {
    expect(defaultAiPrepArtifactKinds()).toEqual([
      'document_brief',
      'key_terms',
      'risk_candidates',
      'suggested_questions',
    ]);
  });

  it('enforces per-tenant concurrency accounting', () => {
    expect(
      aiPrepTenantConcurrencyAllows(new Map([[payload.tenantId, 1]]), payload.tenantId, 1),
    ).toBe(false);
    expect(
      aiPrepTenantConcurrencyAllows(new Map([[payload.tenantId, 1]]), payload.tenantId, 2),
    ).toBe(true);
  });
});
