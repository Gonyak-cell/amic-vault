import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  aiSummaryResponseSchema,
  type AiCitationClaimDto,
  type AiCitationDto,
  type AiSummaryRequestDto,
  type AiSummaryResponseDto,
  type AiSummarySectionDto,
  type AiSummaryTask,
  type AiSummaryWarningCode,
  type AiSummaryExcludedSourcesNoticeDto,
  type AiSummaryOpenQuestionDto,
  type AiSummaryRecommendedActionDto,
  type AiGroundedGenerationOutputDto,
  type EvidencePackChunkDto,
  type EvidencePackDto,
  type PermissionContext,
} from '@amic-vault/shared';
import { AiCitationMapperService } from '../citation/citation-mapper.service';
import { AiCitationVerifier } from '../citation/citation-verifier';
import { AiEvidencePackBuilder } from '../context/evidence-pack.builder';
import { AiRetrievalOrchestratorService } from '../retrieval/retrieval-orchestrator.service';
import { AiModelRoutingService } from '../routing/model-routing.service';
import {
  AiSessionLogService,
  type AiClaimLedgerInput,
  type AiSessionRequestContext,
} from '../session/ai-session-log.service';
import { GraphQueryService } from '../../graph/graph-query.service';
import { ContractIntelService } from '../../contract-intel/contract-intel.service';
import { LocalGemmaGenerationService } from '../generation/local-gemma-generation.service';
import type { EvidencePromptCompileOptions } from '../generation/evidence-prompt.compiler';
import { AiSummaryGenerationGateService } from './ai-summary-generation-gate.service';

interface RenderedSummary {
  status: 'completed' | 'escalated';
  sections: AiSummarySectionDto[];
  citations: AiCitationDto[];
  claims: AiCitationClaimDto[];
  ledgerClaims: AiClaimLedgerInput[];
  conclusion: string;
  openQuestions: AiSummaryOpenQuestionDto[];
  recommendedActions: AiSummaryRecommendedActionDto[];
  excludedSourcesNotice: AiSummaryExcludedSourcesNoticeDto;
  warnings: AiSummaryWarningCode[];
  escalationRequired: boolean;
}

interface GemmaSummaryRenderAttempt {
  rendered: RenderedSummary | null;
  generationResult?: 'generated' | 'fallback';
  fallbackReasonCode?: string;
}

@Injectable()
export class AiSummaryService {
  constructor(
    @Inject(AiModelRoutingService) private readonly routing: AiModelRoutingService,
    @Inject(AiRetrievalOrchestratorService)
    private readonly retrieval: AiRetrievalOrchestratorService,
    @Inject(AiEvidencePackBuilder) private readonly evidencePacks: AiEvidencePackBuilder,
    @Inject(AiCitationMapperService) private readonly citations: AiCitationMapperService,
    @Inject(AiCitationVerifier) private readonly citationVerifier: AiCitationVerifier,
    @Inject(AiSessionLogService) private readonly sessions: AiSessionLogService,
    @Inject(GraphQueryService) private readonly graphQuery: GraphQueryService,
    @Inject(ContractIntelService) private readonly contracts: ContractIntelService,
    @Inject(LocalGemmaGenerationService)
    private readonly localGemma: LocalGemmaGenerationService,
    @Inject(AiSummaryGenerationGateService)
    private readonly generationGate: AiSummaryGenerationGateService,
  ) {}

