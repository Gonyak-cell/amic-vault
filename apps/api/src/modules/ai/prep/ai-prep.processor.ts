import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  adaptEvidencePackToPrepSourceRefs,
  aiPrepArtifactAllowedClaimKinds,
  aiPrepGroundedGenerationOutputSchema,
  parseAiPrepArtifactPayload,
  type AiPrepArtifactKind,
  type AiPrepArtifactPayloadDto,
  type AiPrepStaleReason,
  type EvidencePackDto,
} from '@amic-vault/shared';
import { AiPolicyService } from '../../ai-policy/ai-policy.service';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../../search/permission/search-permission-scope.provider';
import { AiEvidencePromptCompiler } from '../generation/evidence-prompt.compiler';
import { LocalGemmaGenerationService } from '../generation/local-gemma-generation.service';
import { AiRedactionPreprocessor } from '../retrieval/redaction-preprocessor';
import { normalizeAiPrepMetadata } from './ai-prep-metadata-normalizer';
import { AiPrepRepository } from './ai-prep.repository';
import { applyAiPrepRetrievalPlan, planAiPrepRetrieval } from './ai-prep-retrieval-planner';
import type { AiPrepJobPayload, AiPrepSource, AiPrepSourceChunk } from './ai-prep.types';

@Injectable()
export class AiPrepProcessor {
  private readonly logger = new Logger(AiPrepProcessor.name);
  private readonly newVersionStaleReason: AiPrepStaleReason = 'new_version';

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AiPolicyService) private readonly aiPolicy: AiPolicyService,
    @Inject(AiPrepRepository) private readonly repository: AiPrepRepository,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(AiRedactionPreprocessor)
    private readonly redaction: AiRedactionPreprocessor,
    @Inject(AiEvidencePromptCompiler)
    private readonly promptCompiler: AiEvidencePromptCompiler,
    @Inject(LocalGemmaGenerationService)
    private readonly generation: LocalGemmaGenerationService,
  ) {}

  async handle(payload: AiPrepJobPayload): Promise<void> {
    const target = await this.auditService.transaction(payload.tenantId, async (tx) => {
      const found = await this.repository.findTarget(tx, payload);
      if (found) {
        const staleRows = await this.repository.markSupersededArtifactsStale(tx, {
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          currentVersionId: payload.versionId,
        });
        for (const staleRow of staleRows) {
          await this.auditService.log(
            {
              tenantId: payload.tenantId,
              actorType: 'system',
              actorId: null,
              action: 'AI_PREP_STALE',
              targetType: 'ai_prep_artifact',
              targetId: staleRow.ai_prep_artifact_id,
              matterId: found.matterId,
              metadata: {
                ai_prep_artifact_id: staleRow.ai_prep_artifact_id,
                ai_prep_kind: staleRow.artifact_kind,
                ai_prep_status: 'stale',
                document_id: payload.documentId,
                version_id: payload.versionId,
                matter_id: found.matterId,
                stale_reason: this.newVersionStaleReason,
              },
            },
            tx,
          );
        }
      }
      return found;
    });

    if (!target) {
      this.logger.warn({ code: 'AI_PREP_TARGET_MISSING', versionId: payload.versionId });
      return;
    }

    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch({
        tenantId: target.tenantId,
        userId: target.actorId,
      });
    } catch {
      await this.recordBlocked(target, payload, 'AI_PREP_SCOPE_DENIED', []);
      return;
    }
    if (scopeDecision.effect !== 'ALLOW') {
      await this.recordBlocked(target, payload, 'AI_PREP_SCOPE_DENIED', []);
      return;
    }

    const source = await this.auditService.transaction(payload.tenantId, (tx) =>
      this.repository.findScopedSource(
        tx,
        { ...payload, matterId: target.matterId },
        scopeDecision.scope,
      ),
    );
    if (!source || source.chunks.length === 0) {
      await this.recordBlocked(target, payload, 'AI_PREP_NO_SOURCE_CHUNKS', []);
      return;
    }

    const policyDecision = await this.aiPolicy.evaluate({
      tenantId: source.tenantId,
      userId: source.actorId,
      matterId: source.matterId,
      modelRoute: 'local_gemma',
      documentIds: [source.documentId],
    });
    if (policyDecision.effect !== 'ALLOW') {
      await this.recordBlocked(source, payload, 'AI_PREP_POLICY_BLOCKED', source.chunks);
      return;
    }

    const redacted = this.redaction.redact(source.chunks);
    if (redacted.effect !== 'ALLOW' || redacted.chunks.length === 0) {
      await this.recordBlocked(source, payload, 'AI_PREP_REDACTION_BLOCKED', source.chunks);
      return;
    }

    const retrievalPlan = planAiPrepRetrieval({
      artifactKind: payload.artifactKind,
      matterId: source.matterId,
    });
    const plannedRedactedChunks = applyAiPrepRetrievalPlan(redacted.chunks, retrievalPlan);
    if (plannedRedactedChunks.length === 0) {
      await this.recordBlocked(source, payload, 'AI_PREP_NO_SOURCE_CHUNKS', []);
      return;
    }
    const plannedChunkIds = new Set(plannedRedactedChunks.map((chunk) => chunk.chunkId));
    const plannedSource: AiPrepSource = {
      ...source,
      chunks: source.chunks.filter((chunk) => plannedChunkIds.has(chunk.chunkId)),
    };
    if (plannedSource.chunks.length !== plannedRedactedChunks.length) {
      await this.recordBlocked(source, payload, 'AI_PREP_EVIDENCE_SOURCE_REF_MISMATCH', []);
      return;
    }

    const pack = this.repository.buildEvidencePack({
      source: plannedSource,
      chunks: plannedRedactedChunks,
      artifactKind: payload.artifactKind,
      appliedRules: [
        'retrieval.hybrid:query_stage_scope',
        ...(scopeDecision.appliedRules ?? []),
        ...redacted.appliedRules,
        ...retrievalPlan.appliedRules,
        'ai_prep.permission:created_by_scope',
        'ai_prep.policy:local_gemma_allowed',
      ],
      tokenBudget: retrievalPlan.tokenBudget,
    });
    let prepAdapter: ReturnType<typeof adaptEvidencePackToPrepSourceRefs>;
    try {
      prepAdapter = adaptEvidencePackToPrepSourceRefs(pack);
    } catch {
      await this.recordBlocked(
        plannedSource,
        payload,
        'AI_PREP_EVIDENCE_SOURCE_REF_MISMATCH',
        plannedSource.chunks,
      );
      return;
    }
    const compileOptions = {
      purpose: 'file_organization_prep' as const,
      artifactKind: payload.artifactKind,
      allowedClaimKinds: aiPrepArtifactAllowedClaimKinds(payload.artifactKind),
    };
    const compiled = this.promptCompiler.compile(pack, compileOptions);
    const promptHash = sha256Hex(`${compiled.system}\n\n${compiled.prompt}`);
    const generationResult = await this.generation.generateGrounded(pack, {
      compileOptions,
      parseOutput: (value) => aiPrepGroundedGenerationOutputSchema.parse(value),
    });

    if (generationResult.status === 'completed' && generationResult.output) {
      try {
        const payloadJson = parsePrepPayload(
          {
            ...generationResult.output,
            source_refs: prepAdapter.source_refs,
          },
          payload.artifactKind,
        );
        const responseHash = sha256Hex(JSON.stringify(payloadJson));
        await this.auditService.transaction(source.tenantId, async (tx) => {
          const artifactId = await this.repository.upsertCompleted(tx, {
            source: plannedSource,
            artifactKind: payload.artifactKind,
            sourceChunks: plannedSource.chunks,
            promptHash,
            responseHash,
            payload: payloadJson,
            modelName: generationResult.model,
            latencyMs: generationResult.latencyMs,
          });
          await this.recordArtifactAudit(tx, {
            action: 'AI_PREP_COMPLETED',
            artifactId,
            source: plannedSource,
            payload,
            status: 'completed',
            result: 'success',
            sourceChunkCount: plannedSource.chunks.length,
            promptHash,
            responseHash,
            generationResult: 'gemma',
          });
        });
        return;
      } catch {
        await this.recordRejected(plannedSource, payload, pack, {
          reasonCode: 'AI_PREP_VALIDATION_FAILED',
          promptHash,
          modelName: generationResult.model,
          latencyMs: generationResult.latencyMs,
        });
        return;
      }
    }

    const reasonCode = normalizeBlockedReason(generationResult.reasonCode);
    if (deterministicFallbackEnabled() && shouldCompleteWithDeterministicFallback(reasonCode)) {
      await this.recordFallbackCompleted(plannedSource, payload, pack, {
        reasonCode,
        promptHash,
        modelName: generationResult.model,
        latencyMs: generationResult.latencyMs,
      });
      return;
    }

    await this.recordRejected(plannedSource, payload, pack, {
      reasonCode,
      promptHash,
      modelName: generationResult.model,
      latencyMs: generationResult.latencyMs,
    });
  }

  private async recordFallbackCompleted(
    source: AiPrepSource,
    payload: AiPrepJobPayload,
    pack: EvidencePackDto,
    input: {
      reasonCode: string;
      promptHash: string;
      modelName?: string | undefined;
      latencyMs?: number | undefined;
    },
  ): Promise<void> {
    const prepAdapter = adaptEvidencePackToPrepSourceRefs(pack);
    const payloadJson = buildDeterministicFallbackPayload(
      source,
      prepAdapter.source_refs,
      payload.artifactKind,
      input.reasonCode,
    );
    const responseHash = sha256Hex(JSON.stringify(payloadJson));
    await this.auditService.transaction(source.tenantId, async (tx) => {
      const artifactId = await this.repository.upsertCompleted(tx, {
        source,
        artifactKind: payload.artifactKind,
        sourceChunks: source.chunks,
        promptHash: input.promptHash,
        responseHash,
        payload: payloadJson,
        modelName: input.modelName,
        latencyMs: input.latencyMs,
      });
      await this.recordArtifactAudit(tx, {
        action: 'AI_PREP_COMPLETED',
        artifactId,
        source,
        payload,
        status: 'completed',
        result: 'success',
        sourceChunkCount: source.chunks.length,
        promptHash: input.promptHash,
        responseHash,
        generationResult: 'fallback',
        fallbackReasonCode: input.reasonCode,
      });
    });
  }

  private async recordRejected(
    source: AiPrepSource,
    payload: AiPrepJobPayload,
    pack: EvidencePackDto,
    input: {
      reasonCode: string;
      promptHash: string;
      modelName?: string | undefined;
      latencyMs?: number | undefined;
    },
  ): Promise<void> {
    const prepAdapter = adaptEvidencePackToPrepSourceRefs(pack);
    const payloadJson = buildDeterministicRejectedPayload(
      prepAdapter.source_refs,
      payload.artifactKind,
      input.reasonCode,
    );
    const responseHash = sha256Hex(JSON.stringify(payloadJson));
    await this.auditService.transaction(source.tenantId, async (tx) => {
      const artifactId = await this.repository.upsertRejected(tx, {
        source,
        artifactKind: payload.artifactKind,
        sourceChunks: source.chunks,
        reasonCode: input.reasonCode,
        promptHash: input.promptHash,
        responseHash,
        payload: payloadJson,
        modelName: input.modelName,
        latencyMs: input.latencyMs,
      });
      await this.recordArtifactAudit(tx, {
        action: 'AI_PREP_REJECTED',
        artifactId,
        source,
        payload,
        status: 'rejected',
        result: 'failure',
        sourceChunkCount: source.chunks.length,
        reasonCode: input.reasonCode,
        promptHash: input.promptHash,
        responseHash,
        generationResult: 'rejected',
      });
    });
  }

  async markDeadLetter(payload: AiPrepJobPayload, deadLetterId: string): Promise<void> {
    const target = await this.auditService.transaction(payload.tenantId, (tx) =>
      this.repository.findTarget(tx, payload),
    );
    if (!target) return;
    await this.auditService.transaction(payload.tenantId, async (tx) => {
      const artifactId = await this.repository.upsertFailed(tx, {
        source: target,
        artifactKind: payload.artifactKind,
        reasonCode: 'AI_PREP_RETRY_EXHAUSTED',
      });
      await this.recordArtifactAudit(tx, {
        action: 'AI_PREP_FAILED',
        artifactId,
        source: target,
        payload,
        status: 'failed',
        result: 'failure',
        reasonCode: 'AI_PREP_RETRY_EXHAUSTED',
        deadLetterId,
      });
    });
  }

  async markWorkerFailure(payload: AiPrepJobPayload, reasonCode: string): Promise<void> {
    const target = await this.auditService.transaction(payload.tenantId, (tx) =>
      this.repository.findTarget(tx, payload),
    );
    if (!target) return;
    const normalizedReasonCode = normalizeBlockedReason(reasonCode);
    await this.auditService.transaction(payload.tenantId, async (tx) => {
      const artifactId = await this.repository.upsertFailed(tx, {
        source: target,
        artifactKind: payload.artifactKind,
        reasonCode: normalizedReasonCode,
      });
      await this.recordArtifactAudit(tx, {
        action: 'AI_PREP_FAILED',
        artifactId,
        source: target,
        payload,
        status: 'failed',
        result: 'failure',
        reasonCode: normalizedReasonCode,
      });
    });
  }

  private async recordBlocked(
    source: AiPrepSource,
    payload: AiPrepJobPayload,
    reasonCode: string,
    chunks: readonly AiPrepSourceChunk[],
  ): Promise<void> {
    await this.auditService.transaction(source.tenantId, async (tx) => {
      const artifactId = await this.repository.upsertBlocked(tx, {
        source,
        artifactKind: payload.artifactKind,
        reasonCode,
        sourceChunks: chunks,
      });
      await this.recordArtifactAudit(tx, {
        action: 'AI_PREP_BLOCKED',
        artifactId,
        source,
        payload,
        status: 'blocked',
        result: 'denied',
        reasonCode,
        sourceChunkCount: chunks.length,
      });
    });
  }

  private async recordArtifactAudit(
    tx: QueryClient,
    input: {
      action:
        | 'AI_PREP_COMPLETED'
        | 'AI_PREP_BLOCKED'
        | 'AI_PREP_FAILED'
        | 'AI_PREP_REJECTED';
      artifactId: string;
      source: AiPrepSource;
      payload: AiPrepJobPayload;
      status: 'completed' | 'blocked' | 'failed' | 'rejected';
      result: 'success' | 'denied' | 'failure';
      sourceChunkCount?: number | undefined;
      reasonCode?: string | undefined;
      promptHash?: string | undefined;
      responseHash?: string | undefined;
      generationResult?: 'gemma' | 'fallback' | 'rejected' | undefined;
      fallbackReasonCode?: string | undefined;
      deadLetterId?: string | undefined;
    },
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: input.source.tenantId,
        actorType: 'system',
        actorId: null,
        action: input.action,
        targetType: 'ai_prep_artifact',
        targetId: input.artifactId,
        matterId: input.source.matterId,
        result: input.result,
        metadata: {
          ai_prep_artifact_id: input.artifactId,
          ai_prep_kind: input.payload.artifactKind,
          ai_prep_status: input.status,
          matter_id: input.source.matterId,
          document_id: input.source.documentId,
          version_id: input.source.versionId,
          source_chunk_count: input.sourceChunkCount ?? 0,
          ...(input.generationResult ? { generation_result: input.generationResult } : {}),
          ...(input.fallbackReasonCode ? { fallback_reason_code: input.fallbackReasonCode } : {}),
          ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
          ...(input.promptHash ? { prompt_hash: input.promptHash } : {}),
          ...(input.responseHash ? { response_hash: input.responseHash } : {}),
          ...(input.deadLetterId ? { dead_letter_id: input.deadLetterId } : {}),
        },
      },
      tx,
    );
  }
}

