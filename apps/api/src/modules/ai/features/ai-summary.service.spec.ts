import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AiSummaryRequestDto } from '@amic-vault/shared';
import { AiCitationMapperService } from '../citation/citation-mapper.service';
import { AiCitationVerifier } from '../citation/citation-verifier';
import { AiEvidencePackBuilder } from '../context/evidence-pack.builder';
import { AiRetrievalOrchestratorService } from '../retrieval/retrieval-orchestrator.service';
import { AiModelRoutingService } from '../routing/model-routing.service';
import { AiSessionLogService } from '../session/ai-session-log.service';
import { GraphQueryService } from '../../graph/graph-query.service';
import { AiSummaryService } from './ai-summary.service';

const ctx = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111101',
  sessionId: '11111111-1111-4111-8111-111111111102',
};
const matterId = '11111111-1111-4111-8111-111111111103';

describe('AiSummaryService', () => {
  it('blocks policy-denied summaries after recording a blocked session response', async () => {
    const sessions = {
      createSession: vi.fn(async () => ({ sessionId: '11111111-1111-4111-8111-111111111104' })),
      recordResponse: vi.fn(async () => undefined),
    };
    const service = new AiSummaryService(
      { decide: vi.fn(async () => ({ effect: 'DENY', escalationRequired: true })) } as unknown as AiModelRoutingService,
      { retrieve: vi.fn() } as unknown as AiRetrievalOrchestratorService,
      { build: vi.fn() } as unknown as AiEvidencePackBuilder,
      { resolveSources: vi.fn() } as unknown as AiCitationMapperService,
      { verify: vi.fn() } as unknown as AiCitationVerifier,
      sessions as unknown as AiSessionLogService,
      { listFacts: vi.fn() } as unknown as GraphQueryService,
    );

    await expect(service.createSummary(ctx, request())).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.createSession).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ blockedReason: 'ai_policy_blocked' }),
    );
    expect(sessions.recordResponse).toHaveBeenCalledWith(
      ctx,
      '11111111-1111-4111-8111-111111111104',
      expect.objectContaining({ status: 'blocked', blockedReason: 'ai_policy_blocked' }),
    );
  });
});

function request(): AiSummaryRequestDto {
  return {
    matterId,
    task: 'matter_summary',
    query: 'summarize authorized evidence only',
    maxChunks: 3,
  };
}