  async createSummary(
    ctx: AiSessionRequestContext,
    input: AiSummaryRequestDto,
  ): Promise<AiSummaryResponseDto> {
    const startedAt = performance.now();
    const promptText = input.query;
    const routing = await this.routing.decide(ctx, {
      matterId: input.matterId,
      modelRoute: 'local_gemma',
      taskKind: input.task,
      prompt: promptText,
    });
    const created = await this.sessions.createSession(ctx, {
      matterId: input.matterId,
      modelRoute: 'local_gemma',
      promptHash: sha256Hex(promptText),
      promptLength: promptText.length,
      escalationRequired: routing.escalationRequired,
      ...(routing.effect === 'DENY' ? { blockedReason: 'ai_policy_blocked' as const } : {}),
    });

    if (routing.effect === 'DENY') {
      await this.recordBlockedResponse(ctx, created.sessionId, startedAt, 'ai_policy_blocked');
      throw new ForbiddenException({ code: 'AI_POLICY_BLOCKED' });
    }

    const retrieval = await this.retrieval.retrieve({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sessionId: ctx.sessionId ?? null,
      matterId: input.matterId,
      query: input.query,
      filters: { ...(input.filters ?? {}), matterId: input.matterId },
      maxChunks: input.maxChunks,
      modelRoute: 'local_gemma',
    });

    if (retrieval.status !== 'ready') {
      await this.recordBlockedResponse(ctx, created.sessionId, startedAt, 'unsupported_scope');
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }

    await this.sessions.recordRetrievedChunks(
      ctx,
      created.sessionId,
      [
        ...retrieval.chunks.map((chunk, index) => ({
          documentId: chunk.documentId,
          versionId: chunk.versionId,
          chunkId: chunk.chunkId,
          included: true,
          reasonCode: 'included' as const,
          rankIndex: index,
          score: Math.max(0, chunk.score),
          quoteHash: chunk.textHash,
          sourceTextHash: chunk.sourceTextHash,
        })),
        ...(retrieval.excludedChunks ?? []).map((chunk) => ({
          documentId: chunk.documentId,
          versionId: chunk.versionId,
          chunkId: chunk.chunkId,
          included: false,
          reasonCode: chunk.reasonCode,
          rankIndex: chunk.rankIndex,
          score: chunk.score,
          quoteHash: chunk.textHash,
          sourceTextHash: chunk.sourceTextHash,
        })),
      ],
    );

    const retrievalDocumentIds = [...new Set(retrieval.chunks.map((chunk) => chunk.documentId))];
    const graphFacts = isGraphPatternQuestion(input.query)
      ? await this.graphQuery.listNeighborhoodFactsForDocuments(permissionContext(ctx), {
          matterId: input.matterId,
          documentIds: retrievalDocumentIds,
          depth: 2,
          limit: 12,
          scopeLabel: 'ai_evidence_pack',
        })
      : await this.graphQuery.listFacts(permissionContext(ctx), {
          matterId: input.matterId,
          documentIds: retrievalDocumentIds,
          limit: 12,
          scopeLabel: 'ai_evidence_pack',
        });
    const ruleFindings = await this.contracts.evaluateRuleFindings(permissionContext(ctx), {
      matterId: input.matterId,
      limit: 12,
    });

    let pack: EvidencePackDto;
    try {
      pack = this.evidencePacks.build({
        tenantId: ctx.tenantId,
        matterId: input.matterId,
        userQuestion: input.query,
        retrieval,
        graphFacts: graphFacts.facts,
        ruleFindings: ruleFindings.findings,
        taskType: evidenceTaskTypeForSummaryTask(input.task),
        tokenBudget: 2400,
        locale: input.locale,
      });
    } catch {
      await this.recordBlockedResponse(ctx, created.sessionId, startedAt, 'validation_failed');
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }
    const gemmaAttempt = await this.tryRenderGemmaSummary(
      ctx,
      pack,
      input,
      routing.escalationRequired,
    );
    const rendered =
      gemmaAttempt.rendered ?? renderSummary(pack, input, routing.escalationRequired, true);
    if (rendered.citations.length === 0) {
      await this.recordBlockedResponse(ctx, created.sessionId, startedAt, 'validation_failed');
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }

    try {
      await this.citations.resolveSources(
        ctx,
        {
          matterId: input.matterId,
          citations: rendered.citations,
        },
        created.sessionId,
      );
    } catch {
      await this.recordBlockedResponse(ctx, created.sessionId, startedAt, 'permission_denied');
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    const citationVerification = this.citationVerifier.verify({
      citations: rendered.citations,
      claims: rendered.claims,
    });

    const response = aiSummaryResponseSchema.parse({
      sessionId: created.sessionId,
      matterId: input.matterId,
      task: input.task,
      status: rendered.status,
      modelRoute: 'local_gemma',
      evidencePackId: pack.packId,
      conclusion: rendered.conclusion,
      openQuestions: rendered.openQuestions,
      recommendedActions: rendered.recommendedActions,
      excludedSourcesNotice: rendered.excludedSourcesNotice,
      citations: rendered.citations,
      claims: rendered.claims,
      sections: rendered.sections,
      warnings: rendered.warnings,
      citationWarnings: citationVerification.warnings,
      escalationRequired:
        rendered.escalationRequired || citationVerification.warnings.some((warning) => warning.escalationRequired),
      legalConclusionAutoApproval: citationVerification.legalConclusionAutoApproval,
    });

    const responseJson = JSON.stringify(response);
    const responseHash = sha256Hex(responseJson);
    await this.sessions.recordClaims(
      ctx,
      created.sessionId,
      rendered.ledgerClaims,
      rendered.citations,
    );
    if (isContractAiReviewTask(input.task) && input.targetDocumentId) {
      await this.contracts.materializeContractAiReviewFindings(permissionContext(ctx), {
        matterId: input.matterId,
        documentId: input.targetDocumentId,
        aiSessionId: created.sessionId,
        task: input.task,
        claims: rendered.ledgerClaims,
        citations: rendered.citations,
      });
    }
    await this.sessions.recordResponse(ctx, created.sessionId, {
      responseHash,
      responseLength: responseJson.length,
      responseTokenCount: Math.ceil(responseJson.length / 4),
      latencyMs: Math.round(performance.now() - startedAt),
      status: 'responded',
      escalationRequired: response.escalationRequired,
      requestKind: input.task,
      ...(gemmaAttempt.generationResult
        ? { generationResult: gemmaAttempt.generationResult }
        : {}),
      ...(gemmaAttempt.fallbackReasonCode
        ? { fallbackReasonCode: gemmaAttempt.fallbackReasonCode }
        : {}),
      ...(response.escalationRequired ? { blockedReason: 'unsupported_scope' as const } : {}),
    });
    await this.sessions.recordPayload(ctx, created.sessionId, {
      promptText,
      responseText: responseJson,
      dlpFindingCount: 0,
    });
    return response;
  }

  private async recordBlockedResponse(
    ctx: AiSessionRequestContext,
    sessionId: string,
    startedAt: number,
    blockedReason:
      | 'ai_policy_blocked'
      | 'permission_denied'
      | 'unsupported_scope'
      | 'validation_failed',
  ): Promise<void> {
    await this.sessions.recordResponse(ctx, sessionId, {
      responseHash: sha256Hex(`blocked:${blockedReason}`),
      responseLength: 0,
      responseTokenCount: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      status: 'blocked',
      escalationRequired: true,
      blockedReason,
    });
  }

  private async tryRenderGemmaSummary(
    ctx: AiSessionRequestContext,
    pack: EvidencePackDto,
    input: AiSummaryRequestDto,
    routingEscalationRequired: boolean,
  ): Promise<GemmaSummaryRenderAttempt> {
    if (!gemmaGenerationTask(input.task)) return { rendered: null };
    const policy = await this.generationGate.getPolicy(ctx, input.matterId);
    if (!policy.summaryGenerationEnabled) {
      return {
        rendered: null,
        generationResult: 'fallback',
        fallbackReasonCode: 'SUMMARY_GENERATION_DISABLED',
      };
    }
    let generated: Awaited<ReturnType<LocalGemmaGenerationService['generateGrounded']>>;
    try {
      generated = await this.localGemma.generateGrounded(pack, {
        compileOptions: gemmaCompileOptionsForTask(input.task),
      });
    } catch {
      return {
        rendered: null,
        generationResult: 'fallback',
        fallbackReasonCode: 'LOCAL_GEMMA_UNAVAILABLE',
      };
    }
    if (generated.status !== 'completed' || !generated.output) {
      return {
        rendered: null,
        generationResult: 'fallback',
        fallbackReasonCode: generated.reasonCode ?? 'LOCAL_GEMMA_UNAVAILABLE',
      };
    }
    const rendered = renderGeneratedSummary(pack, input, generated.output, routingEscalationRequired);
    if (!rendered) {
      return {
        rendered: null,
        generationResult: 'fallback',
        fallbackReasonCode: 'UNSUPPORTED_OUTPUT',
      };
    }
    return { rendered, generationResult: 'generated' };
  }
}

function permissionContext(ctx: AiSessionRequestContext): PermissionContext {
  return {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  };
}

function isGraphPatternQuestion(query: string): boolean {
  return /graph|relationship|path|neighbor|issue|rfi|risk|fact|evidence|그래프|관계|연결|경로|쟁점|증거|사실|리스크|요청/iu.test(
    query,
  );
}

function renderSummary(
  pack: EvidencePackDto,
  input: AiSummaryRequestDto,
  routingEscalationRequired: boolean,
  degraded: boolean,
): RenderedSummary {
  const candidateChunks = input.targetDocumentId
    ? pack.retrievedChunks.filter((chunk) => chunk.documentId === input.targetDocumentId)
    : pack.retrievedChunks;
  const chunks = selectChunksForTask(input.task, candidateChunks);
  const warnings = warningCodesForTask(input.task, degraded);
  const citations = uniqueCitations(chunks);
  const escalationRequired =
    routingEscalationRequired || input.task === 'risk_extraction' || input.task === 'clause_analysis';

  const sections = chunks.slice(0, 5).map((chunk, index) =>
    sectionForChunk(input.task, chunk, index, escalationRequired),
  );
  const openQuestions = openQuestionsForPack(pack);
  const recommendedActions = recommendedActionsForPack(
    input.task,
    escalationRequired,
    openQuestions.length > 0,
  );
  const responseEscalationRequired = escalationRequired || recommendedActions.length > 0;
  const status = responseEscalationRequired ? 'escalated' : 'completed';
  const normalizedSections = sections.map((section) => ({
    ...section,
    ...(responseEscalationRequired ? { escalationRequired: true } : {}),
  }));
  const claims = sections.map((section) => {
    const claimHash = sha256Hex(`${section.heading}:${section.text}:${section.citationRefs.join('|')}`);
    return {
      claimId: section.sectionId,
      claimHash,
      citationRefs: section.citationRefs,
      ...(input.task === 'risk_extraction' ? { isLegalConclusion: true } : {}),
    };
  });
  const ledgerClaims = sections.map((section, index) => ({
    sessionClaimId: section.sectionId,
    claimHash: claims[index]?.claimHash ?? sha256Hex(section.text),
    claimText: section.text,
    kind: claimKindForTask(input.task),
    citationRefs: section.citationRefs,
    ...(input.task === 'risk_extraction' ? { isLegalConclusion: true } : {}),
  }));

  return {
    status,
    sections: normalizedSections,
    citations,
    claims,
    ledgerClaims,
    conclusion: conclusionFromSections(normalizedSections),
    openQuestions,
    recommendedActions,
    excludedSourcesNotice: excludedSourcesNoticeForPack(pack),
    warnings,
    escalationRequired: responseEscalationRequired,
  };
}

function renderGeneratedSummary(
  pack: EvidencePackDto,
  input: AiSummaryRequestDto,
  output: AiGroundedGenerationOutputDto,
  routingEscalationRequired: boolean,
): RenderedSummary | null {
  const candidateChunks = input.targetDocumentId
    ? pack.retrievedChunks.filter((chunk) => chunk.documentId === input.targetDocumentId)
    : pack.retrievedChunks;
  const allowedRefs = new Set(candidateChunks.map((chunk) => chunk.citationRef));
  const citedRefs = new Set<string>();

  for (const section of output.sections) {
    if (!section.source_refs.every((ref) => allowedRefs.has(ref))) return null;
    section.source_refs.forEach((ref) => citedRefs.add(ref));
  }
  for (const claim of output.claims) {
    if (!claim.source_refs.every((ref) => allowedRefs.has(ref))) return null;
    claim.source_refs.forEach((ref) => citedRefs.add(ref));
  }
  if (citedRefs.size === 0) return null;

  const chunks = candidateChunks.filter((chunk) => citedRefs.has(chunk.citationRef));
  const citations = uniqueCitations(chunks);
  if (citations.length === 0) return null;

  const baseEscalationRequired =
    routingEscalationRequired ||
    input.task === 'risk_extraction' ||
    input.task === 'clause_analysis' ||
    output.claims.some((claim) => claim.is_legal_conclusion === true);
  const slicedClaims = output.claims.slice(0, 100);
  const openQuestions = openQuestionsForPack(
    pack,
    slicedClaims
      .filter((claim) => claim.kind === 'question')
      .map((claim) => ({
        question: claim.text,
        neededEvidence: 'Confirm this open point against additional authorized matter evidence.',
        citationRefs: claim.source_refs,
      })),
  );
  const recommendedActions = recommendedActionsForPack(
    input.task,
    baseEscalationRequired,
    openQuestions.length > 0,
    emailRecommendedActionsFromClaims(input.task, slicedClaims),
  );
  const escalationRequired = baseEscalationRequired || recommendedActions.length > 0;
  const sections = output.sections.slice(0, 12).map((section) => ({
    sectionId: section.section_id,
    heading: section.heading,
    text: section.text,
    citationRefs: section.source_refs,
    ...(escalationRequired ? { escalationRequired: true } : {}),
  }));
  const claims = slicedClaims.map((claim) => ({
    claimId: claim.claim_id,
    claimHash: sha256Hex(`${claim.kind}:${claim.text}:${claim.source_refs.join('|')}`),
    citationRefs: claim.source_refs,
    ...(claim.is_legal_conclusion ? { isLegalConclusion: true } : {}),
  }));
  const ledgerClaims = slicedClaims.map((claim, index) => ({
    sessionClaimId: claim.claim_id,
    claimHash: claims[index]?.claimHash ?? sha256Hex(claim.text),
    claimText: claim.text,
    kind: claim.kind,
    citationRefs: claim.source_refs,
    ...(claim.is_legal_conclusion ? { isLegalConclusion: true } : {}),
  }));

  return {
    status: escalationRequired ? 'escalated' : 'completed',
    sections,
    citations,
    claims,
    ledgerClaims,
    conclusion: output.answer,
    openQuestions,
    recommendedActions,
    excludedSourcesNotice: excludedSourcesNoticeForPack(pack),
    warnings: warningCodesForTask(input.task, false),
    escalationRequired,
  };
}

function selectChunksForTask(
  task: AiSummaryTask,
  chunks: readonly EvidencePackChunkDto[],
): EvidencePackChunkDto[] {
  const limit = task === 'matter_summary' ? 5 : 3;
  return chunks.slice(0, limit);
}

function uniqueCitations(chunks: readonly EvidencePackChunkDto[]): AiCitationDto[] {
  const seen = new Set<string>();
  const citations: AiCitationDto[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.citationRef)) continue;
    seen.add(chunk.citationRef);
    citations.push({
      citationRef: chunk.citationRef,
      matterId: chunk.matterId,
      documentId: chunk.documentId,
      versionId: chunk.versionId,
      chunkId: chunk.chunkId,
      quoteHash: chunk.textHash,
      sourceTextHash: chunk.sourceTextHash,
    });
  }
  return citations;
}