function parsePrepPayload(
  input: unknown,
  artifactKind: AiPrepJobPayload['artifactKind'],
): AiPrepArtifactPayloadDto {
  return parseAiPrepArtifactPayload(input, artifactKind);
}

function buildDeterministicFallbackPayload(
  source: AiPrepSource,
  sourceRefsInput: readonly string[],
  artifactKind: AiPrepArtifactKind,
  reasonCode: string,
): AiPrepArtifactPayloadDto {
  const sourceRefs = sourceRefsInput.slice(0, 50);
  const primarySourceRef = sourceRefs[0];
  if (!primarySourceRef) {
    throw new Error('deterministic ai prep fallback artifact requires source refs');
  }
  const sectionRefs = sourceRefs.slice(0, 20);
  const allowedKinds = aiPrepArtifactAllowedClaimKinds(artifactKind);
  const claimKind = allowedKinds.includes('key_fact') ? 'key_fact' : (allowedKinds[0] ?? 'summary');
  const sourceCount = sourceRefs.length;
  const normalizedReason = normalizeBlockedReason(reasonCode);
  const metadata = normalizeAiPrepMetadata({
    title: source.title,
    sourceTextHashes: source.chunks.map((chunk) => chunk.sourceTextHash),
  });
  return parseAiPrepArtifactPayload(
    {
      answer: fallbackAnswer(artifactKind, metadata.safeTitle, sourceCount),
      sections: [
        {
          section_id: 'prep_fallback',
          heading: '파일 정리 준비',
          text: fallbackSectionText(artifactKind, metadata.safeTitle, sourceCount),
          source_refs: sectionRefs,
        },
      ],
      claims: [
        {
          claim_id: 'prep_fallback_1',
          kind: claimKind,
          text: fallbackClaimText(artifactKind, metadata.safeTitle, sourceCount),
          source_refs: [primarySourceRef],
          is_legal_conclusion: false,
        },
      ],
      warnings: [`LOCAL_GEMMA_${normalizedReason}_FALLBACK`],
      source_refs: sourceRefs,
    },
    artifactKind,
  );
}

