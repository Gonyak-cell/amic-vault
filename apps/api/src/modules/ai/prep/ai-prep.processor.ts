import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  aiPrepArtifactAllowedClaimKinds,
  aiPrepGroundedGenerationOutputSchema,
  parseAiPrepArtifactPayload,
  type AiPrepArtifactKind,
  type AiPrepArtifactPayloadDto,
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
import { AiPrepRepository } from './ai-prep.repository';
import type { AiPrepJobPayload, AiPrepSource, AiPrepSourceChunk } from './ai-prep.types';

@Injectable()
export class AiPrepProcessor {
  private readonly logger = new Logger(AiPrepProcessor.name);

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
                stale_reason: 'new_version',
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

    const pack = this.repository.buildEvidencePack({
      source,
      chunks: redacted.chunks,
      artifactKind: payload.artifactKind,
      appliedRules: [
        ...(scopeDecision.appliedRules ?? []),
        ...redacted.appliedRules,
        'ai_prep.permission:created_by_scope',
        'ai_prep.policy:local_gemma_allowed',
      ],
    });
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

    let payloadJson: AiPrepArtifactPayloadDto;
    let generationResultKind: 'gemma' | 'fallback' = 'gemma';
    let fallbackReasonCode: string | undefined;
    if (generationResult.status === 'completed' && generationResult.output) {
      try {
        payloadJson = parsePrepPayload(
          {
            ...generationResult.output,
            source_refs: pack.citationRequirements.sourceRefs,
          },
          payload.artifactKind,
        );
      } catch {
        generationResultKind = 'fallback';
        fallbackReasonCode = 'AI_PREP_VALIDATION_FAILED';
        payloadJson = buildDeterministicPrepPayload(
          pack,
          payload.artifactKind,
          fallbackReasonCode,
        );
      }
    } else {
      generationResultKind = 'fallback';
      fallbackReasonCode = normalizeBlockedReason(generationResult.reasonCode);
      payloadJson = buildDeterministicPrepPayload(
        pack,
        payload.artifactKind,
        fallbackReasonCode,
      );
    }
    const responseHash = sha256Hex(JSON.stringify(payloadJson));
    await this.auditService.transaction(source.tenantId, async (tx) => {
      const artifactId = await this.repository.upsertCompleted(tx, {
        source,
        artifactKind: payload.artifactKind,
        sourceChunks: source.chunks,
        promptHash,
        responseHash,
        payload: payloadJson,
        modelName: generationResult.model,
        latencyMs: generationResult.latencyMs,
      });
      await this.recordArtifactAudit(tx, {
        action: 'AI_PREP_COMPLETED',
        artifactId,
        source,
        payload,
        status: 'completed',
        result: 'success',
        sourceChunkCount: source.chunks.length,
        promptHash,
        responseHash,
        generationResult: generationResultKind,
        fallbackReasonCode,
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
      action: 'AI_PREP_COMPLETED' | 'AI_PREP_BLOCKED' | 'AI_PREP_FAILED';
      artifactId: string;
      source: AiPrepSource;
      payload: AiPrepJobPayload;
      status: 'completed' | 'blocked' | 'failed';
      result: 'success' | 'denied' | 'failure';
      sourceChunkCount?: number | undefined;
      reasonCode?: string | undefined;
      promptHash?: string | undefined;
      responseHash?: string | undefined;
      generationResult?: 'gemma' | 'fallback' | undefined;
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

function buildDeterministicPrepPayload(
  pack: EvidencePackDto,
  artifactKind: AiPrepArtifactKind,
  reasonCode: string,
): AiPrepArtifactPayloadDto {
  const sourceRefs = pack.citationRequirements.sourceRefs.slice(0, 50);
  const primarySourceRef = sourceRefs[0];
  if (!primarySourceRef) {
    throw new Error('deterministic ai prep fallback requires source refs');
  }
  const sectionRefs = sourceRefs.slice(0, 20);
  const allowedKinds = aiPrepArtifactAllowedClaimKinds(artifactKind);
  const claimKind = allowedKinds.includes('key_fact') ? 'key_fact' : (allowedKinds[0] ?? 'summary');
  const sourceCount = sourceRefs.length;
  const normalizedReason = normalizeBlockedReason(reasonCode);
  return parseAiPrepArtifactPayload(
    {
      answer: fallbackAnswer(artifactKind, sourceCount),
      sections: [
        {
          section_id: 'prep_fallback',
          heading: '파일 정리 준비',
          text: fallbackSectionText(artifactKind, sourceCount),
          source_refs: sectionRefs,
        },
      ],
      claims: [
        {
          claim_id: 'prep_fallback_1',
          kind: claimKind,
          text: fallbackClaimText(artifactKind, sourceCount),
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

function fallbackAnswer(artifactKind: AiPrepArtifactKind, sourceCount: number): string {
  return `${artifactLabel(artifactKind)} 준비가 완료되었습니다. 권한 통과 source ref ${sourceCount}개를 기준으로 안전한 파일 정리용 fallback을 저장했습니다.`;
}

function fallbackSectionText(artifactKind: AiPrepArtifactKind, sourceCount: number): string {
  return `로컬 Gemma 출력이 저장 기준을 충족하지 않아 원본 모델 응답은 폐기했습니다. ${artifactLabel(artifactKind)}용 source ref ${sourceCount}개만 연결합니다.`;
}

function fallbackClaimText(artifactKind: AiPrepArtifactKind, sourceCount: number): string {
  return `${artifactLabel(artifactKind)} artifact는 권한 통과 source ref ${sourceCount}개와 연결되어 있으며, 법률 쟁점·위험·조항 분석 claim은 저장하지 않았습니다.`;
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

function normalizeBlockedReason(reasonCode: string | undefined): string {
  const normalized = (reasonCode ?? 'AI_PREP_GENERATION_BLOCKED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 80);
  return normalized.length > 0 ? normalized : 'AI_PREP_GENERATION_BLOCKED';
}
