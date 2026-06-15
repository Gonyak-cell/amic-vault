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
import { ContractIntelService } from '../../contract-intel/contract-intel.service';
import { LocalGemmaGenerationService } from '../generation/local-gemma-generation.service';
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
      { evaluateRuleFindings: vi.fn() } as unknown as ContractIntelService,
      { generateGrounded: vi.fn() } as unknown as LocalGemmaGenerationService,
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

  it('uses Gemma grounded output when enabled and citation refs are allowed', async () => {
    const previous = process.env.AI_SUMMARY_GEMMA_ENABLED;
    process.env.AI_SUMMARY_GEMMA_ENABLED = 'true';
    const sessionId = '11111111-1111-4111-8111-111111111104';
    const chunkId = '11111111-1111-4111-8111-111111111105';
    const sessions = {
      createSession: vi.fn(async () => ({ sessionId })),
      recordRetrievedChunks: vi.fn(async () => undefined),
      recordResponse: vi.fn(async () => undefined),
    };
    const generation = {
      generateGrounded: vi.fn(async () => ({
        status: 'completed',
        output: {
          answer: 'generated answer',
          sections: [
            {
              section_id: 'generated-section',
              heading: 'Generated',
              text: 'Generated cited summary',
              source_refs: [`chunk:${chunkId}`],
            },
          ],
          claims: [
            {
              claim_id: 'generated-claim',
              kind: 'summary',
              text: 'Generated cited summary',
              source_refs: [`chunk:${chunkId}`],
              is_legal_conclusion: false,
            },
          ],
        },
      })),
    };
    const service = new AiSummaryService(
      { decide: vi.fn(async () => ({ effect: 'ALLOW', escalationRequired: false })) } as unknown as AiModelRoutingService,
      {
        retrieve: vi.fn(async () => ({
          status: 'ready',
          questionKind: 'retrieval',
          chunks: [
            {
              documentId: '11111111-1111-4111-8111-111111111106',
              versionId: '11111111-1111-4111-8111-111111111107',
              matterId,
              chunkId,
              parentChunkId: null,
              chunkOrdinal: 0,
              tokenCount: 10,
              score: 1,
              redactedText: 'authorized evidence',
              textHash: '1'.repeat(64),
              sourceTextHash: '2'.repeat(64),
            },
          ],
          omittedChunkIds: [],
          appliedRules: ['retrieval.hybrid:query_stage_scope'],
        })),
      } as unknown as AiRetrievalOrchestratorService,
      new AiEvidencePackBuilder(
        { rankAuthorizedChunks: vi.fn((chunks) => chunks) } as never,
        {
          fit: vi.fn((chunks) => ({ chunks, omittedChunkIds: [], tokenBudget: 2400, tokenCount: 10 })),
        } as never,
      ),
      { resolveSources: vi.fn(async () => ({ sources: [] })) } as unknown as AiCitationMapperService,
      { verify: vi.fn(() => ({ warnings: [], legalConclusionAutoApproval: false })) } as unknown as AiCitationVerifier,
      sessions as unknown as AiSessionLogService,
      { listFacts: vi.fn(async () => ({ facts: [] })) } as unknown as GraphQueryService,
      { evaluateRuleFindings: vi.fn(async () => ({ findings: [] })) } as unknown as ContractIntelService,
      generation as unknown as LocalGemmaGenerationService,
    );

    try {
      const summary = await service.createSummary(ctx, request());
      expect(summary.sections[0]).toMatchObject({
        sectionId: 'generated-section',
        text: 'Generated cited summary',
      });
      expect(summary.warnings).not.toContain('EVIDENCE_ONLY_DEGRADED');
      expect(sessions.recordResponse).toHaveBeenCalledWith(
        ctx,
        sessionId,
        expect.objectContaining({ status: 'responded' }),
      );
      const riskSummary = await service.createSummary(ctx, {
        ...request(),
        task: 'risk_extraction',
        query: 'find risks',
      });
      expect(riskSummary.status).toBe('escalated');
      expect(riskSummary.sections[0]?.sectionId).toBe('risk_extraction-1');
      expect(generation.generateGrounded).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.AI_SUMMARY_GEMMA_ENABLED;
      else process.env.AI_SUMMARY_GEMMA_ENABLED = previous;
    }
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