function sectionForChunk(
  task: AiSummaryTask,
  chunk: EvidencePackChunkDto,
  index: number,
  escalationRequired: boolean,
): AiSummarySectionDto {
  const citationRefs = [chunk.citationRef];
  return {
    sectionId: `${task}-${index + 1}`,
    heading: headingForTask(task, index),
    text: `${prefixForTask(task)} ${compactEvidenceText(chunk.redactedText)} [${chunk.citationRef}]`,
    citationRefs,
    ...(escalationRequired ? { escalationRequired: true } : {}),
  };
}

function headingForTask(task: AiSummaryTask, index: number): string {
  const labels: Record<AiSummaryTask, string> = {
    document_summary: 'Document evidence',
    matter_summary: 'Matter evidence',
    email_thread_summary: 'Filed email thread evidence',
    clause_analysis: 'Clause analysis template',
    risk_extraction: 'Risk review template',
    matter_qa: 'Matter Q&A evidence',
  };
  return `${labels[task]} ${index + 1}`;
}

function prefixForTask(task: AiSummaryTask): string {
  const prefixes: Record<AiSummaryTask, string> = {
    document_summary: 'Evidence-only document summary:',
    matter_summary: 'Authorized matter evidence:',
    email_thread_summary: 'Filed authorized email context:',
    clause_analysis: 'Rule findings active; cited clause evidence only:',
    risk_extraction: 'Human review required; cited rule and chunk evidence only:',
    matter_qa: 'Cited answer from authorized matter evidence only:',
  };
  return prefixes[task];
}

