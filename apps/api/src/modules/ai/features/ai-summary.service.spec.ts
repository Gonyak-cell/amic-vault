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
import { AiSummaryGenerationGateService } from './ai-summary-generation-gate.service';
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
      createSession: vi.fn(async () => ({ sessionId })),
      recordResponse: vi.fn(async () => undefined),
    };
    const service = serviceWith({ sessions });

    await expect(service.createSummary(ctx, request())).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.createSession).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ blockedReason: 'ai_policy_blocked' }),
    );
    expect(sessions.recordResponse).toHaveBeenCalledWith(
      ctx,
      sessionId,
      expect.objectContaining({ status: 'blocked', blockedReason: 'ai_policy_blocked' }),
    );
  });

  it('uses Gemma grounded matter_qa output when the DB policy gate is enabled', async () => {
    const sessions = sessionRecorder();
    const generation = {
      generateGrounded: vi.fn(async () => generatedMatterQaOutput()),
    };
    const service = serviceWith({ sessions, generation, summaryGenerationEnabled: true });

    const summary = await service.createSummary(ctx, request({ task: 'matter_qa' }));

    expect(summary.sections[0]).toMatchObject({
      sectionId: 'generated-section',
      text: 'Generated cited matter answer',
    });
    expect(summary.conclusion).toBe('generated answer');
    expect(summary.warnings).not.toContain('EVIDENCE_ONLY_DEGRADED');
    expect(sessions.recordResponse).toHaveBeenCalledWith(
      ctx,
      sessionId,
      expect.objectContaining({
        status: 'responded',
        requestKind: 'matter_qa',
        generationResult: 'generated',
      }),
    );
    expect(sessions.recordClaims).toHaveBeenCalledWith(
      ctx,
      sessionId,
      [
        expect.objectContaining({
          sessionClaimId: 'generated-claim',
          claimText: 'Generated cited matter answer',
          kind: 'answer',
          citationRefs: [`chunk:${chunkId}`],
        }),
      ],
      expect.any(Array),
    );
    expect(sessions.recordPayload).toHaveBeenCalledWith(
      ctx,
      sessionId,
      expect.objectContaining({
        promptText: 'summarize authorized evidence only',
        responseText: expect.stringContaining(sessionId),
        dlpFindingCount: 0,
      }),
    );
  });

  it('uses Gemma clause_analysis output with rule findings context and risk ledger claims', async () => {
    const sessions = sessionRecorder();
    const ruleFindings = [ruleFinding()];
    const generation = {
      generateGrounded: vi.fn(async () => generatedClauseRiskOutput()),
    };
    const generation = {
      generateGrounded: vi.fn(async () => generatedEmailThreadOutput()),
    };
    const service = serviceWith({ sessions, generation, summaryGenerationEnabled: true });

    const summary = await service.createSummary(ctx, request({ task: 'email_thread_summary' }));

    expect(generation.generateGrounded).toHaveBeenCalledWith(expect.any(Object), {
      compileOptions: {
        purpose: 'email_thread_summary',
        allowedClaimKinds: ['summary', 'key_fact', 'timeline', 'question'],
      },
    });
    expect(summary.status).toBe('escalated');
    expect(summary.recommendedActions).toEqual(
      expect.arrayContaining([
        {
          action: '요청사항 확인: 금요일까지 계약서 회신 요청',
          reviewRequired: true,
        },
      })),
    };
    const service = serviceWith({ sessions, generation, summaryGenerationEnabled: true });

    const summary = await service.createSummary(ctx, request({ task: 'matter_qa' }));

    expect(summary.warnings).toContain('EVIDENCE_ONLY_DEGRADED');
    expect(generation.generateGrounded).toHaveBeenCalledTimes(1);
    expect(sessions.recordResponse).toHaveBeenCalledWith(
      ctx,
      sessionId,
      expect.objectContaining({
        generationResult: 'fallback',
        fallbackReasonCode: 'generation_failed',
      }),
    );
  });
});

function serviceWith(input: {
  sessions?: Partial<AiSessionLogService>;
  generation?: Partial<LocalGemmaGenerationService>;
  omittedChunkIds?: string[];
  ruleFindings?: EvidencePackDto['ruleFindings'];
  summaryGenerationEnabled?: boolean;
  graphQuery?: Pick<GraphQueryService, 'listFacts' | 'listNeighborhoodFactsForDocuments'>;
  contracts?: Partial<ContractIntelService>;
}): AiSummaryService {
  const sessions = input.sessions ?? sessionRecorder();
  const routingDecision =
    sessions.recordRetrievedChunks === undefined
      ? { effect: 'DENY' as const, escalationRequired: true }
      : { effect: 'ALLOW' as const, escalationRequired: false };
  return new AiSummaryService(
    { decide: vi.fn(async () => routingDecision) } as unknown as AiModelRoutingService,
    retrieval() as unknown as AiRetrievalOrchestratorService,
    new AiEvidencePackBuilder(
      { rankAuthorizedChunks: vi.fn((chunks) => chunks) } as never,
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
      } as never,
    ),
    { resolveSources: vi.fn(async () => ({ sources: [] })) } as unknown as AiCitationMapperService,
    {
      verify: vi.fn(() => ({ warnings: [], legalConclusionAutoApproval: false })),
    } as unknown as AiCitationVerifier,
    sessions as unknown as AiSessionLogService,
    (input.graphQuery ?? {
      listFacts: vi.fn(async () => ({ matterId, facts: [] })),
      listNeighborhoodFactsForDocuments: vi.fn(async () => ({ matterId, facts: [] })),
    }) as unknown as GraphQueryService,
    {
      evaluateRuleFindings: vi.fn(async () => ({ findings: input.ruleFindings ?? [] })),
      materializeContractAiReviewFindings: vi.fn(async () => undefined),
      ...input.contracts,
    } as unknown as ContractIntelService,
    (input.generation ?? { generateGrounded: vi.fn() }) as unknown as LocalGemmaGenerationService,
    {
      getPolicy: vi.fn(async () => ({
        summaryGenerationEnabled: input.summaryGenerationEnabled ?? false,
        sessionPayloadPreservationEnabled: input.summaryGenerationEnabled ?? false,
      })),
    } as unknown as AiSummaryGenerationGateService,
  );
}

function sessionRecorder() {
  return {
    createSession: vi.fn(async () => ({ sessionId })),
    recordRetrievedChunks: vi.fn(async () => undefined),
    recordClaims: vi.fn(async () => undefined),
    recordResponse: vi.fn(async () => undefined),
    recordPayload: vi.fn(async () => undefined),
  };
}

function retrieval() {
  return {
    retrieve: vi.fn(async () => ({
      status: 'ready',
      questionKind: 'retrieval',
      chunks: [
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