function buildDeterministicRejectedPayload(
  sourceRefsInput: readonly string[],
  artifactKind: AiPrepArtifactKind,
  reasonCode: string,
): AiPrepArtifactPayloadDto {
  const sourceRefs = sourceRefsInput.slice(0, 50);
  const primarySourceRef = sourceRefs[0];
  if (!primarySourceRef) {
    throw new Error('deterministic ai prep rejected artifact requires source refs');
  }
  const sectionRefs = sourceRefs.slice(0, 20);
  const allowedKinds = aiPrepArtifactAllowedClaimKinds(artifactKind);
  const claimKind = allowedKinds.includes('key_fact') ? 'key_fact' : (allowedKinds[0] ?? 'summary');
  const sourceCount = sourceRefs.length;
  const normalizedReason = normalizeBlockedReason(reasonCode);
  return parseAiPrepArtifactPayload(
    {
      answer: rejectedAnswer(artifactKind, sourceCount),
      sections: [
        {
          section_id: 'prep_rejected',
          heading: '파일 정리 준비',
          text: rejectedSectionText(artifactKind, sourceCount),
          source_refs: sectionRefs,
        },
      ],
      claims: [
        {
          claim_id: 'prep_rejected_1',
          kind: claimKind,
          text: rejectedClaimText(artifactKind, sourceCount),
          source_refs: [primarySourceRef],
          is_legal_conclusion: false,
        },
      ],
      warnings: [`LOCAL_GEMMA_${normalizedReason}_REJECTED`],
      source_refs: sourceRefs,
    },
    artifactKind,
  );
}