function claimKindForTask(task: AiSummaryTask): AiClaimLedgerInput['kind'] {
  if (task === 'matter_qa') return 'answer';
  if (task === 'clause_analysis') return 'risk';
  if (task === 'risk_extraction') return 'risk';
  if (task === 'email_thread_summary') return 'summary';
  return 'summary';
}

function warningCodesForTask(task: AiSummaryTask, degraded: boolean): AiSummaryWarningCode[] {
  const warnings = new Set<AiSummaryWarningCode>(['NO_DENIED_SOURCES_INCLUDED']);
  if (degraded) warnings.add('EVIDENCE_ONLY_DEGRADED');
  if (task === 'clause_analysis' || task === 'risk_extraction') warnings.add('HUMAN_REVIEW_REQUIRED');
  if (task === 'risk_extraction') warnings.add('HUMAN_REVIEW_REQUIRED');
  return [...warnings];
}

function conclusionFromSections(sections: readonly AiSummarySectionDto[]): string {
  return sections[0]?.text ?? 'No cited conclusion is available from authorized matter evidence.';
}

function openQuestionsForPack(
  pack: EvidencePackDto,
  generatedQuestions: readonly AiSummaryOpenQuestionDto[] = [],
): AiSummaryOpenQuestionDto[] {
  const uncertaintyQuestions = pack.uncertainty.map((question) => ({
    question,
    neededEvidence: 'Review additional authorized matter sources before relying on this point.',
  }));
  return [...uncertaintyQuestions, ...generatedQuestions].slice(0, 20);
}

