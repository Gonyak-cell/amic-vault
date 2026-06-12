import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SearchQueryDto } from '@amic-vault/shared';
import { AuditService } from '../../audit/audit.service';
import { AiPolicyService } from '../../ai-policy/ai-policy.service';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../../search/permission/search-permission-scope.provider';
import type { SearchSqlValue } from '../../search/query/search-filter.builder';
import { SearchQueryBuilder } from '../../search/query/search-query.builder';
import { deterministicEmbeddingVector, vectorToSqlLiteral } from '../../search/semantic/local-embedding';
import { AiMetadataFilterBuilder } from './metadata-filter.builder';
import { AiQuestionClassifier } from './question-classifier';
import { AiRedactionPreprocessor } from './redaction-preprocessor';
import { AiDeterministicReranker } from './reranker';
import type {
  AiRetrievalCandidate,
  AiRetrievalDeniedReason,
  AiRetrievalRequest,
  AiRetrievalResult,
} from './ai-retrieval.types';

interface AiRetrievalChunkRow {
  document_id: string;
  version_id: string;
  matter_id: string;
  chunk_id: string;
  parent_chunk_id: string | null;
  chunk_ordinal: number;
  token_count: number;
  chunk_text: string;
  text_hash: string;
  source_text_hash: string;
  score: number | string;
}

const defaultMaxChunks = 6;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function filterRefs(input: {
  matterId: string;
  reason: string;
  appliedRules: readonly string[];
}): string {
  const priorityRules = [
    ...new Set([
      ...input.appliedRules.filter((rule) => rule.startsWith('metadata_filter:')),
      ...input.appliedRules.filter((rule) => rule === 'matter.membership:required'),
      ...input.appliedRules.filter((rule) => rule.startsWith('document.permissions:')),
      ...input.appliedRules.filter((rule) => rule.startsWith('ethical_wall:')),
      ...input.appliedRules.filter((rule) => rule.startsWith('permission_scope:')),
      ...input.appliedRules.filter((rule) => rule.startsWith('ai_policy:')),
      ...input.appliedRules.filter((rule) => rule.startsWith('dlp.redaction:')),
      ...input.appliedRules.filter((rule) => rule.startsWith('retrieval.')),
      ...input.appliedRules.filter((rule) => rule.startsWith('question.')),
      ...input.appliedRules,
    ]),
  ];
  const compactRules = priorityRules.map(compactRuleRef);
  const refs = [
    `matter_id:${input.matterId}`,
    `reason:${input.reason}`,
    `scope:${compactRules.join(',')}`,
  ];
  return refs.join('|').slice(0, 256);
}

function compactRuleRef(rule: string): string {
  const aliases: Record<string, string> = {
    'metadata_filter:matter_forced': 'meta_matter',
    'metadata_filter:schema_valid': 'meta_valid',
    'metadata_filter:matter_mismatch': 'meta_mismatch',
    'metadata_filter:invalid_fail_closed': 'meta_invalid',
    'matter.membership:required': 'matter_member',
    'document.permissions:condition_fail_closed': 'doc_condition_closed',
    'document.permissions:explicit_deny': 'doc_explicit_deny',
    'ethical_wall:excluded_filter': 'wall_excluded',
    'ethical_wall:insider_required_filter': 'wall_insider_required',
    'permission_scope:error': 'permission_scope_error',
    'permission_scope:deny': 'permission_scope_deny',
    'ai_policy:blocked_before_retrieval': 'ai_policy_pre_block',
    'ai_policy:blocked_after_retrieval': 'ai_policy_post_block',
    'dlp.redaction:applied_before_context': 'dlp_redacted',
    'dlp.redaction:no_findings': 'dlp_clean',
    'dlp.redaction:failed_closed': 'dlp_failed_closed',
    'retrieval.hybrid:query_stage_scope': 'retrieval_query_scope',
    'question.retrieval:supported': 'question_retrieval',
    'question.graph:unsupported_before_r7': 'question_graph_unsupported',
    'question.rule_findings:unsupported_before_r8': 'question_rule_unsupported',
    'reranker:deterministic': 'reranker_deterministic',
  };
  return aliases[rule] ?? rule.slice(0, 40);
}

