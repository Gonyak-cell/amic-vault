import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AiSummaryRequestDto, EvidencePackDto } from '@amic-vault/shared';
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
const sessionId = '11111111-1111-4111-8111-111111111104';
const chunkId = '11111111-1111-4111-8111-111111111105';

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
    const materializeContractAiReviewFindings = vi.fn(async () => undefined);
    const service = serviceWith({
      sessions,
      generation,
      ruleFindings,
      summaryGenerationEnabled: true,
      contracts: { materializeContractAiReviewFindings },
    });
    const targetDocumentId = '11111111-1111-4111-8111-111111111106';

    const summary = await service.createSummary(
      ctx,
      request({ task: 'clause_analysis', targetDocumentId }),
    );

    expect(generation.generateGrounded).toHaveBeenCalledWith(
      expect.objectContaining({ ruleFindings }),
      {
        compileOptions: {
          purpose: 'clause_risk_analysis',
          allowedClaimKinds: ['risk', 'clause', 'issue'],
        },
      },
    );
    expect(summary.sections[0]).toMatchObject({
      sectionId: 'generated-clause-risk',
      text: 'Generated cited clause risk',
    });
    expect(summary.status).toBe('escalated');
    expect(summary.warnings).toContain('HUMAN_REVIEW_REQUIRED');
    expect(summary.warnings).not.toContain('RULE_FINDINGS_UNAVAILABLE_BEFORE_R8');
    expect(sessions.recordClaims).toHaveBeenCalledWith(
      ctx,
      sessionId,
      [
        expect.objectContaining({
          sessionClaimId: 'generated-clause-risk-claim',
          claimText: 'Generated cited clause risk',
          kind: 'risk',
          citationRefs: [`chunk:${chunkId}`],
        }),
      ],
      expect.any(Array),
    );
    expect(materializeContractAiReviewFindings).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
      }),
      expect.objectContaining({
        matterId,
        documentId: targetDocumentId,
        aiSessionId: sessionId,
        task: 'clause_analysis',
        claims: [
          expect.objectContaining({
            sessionClaimId: 'generated-clause-risk-claim',
            claimHash: expect.stringMatching(/^[0-9a-f]{64}$/),
            kind: 'risk',
            citationRefs: [`chunk:${chunkId}`],
          }),
        ],
        citations: [
          expect.objectContaining({
            citationRef: `chunk:${chunkId}`,
            documentId: targetDocumentId,
            versionId: '11111111-1111-4111-8111-111111111107',
          }),
        ],
      }),
    );
  });

  it('maps generated email request and deadline claims into review actions', async () => {
    const sessions = sessionRecorder();
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
        {
          action: '기한 확인: 금요일 회신 기한',
          reviewRequired: true,
        },
      ]),
    );
    expect(sessions.recordClaims).toHaveBeenCalledWith(
      ctx,
      sessionId,
      [
        expect.objectContaining({
          sessionClaimId: 'generated-email-request',
          claimText: '금요일까지 계약서 회신 요청',
          kind: 'key_fact',
          citationRefs: [`chunk:${chunkId}`],
        }),
        expect.objectContaining({
          sessionClaimId: 'generated-email-deadline',
          claimText: '금요일 회신 기한',
          kind: 'timeline',
          citationRefs: [`chunk:${chunkId}`],
        }),
      ],
      expect.any(Array),
    );
  });

  it('maps generated question claims into openQuestions', async () => {
    const generation = {
      generateGrounded: vi.fn(async () => generatedMatterQaOutput({ includeQuestion: true })),
    };
    const service = serviceWith({ generation, summaryGenerationEnabled: true });

    const summary = await service.createSummary(ctx, request({ task: 'matter_qa' }));

    expect(summary.openQuestions).toEqual([
      {
        question: 'Which signing copy controls?',
        neededEvidence: 'Confirm this open point against additional authorized matter evidence.',
        citationRefs: [`chunk:${chunkId}`],
      },
    ]);
    expect(summary.recommendedActions).toContainEqual(
      expect.objectContaining({ reviewRequired: true }),
    );
    expect(summary.escalationRequired).toBe(true);
  });

  it('exposes evidence pack uncertainty and omitted source counts in the structured answer', async () => {
    const service = serviceWith({
      omittedChunkIds: ['11111111-1111-4111-8111-111111111188'],
    });

    const summary = await service.createSummary(ctx, request({ task: 'matter_summary' }));

    expect(summary.conclusion).toContain('Authorized matter evidence');
    expect(summary.openQuestions).toEqual([
      {
        question: 'Context window omitted chunks by id only.',
        neededEvidence: 'Review additional authorized matter sources before relying on this point.',
      },
    ]);
    expect(summary.excludedSourcesNotice.count).toBe(1);
    expect(summary.recommendedActions).toContainEqual(
      expect.objectContaining({ reviewRequired: true }),
    );
    expect(summary.escalationRequired).toBe(true);
  });

  it('uses graph neighborhood facts for graph-pattern summary questions', async () => {
    const graphQuery = {
      listFacts: vi.fn(async () => ({ matterId, facts: [] })),
      listNeighborhoodFactsForDocuments: vi.fn(async () => ({ matterId, facts: [] })),
    };
    const service = serviceWith({ graphQuery });

    await service.createSummary(
      ctx,
      request({ query: '쟁점과 RFI 관계 경로를 요약해줘', task: 'matter_summary' }),
    );

    expect(graphQuery.listNeighborhoodFactsForDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: ctx.tenantId, userId: ctx.userId }),
      {
        matterId,
        documentIds: ['11111111-1111-4111-8111-111111111106'],
        depth: 2,
        limit: 12,
        scopeLabel: 'ai_evidence_pack',
      },
    );
    expect(graphQuery.listFacts).not.toHaveBeenCalled();
  });

  it('falls back to evidence-only matter_qa when the DB policy gate is disabled', async () => {
    const sessions = sessionRecorder();
    const generation = { generateGrounded: vi.fn() };
    const service = serviceWith({ sessions, generation, summaryGenerationEnabled: false });

    const summary = await service.createSummary(ctx, request({ task: 'matter_qa' }));

    expect(summary.warnings).toContain('EVIDENCE_ONLY_DEGRADED');
    expect(summary.sections[0]?.text).toContain('Cited answer from authorized matter evidence only');
    expect(generation.generateGrounded).not.toHaveBeenCalled();
    expect(sessions.recordResponse).toHaveBeenCalledWith(
      ctx,
      sessionId,
      expect.objectContaining({
        requestKind: 'matter_qa',
        generationResult: 'fallback',
        fallbackReasonCode: 'SUMMARY_GENERATION_DISABLED',
      }),
    );
  });

  it('falls back to evidence-only matter_qa when the Gemma gateway fails', async () => {
    const sessions = sessionRecorder();
    const generation = {
      generateGrounded: vi.fn(async () => ({
        status: 'blocked' as const,
        reasonCode: 'generation_failed',
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
        fit: vi.fn((chunks) => ({
          chunks,
          omittedChunkIds: input.omittedChunkIds ?? [],
          tokenBudget: 2400,
          tokenCount: 10,
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
  };
}

function generatedMatterQaOutput(options: { includeQuestion?: boolean } = {}) {
  const questionClaim = {
    claim_id: 'generated-open-question',
    kind: 'question' as const,
    text: 'Which signing copy controls?',
    source_refs: [`chunk:${chunkId}`],
    is_legal_conclusion: false,
  };
  return {
    status: 'completed' as const,
    output: {
      answer: 'generated answer',
      sections: [
        {
          section_id: 'generated-section',
          heading: 'Generated',
          text: 'Generated cited matter answer',
          source_refs: [`chunk:${chunkId}`],
        },
      ],
      claims: [
        {
          claim_id: 'generated-claim',
          kind: 'answer' as const,
          text: 'Generated cited matter answer',
          source_refs: [`chunk:${chunkId}`],
          is_legal_conclusion: false,
        },
        ...(options.includeQuestion ? [questionClaim] : []),
      ],
    },
  };
}

function generatedClauseRiskOutput() {
  return {
    status: 'completed' as const,
    output: {
      answer: 'generated clause risk answer',
      sections: [
        {
          section_id: 'generated-clause-risk',
          heading: 'Generated clause risk',
          text: 'Generated cited clause risk',
          source_refs: [`chunk:${chunkId}`],
        },
      ],
      claims: [
        {
          claim_id: 'generated-clause-risk-claim',
          kind: 'risk' as const,
          text: 'Generated cited clause risk',
          source_refs: [`chunk:${chunkId}`],
          is_legal_conclusion: false,
        },
      ],
    },
  };
}

function generatedEmailThreadOutput() {
  return {
    status: 'completed' as const,
    output: {
      answer: '금요일까지 계약서 회신 요청이 있습니다.',
      sections: [
        {
          section_id: 'generated-email-thread',
          heading: '요청사항과 기한',
          text: '금요일까지 계약서 회신 요청이 확인됩니다.',
          source_refs: [`chunk:${chunkId}`],
        },
      ],
      claims: [
        {
          claim_id: 'generated-email-request',
          kind: 'key_fact' as const,
          text: '금요일까지 계약서 회신 요청',
          source_refs: [`chunk:${chunkId}`],
          is_legal_conclusion: false,
        },
        {
          claim_id: 'generated-email-deadline',
          kind: 'timeline' as const,
          text: '금요일 회신 기한',
          source_refs: [`chunk:${chunkId}`],
          is_legal_conclusion: false,
        },
      ],
    },
  };
}

function ruleFinding(): EvidencePackDto['ruleFindings'][number] {
  return {
    findingId: 'b'.repeat(64),
    matterId,
    documentId: '11111111-1111-4111-8111-111111111106',
    versionId: '11111111-1111-4111-8111-111111111107',
    clauseId: '11111111-1111-4111-8111-111111111108',
    ruleId: '11111111-1111-4111-8111-111111111109',
    ruleKey: 'nda.section.required',
    ruleVersion: 1,
    severity: 'critical',
    status: 'fail',
    findingCode: 'required_clause.section.fail',
    findingHash: 'c'.repeat(64),
    evidenceRefs: ['clause:11111111-1111-4111-8111-111111111108'],
  };
}

function request(overrides: Partial<AiSummaryRequestDto> = {}): AiSummaryRequestDto {
  return {
    matterId,
    task: 'matter_summary',
    query: 'summarize authorized evidence only',
    maxChunks: 3,
    ...overrides,
  };
}