function recommendedActionsForPack(
  task: AiSummaryTask,
  escalationRequired: boolean,
  hasOpenQuestions: boolean,
  claimDrivenActions: readonly AiSummaryRecommendedActionDto[] = [],
): AiSummaryRecommendedActionDto[] {
  const actions: AiSummaryRecommendedActionDto[] = [...claimDrivenActions];
  if (escalationRequired || task === 'clause_analysis' || task === 'risk_extraction') {
    actions.push({
      action: 'Review the cited evidence before treating this answer as legal analysis.',
      reviewRequired: true,
    });
  }
  if (hasOpenQuestions) {
    actions.push({
      action: 'Check additional authorized matter sources for omitted or uncertain context.',
      reviewRequired: true,
    });
  }
  return actions.slice(0, 20);
}

function emailRecommendedActionsFromClaims(
  task: AiSummaryTask,
  claims: readonly AiGroundedGenerationOutputDto['claims'][number][],
): AiSummaryRecommendedActionDto[] {
  if (task !== 'email_thread_summary') return [];
  const actions = new Map<string, AiSummaryRecommendedActionDto>();
  for (const claim of claims) {
    if (claim.kind !== 'key_fact' && claim.kind !== 'timeline') continue;
    const label = claim.kind === 'timeline' ? '기한 확인' : '요청사항 확인';
    const action = `${label}: ${compactActionText(claim.text)}`;
    actions.set(action, { action, reviewRequired: true });
    if (actions.size >= 8) break;
  }
  return [...actions.values()];
}