function fallbackAnswer(artifactKind: AiPrepArtifactKind, title: string, sourceCount: number): string {
  return `${artifactLabel(artifactKind)} 준비가 완료되었습니다. ${title} 파일은 권한 통과 source ref ${sourceCount}개와 연결되었습니다.`;
}

function fallbackSectionText(artifactKind: AiPrepArtifactKind, title: string, sourceCount: number): string {
  return `${title}의 ${artifactLabel(artifactKind)} 항목을 파일 정리용으로 생성했습니다. 본문 원문이나 모델 응답은 저장하지 않았습니다. source ref ${sourceCount}개를 기준으로 다시 처리할 수 있습니다.`;
}

function fallbackClaimText(artifactKind: AiPrepArtifactKind, title: string, sourceCount: number): string {
  return `${title} 파일의 ${artifactLabel(artifactKind)} fallback artifact이며, 법률 분석 없이 source ref ${sourceCount}개만 근거로 보존했습니다.`;
}

function rejectedAnswer(artifactKind: AiPrepArtifactKind, sourceCount: number): string {
  return `${artifactLabel(artifactKind)} 모델 출력이 거부되었습니다. 권한 통과 source ref ${sourceCount}개를 기준으로 거부 상태만 기록했습니다.`;
}

function rejectedSectionText(artifactKind: AiPrepArtifactKind, sourceCount: number): string {
  return `로컬 Gemma 출력이 저장 기준을 충족하지 않아 원본 모델 응답은 폐기했습니다. ${artifactLabel(artifactKind)}용 source ref ${sourceCount}개만 참조로 남깁니다.`;
}

