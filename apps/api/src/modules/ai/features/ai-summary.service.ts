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
import { AiSessionLogService, type AiSessionRequestContext } from '../session/ai-session-log.service';
import { GraphQueryService } from '../../graph/graph-query.service';
import { ContractIntelService } from '../../contract-intel/contract-intel.service';
import { LocalGemmaGenerationService } from '../generation/local-gemma-generation.service';

interface RenderedSummary {
  status: 'completed' | 'escalated';
  sections: AiSummarySectionDto[];
  citations: AiCitationDto[];
  claims: AiCitationClaimDto[];
  warnings: AiSummaryWarningCode[];
  escalationRequired: boolean;
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
  ) {}

  async createSummary(
    ctx: AiSessionRequestContext,
    input: AiSummaryRequestDto,
  ): Promise<AiSummaryResponseDto> {
    const startedAt = performance.now();
    const routing = await this.routing.decide(ctx, {
      matterId: input.matterId,
      modelRoute: 'local_gemma',
      taskKind: input.task,
      prompt: input.query,
    });
    const created = await this.sessions.createSession(ctx, {
      matterId: input.matterId,
      modelRoute: 'local_gemma',
      promptHash: sha256Hex(`${input.task}:${input.query}`),
      promptLength: input.query.length,
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
      retrieval.chunks.map((chunk, index) => ({
        documentId: chunk.documentId,
        versionId: chunk.versionId,
        chunkId: chunk.chunkId,
        included: true,
        reasonCode: 'included',
        rankIndex: index,
        score: Math.max(0, chunk.score),
        quoteHash: chunk.textHash,
        sourceTextHash: chunk.sourceTextHash,
      })),
    );

    const graphFacts = await this.graphQuery.listFacts(permissionContext(ctx), {
      matterId: input.matterId,
      documentIds: [...new Set(retrieval.chunks.map((chunk) => chunk.documentId))],
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
    const rendered =
      (await this.tryRenderGemmaSummary(pack, input, routing.escalationRequired)) ??
      renderSummary(pack, input, routing.escalationRequired, true);
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
    await this.sessions.recordResponse(ctx, created.sessionId, {
      responseHash: sha256Hex(responseJson),
      responseLength: responseJson.length,
      responseTokenCount: Math.ceil(responseJson.length / 4),
      latencyMs: Math.round(performance.now() - startedAt),
      status: 'responded',
      escalationRequired: response.escalationRequired,
      ...(response.escalationRequired ? { blockedReason: 'unsupported_scope' as const } : {}),
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
    pack: EvidencePackDto,
    input: AiSummaryRequestDto,
    routingEscalationRequired: boolean,
  ): Promise<RenderedSummary | null> {
    if (!summaryGemmaEnabled()) return null;
    let generated: Awaited<ReturnType<LocalGemmaGenerationService['generateGrounded']>>;
    try {
      generated = await this.localGemma.generateGrounded(pack);
    } catch {
      return null;
    }
    if (generated.status !== 'completed' || !generated.output) return null;
    return renderGeneratedSummary(pack, input, generated.output, routingEscalationRequired);
  }
}

function permissionContext(ctx: AiSessionRequestContext): PermissionContext {
  return {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  };
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
  const claims = sections.map((section) => ({
    claimId: section.sectionId,
    claimHash: sha256Hex(`${section.heading}:${section.text}:${section.citationRefs.join('|')}`),
    citationRefs: section.citationRefs,
    ...(input.task === 'risk_extraction' ? { isLegalConclusion: true } : {}),
  }));

  return {
    status: escalationRequired ? 'escalated' : 'completed',
    sections,
    citations,
    claims,
    warnings,
    escalationRequired,
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

  const escalationRequired =
    routingEscalationRequired ||
    input.task === 'risk_extraction' ||
    input.task === 'clause_analysis' ||
    output.claims.some((claim) => claim.is_legal_conclusion === true);
  const sections = output.sections.slice(0, 12).map((section) => ({
    sectionId: section.section_id,
    heading: section.heading,
    text: section.text,
    citationRefs: section.source_refs,
    ...(escalationRequired ? { escalationRequired: true } : {}),
  }));
  const claims = output.claims.slice(0, 100).map((claim) => ({
    claimId: claim.claim_id,
    claimHash: sha256Hex(`${claim.kind}:${claim.text}:${claim.source_refs.join('|')}`),
    citationRefs: claim.source_refs,
    ...(claim.is_legal_conclusion ? { isLegalConclusion: true } : {}),
  }));

  return {
    status: escalationRequired ? 'escalated' : 'completed',
    sections,
    citations,
    claims,
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

function warningCodesForTask(task: AiSummaryTask, degraded: boolean): AiSummaryWarningCode[] {
  const warnings = new Set<AiSummaryWarningCode>(['NO_DENIED_SOURCES_INCLUDED']);
  if (degraded) warnings.add('EVIDENCE_ONLY_DEGRADED');
  if (task === 'clause_analysis' || task === 'risk_extraction') warnings.add('HUMAN_REVIEW_REQUIRED');
  if (task === 'risk_extraction') warnings.add('HUMAN_REVIEW_REQUIRED');
  return [...warnings];
}

function compactEvidenceText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 700);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function summaryGemmaEnabled(): boolean {
  const defaultValue = process.env.NODE_ENV === 'test' ? 'false' : 'true';
  const raw = process.env.AI_SUMMARY_GEMMA_ENABLED ?? defaultValue;
  return ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
}

function evidenceTaskTypeForSummaryTask(task: AiSummaryTask): EvidencePackDto['taskType'] {
  if (task === 'matter_qa') return 'retrieval';
  if (task === 'clause_analysis' || task === 'risk_extraction') return 'review';
  return 'summary';
}