function excludedSourcesNoticeForPack(pack: EvidencePackDto): AiSummaryExcludedSourcesNoticeDto {
  return { count: pack.omittedChunkIds.length };
}

function compactEvidenceText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 700);
}

function compactActionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 540);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function gemmaGenerationTask(task: AiSummaryTask): boolean {
  return (
    task === 'document_summary' ||
    task === 'matter_summary' ||
    task === 'email_thread_summary' ||
    task === 'clause_analysis' ||
    task === 'risk_extraction' ||
    task === 'matter_qa'
  );
}

function isContractAiReviewTask(
  task: AiSummaryTask,
): task is Extract<AiSummaryTask, 'clause_analysis' | 'risk_extraction'> {
  return task === 'clause_analysis' || task === 'risk_extraction';
}

function evidenceTaskTypeForSummaryTask(task: AiSummaryTask): EvidencePackDto['taskType'] {
  if (task === 'matter_qa') return 'retrieval';
  if (task === 'clause_analysis' || task === 'risk_extraction') return 'review';
  return 'summary';
}

function gemmaCompileOptionsForTask(task: AiSummaryTask): EvidencePromptCompileOptions | undefined {
  if (task === 'clause_analysis' || task === 'risk_extraction') {
    return {
      purpose: 'clause_risk_analysis',
      allowedClaimKinds: ['risk', 'clause', 'issue'],
    };
  }
  if (task === 'email_thread_summary') {
    return {
      purpose: 'email_thread_summary',
      allowedClaimKinds: ['summary', 'key_fact', 'timeline', 'question'],
    };
  }
  return undefined;
}