@Injectable()
export class AiRetrievalOrchestratorService {
  private readonly logger = new Logger(AiRetrievalOrchestratorService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AiPolicyService) private readonly aiPolicyService: AiPolicyService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(SearchQueryBuilder) private readonly searchQueryBuilder: SearchQueryBuilder,
    @Inject(AiQuestionClassifier) private readonly classifier: AiQuestionClassifier,
    @Inject(AiMetadataFilterBuilder) private readonly metadataFilterBuilder: AiMetadataFilterBuilder,
    @Inject(AiRedactionPreprocessor) private readonly redaction: AiRedactionPreprocessor,
    @Inject(AiDeterministicReranker) private readonly reranker: AiDeterministicReranker,
  ) {}

  async retrieve(input: AiRetrievalRequest): Promise<AiRetrievalResult> {
    const startedAt = performance.now();
    const classification = this.classifier.classify(input.query);
    const metadataDecision = this.metadataFilterBuilder.build({
      matterId: input.matterId,
      filters: input.filters,
    });
    if (metadataDecision.effect !== 'ALLOW') {
      return this.deny(input, metadataDecision.reasonCode, startedAt, [
        ...classification.appliedRules,
        ...metadataDecision.appliedRules,
      ]);
    }

    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(input);
    } catch {
      return this.deny(input, 'permission_denied', startedAt, [
        ...classification.appliedRules,
        ...metadataDecision.appliedRules,
        'permission_scope:error',
      ]);
    }
    if (scopeDecision.effect !== 'ALLOW') {
      return this.deny(input, 'permission_denied', startedAt, [
        ...classification.appliedRules,
        ...metadataDecision.appliedRules,
        'permission_scope:deny',
      ]);
    }

    try {
      await this.aiPolicyService.assertAllowed({
        tenantId: input.tenantId,
        userId: input.userId,
        matterId: input.matterId,
        modelRoute: input.modelRoute ?? 'local_gemma',
        documentIds: [],
        purpose: 'retrieval',
      });
    } catch {
      return this.deny(input, 'ai_policy_blocked', startedAt, [
        ...classification.appliedRules,
        ...metadataDecision.appliedRules,
        ...(scopeDecision.appliedRules ?? []),
        'ai_policy:blocked_before_retrieval',
      ]);
    }

    if (classification.kind !== 'retrieval') {
      const result: AiRetrievalResult = {
        status: 'unsupported',
        questionKind: classification.kind,
        chunks: [],
        omittedChunkIds: [],
        appliedRules: [
          ...classification.appliedRules,
          ...metadataDecision.appliedRules,
          ...(scopeDecision.appliedRules ?? []),
        ],
      };
      await this.auditRetrieval(input, result, startedAt);
      return result;
    }

    try {
      const query: SearchQueryDto = {
        query: input.query,
        mode: 'hybrid',
        filters: metadataDecision.filters,
        page: 1,
        pageSize: Math.min(50, Math.max(1, input.maxChunks ?? defaultMaxChunks)),
      };
      const built = this.searchQueryBuilder.buildVectorChunks(
        query,
        scopeDecision.scope,
        vectorToSqlLiteral(deterministicEmbeddingVector(input.query)),
        'hybrid',
        query.pageSize,
      );
      const candidates = await this.queryCandidates(input.tenantId, built.sql, built.params);
      const redacted = this.redaction.redact(this.reranker.rerank(candidates));
      if (redacted.effect !== 'ALLOW') {
        return this.deny(input, 'dlp_redaction_failed', startedAt, [
          ...classification.appliedRules,
          ...metadataDecision.appliedRules,
          ...(scopeDecision.appliedRules ?? []),
          ...redacted.appliedRules,
        ]);
      }

      try {
        await this.aiPolicyService.assertAllowed({
          tenantId: input.tenantId,
          userId: input.userId,
          matterId: input.matterId,
          modelRoute: input.modelRoute ?? 'local_gemma',
          documentIds: [...new Set(redacted.chunks.map((chunk) => chunk.documentId))],
          purpose: 'retrieval',
        });
      } catch {
        return this.deny(input, 'ai_policy_blocked', startedAt, [
          ...classification.appliedRules,
          ...metadataDecision.appliedRules,
          ...(scopeDecision.appliedRules ?? []),
          'ai_policy:blocked_after_retrieval',
        ]);
      }

      const result: AiRetrievalResult = {
        status: 'ready',
        questionKind: classification.kind,
        chunks: redacted.chunks,
        omittedChunkIds: [],
        appliedRules: [
          ...classification.appliedRules,
          ...metadataDecision.appliedRules,
          ...(scopeDecision.appliedRules ?? []),
          ...redacted.appliedRules,
          'retrieval.hybrid:query_stage_scope',
          'reranker:deterministic',
        ],
      };
      await this.auditRetrieval(input, result, startedAt);
      return result;
    } catch {
      this.logger.warn({ code: 'AI_RETRIEVAL_ERROR', matterId: input.matterId });
      return this.deny(input, 'retrieval_failed', startedAt, [
        ...classification.appliedRules,
        ...metadataDecision.appliedRules,
        ...(scopeDecision.appliedRules ?? []),
        'retrieval:failed_closed',
      ]);
    }
  }

  private async queryCandidates(
    tenantId: string,
    sql: string,
    params: SearchSqlValue[],
  ): Promise<AiRetrievalCandidate[]> {
    return this.auditService.transaction(tenantId, async (client) => {
      const result = await client.query<AiRetrievalChunkRow>(sql, params);
      return result.rows.map((row) => ({
        documentId: row.document_id,
        versionId: row.version_id,
        matterId: row.matter_id,
        chunkId: row.chunk_id,
        parentChunkId: row.parent_chunk_id,
        chunkOrdinal: Number(row.chunk_ordinal),
        tokenCount: Number(row.token_count),
        score: Number(row.score),
        chunkText: row.chunk_text,
        textHash: row.text_hash,
        sourceTextHash: row.source_text_hash,
      }));
    });
  }

  private async deny(
    input: AiRetrievalRequest,
    reasonCode: AiRetrievalDeniedReason,
    startedAt: number,
    appliedRules: readonly string[],
  ): Promise<AiRetrievalResult> {
    const result: AiRetrievalResult = {
      status: 'denied',
      questionKind: this.classifier.classify(input.query).kind,
      reasonCode,
      chunks: [],
      omittedChunkIds: [],
      appliedRules,
    };
    await this.auditRetrieval(input, result, startedAt);
    return result;
  }

  private async auditRetrieval(
    input: AiRetrievalRequest,
    result: AiRetrievalResult,
    startedAt: number,
  ): Promise<void> {
    await this.auditService.log({
      tenantId: input.tenantId,
      actorId: input.userId,
      sessionId: input.sessionId ?? null,
      action: 'SEARCH_EXECUTED',
      targetType: 'ai_retrieval',
      targetId: input.matterId,
      matterId: input.matterId,
      result: result.status === 'ready' || result.status === 'unsupported' ? 'success' : 'denied',
      metadata: {
        scope_type: 'ai_retrieval',
        scope_id: input.matterId,
        query_hash: sha256Hex(input.query),
        query_length: input.query.length,
        filter_refs: filterRefs({
          matterId: input.matterId,
          reason: result.reasonCode ?? result.questionKind,
          appliedRules: result.appliedRules,
        }),
        result_count: result.chunks.length,
        document_count: new Set(result.chunks.map((chunk) => chunk.documentId)).size,
        duration_ms: Math.round(performance.now() - startedAt),
      },
    });
  }
}