function rejectedClaimText(artifactKind: AiPrepArtifactKind, sourceCount: number): string {
  return `${artifactLabel(artifactKind)} artifact는 rejected 상태이며, 권한 통과 source ref ${sourceCount}개와 연결되어 있고 법률 쟁점·위험·조항 분석 claim은 저장하지 않았습니다.`;
}

function artifactLabel(artifactKind: AiPrepArtifactKind): string {
  switch (artifactKind) {
    case 'document_profile':
      return '문서 프로필';
    case 'key_fields':
      return '주요 필드';
    case 'date_facts':
      return '날짜 정보';
    case 'people_organizations':
      return '인물·조직 정보';
    case 'keyword_tags':
      return '키워드 태그';
    case 'filing_suggestions':
      return '파일링 제안';
    case 'source_outline':
      return '출처 개요';
    case 'retrieval_hints':
      return '검색 힌트';
  }
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function shouldCompleteWithDeterministicFallback(reasonCode: string): boolean {
  return ['GENERATION_FAILED', 'INVALID_JSON', 'SCHEMA_INVALID', 'RESPONSE_TOO_LARGE'].includes(
    reasonCode,
  );
}

function deterministicFallbackEnabled(): boolean {
  const raw = process.env.AI_PREP_DETERMINISTIC_FALLBACK_ENABLED ?? 'true';
  return ['1', 'true', 'yes'].includes(raw.trim().toLowerCase());
}

function normalizeBlockedReason(reasonCode: string | undefined): string {
  const normalized = (reasonCode ?? 'AI_PREP_GENERATION_BLOCKED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 80);
  return normalized.length > 0 ? normalized : 'AI_PREP_GENERATION_BLOCKED';
}
