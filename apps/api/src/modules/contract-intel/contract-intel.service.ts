import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  clauseBankEntryListResponseSchema,
  clauseBankEntrySchema,
  clauseSearchResponseSchema,
  contractAiReviewFindingListResponseSchema,
  contractAiReviewFindingSchema,
  contractProcessResponseSchema,
  contractClauseBankResponseSchema,
  contractRuleFindingsResponseSchema,
  counterpartyPatternsResponseSchema,
  negotiationIssueListResponseSchema,
  negotiationIssueSchema,
  negotiationPositionListResponseSchema,
  negotiationPositionSchema,
  playbookRuleResponseSchema,
  type ClauseBankEntryDto,
  type ClauseBankEntryListResponseDto,
  type ClauseBankEntryQueryDto,
  type ClauseSearchRequestDto,
  type ClauseSearchResponseDto,
  type ContractAiReviewFindingDto,
  type ContractAiReviewFindingListResponseDto,
  type ContractAiReviewFindingQueryDto,
  type ContractClauseBankItemDto,
  type ContractClauseBankQueryDto,
  type ContractClauseBankResponseDto,
  type ContractClassificationDto,
  type ContractProcessResponseDto,
  type ContractRuleFindingsQueryDto,
  type ContractRuleFindingsResponseDto,
  type CounterpartyPatternsQueryDto,
  type CounterpartyPatternsResponseDto,
  type CreateClauseBankEntryRequestDto,
  type CreateNegotiationPositionRequestDto,
  type CreatePlaybookRuleRequestDto,
  type NegotiationPositionDto,
  type NegotiationPositionListResponseDto,
  type NegotiationPositionQueryDto,
  type NegotiationIssueDto,
  type NegotiationIssueListResponseDto,
  type NegotiationIssueQueryDto,
  type PermissionContext,
  type PlaybookRuleResponseDto,
  type UpdateNegotiationIssueStatusRequestDto,
  type UpdateNegotiationPositionRequestDto,
  type UpdateClauseBankEntryRequestDto,
  type WordClauseInsertionRequestDto,
  type WordClauseInsertionResponseDto,
  wordClauseInsertionResponseSchema,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { DocumentPermissionService } from '../permission/document-permission.service';
import { PermissionService } from '../permission/permission.service';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../search/permission/search-permission-scope.provider';
import {
  SearchFilterBuilder,
  type SearchSqlFragment,
  type SearchSqlValue,
} from '../search/query/search-filter.builder';
import {
  createDefaultSearchEmbeddingGateway,
  SEARCH_EMBEDDING_GATEWAY,
  searchEmbeddingModelRoute,
  type SearchEmbeddingGateway,
} from '../search/index/search-index.repository';
import {
  embeddingHash,
  vectorToSqlLiteral,
  zeroEmbeddingVector,
} from '../search/semantic/local-embedding';
import { classifyContractText } from './contract-classifier';
import {
  contractParserVersion,
  parseContractText,
  sha256Hex,
  type ParsedClause,
  type ParsedDefinedTerm,
  type ParsedRedlineChange,
} from './contract-parser';
import {
  contractAiReviewQueueName,
} from './contract-ai-review-queue.types';
import { ContractAiReviewQueueService } from './contract-ai-review-queue.service';
import {
  evaluatePlaybookRule,
  type ContractRuleFinding,
  type ContractRuleClauseFact,
  type ContractRuleFacts,
  type ContractRuleRedlineFact,
  type PlaybookRuleForEvaluation,
} from './contract-rule-engine';

interface ContractTargetRow {
  matter_id: string;
  document_id: string;
  version_id: string;
  ai_allowed: boolean;
  body_text: string | null;
  extraction_status: string | null;
}

interface ClauseIdRow {
  clause_id: string;
  start_offset: number;
  end_offset: number;
}

interface ClauseBankRow {
  clause_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_kind: ContractClauseBankItemDto['clauseKind'];
  clause_number: string;
  start_offset: number;
  end_offset: number;
  heading_hash: string;
  text_hash: string;
  defined_term_count: string;
  conflict_count: string;
  redline_change_count: string;
}

interface ClauseBankEntryRow {
  entry_id: string;
  source_clause_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_kind: ContractClauseBankItemDto['clauseKind'];
  clause_number: string;
  heading_hash: string;
  text_hash: string;
  status: ClauseBankEntryDto['status'];
  tags: string[];
  usage_count: string;
  proposed_by: string | null;
  approved_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ClauseSearchRow {
  clause_id: string;
  clause_bank_entry_id: string | null;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_kind: ContractClauseBankItemDto['clauseKind'];
  clause_number: string;
  heading_hash: string;
  text_hash: string;
  tags: string[] | null;
  semantic_score: number | string;
  score: number | string;
}

interface WordClauseInsertionSourceRow {
  clause_id: string;
  clause_bank_entry_id: string | null;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_number: string;
  chunk_text: string;
  text_hash: string;
}

interface ClauseChunkIdRow {
  clause_chunk_id: string | null;
}

interface PlaybookRuleRow {
  rule_id: string;
  rule_key: string;
  rule_type: PlaybookRuleForEvaluation['ruleType'];
  severity: PlaybookRuleForEvaluation['severity'];
  version_number: number;
  matter_id: string | null;
  client_id: string | null;
  expression_hash: string;
  expression_json: Record<string, unknown>;
}

interface NegotiationPositionRow {
  position_id: string;
  matter_id: string;
  party_id: string;
  issue_label: string;
  clause_kind: NegotiationPositionDto['clauseKind'];
  position_summary: string;
  position_summary_hash: string;
  source_document_id: string;
  source_version_id: string;
  source_clause_id: string | null;
  round_no: number;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NegotiationIssueRow {
  issue_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_id: string | null;
  redline_change_id: string;
  change_type: 'added' | 'deleted';
  redline_text_hash: string;
  rule_id: string;
  rule_key: string;
  rule_version: number;
  severity: PlaybookRuleForEvaluation['severity'];
  finding_status: ContractRuleFinding['status'];
  finding_code: string;
  finding_hash: string;
  status: NegotiationIssueDto['status'];
  created_at: Date | string;
  updated_at: Date | string;
}

interface NegotiationIssueCandidate {
  issueKey: string;
  redline: ContractRuleRedlineFact;
  finding: ContractRuleFinding;
}

interface ContractAiReviewFindingRow {
  finding_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_id: string | null;
  ai_session_id: string;
  ai_claim_id: string;
  ai_source: 'local_gemma';
  review_task: ContractAiReviewFindingDto['task'];
  severity: ContractAiReviewFindingDto['severity'];
  finding_code: string;
  finding_hash: string;
  finding_text: string;
  citation_refs: string[];
  status: ContractAiReviewFindingDto['status'];
  accepted_by: string | null;
  accepted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ContractAiReviewFindingBaseRow {
  finding_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  ai_session_id: string;
  finding_hash: string;
  status: ContractAiReviewFindingDto['status'];
}

interface ContractAiReviewClaimRow {
  claim_id: string;
  session_claim_id: string;
  claim_hash: string;
}

interface ContractAiReviewMaterializeClaimInput {
  sessionClaimId: string;
  claimHash: string;
  kind: string;
  citationRefs: readonly string[];
  isLegalConclusion?: boolean;
}

interface ContractAiReviewMaterializeCitationInput {
  citationRef: string;
  documentId: string;
  versionId: string;
}

interface ContractAiReviewMaterializeInput {
  matterId: string;
  documentId: string;
  aiSessionId: string;
  task: ContractAiReviewFindingDto['task'];
  claims: readonly ContractAiReviewMaterializeClaimInput[];
  citations: readonly ContractAiReviewMaterializeCitationInput[];
}

interface CounterpartyPatternRow {
  party_id: string;
  clause_kind: NegotiationPositionDto['clauseKind'];
  request_count: string;
  matter_count: string;
  latest_round_no: number;
  latest_position_id: string;
}

interface PartyIdentityRow {
  matter_id: string;
  related_client_id: string | null;
  party_role: string;
  normalized_name: string;
}

interface RuleTermRow {
  term_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_id: string;
  normalized_term_key: string;
  definition_hash: string;
}

interface RuleRedlineRow {
  redline_change_id: string;
  matter_id: string;
  document_id: string;
  version_id: string;
  clause_id: string | null;
  change_type: 'added' | 'deleted';
  text_hash: string;
}

interface RevisionRedlineRow {
  change_type: 'insert' | 'delete' | 'move_from' | 'move_to';
  before_text: string;
  after_text: string;
  before_text_hash: string;
  after_text_hash: string;
}

const sensitiveExpressionKeys = new Set([
  'body',
  'content',
  'text',
  'snippet',
  'raw',
  'password',
  'token',
]);

@Injectable()
export class ContractIntelService {
  private readonly embeddingGateway: SearchEmbeddingGateway;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentPermissionService)
    private readonly documentPermission: DocumentPermissionService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(SearchFilterBuilder) private readonly filterBuilder: SearchFilterBuilder,
    @Inject(ContractAiReviewQueueService)
    private readonly aiReviewQueue: ContractAiReviewQueueService,
    @Optional()
    @Inject(SEARCH_EMBEDDING_GATEWAY)
    embeddingGateway?: SearchEmbeddingGateway,
  ) {
    this.embeddingGateway = embeddingGateway ?? createDefaultSearchEmbeddingGateway();
  }

  async processDocument(
    ctx: PermissionContext,
    input: { documentId: string; versionId?: string | undefined },
  ): Promise<ContractProcessResponseDto> {
    const decision = await this.documentPermission.canReadDocument(ctx, input.documentId);
    if (decision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const target = await this.findTarget(client, ctx.tenantId, input.documentId, input.versionId);
      if (!target) throw new BadRequestException({ code: 'VALIDATION_FAILED' });

      const bodyText = target.body_text ?? '';
      const classification = classifyContractText({
        documentId: target.document_id,
        versionId: target.version_id,
        matterId: target.matter_id,
        text: bodyText,
      });
      await this.upsertClassification(client, ctx.tenantId, classification);

      const warnings: string[] = [];
      let clauseCount = 0;
      let definedTermCount = 0;
      let redlineChangeCount = 0;
      let parserStatus: ContractProcessResponseDto['parserStatus'] = 'failed';
      if (target.extraction_status !== 'ready' || bodyText.trim().length === 0) {
        warnings.push('contract.parser:canonical_text_not_ready');
      } else {
        const parsed = parseContractText(bodyText);
        parserStatus = parsed.status;
        warnings.push(...parsed.warnings);
        if (parsed.status !== 'failed') {
          await this.markDerivedStale(client, ctx.tenantId, target.version_id);
          const clauseIds = await this.upsertClauses(
            client,
            ctx.tenantId,
            target,
            parsed.clauses,
          );
          clauseCount = parsed.clauses.length;
          await this.upsertClauseChunks(client, ctx.tenantId, target, clauseIds);
          await this.upsertClauseEmbeddings(client, ctx.tenantId, target, clauseIds);
          definedTermCount = await this.upsertDefinedTerms(
            client,
            ctx.tenantId,
            target,
            parsed.definedTerms,
            clauseIds,
          );
          await this.upsertRedlines(
            client,
            ctx.tenantId,
            target,
            parsed.redlineChanges,
            clauseIds,
          );
          const revisionRedlines = await this.revisionRedlineChanges(
            client,
            ctx.tenantId,
            target,
          );
          await this.upsertRedlines(client, ctx.tenantId, target, revisionRedlines, clauseIds);
          redlineChangeCount = await this.currentRedlineCount(
            client,
            ctx.tenantId,
            target.version_id,
          );
        }
      }

      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_CLASSIFIED',
          targetType: 'contract_document',
          targetId: target.document_id,
          matterId: target.matter_id,
          metadata: {
            matter_id: target.matter_id,
            document_id: target.document_id,
            version_id: target.version_id,
            contract_type: classification.contractType,
            classifier_version: classification.classifierVersion,
            confidence: classification.confidence,
          },
        },
        client,
      );
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_CLAUSES_EXTRACTED',
          targetType: 'contract_document',
          targetId: target.document_id,
          matterId: target.matter_id,
          result: parserStatus === 'failed' ? 'failure' : 'success',
          metadata: {
            matter_id: target.matter_id,
            document_id: target.document_id,
            version_id: target.version_id,
            clause_count: clauseCount,
            parser_status: parserStatus,
          },
        },
        client,
      );
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_TERMS_EXTRACTED',
          targetType: 'contract_document',
          targetId: target.document_id,
          matterId: target.matter_id,
          result: parserStatus === 'failed' ? 'failure' : 'success',
          metadata: {
            matter_id: target.matter_id,
            document_id: target.document_id,
            version_id: target.version_id,
            term_count: definedTermCount,
            parser_status: parserStatus,
          },
        },
        client,
      );
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_REDLINE_PARSED',
          targetType: 'contract_document',
          targetId: target.document_id,
          matterId: target.matter_id,
          result: parserStatus === 'partial' || parserStatus === 'failed' ? 'failure' : 'success',
          metadata: {
            matter_id: target.matter_id,
            document_id: target.document_id,
            version_id: target.version_id,
            redline_change_count: redlineChangeCount,
            parser_status: parserStatus,
          },
        },
        client,
      );
      const reviewJobIds =
        target.ai_allowed && parserStatus !== 'failed'
          ? await this.aiReviewQueue.enqueueFirstReview(
              {
                tenantId: ctx.tenantId,
                matterId: target.matter_id,
                documentId: target.document_id,
                versionId: target.version_id,
                userId: ctx.userId,
                authSessionId: ctx.sessionId ?? null,
              },
              client,
            )
          : [];
      if (reviewJobIds.length > 0) {
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'CONTRACT_AI_REVIEW_REQUESTED',
            targetType: 'contract_document',
            targetId: target.document_id,
            matterId: target.matter_id,
            metadata: {
              matter_id: target.matter_id,
              document_id: target.document_id,
              version_id: target.version_id,
              scope_type: 'contract_ai_review',
              queue_name: contractAiReviewQueueName,
              enqueued_job_count: reviewJobIds.length,
            },
          },
          client,
        );
      }

      return contractProcessResponseSchema.parse({
        documentId: target.document_id,
        versionId: target.version_id,
        matterId: target.matter_id,
        classification,
        clauseCount,
        definedTermCount,
        redlineChangeCount,
        parserStatus,
        warnings,
      });
    });
  }

  async createPlaybookRule(
    ctx: PermissionContext,
    input: CreatePlaybookRuleRequestDto,
  ): Promise<PlaybookRuleResponseDto> {
    assertSafeExpression(input.expression);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const expressionHash = sha256Hex(canonicalJson(input.expression));
      const versionNumber = await this.nextRuleVersion(client, ctx.tenantId, input.ruleKey);
      const ruleId = randomUUID();
      const result = await client.query<{
        rule_id: string;
        rule_key: string;
        rule_type: string;
        severity: string;
        status: 'active';
        version_number: number;
        matter_id: string | null;
        client_id: string | null;
        expression_hash: string;
      }>(
        `
          INSERT INTO playbook_rules (
            rule_id, tenant_id, matter_id, client_id, rule_key, rule_type, severity,
            expression_json, expression_hash, version_number, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11)
          RETURNING rule_id, rule_key, rule_type, severity, status, version_number,
            matter_id, client_id, expression_hash
        `,
        [
          ruleId,
          ctx.tenantId,
          input.matterId ?? null,
          input.clientId ?? null,
          input.ruleKey,
          input.ruleType,
          input.severity,
          canonicalJson(input.expression),
          expressionHash,
          versionNumber,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('playbook rule insert returned no row');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'PLAYBOOK_RULE_CHANGED',
          targetType: 'playbook_rule',
          targetId: row.rule_id,
          matterId: row.matter_id,
          metadata: {
            matter_id: row.matter_id,
            client_id: row.client_id,
            playbook_rule_id: row.rule_id,
            rule_key: row.rule_key,
            rule_version: row.version_number,
            hash: row.expression_hash,
          },
        },
        client,
      );
      return playbookRuleResponseSchema.parse({
        ruleId: row.rule_id,
        ruleKey: row.rule_key,
        ruleType: row.rule_type,
        severity: row.severity,
        status: row.status,
        versionNumber: row.version_number,
        matterId: row.matter_id,
        clientId: row.client_id,
        expressionHash: row.expression_hash,
      });
    });
  }

  async createNegotiationPosition(
    ctx: PermissionContext,
    input: CreateNegotiationPositionRequestDto,
  ): Promise<NegotiationPositionDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    await this.assertCanReadContractScope(ctx, input.matterId, input.sourceDocumentId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.assertNegotiationPositionReferences(client, ctx, {
        matterId: input.matterId,
        partyId: input.partyId,
        sourceDocumentId: input.sourceDocumentId,
        sourceVersionId: input.sourceVersionId,
        sourceClauseId: input.sourceClauseId ?? null,
      });
      const positionId = randomUUID();
      const summaryHash = sha256Hex(input.positionSummary);
      const result = await client.query<NegotiationPositionRow>(
        `
          INSERT INTO negotiation_positions (
            position_id, tenant_id, matter_id, party_id, issue_label, clause_kind,
            position_summary, position_summary_hash, source_document_id, source_version_id,
            source_clause_id, round_no, created_by, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
          RETURNING position_id, matter_id, party_id, issue_label, clause_kind,
            position_summary, position_summary_hash, source_document_id, source_version_id,
            source_clause_id, round_no, created_by, created_at, updated_at
        `,
        [
          positionId,
          ctx.tenantId,
          input.matterId,
          input.partyId,
          input.issueLabel,
          input.clauseKind,
          input.positionSummary,
          summaryHash,
          input.sourceDocumentId,
          input.sourceVersionId,
          input.sourceClauseId ?? null,
          input.roundNo,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('negotiation position insert returned no row');
      await this.auditNegotiationPosition(ctx, client, row);
      return negotiationPositionSchema.parse(toNegotiationPositionDto(row));
    });
  }

  async listNegotiationPositions(
    ctx: PermissionContext,
    input: NegotiationPositionQueryDto,
  ): Promise<NegotiationPositionListResponseDto> {
    await this.assertCanReadContractScope(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<NegotiationPositionRow>(
        `
          SELECT position_id, matter_id, party_id, issue_label, clause_kind,
            position_summary, position_summary_hash, source_document_id, source_version_id,
            source_clause_id, round_no, created_by, created_at, updated_at
          FROM negotiation_positions
          WHERE tenant_id = $1
            AND matter_id = $2
            AND ($3::uuid IS NULL OR party_id = $3::uuid)
          ORDER BY round_no DESC, updated_at DESC, position_id
          LIMIT $4
        `,
        [ctx.tenantId, input.matterId, input.partyId ?? null, input.limit],
      );
      return negotiationPositionListResponseSchema.parse({
        positions: result.rows.map(toNegotiationPositionDto),
      });
    });
  }

  async updateNegotiationPosition(
    ctx: PermissionContext,
    positionId: string,
    input: UpdateNegotiationPositionRequestDto,
  ): Promise<NegotiationPositionDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const before = await this.findNegotiationPosition(client, ctx.tenantId, positionId);
      if (!before) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      await this.assertCanEditMatter(ctx, before.matter_id);
      const next = {
        matterId: before.matter_id,
        partyId: before.party_id,
        sourceDocumentId: input.sourceDocumentId ?? before.source_document_id,
        sourceVersionId: input.sourceVersionId ?? before.source_version_id,
        sourceClauseId: input.sourceClauseId === undefined ? before.source_clause_id : input.sourceClauseId,
      };
      await this.assertNegotiationPositionReferences(client, ctx, next);
      const nextSummary = input.positionSummary ?? before.position_summary;
      const result = await client.query<NegotiationPositionRow>(
        `
          UPDATE negotiation_positions
          SET issue_label = COALESCE($3, issue_label),
            clause_kind = COALESCE($4, clause_kind),
            position_summary = COALESCE($5, position_summary),
            position_summary_hash = $6,
            source_document_id = $7,
            source_version_id = $8,
            source_clause_id = $9,
            round_no = COALESCE($10, round_no),
            updated_at = now()
          WHERE tenant_id = $1
            AND position_id = $2
          RETURNING position_id, matter_id, party_id, issue_label, clause_kind,
            position_summary, position_summary_hash, source_document_id, source_version_id,
            source_clause_id, round_no, created_by, created_at, updated_at
        `,
        [
          ctx.tenantId,
          positionId,
          input.issueLabel ?? null,
          input.clauseKind ?? null,
          input.positionSummary ?? null,
          sha256Hex(nextSummary),
          next.sourceDocumentId,
          next.sourceVersionId,
          next.sourceClauseId,
          input.roundNo ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('negotiation position update returned no row');
      await this.auditNegotiationPosition(ctx, client, row);
      return negotiationPositionSchema.parse(toNegotiationPositionDto(row));
    });
  }

  async listNegotiationIssues(
    ctx: PermissionContext,
    input: NegotiationIssueQueryDto,
  ): Promise<NegotiationIssueListResponseDto> {
    await this.assertCanReadContractScope(ctx, input.matterId, input.documentId);
    const scopeDecision = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const facts = await this.queryRuleFacts(client, ctx.tenantId, scopeDecision.scope, {
        matterId: input.matterId,
        documentId: input.documentId,
        limit: 50,
      });
      const rules = await this.queryActivePlaybookRules(client, ctx.tenantId, input.matterId);
      const findings = rules
        .map((rule) => evaluatePlaybookRule(rule, facts))
        .filter((finding) => finding.status !== 'unsupported');
      const candidates = materializeNegotiationIssueCandidates(
        facts.redlineChanges,
        findings,
        input.limit,
      );
      for (const candidate of candidates) {
        await client.query(
          `
            INSERT INTO contract_negotiation_issues (
              tenant_id, matter_id, document_id, version_id, clause_id,
              redline_change_id, rule_id, rule_key, rule_version, severity,
              finding_status, finding_code, finding_hash, issue_key, status
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, 'open'
            )
            ON CONFLICT (tenant_id, issue_key) DO NOTHING
          `,
          [
            ctx.tenantId,
            candidate.redline.matterId,
            candidate.redline.documentId,
            candidate.redline.versionId,
            candidate.redline.clauseId,
            candidate.redline.redlineChangeId,
            candidate.finding.ruleId,
            candidate.finding.ruleKey,
            candidate.finding.ruleVersion,
            candidate.finding.severity,
            candidate.finding.status,
            candidate.finding.findingCode,
            candidate.finding.findingHash,
            candidate.issueKey,
          ],
        );
      }
      if (candidates.length === 0) {
        return negotiationIssueListResponseSchema.parse({
          matterId: input.matterId,
          documentId: input.documentId ?? null,
          issues: [],
        });
      }
      const rows = await client.query<NegotiationIssueRow>(
        `
          SELECT
            ni.issue_id, ni.matter_id, ni.document_id, ni.version_id, ni.clause_id,
            ni.redline_change_id, rc.change_type, rc.text_hash AS redline_text_hash,
            ni.rule_id, ni.rule_key, ni.rule_version, ni.severity,
            ni.finding_status, ni.finding_code, ni.finding_hash, ni.status,
            ni.created_at, ni.updated_at
          FROM contract_negotiation_issues ni
          JOIN contract_redline_changes rc
            ON rc.tenant_id = ni.tenant_id
            AND rc.redline_change_id = ni.redline_change_id
          WHERE ni.tenant_id = $1
            AND ni.issue_key = ANY($2::text[])
            AND ($3::text IS NULL OR ni.status = $3)
          ORDER BY ni.updated_at DESC, ni.issue_id
          LIMIT $4
        `,
        [
          ctx.tenantId,
          candidates.map((candidate) => candidate.issueKey),
          input.status ?? null,
          input.limit,
        ],
      );
      return negotiationIssueListResponseSchema.parse({
        matterId: input.matterId,
        documentId: input.documentId ?? null,
        issues: rows.rows.map(toNegotiationIssueDto),
      });
    });
  }

  async updateNegotiationIssueStatus(
    ctx: PermissionContext,
    issueId: string,
    input: UpdateNegotiationIssueStatusRequestDto,
  ): Promise<NegotiationIssueDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const before = await this.findNegotiationIssue(client, ctx.tenantId, issueId, true);
      if (!before) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      await this.assertCanEditMatter(ctx, before.matter_id);
      await this.assertCanReadContractScope(ctx, before.matter_id, before.document_id);
      const result = await client.query<NegotiationIssueRow>(
        `
          UPDATE contract_negotiation_issues ni
          SET status = $3,
            status_changed_by = CASE WHEN $3 = 'open' THEN NULL ELSE $4::uuid END,
            status_changed_at = CASE WHEN $3 = 'open' THEN NULL ELSE now() END,
            updated_at = now()
          FROM contract_redline_changes rc
          WHERE ni.tenant_id = $1
            AND ni.issue_id = $2
            AND rc.tenant_id = ni.tenant_id
            AND rc.redline_change_id = ni.redline_change_id
          RETURNING
            ni.issue_id, ni.matter_id, ni.document_id, ni.version_id, ni.clause_id,
            ni.redline_change_id, rc.change_type, rc.text_hash AS redline_text_hash,
            ni.rule_id, ni.rule_key, ni.rule_version, ni.severity,
            ni.finding_status, ni.finding_code, ni.finding_hash, ni.status,
            ni.created_at, ni.updated_at
        `,
        [ctx.tenantId, issueId, input.status, ctx.userId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('negotiation issue update returned no row');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_NEGOTIATION_ISSUE_CHANGED',
          targetType: 'document',
          targetId: row.document_id,
          matterId: row.matter_id,
          metadata: {
            issue_id: row.issue_id,
            matter_id: row.matter_id,
            document_id: row.document_id,
            version_id: row.version_id,
            clause_id: row.clause_id,
            redline_change_id: row.redline_change_id,
            rule_id: row.rule_id,
            finding_hash: row.finding_hash,
            status_before: before.status,
            status_after: row.status,
          },
        },
        client,
      );
      return negotiationIssueSchema.parse(toNegotiationIssueDto(row));
    });
  }

  async listContractAiReviewFindings(
    ctx: PermissionContext,
    input: ContractAiReviewFindingQueryDto,
  ): Promise<ContractAiReviewFindingListResponseDto> {
    await this.assertCanReadContractScope(ctx, input.matterId, input.documentId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const rows = await this.queryContractAiReviewFindings(client, ctx.tenantId, input);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'AI_PAYLOAD_VIEWED',
          targetType: 'contract_ai_review_finding',
          targetId: input.documentId ?? input.matterId,
          matterId: input.matterId,
          metadata: {
            matter_id: input.matterId,
            document_id: input.documentId ?? null,
            scope_type: 'contract_ai_review',
            query_hash: sha256Hex(`${input.matterId}:${input.documentId ?? ''}:ai_review`),
            result_count: rows.length,
          },
        },
        client,
      );
      return contractAiReviewFindingListResponseSchema.parse({
        matterId: input.matterId,
        documentId: input.documentId ?? null,
        findings: rows.map(toContractAiReviewFindingDto),
      });
    });
  }

  async acceptContractAiReviewFinding(
    ctx: PermissionContext,
    findingId: string,
  ): Promise<ContractAiReviewFindingDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const before = await this.findContractAiReviewFindingBase(
        client,
        ctx.tenantId,
        findingId,
        true,
      );
      if (!before) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      await this.assertCanEditMatter(ctx, before.matter_id);
      await this.assertCanReadContractScope(ctx, before.matter_id, before.document_id);

      await client.query(
        `
          UPDATE contract_ai_review_findings
          SET status = 'accepted',
            accepted_by = COALESCE(accepted_by, $3::uuid),
            accepted_at = COALESCE(accepted_at, now()),
            updated_at = now()
          WHERE tenant_id = $1
            AND finding_id = $2
        `,
        [ctx.tenantId, findingId, ctx.userId],
      );
      const row = await this.findContractAiReviewFinding(client, ctx.tenantId, findingId);
      if (!row) throw new Error('contract AI review finding update returned no row');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_AI_REVIEW_ACCEPTED',
          targetType: 'contract_ai_review_finding',
          targetId: findingId,
          matterId: row.matter_id,
          metadata: {
            work_item_ref: findingId,
            matter_id: row.matter_id,
            document_id: row.document_id,
            version_id: row.version_id,
            ai_session_id: row.ai_session_id,
            finding_hash: row.finding_hash,
            status_before: before.status,
            status_after: row.status,
          },
        },
        client,
      );
      return contractAiReviewFindingSchema.parse(toContractAiReviewFindingDto(row));
    });
  }

  async materializeContractAiReviewFindings(
    ctx: PermissionContext,
    input: ContractAiReviewMaterializeInput,
  ): Promise<void> {
    await this.assertCanReadContractScope(ctx, input.matterId, input.documentId);
    if (input.claims.length === 0) throw new BadRequestException({ code: 'VALIDATION_FAILED' });

    const citationsByRef = new Map(
      input.citations.map((citation) => [citation.citationRef, citation]),
    );
    const candidates = input.claims.map((claim) => {
      const citation = claim.citationRefs
        .map((ref) => citationsByRef.get(ref))
        .find((candidate) => candidate?.documentId === input.documentId);
      if (!citation) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      return { claim, versionId: citation.versionId };
    });

    await this.auditService.transaction(ctx.tenantId, async (client) => {
      const claimRows = await client.query<ContractAiReviewClaimRow>(
        `
          SELECT claim_id, session_claim_id, claim_hash
          FROM ai_claims
          WHERE tenant_id = $1
            AND ai_session_id = $2
            AND session_claim_id = ANY($3::text[])
        `,
        [
          ctx.tenantId,
          input.aiSessionId,
          candidates.map((candidate) => candidate.claim.sessionClaimId),
        ],
      );
      const claimsBySessionId = new Map(
        claimRows.rows.map((row) => [row.session_claim_id, row]),
      );

      for (const candidate of candidates) {
        const claimRow = claimsBySessionId.get(candidate.claim.sessionClaimId);
        if (!claimRow || claimRow.claim_hash !== candidate.claim.claimHash) {
          throw new BadRequestException({ code: 'VALIDATION_FAILED' });
        }
        await client.query(
          `
            INSERT INTO contract_ai_review_findings (
              tenant_id, matter_id, document_id, version_id, clause_id,
              ai_session_id, ai_claim_id, ai_source, review_task, severity,
              finding_code, finding_hash, status
            )
            VALUES ($1, $2, $3, $4, NULL, $5, $6, 'local_gemma', $7, $8, $9, $10, 'pending')
            ON CONFLICT (tenant_id, document_id, version_id, ai_claim_id, review_task)
            DO UPDATE SET
              severity = EXCLUDED.severity,
              finding_code = EXCLUDED.finding_code,
              finding_hash = EXCLUDED.finding_hash,
              updated_at = now()
            WHERE contract_ai_review_findings.status = 'pending'
          `,
          [
            ctx.tenantId,
            input.matterId,
            input.documentId,
            candidate.versionId,
            input.aiSessionId,
            claimRow.claim_id,
            input.task,
            contractAiReviewSeverity(candidate.claim, input.task),
            contractAiReviewFindingCode(candidate.claim, input.task),
            candidate.claim.claimHash,
          ],
        );
      }
    });
  }

  async getCounterpartyPatterns(
    ctx: PermissionContext,
    input: CounterpartyPatternsQueryDto,
  ): Promise<CounterpartyPatternsResponseDto> {
    const party = await this.findPartyIdentity(ctx, input.partyId);
    if (!party) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    await this.assertCanReadContractScope(ctx, party.matter_id);
    const scopeDecision = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const filters = this.filterBuilder.build({ scope: scopeDecision.scope });
      const params: SearchSqlValue[] = [...filters.params];
      const tenantSql = `$${params.push(ctx.tenantId)}`;
      const partyIdSql = `$${params.push(input.partyId)}`;
      const relatedClientSql = `$${params.push(party.related_client_id ?? '')}`;
      const partyRoleSql = `$${params.push(party.party_role)}`;
      const normalizedNameSql = `$${params.push(party.normalized_name)}`;
      const limitSql = `$${params.push(input.limit)}`;
      const result = await client.query<CounterpartyPatternRow>(
        `
          WITH idx AS (
            SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
              d.document_type, d.status AS document_status, dv.version_status, d.updated_at
            FROM documents d
            JOIN matters m
              ON m.tenant_id = d.tenant_id
              AND m.matter_id = d.matter_id
            JOIN document_versions dv
              ON dv.tenant_id = d.tenant_id
              AND dv.document_id = d.document_id
              AND dv.version_status = 'current'
          )
          SELECT
            ${partyIdSql}::uuid AS party_id,
            np.clause_kind,
            count(*)::text AS request_count,
            count(DISTINCT np.matter_id)::text AS matter_count,
            max(np.round_no) AS latest_round_no,
            (
              array_agg(np.position_id ORDER BY np.round_no DESC, np.updated_at DESC, np.position_id DESC)
            )[1] AS latest_position_id
          FROM negotiation_positions np
          JOIN parties p
            ON p.tenant_id = np.tenant_id
            AND p.party_id = np.party_id
          JOIN idx
            ON idx.tenant_id = np.tenant_id
            AND idx.document_id = np.source_document_id
            AND idx.version_id = np.source_version_id
          ${filters.whereSql}
            AND np.tenant_id = ${tenantSql}
            AND (
              (
                NULLIF(${relatedClientSql}, '')::uuid IS NOT NULL
                AND p.related_client_id = NULLIF(${relatedClientSql}, '')::uuid
              )
              OR (
                NULLIF(${relatedClientSql}, '')::uuid IS NULL
                AND p.party_role = ${partyRoleSql}
                AND lower(regexp_replace(btrim(p.name), '\\s+', ' ', 'g')) = ${normalizedNameSql}
              )
            )
          GROUP BY np.clause_kind
          ORDER BY count(*) DESC, np.clause_kind
          LIMIT ${limitSql}
        `,
        params,
      );
      return counterpartyPatternsResponseSchema.parse({
        partyId: input.partyId,
        patterns: result.rows.map((row) => ({
          partyId: row.party_id,
          clauseKind: row.clause_kind,
          requestCount: Number(row.request_count),
          matterCount: Number(row.matter_count),
          latestRoundNo: Number(row.latest_round_no),
          latestPositionId: row.latest_position_id,
        })),
      });
    });
  }

  async listClauseBank(
    ctx: PermissionContext,
    input: ContractClauseBankQueryDto,
  ): Promise<ContractClauseBankResponseDto> {
    await this.assertCanReadContractScope(ctx, input.matterId, input.documentId);
    const scopeDecision = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const clauses = await this.queryClauseBank(client, scopeDecision.scope, input);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_CLAUSE_BANK_VIEWED',
          targetType: 'contract_clause_bank',
          targetId: input.documentId ?? input.matterId,
          matterId: input.matterId,
          metadata: {
            matter_id: input.matterId,
            document_id: input.documentId ?? null,
            query_hash: sha256Hex(`${input.matterId}:${input.documentId ?? ''}:clause_bank`),
            result_count: clauses.length,
            clause_count: clauses.length,
            filter_refs: compactRules(scopeDecision.appliedRules ?? []),
          },
        },
        client,
      );
      return contractClauseBankResponseSchema.parse({
        matterId: input.matterId,
        documentId: input.documentId ?? null,
        clauses,
      });
    });
  }

  async createClauseBankEntry(
    ctx: PermissionContext,
    input: CreateClauseBankEntryRequestDto,
  ): Promise<ClauseBankEntryDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const source = await this.findClauseBankSource(client, ctx.tenantId, input.clauseId);
      if (!source) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      await this.assertCanReadContractScope(ctx, source.matter_id, source.document_id);

      const result = await client.query<ClauseBankEntryRow>(
        `
          INSERT INTO clause_bank_entries (
            tenant_id, source_clause_id, matter_id, document_id, version_id,
            clause_kind, clause_number, heading_hash, text_hash, status, tags,
            proposed_by, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10::text[], $11, now()
          )
          ON CONFLICT (tenant_id, source_clause_id)
          DO UPDATE SET
            tags = CASE
              WHEN clause_bank_entries.status = 'draft' THEN EXCLUDED.tags
              ELSE clause_bank_entries.tags
            END,
            updated_at = CASE
              WHEN clause_bank_entries.status = 'draft' THEN EXCLUDED.updated_at
              ELSE clause_bank_entries.updated_at
            END
          RETURNING entry_id, source_clause_id, matter_id, document_id, version_id,
            clause_kind, clause_number, heading_hash, text_hash, status, tags,
            usage_count::text, proposed_by, approved_by, created_at, updated_at
        `,
        [
          ctx.tenantId,
          source.source_clause_id,
          source.matter_id,
          source.document_id,
          source.version_id,
          source.clause_kind,
          source.clause_number,
          source.heading_hash,
          source.text_hash,
          input.tags,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('clause bank entry insert returned no row');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CLAUSE_BANK_CHANGED',
          targetType: 'clause_bank_entry',
          targetId: row.entry_id,
          matterId: row.matter_id,
          metadata: {
            matter_id: row.matter_id,
            document_id: row.document_id,
            version_id: row.version_id,
            work_item_ref: row.entry_id,
            status_after: row.status,
            item_count: row.tags.length,
            hash: row.text_hash,
          },
        },
        client,
      );
      return this.toClauseBankEntryDto(ctx, row, true);
    });
  }

  async listClauseBankEntries(
    ctx: PermissionContext,
    input: ClauseBankEntryQueryDto,
  ): Promise<ClauseBankEntryListResponseDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const rows = await this.queryClauseBankEntries(client, ctx.tenantId, input);
      const entries: ClauseBankEntryDto[] = [];
      for (const row of rows) {
        entries.push(await this.toClauseBankEntryDto(ctx, row));
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_CLAUSE_BANK_VIEWED',
          targetType: 'contract_clause_bank',
          targetId: ctx.tenantId,
          matterId: null,
          metadata: {
            graph_scope: 'firm_clause_bank',
            result_count: entries.length,
            status: input.status ?? null,
            tag: input.tag ?? null,
            clause_kind: input.clauseKind ?? null,
          },
        },
        client,
      );
      return clauseBankEntryListResponseSchema.parse({ entries });
    });
  }

  async searchClauses(
    ctx: PermissionContext,
    input: ClauseSearchRequestDto,
  ): Promise<ClauseSearchResponseDto> {
    const queryHash = sha256Hex(input.query);
    const scopeDecision = await this.authorizedScope(ctx);
    const vector = await this.queryEmbeddingVectorLiteral(input.query);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const rows = vector
        ? await this.querySimilarClauses(
            client,
            ctx.tenantId,
            scopeDecision.scope,
            vector,
            input.limit,
          )
        : [];
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_CLAUSE_BANK_VIEWED',
          targetType: 'contract_clause_search',
          targetId: ctx.tenantId,
          matterId: null,
          metadata: {
            graph_scope: 'firm_clause_search',
            query_hash: queryHash,
            result_count: rows.length,
            model_route: searchEmbeddingModelRoute,
            filter_refs: compactRules(scopeDecision.appliedRules ?? []),
          },
        },
        client,
      );
      return clauseSearchResponseSchema.parse({
        queryHash,
        modelRoute: searchEmbeddingModelRoute,
        results: rows.map((row) => ({
          clauseId: row.clause_id,
          clauseBankEntryId: row.clause_bank_entry_id,
          matterId: row.matter_id,
          documentId: row.document_id,
          versionId: row.version_id,
          clauseKind: row.clause_kind,
          clauseNumber: row.clause_number,
          headingHash: row.heading_hash,
          textHash: row.text_hash,
          tags: row.tags ?? [],
          approved: row.clause_bank_entry_id !== null,
          score: Number(row.score),
          semanticScore: Number(row.semantic_score),
          citationRef: `clause:${row.clause_id}`,
        })),
      });
    });
  }

  async prepareWordClauseInsertion(
    ctx: PermissionContext,
    input: WordClauseInsertionRequestDto,
  ): Promise<WordClauseInsertionResponseDto> {
    const scopeDecision = await this.authorizedScope(ctx);
    const response = await this.auditService.transaction(ctx.tenantId, async (client) => {
      const row = await this.findWordClauseInsertionSource(
        client,
        scopeDecision.scope,
        input.clauseId,
        input.clauseBankEntryId ?? null,
      );
      if (!row) {
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'CONTRACT_CLAUSE_BANK_VIEWED',
            targetType: 'word_clause_insertion',
            targetId: null,
            matterId: null,
            result: 'denied',
            metadata: {
              graph_scope: 'word_clause_insertion',
              client_request_hash: sha256Hex(canonicalJson(input)),
              result_count: 0,
              filter_refs: compactRules(scopeDecision.appliedRules ?? []),
            },
          },
          client,
        );
        return null;
      }

      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_CLAUSE_BANK_VIEWED',
          targetType: 'word_clause_insertion',
          targetId: row.clause_bank_entry_id ?? row.clause_id,
          matterId: row.matter_id,
          metadata: {
            graph_scope: 'word_clause_insertion',
            matter_id: row.matter_id,
            document_id: row.document_id,
            version_id: row.version_id,
            work_item_ref: row.clause_bank_entry_id ?? row.clause_id,
            client_request_hash: sha256Hex(canonicalJson(input)),
            hash: row.text_hash,
            item_count: 1,
            filter_refs: compactRules(scopeDecision.appliedRules ?? []),
          },
        },
        client,
      );

      return wordClauseInsertionResponseSchema.parse({
        status: 'ready',
        clauseId: row.clause_id,
        clauseBankEntryId: row.clause_bank_entry_id,
        insertionFormat: input.insertionFormat,
        citationRef: `clause:${row.clause_id}`,
        textHash: row.text_hash,
        insertText: row.chunk_text.trim(),
      });
    });
    if (!response) throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    return response;
  }

  async updateClauseBankEntry(
    ctx: PermissionContext,
    entryId: string,
    input: UpdateClauseBankEntryRequestDto,
  ): Promise<ClauseBankEntryDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.assertClauseBankReviewer(client, ctx.tenantId, ctx.userId);
      const before = await this.findClauseBankEntry(client, ctx.tenantId, entryId);
      if (!before) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      const result = await client.query<ClauseBankEntryRow>(
        `
          UPDATE clause_bank_entries
          SET status = $3,
            tags = COALESCE($4::text[], tags),
            approved_by = CASE WHEN $3 = 'approved' THEN $5 ELSE approved_by END,
            updated_at = now()
          WHERE tenant_id = $1
            AND entry_id = $2
          RETURNING entry_id, source_clause_id, matter_id, document_id, version_id,
            clause_kind, clause_number, heading_hash, text_hash, status, tags,
            usage_count::text, proposed_by, approved_by, created_at, updated_at
        `,
        [ctx.tenantId, entryId, input.status, input.tags ?? null, ctx.userId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('clause bank entry update returned no row');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CLAUSE_BANK_CHANGED',
          targetType: 'clause_bank_entry',
          targetId: row.entry_id,
          matterId: row.matter_id,
          metadata: {
            matter_id: row.matter_id,
            document_id: row.document_id,
            version_id: row.version_id,
            work_item_ref: row.entry_id,
            status_before: before.status,
            status_after: row.status,
            item_count: row.tags.length,
            hash: row.text_hash,
          },
        },
        client,
      );
      return this.toClauseBankEntryDto(ctx, row, true);
    });
  }

  async evaluateRuleFindings(
    ctx: PermissionContext,
    input: ContractRuleFindingsQueryDto,
  ): Promise<ContractRuleFindingsResponseDto> {
    await this.assertCanReadContractScope(ctx, input.matterId, input.documentId);
    const scopeDecision = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const facts = await this.queryRuleFacts(client, ctx.tenantId, scopeDecision.scope, input);
      const rules = await this.queryActivePlaybookRules(client, ctx.tenantId, input.matterId);
      const allFindings = rules
        .map((rule) => evaluatePlaybookRule(rule, facts))
        .sort((a, b) =>
          `${a.ruleKey}:${a.findingHash}`.localeCompare(`${b.ruleKey}:${b.findingHash}`),
        );
      const findings = allFindings.slice(0, input.limit);
      const unsupportedRuleCount = allFindings.filter(
        (finding) => finding.status === 'unsupported',
      ).length;
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'CONTRACT_RULE_EVALUATED',
          targetType: 'contract_rule_eval',
          targetId: input.documentId ?? input.matterId,
          matterId: input.matterId,
          metadata: {
            matter_id: input.matterId,
            document_id: input.documentId ?? null,
            query_hash: sha256Hex(`${input.matterId}:${input.documentId ?? ''}:rule_eval`),
            result_count: findings.length,
            rule_finding_count: findings.length,
            unsupported_rule_count: unsupportedRuleCount,
            filter_refs: compactRules(scopeDecision.appliedRules ?? []),
          },
        },
        client,
      );
      return contractRuleFindingsResponseSchema.parse({
        matterId: input.matterId,
        documentId: input.documentId ?? null,
        findings,
        unsupportedRuleCount,
      });
    });
  }

  private async assertCanReadContractScope(
    ctx: PermissionContext,
    matterId: string,
    documentId?: string | undefined,
  ): Promise<void> {
    const matterDecision = await this.permissionService.canReadMatter(ctx, matterId);
    if (matterDecision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    if (!documentId) return;
    const documentDecision = await this.documentPermission.canReadDocument(ctx, documentId);
    if (documentDecision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async assertCanEditMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    let decision: Awaited<ReturnType<PermissionService['canEditMatter']>> | undefined;
    try {
      decision = await this.permissionService.canEditMatter(ctx, matterId);
    } catch {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    if (decision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async assertNegotiationPositionReferences(
    client: PoolClient,
    ctx: PermissionContext,
    input: {
      matterId: string;
      partyId: string;
      sourceDocumentId: string;
      sourceVersionId: string;
      sourceClauseId: string | null;
    },
  ): Promise<void> {
    const party = await client.query<{ matter_id: string }>(
      `
        SELECT matter_id
        FROM parties
        WHERE tenant_id = $1
          AND party_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, input.partyId],
    );
    if (party.rows[0]?.matter_id !== input.matterId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }

    const source = await client.query<{
      matter_id: string;
      clause_id: string | null;
    }>(
      `
        SELECT d.matter_id, cc.clause_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_id = $3
        LEFT JOIN contract_clauses cc
          ON cc.tenant_id = d.tenant_id
          AND cc.document_id = d.document_id
          AND cc.version_id = dv.version_id
          AND cc.clause_id = $4::uuid
          AND cc.stale = false
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
        LIMIT 1
      `,
      [
        ctx.tenantId,
        input.sourceDocumentId,
        input.sourceVersionId,
        input.sourceClauseId,
      ],
    );
    const sourceRow = source.rows[0];
    if (!sourceRow || sourceRow.matter_id !== input.matterId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }
    if (input.sourceClauseId && sourceRow.clause_id !== input.sourceClauseId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }
  }

  private async findNegotiationPosition(
    client: PoolClient,
    tenantId: string,
    positionId: string,
  ): Promise<NegotiationPositionRow | null> {
    const result = await client.query<NegotiationPositionRow>(
      `
        SELECT position_id, matter_id, party_id, issue_label, clause_kind,
          position_summary, position_summary_hash, source_document_id, source_version_id,
          source_clause_id, round_no, created_by, created_at, updated_at
        FROM negotiation_positions
        WHERE tenant_id = $1
          AND position_id = $2
        LIMIT 1
      `,
      [tenantId, positionId],
    );
    return result.rows[0] ?? null;
  }

  private async findNegotiationIssue(
    client: PoolClient,
    tenantId: string,
    issueId: string,
    lock: boolean,
  ): Promise<NegotiationIssueRow | null> {
    const result = await client.query<NegotiationIssueRow>(
      `
        SELECT
          ni.issue_id, ni.matter_id, ni.document_id, ni.version_id, ni.clause_id,
          ni.redline_change_id, rc.change_type, rc.text_hash AS redline_text_hash,
          ni.rule_id, ni.rule_key, ni.rule_version, ni.severity,
          ni.finding_status, ni.finding_code, ni.finding_hash, ni.status,
          ni.created_at, ni.updated_at
        FROM contract_negotiation_issues ni
        JOIN contract_redline_changes rc
          ON rc.tenant_id = ni.tenant_id
          AND rc.redline_change_id = ni.redline_change_id
        WHERE ni.tenant_id = $1
          AND ni.issue_id = $2
        LIMIT 1
        ${lock ? 'FOR UPDATE OF ni' : ''}
      `,
      [tenantId, issueId],
    );
    return result.rows[0] ?? null;
  }

  private async queryContractAiReviewFindings(
    client: PoolClient,
    tenantId: string,
    input: ContractAiReviewFindingQueryDto,
  ): Promise<ContractAiReviewFindingRow[]> {
    const result = await client.query<ContractAiReviewFindingRow>(
      `
        SELECT
          finding.finding_id, finding.matter_id, finding.document_id, finding.version_id,
          finding.clause_id, finding.ai_session_id, finding.ai_claim_id, finding.ai_source,
          finding.review_task, finding.severity, finding.finding_code, finding.finding_hash,
          claim.claim_text AS finding_text,
          array_agg(citation.source_ref ORDER BY citation.source_ref) AS citation_refs,
          finding.status, finding.accepted_by, finding.accepted_at,
          finding.created_at, finding.updated_at
        FROM contract_ai_review_findings finding
        JOIN ai_claims claim
          ON claim.tenant_id = finding.tenant_id
          AND claim.claim_id = finding.ai_claim_id
        JOIN ai_claim_citations citation
          ON citation.tenant_id = finding.tenant_id
          AND citation.claim_id = finding.ai_claim_id
        WHERE finding.tenant_id = $1
          AND finding.matter_id = $2
          AND ($3::uuid IS NULL OR finding.document_id = $3::uuid)
          AND ($4::text IS NULL OR finding.review_task = $4)
          AND ($5::text IS NULL OR finding.status = $5)
        GROUP BY finding.finding_id, finding.matter_id, finding.document_id, finding.version_id,
          finding.clause_id, finding.ai_session_id, finding.ai_claim_id, finding.ai_source,
          finding.review_task, finding.severity, finding.finding_code, finding.finding_hash,
          claim.claim_text, finding.status, finding.accepted_by, finding.accepted_at,
          finding.created_at, finding.updated_at
        ORDER BY
          CASE finding.status WHEN 'pending' THEN 0 ELSE 1 END,
          CASE finding.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          finding.created_at DESC,
          finding.finding_id
        LIMIT $6
      `,
      [
        tenantId,
        input.matterId,
        input.documentId ?? null,
        input.task ?? null,
        input.status ?? null,
        input.limit,
      ],
    );
    return result.rows;
  }

  private async findContractAiReviewFinding(
    client: PoolClient,
    tenantId: string,
    findingId: string,
  ): Promise<ContractAiReviewFindingRow | null> {
    const result = await client.query<ContractAiReviewFindingRow>(
      `
        SELECT
          finding.finding_id, finding.matter_id, finding.document_id, finding.version_id,
          finding.clause_id, finding.ai_session_id, finding.ai_claim_id, finding.ai_source,
          finding.review_task, finding.severity, finding.finding_code, finding.finding_hash,
          claim.claim_text AS finding_text,
          array_agg(citation.source_ref ORDER BY citation.source_ref) AS citation_refs,
          finding.status, finding.accepted_by, finding.accepted_at,
          finding.created_at, finding.updated_at
        FROM contract_ai_review_findings finding
        JOIN ai_claims claim
          ON claim.tenant_id = finding.tenant_id
          AND claim.claim_id = finding.ai_claim_id
        JOIN ai_claim_citations citation
          ON citation.tenant_id = finding.tenant_id
          AND citation.claim_id = finding.ai_claim_id
        WHERE finding.tenant_id = $1
          AND finding.finding_id = $2
        GROUP BY finding.finding_id, finding.matter_id, finding.document_id, finding.version_id,
          finding.clause_id, finding.ai_session_id, finding.ai_claim_id, finding.ai_source,
          finding.review_task, finding.severity, finding.finding_code, finding.finding_hash,
          claim.claim_text, finding.status, finding.accepted_by, finding.accepted_at,
          finding.created_at, finding.updated_at
        LIMIT 1
      `,
      [tenantId, findingId],
    );
    return result.rows[0] ?? null;
  }

  private async findContractAiReviewFindingBase(
    client: PoolClient,
    tenantId: string,
    findingId: string,
    lock: boolean,
  ): Promise<ContractAiReviewFindingBaseRow | null> {
    const result = await client.query<ContractAiReviewFindingBaseRow>(
      `
        SELECT finding_id, matter_id, document_id, version_id, ai_session_id, finding_hash, status
        FROM contract_ai_review_findings
        WHERE tenant_id = $1
          AND finding_id = $2
        LIMIT 1
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [tenantId, findingId],
    );
    return result.rows[0] ?? null;
  }

  private async findPartyIdentity(
    ctx: PermissionContext,
    partyId: string,
  ): Promise<PartyIdentityRow | null> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<PartyIdentityRow>(
        `
          SELECT matter_id, related_client_id, party_role,
            lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) AS normalized_name
          FROM parties
          WHERE tenant_id = $1
            AND party_id = $2
          LIMIT 1
        `,
        [ctx.tenantId, partyId],
      );
      return result.rows[0] ?? null;
    });
  }

  private async auditNegotiationPosition(
    ctx: PermissionContext,
    client: PoolClient,
    row: NegotiationPositionRow,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'NEGOTIATION_POSITION_CHANGED',
        targetType: 'negotiation_position',
        targetId: row.position_id,
        matterId: row.matter_id,
        metadata: {
          negotiation_position_id: row.position_id,
          matter_id: row.matter_id,
          party_id: row.party_id,
          document_id: row.source_document_id,
          version_id: row.source_version_id,
          hash: row.position_summary_hash,
          item_count: row.round_no,
        },
      },
      client,
    );
  }

  private async authorizedScope(ctx: PermissionContext): Promise<{
    scope: SearchSqlFragment;
    appliedRules?: string[] | undefined;
  }> {
    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
    } catch {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    if (scopeDecision.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    return scopeDecision;
  }

  private async queryEmbeddingVectorLiteral(query: string): Promise<string | null> {
    const embeddingResult = await this.embeddingGateway.embedText({ text: query });
    if (embeddingResult.status !== 'completed' || !embeddingResult.embedding) return null;
    return vectorToSqlLiteral(embeddingResult.embedding);
  }

  private async querySimilarClauses(
    client: PoolClient,
    tenantId: string,
    scope: SearchSqlFragment,
    queryVector: string,
    limit: number,
  ): Promise<ClauseSearchRow[]> {
    const filters = this.filterBuilder.build({ scope });
    const params: SearchSqlValue[] = [...filters.params];
    const tenantSql = `$${params.push(tenantId)}`;
    const vectorSql = `$${params.push(queryVector)}`;
    const candidateLimitSql = `$${params.push(Math.min(1_000, Math.max(200, limit * 20)))}`;
    const limitSql = `$${params.push(limit)}`;
    const result = await client.query<ClauseSearchRow>(
      `
        WITH semantic_candidates AS (
          SELECT emb.clause_id, emb.embedding
          FROM contract_clause_embeddings emb
          WHERE emb.tenant_id = ${tenantSql}
            AND emb.model_route = '${searchEmbeddingModelRoute}'
            AND emb.stale = false
          ORDER BY emb.embedding <=> ${vectorSql}::vector
          LIMIT ${candidateLimitSql}
        ),
        idx AS (
          SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
            d.document_type, d.status AS document_status, dv.version_status, d.updated_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
            AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
        )
        SELECT
          cc.clause_id,
          cbe.entry_id AS clause_bank_entry_id,
          cc.matter_id,
          cc.document_id,
          cc.version_id,
          cc.clause_kind,
          cc.clause_number,
          cc.heading_hash,
          cc.text_hash,
          COALESCE(cbe.tags, ARRAY[]::text[]) AS tags,
          (1 - (emb.embedding <=> ${vectorSql}::vector)) AS semantic_score,
          (
            GREATEST((1 - (emb.embedding <=> ${vectorSql}::vector)), 0)
            + CASE WHEN cbe.entry_id IS NULL THEN 0 ELSE 0.08 END
          ) AS score
        FROM contract_clauses cc
        JOIN idx
          ON idx.tenant_id = cc.tenant_id
          AND idx.document_id = cc.document_id
          AND idx.version_id = cc.version_id
        JOIN semantic_candidates emb
          ON emb.clause_id = cc.clause_id
        LEFT JOIN clause_bank_entries cbe
          ON cbe.tenant_id = cc.tenant_id
          AND cbe.source_clause_id = cc.clause_id
          AND cbe.status = 'approved'
        ${filters.whereSql}
          AND cc.stale = false
        ORDER BY score DESC, semantic_score DESC, cc.updated_at DESC, cc.clause_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows;
  }

  private async findWordClauseInsertionSource(
    client: PoolClient,
    scope: SearchSqlFragment,
    clauseId: string,
    clauseBankEntryId: string | null,
  ): Promise<WordClauseInsertionSourceRow | null> {
    const filters = this.filterBuilder.build({ scope });
    const params: SearchSqlValue[] = [...filters.params];
    const clauseSql = `$${params.push(clauseId)}`;
    const entryRequiredSql = `$${params.push(Boolean(clauseBankEntryId))}`;
    const entrySql = `$${params.push(clauseBankEntryId ?? '00000000-0000-0000-0000-000000000000')}`;
    const result = await client.query<WordClauseInsertionSourceRow>(
      `
        WITH idx AS (
          SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
            d.document_type, d.status AS document_status, dv.version_status, d.updated_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
            AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
        )
        SELECT cc.clause_id,
          cbe.entry_id AS clause_bank_entry_id,
          cc.matter_id,
          cc.document_id,
          cc.version_id,
          cc.clause_number,
          ccc.chunk_text,
          ccc.text_hash
        FROM contract_clauses cc
        JOIN idx
          ON idx.tenant_id = cc.tenant_id
          AND idx.document_id = cc.document_id
          AND idx.version_id = cc.version_id
        JOIN contract_clause_chunks ccc
          ON ccc.tenant_id = cc.tenant_id
          AND ccc.clause_id = cc.clause_id
          AND ccc.stale = false
        LEFT JOIN clause_bank_entries cbe
          ON cbe.tenant_id = cc.tenant_id
          AND cbe.source_clause_id = cc.clause_id
          AND cbe.status = 'approved'
        ${filters.whereSql}
          AND cc.clause_id = ${clauseSql}::uuid
          AND cc.stale = false
          AND (${entryRequiredSql}::boolean = false OR cbe.entry_id = ${entrySql}::uuid)
          AND ccc.chunk_text <> ''
        ORDER BY ccc.chunk_ordinal ASC
        LIMIT 1
      `,
      params,
    );
    return result.rows[0] ?? null;
  }

  private async findClauseBankSource(
    client: PoolClient,
    tenantId: string,
    clauseId: string,
  ): Promise<ClauseBankEntryRow | null> {
    const result = await client.query<ClauseBankEntryRow>(
      `
        SELECT
          gen_random_uuid() AS entry_id,
          cc.clause_id AS source_clause_id,
          cc.clause_id,
          cc.matter_id,
          cc.document_id,
          cc.version_id,
          cc.clause_kind,
          cc.clause_number,
          cc.heading_hash,
          cc.text_hash,
          'draft'::text AS status,
          ARRAY[]::text[] AS tags,
          '0'::text AS usage_count,
          NULL::uuid AS proposed_by,
          NULL::uuid AS approved_by,
          now() AS created_at,
          now() AS updated_at
        FROM contract_clauses cc
        JOIN documents d
          ON d.tenant_id = cc.tenant_id
          AND d.document_id = cc.document_id
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
        WHERE cc.tenant_id = $1
          AND cc.clause_id = $2
          AND cc.stale = false
        LIMIT 1
      `,
      [tenantId, clauseId],
    );
    return result.rows[0] ?? null;
  }

  private async findClauseBankEntry(
    client: PoolClient,
    tenantId: string,
    entryId: string,
  ): Promise<ClauseBankEntryRow | null> {
    const result = await client.query<ClauseBankEntryRow>(
      `
        SELECT entry_id, source_clause_id, matter_id, document_id, version_id,
          clause_kind, clause_number, heading_hash, text_hash, status, tags,
          usage_count::text, proposed_by, approved_by, created_at, updated_at
        FROM clause_bank_entries
        WHERE tenant_id = $1
          AND entry_id = $2
        LIMIT 1
      `,
      [tenantId, entryId],
    );
    return result.rows[0] ?? null;
  }

  private async queryClauseBankEntries(
    client: PoolClient,
    tenantId: string,
    input: ClauseBankEntryQueryDto,
  ): Promise<ClauseBankEntryRow[]> {
    const params: SearchSqlValue[] = [tenantId];
    const statusFilter = input.status ? `AND status = $${params.push(input.status)}` : '';
    const tagFilter = input.tag ? `AND $${params.push(input.tag)} = ANY(tags)` : '';
    const kindFilter = input.clauseKind
      ? `AND clause_kind = $${params.push(input.clauseKind)}`
      : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<ClauseBankEntryRow>(
      `
        SELECT entry_id, source_clause_id, matter_id, document_id, version_id,
          clause_kind, clause_number, heading_hash, text_hash, status, tags,
          usage_count::text, proposed_by, approved_by, created_at, updated_at
        FROM clause_bank_entries
        WHERE tenant_id = $1
          ${statusFilter}
          ${tagFilter}
          ${kindFilter}
        ORDER BY
          CASE status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
          updated_at DESC,
          entry_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows;
  }

  private async assertClauseBankReviewer(
    client: PoolClient,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const result = await client.query<{ role: string }>(
      `
        SELECT role
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      [tenantId, userId],
    );
    const role = result.rows[0]?.role;
    if (role !== 'firm_admin' && role !== 'security_admin') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }

  private async toClauseBankEntryDto(
    ctx: PermissionContext,
    row: ClauseBankEntryRow,
    forceAccessible = false,
  ): Promise<ClauseBankEntryDto> {
    const sourceAccessible = forceAccessible || (await this.canReadClauseBankSource(ctx, row));
    return clauseBankEntrySchema.parse({
      entryId: row.entry_id,
      status: row.status,
      sourceClauseId: row.source_clause_id,
      matterId: sourceAccessible ? row.matter_id : null,
      documentId: sourceAccessible ? row.document_id : null,
      versionId: sourceAccessible ? row.version_id : null,
      clauseKind: row.clause_kind,
      clauseNumber: row.clause_number,
      headingHash: row.heading_hash,
      textHash: row.text_hash,
      tags: row.tags,
      usageCount: Number(row.usage_count),
      proposedBy: row.proposed_by,
      approvedBy: row.approved_by,
      sourceAccessible,
      citationRef: sourceAccessible ? `clause:${row.source_clause_id}` : `clause-bank:${row.entry_id}`,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    });
  }

  private async canReadClauseBankSource(
    ctx: PermissionContext,
    row: ClauseBankEntryRow,
  ): Promise<boolean> {
    try {
      const matterDecision = await this.permissionService.canReadMatter(ctx, row.matter_id);
      if (matterDecision.effect !== 'ALLOW') return false;
      const documentDecision = await this.documentPermission.canReadDocument(ctx, row.document_id);
      return documentDecision.effect === 'ALLOW';
    } catch {
      return false;
    }
  }

  private async queryClauseBank(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: ContractClauseBankQueryDto,
  ): Promise<ContractClauseBankItemDto[]> {
    const filters = this.filterBuilder.build({
      filters: { matterId: input.matterId },
      scope,
    });
    const params: SearchSqlValue[] = [...filters.params];
    const documentFilter = input.documentId
      ? `AND cc.document_id = $${params.push(input.documentId)}::uuid`
      : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<ClauseBankRow>(
      `
        WITH idx AS (
          SELECT d.tenant_id, d.document_id, dv.version_id, d.matter_id, m.client_id,
            d.document_type, d.status AS document_status, dv.version_status, d.updated_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
            AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
            AND dv.document_id = d.document_id
            AND dv.version_status = 'current'
        )
        SELECT
          cc.clause_id,
          cc.matter_id,
          cc.document_id,
          cc.version_id,
          cc.clause_kind,
          cc.clause_number,
          cc.start_offset,
          cc.end_offset,
          cc.heading_hash,
          cc.text_hash,
          (
            SELECT count(*)::text
            FROM contract_defined_terms cdt
            WHERE cdt.tenant_id = cc.tenant_id
              AND cdt.clause_id = cc.clause_id
              AND cdt.stale = false
          ) AS defined_term_count,
          (
            SELECT count(*)::text
            FROM contract_defined_terms cdt
            WHERE cdt.tenant_id = cc.tenant_id
              AND cdt.clause_id = cc.clause_id
              AND cdt.conflict_status = 'conflict'
              AND cdt.stale = false
          ) AS conflict_count,
          (
            SELECT count(*)::text
            FROM contract_redline_changes crc
            WHERE crc.tenant_id = cc.tenant_id
              AND crc.clause_id = cc.clause_id
              AND crc.stale = false
          ) AS redline_change_count
        FROM contract_clauses cc
        JOIN idx
          ON idx.tenant_id = cc.tenant_id
          AND idx.document_id = cc.document_id
          AND idx.version_id = cc.version_id
        ${filters.whereSql}
          AND cc.stale = false
          ${documentFilter}
        ORDER BY cc.document_id, cc.start_offset, cc.clause_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(toClauseBankItem);
  }

  private async queryRuleFacts(
    client: PoolClient,
    tenantId: string,
    scope: SearchSqlFragment,
    input: ContractRuleFindingsQueryDto,
  ): Promise<ContractRuleFacts> {
    const clauses = await this.queryRuleClauseFacts(client, scope, input);
    const clauseIds = clauses.map((clause) => clause.clauseId);
    if (clauseIds.length === 0) {
      return {
        matterId: input.matterId,
        documentId: input.documentId ?? null,
        clauses: [],
        terms: [],
        redlineChanges: [],
      };
    }
    const terms = await client.query<RuleTermRow>(
      `
        SELECT term_id, matter_id, document_id, version_id, clause_id,
          normalized_term_key, definition_hash
        FROM contract_defined_terms
        WHERE tenant_id = $1
          AND clause_id = ANY($2::uuid[])
          AND stale = false
        ORDER BY document_id, start_offset, term_id
      `,
      [tenantId, clauseIds],
    );
    const redlines = await client.query<RuleRedlineRow>(
      `
        SELECT redline_change_id, matter_id, document_id, version_id, clause_id,
          change_type, text_hash
        FROM contract_redline_changes
        WHERE tenant_id = $1
          AND (
            clause_id = ANY($2::uuid[])
            OR (clause_id IS NULL AND document_id = ANY($3::uuid[]))
          )
          AND stale = false
        ORDER BY document_id, start_offset, redline_change_id
      `,
      [
        tenantId,
        clauseIds,
        [...new Set(clauses.map((clause) => clause.documentId))],
      ],
    );
    return {
      matterId: input.matterId,
      documentId: input.documentId ?? null,
      clauses,
      terms: terms.rows.map((row) => ({
        termId: row.term_id,
        matterId: row.matter_id,
        documentId: row.document_id,
        versionId: row.version_id,
        clauseId: row.clause_id,
        normalizedTermKey: row.normalized_term_key,
        definitionHash: row.definition_hash,
      })),
      redlineChanges: redlines.rows.map((row) => ({
        redlineChangeId: row.redline_change_id,
        matterId: row.matter_id,
        documentId: row.document_id,
        versionId: row.version_id,
        clauseId: row.clause_id,
        changeType: row.change_type,
        textHash: row.text_hash,
      })),
    };
  }

  private async queryRuleClauseFacts(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: ContractRuleFindingsQueryDto,
  ): Promise<ContractRuleClauseFact[]> {
    const clauses = await this.queryClauseBank(client, scope, {
      matterId: input.matterId,
      documentId: input.documentId,
      limit: 500,
    });
    return clauses.map((clause) => ({
      clauseId: clause.clauseId,
      matterId: clause.matterId,
      documentId: clause.documentId,
      versionId: clause.versionId,
      clauseKind: clause.clauseKind,
      clauseNumber: clause.clauseNumber,
      textHash: clause.textHash,
    }));
  }

  private async queryActivePlaybookRules(
    client: PoolClient,
    tenantId: string,
    matterId: string,
  ): Promise<PlaybookRuleForEvaluation[]> {
    const result = await client.query<PlaybookRuleRow>(
      `
        WITH target_matter AS (
          SELECT client_id
          FROM matters
          WHERE tenant_id = $1
            AND matter_id = $2
          LIMIT 1
        )
        SELECT DISTINCT ON (rule_key)
          pr.rule_id, pr.rule_key, pr.rule_type, pr.severity, pr.version_number,
          pr.matter_id, pr.client_id, pr.expression_hash, pr.expression_json
        FROM playbook_rules pr
        CROSS JOIN target_matter tm
        WHERE pr.tenant_id = $1
          AND pr.status = 'active'
          AND (
            pr.matter_id = $2
            OR pr.client_id = tm.client_id
            OR (pr.matter_id IS NULL AND pr.client_id IS NULL)
          )
        ORDER BY pr.rule_key,
          CASE
            WHEN pr.matter_id = $2 THEN 0
            WHEN pr.client_id = tm.client_id THEN 1
            ELSE 2
          END,
          pr.version_number DESC
      `,
      [tenantId, matterId],
    );
    return result.rows.map((row) => ({
      ruleId: row.rule_id,
      ruleKey: row.rule_key,
      ruleType: row.rule_type,
      severity: row.severity,
      versionNumber: Number(row.version_number),
      matterId: row.matter_id,
      clientId: row.client_id,
      expressionHash: row.expression_hash,
      expression: row.expression_json,
    }));
  }

  private async findTarget(
    client: PoolClient,
    tenantId: string,
    documentId: string,
    versionId?: string,
  ): Promise<ContractTargetRow | null> {
    const result = await client.query<ContractTargetRow>(
      `
        SELECT d.matter_id, d.document_id, d.ai_allowed, dv.version_id,
          cd.body_text, cd.extraction_status
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
          AND cd.version_id = dv.version_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND d.status <> 'deleted'
          AND d.deleted_at IS NULL
          AND (($3::uuid IS NULL AND dv.version_status = 'current') OR dv.version_id = $3::uuid)
        ORDER BY dv.created_at DESC
        LIMIT 1
      `,
      [tenantId, documentId, versionId ?? null],
    );
    return result.rows[0] ?? null;
  }

  private async upsertClassification(
    client: PoolClient,
    tenantId: string,
    input: ContractClassificationDto,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO contract_classifications (
          tenant_id, matter_id, document_id, version_id, contract_type, confidence,
          unsupported, classifier_version, signal_refs, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], now())
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          document_id = EXCLUDED.document_id,
          contract_type = EXCLUDED.contract_type,
          confidence = EXCLUDED.confidence,
          unsupported = EXCLUDED.unsupported,
          classifier_version = EXCLUDED.classifier_version,
          signal_refs = EXCLUDED.signal_refs,
          updated_at = EXCLUDED.updated_at
      `,
      [
        tenantId,
        input.matterId,
        input.documentId,
        input.versionId,
        input.contractType,
        input.confidence,
        input.unsupported,
        input.classifierVersion,
        input.signalRefs,
      ],
    );
  }

  private async markDerivedStale(
    client: PoolClient,
    tenantId: string,
    versionId: string,
  ): Promise<void> {
    for (const table of [
      'contract_clause_chunks',
      'contract_defined_terms',
      'contract_redline_changes',
      'contract_clauses',
    ]) {
      await client.query(
        `UPDATE ${table} SET stale = true, updated_at = now() WHERE tenant_id = $1 AND version_id = $2 AND stale = false`,
        [tenantId, versionId],
      );
    }
  }

  private async upsertClauses(
    client: PoolClient,
    tenantId: string,
    target: ContractTargetRow,
    clauses: readonly ParsedClause[],
  ): Promise<ClauseIdRow[]> {
    const output: ClauseIdRow[] = [];
    for (const clause of clauses) {
      const result = await client.query<ClauseIdRow>(
        `
          INSERT INTO contract_clauses (
            tenant_id, matter_id, document_id, version_id, clause_kind, clause_number,
            start_offset, end_offset, heading_hash, text_hash, parser_version, stale, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, now())
          ON CONFLICT (tenant_id, version_id, clause_number, start_offset)
          DO UPDATE SET
            clause_kind = EXCLUDED.clause_kind,
            end_offset = EXCLUDED.end_offset,
            heading_hash = EXCLUDED.heading_hash,
            text_hash = EXCLUDED.text_hash,
            parser_version = EXCLUDED.parser_version,
            stale = false,
            updated_at = EXCLUDED.updated_at
          RETURNING clause_id, start_offset, end_offset
        `,
        [
          tenantId,
          target.matter_id,
          target.document_id,
          target.version_id,
          clause.clauseKind,
          clause.clauseNumber,
          clause.startOffset,
          clause.endOffset,
          clause.headingHash,
          clause.textHash,
          contractParserVersion,
        ],
      );
      const row = result.rows[0];
      if (row) output.push(row);
    }
    return output;
  }

  private async upsertClauseChunks(
    client: PoolClient,
    tenantId: string,
    target: ContractTargetRow,
    clauses: readonly ClauseIdRow[],
  ): Promise<void> {
    const bodyText = target.body_text ?? '';
    for (const [index, clause] of clauses.entries()) {
      const chunkId = await this.findAlignedChunkId(client, tenantId, target, clause);
      const chunkText = bodyText.slice(clause.start_offset, clause.end_offset).trim();
      await client.query(
        `
          INSERT INTO contract_clause_chunks (
            tenant_id, clause_id, matter_id, document_id, version_id, chunk_id, chunk_ordinal,
            start_offset, end_offset, chunk_text, text_hash, stale, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, now())
          ON CONFLICT (tenant_id, clause_id, chunk_ordinal)
          DO UPDATE SET
            chunk_id = EXCLUDED.chunk_id,
            start_offset = EXCLUDED.start_offset,
            end_offset = EXCLUDED.end_offset,
            chunk_text = EXCLUDED.chunk_text,
            text_hash = EXCLUDED.text_hash,
            stale = false,
            updated_at = EXCLUDED.updated_at
        `,
        [
          tenantId,
          clause.clause_id,
          target.matter_id,
          target.document_id,
          target.version_id,
          chunkId,
          index,
          clause.start_offset,
          clause.end_offset,
          chunkText,
          sha256Hex(`${target.version_id}:${clause.start_offset}:${clause.end_offset}`),
        ],
      );
    }
  }

  private async upsertClauseEmbeddings(
    client: PoolClient,
    tenantId: string,
    target: ContractTargetRow,
    clauses: readonly ClauseIdRow[],
  ): Promise<void> {
    await client.query(
      `
        UPDATE contract_clause_embeddings
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
      `,
      [tenantId, target.version_id],
    );
    const bodyText = target.body_text ?? '';
    for (const clause of clauses) {
      const text = bodyText.slice(clause.start_offset, clause.end_offset).trim();
      if (!text) continue;
      const sourceTextHash = sha256Hex(text);
      const chunk = await this.findClauseChunkId(client, tenantId, clause.clause_id);
      const embeddingResult = await this.embeddingGateway.embedText({ text });
      const vector =
        embeddingResult.status === 'completed' && embeddingResult.embedding
          ? embeddingResult.embedding
          : zeroEmbeddingVector();
      const stale = embeddingResult.status !== 'completed';
      await client.query(
        `
          INSERT INTO contract_clause_embeddings (
            tenant_id, clause_id, clause_chunk_id, matter_id, document_id, version_id,
            model_route, model_tier, embedding, embedding_hash, source_text_hash, stale,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'local', $8::vector, $9, $10, $11, now())
          ON CONFLICT (tenant_id, clause_id, model_route)
          DO UPDATE SET
            clause_chunk_id = EXCLUDED.clause_chunk_id,
            matter_id = EXCLUDED.matter_id,
            document_id = EXCLUDED.document_id,
            version_id = EXCLUDED.version_id,
            model_tier = EXCLUDED.model_tier,
            embedding = EXCLUDED.embedding,
            embedding_hash = EXCLUDED.embedding_hash,
            source_text_hash = EXCLUDED.source_text_hash,
            stale = EXCLUDED.stale,
            updated_at = EXCLUDED.updated_at
        `,
        [
          tenantId,
          clause.clause_id,
          chunk?.clause_chunk_id ?? null,
          target.matter_id,
          target.document_id,
          target.version_id,
          searchEmbeddingModelRoute,
          vectorToSqlLiteral(vector),
          embeddingHash(vector),
          sourceTextHash,
          stale,
        ],
      );
    }
  }

  private async findClauseChunkId(
    client: PoolClient,
    tenantId: string,
    clauseId: string,
  ): Promise<ClauseChunkIdRow | null> {
    const result = await client.query<ClauseChunkIdRow>(
      `
        SELECT clause_chunk_id
        FROM contract_clause_chunks
        WHERE tenant_id = $1
          AND clause_id = $2
          AND stale = false
        ORDER BY chunk_ordinal ASC
        LIMIT 1
      `,
      [tenantId, clauseId],
    );
    return result.rows[0] ?? null;
  }

  private async findAlignedChunkId(
    client: PoolClient,
    tenantId: string,
    target: ContractTargetRow,
    clause: ClauseIdRow,
  ): Promise<string | null> {
    const result = await client.query<{ chunk_id: string }>(
      `
        SELECT chunk_id
        FROM document_chunks
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_id = $3
          AND stale = false
          AND chunk_kind = 'parent'
          AND char_start < $5
          AND char_end > $4
        ORDER BY
          greatest(0, least(char_end, $5) - greatest(char_start, $4)) DESC,
          chunk_ordinal ASC
        LIMIT 1
      `,
      [tenantId, target.document_id, target.version_id, clause.start_offset, clause.end_offset],
    );
    return result.rows[0]?.chunk_id ?? null;
  }

  private async upsertDefinedTerms(
    client: PoolClient,
    tenantId: string,
    target: ContractTargetRow,
    terms: readonly ParsedDefinedTerm[],
    clauses: readonly ClauseIdRow[],
  ): Promise<number> {
    const conflictCounts = countTermConflicts(terms);
    let inserted = 0;
    for (const term of terms) {
      const clause = clauseForOffset(clauses, term.startOffset);
      if (!clause) continue;
      const conflictCount = conflictCounts.get(term.normalizedTermKey) ?? 0;
      await client.query(
        `
          INSERT INTO contract_defined_terms (
            tenant_id, matter_id, document_id, version_id, clause_id, normalized_term_key,
            term_hash, definition_hash, conflict_status, conflict_ref_count,
            start_offset, end_offset, stale, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, now())
          ON CONFLICT (tenant_id, version_id, normalized_term_key, clause_id, start_offset)
          DO UPDATE SET
            term_hash = EXCLUDED.term_hash,
            definition_hash = EXCLUDED.definition_hash,
            conflict_status = EXCLUDED.conflict_status,
            conflict_ref_count = EXCLUDED.conflict_ref_count,
            end_offset = EXCLUDED.end_offset,
            stale = false,
            updated_at = EXCLUDED.updated_at
        `,
        [
          tenantId,
          target.matter_id,
          target.document_id,
          target.version_id,
          clause.clause_id,
          term.normalizedTermKey,
          term.termHash,
          term.definitionHash,
          conflictCount > 1 ? 'conflict' : 'none',
          Math.max(0, conflictCount - 1),
          term.startOffset,
          term.endOffset,
        ],
      );
      inserted += 1;
    }
    return inserted;
  }

  private async upsertRedlines(
    client: PoolClient,
    tenantId: string,
    target: ContractTargetRow,
    changes: readonly ParsedRedlineChange[],
    clauses: readonly ClauseIdRow[],
  ): Promise<number> {
    let inserted = 0;
    for (const change of changes) {
      const clause = clauseForOffset(clauses, change.startOffset);
      await client.query(
        `
          INSERT INTO contract_redline_changes (
            tenant_id, matter_id, document_id, version_id, clause_id, change_type,
            start_offset, end_offset, text_hash, parser_version, stale, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, now())
          ON CONFLICT (tenant_id, version_id, change_type, start_offset, end_offset, text_hash)
          DO UPDATE SET
            clause_id = EXCLUDED.clause_id,
            parser_version = EXCLUDED.parser_version,
            stale = false,
            updated_at = EXCLUDED.updated_at
        `,
        [
          tenantId,
          target.matter_id,
          target.document_id,
          target.version_id,
          clause?.clause_id ?? null,
          change.changeType,
          change.startOffset,
          change.endOffset,
          change.textHash,
          contractParserVersion,
        ],
      );
      inserted += 1;
    }
    return inserted;
  }

  private async revisionRedlineChanges(
    client: PoolClient,
    tenantId: string,
    target: ContractTargetRow,
  ): Promise<ParsedRedlineChange[]> {
    const result = await client.query<RevisionRedlineRow>(
      `
        SELECT change_type, before_text, after_text, before_text_hash, after_text_hash
        FROM document_revisions
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_id = $3
          AND stale = false
          AND change_type IN ('insert', 'delete', 'move_from', 'move_to')
        ORDER BY sequence_no, revision_id
      `,
      [tenantId, target.document_id, target.version_id],
    );
    return result.rows.map((row, index) => {
      const added = row.change_type === 'insert' || row.change_type === 'move_to';
      const text = added ? row.after_text : row.before_text;
      const offset = redlineOffset(target.body_text ?? '', text, index);
      return {
        changeType: added ? 'added' : 'deleted',
        startOffset: offset.startOffset,
        endOffset: offset.endOffset,
        textHash: added ? row.after_text_hash : row.before_text_hash,
      };
    });
  }

  private async currentRedlineCount(
    client: PoolClient,
    tenantId: string,
    versionId: string,
  ): Promise<number> {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM contract_redline_changes
        WHERE tenant_id = $1
          AND version_id = $2
          AND stale = false
      `,
      [tenantId, versionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  private async nextRuleVersion(
    client: PoolClient,
    tenantId: string,
    ruleKey: string,
  ): Promise<number> {
    const result = await client.query<{ next_version: string }>(
      `
        SELECT (coalesce(max(version_number), 0) + 1)::text AS next_version
        FROM playbook_rules
        WHERE tenant_id = $1
          AND rule_key = $2
      `,
      [tenantId, ruleKey],
    );
    return Number(result.rows[0]?.next_version ?? 1);
  }
}

function clauseForOffset(clauses: readonly ClauseIdRow[], offset: number): ClauseIdRow | null {
  return clauses.find((clause) => offset >= clause.start_offset && offset < clause.end_offset) ?? null;
}

function redlineOffset(
  bodyText: string,
  revisionText: string,
  fallbackIndex: number,
): { startOffset: number; endOffset: number } {
  const foundAt = revisionText.length > 0 ? bodyText.indexOf(revisionText) : -1;
  if (foundAt >= 0) {
    return {
      startOffset: foundAt,
      endOffset: foundAt + Math.max(1, revisionText.length),
    };
  }
  const startOffset = Math.max(0, bodyText.length) + 1 + fallbackIndex * 2;
  return { startOffset, endOffset: startOffset + 1 };
}

function countTermConflicts(terms: readonly ParsedDefinedTerm[]): Map<string, number> {
  const definitions = new Map<string, Set<string>>();
  for (const term of terms) {
    const set = definitions.get(term.normalizedTermKey) ?? new Set<string>();
    set.add(term.definitionHash);
    definitions.set(term.normalizedTermKey, set);
  }
  return new Map([...definitions.entries()].map(([key, value]) => [key, value.size]));
}

function toClauseBankItem(row: ClauseBankRow): ContractClauseBankItemDto {
  return {
    clauseId: row.clause_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    clauseKind: row.clause_kind,
    clauseNumber: row.clause_number,
    startOffset: Number(row.start_offset),
    endOffset: Number(row.end_offset),
    headingHash: row.heading_hash,
    textHash: row.text_hash,
    definedTermCount: Number(row.defined_term_count),
    conflictCount: Number(row.conflict_count),
    redlineChangeCount: Number(row.redline_change_count),
    citationRef: `clause:${row.clause_id}`,
  };
}

function toNegotiationPositionDto(row: NegotiationPositionRow): NegotiationPositionDto {
  return {
    positionId: row.position_id,
    matterId: row.matter_id,
    partyId: row.party_id,
    issueLabel: row.issue_label,
    clauseKind: row.clause_kind,
    positionSummary: row.position_summary,
    sourceDocumentId: row.source_document_id,
    sourceVersionId: row.source_version_id,
    sourceClauseId: row.source_clause_id,
    roundNo: Number(row.round_no),
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function materializeNegotiationIssueCandidates(
  redlines: readonly ContractRuleRedlineFact[],
  findings: readonly ContractRuleFinding[],
  limit: number,
): NegotiationIssueCandidate[] {
  const candidates: NegotiationIssueCandidate[] = [];
  for (const redline of redlines) {
    for (const finding of findings) {
      if (!negotiationIssueMatches(redline, finding)) continue;
      candidates.push({
        issueKey: negotiationIssueKey(redline, finding),
        redline,
        finding,
      });
    }
  }
  return candidates
    .sort((a, b) => `${a.redline.redlineChangeId}:${a.finding.ruleKey}`.localeCompare(
      `${b.redline.redlineChangeId}:${b.finding.ruleKey}`,
    ))
    .slice(0, limit);
}

function negotiationIssueMatches(
  redline: ContractRuleRedlineFact,
  finding: ContractRuleFinding,
): boolean {
  if (finding.status === 'unsupported') return false;
  if (finding.documentId && finding.documentId !== redline.documentId) return false;
  if (finding.versionId && finding.versionId !== redline.versionId) return false;
  if (finding.clauseId && redline.clauseId && finding.clauseId !== redline.clauseId) {
    return false;
  }
  if (finding.clauseId && !redline.clauseId) return false;
  return true;
}

function negotiationIssueKey(
  redline: ContractRuleRedlineFact,
  finding: ContractRuleFinding,
): string {
  return sha256Hex(
    canonicalJson({
      redlineChangeId: redline.redlineChangeId,
      ruleId: finding.ruleId,
      ruleVersion: finding.ruleVersion,
      findingHash: finding.findingHash,
    }),
  );
}

function toNegotiationIssueDto(row: NegotiationIssueRow): NegotiationIssueDto {
  const citationRefs = [
    `redline:${row.redline_change_id}`,
    ...(row.clause_id ? [`clause:${row.clause_id}`] : []),
    `rule:${row.rule_id}`,
  ];
  return {
    issueId: row.issue_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    clauseId: row.clause_id,
    redlineChangeId: row.redline_change_id,
    changeType: row.change_type,
    redlineTextHash: row.redline_text_hash,
    ruleId: row.rule_id,
    ruleKey: row.rule_key,
    ruleVersion: Number(row.rule_version),
    severity: row.severity,
    findingStatus: row.finding_status,
    findingCode: row.finding_code,
    findingHash: row.finding_hash,
    status: row.status,
    citationRefs,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toContractAiReviewFindingDto(row: ContractAiReviewFindingRow): ContractAiReviewFindingDto {
  return {
    findingId: row.finding_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    clauseId: row.clause_id,
    aiSessionId: row.ai_session_id,
    aiClaimId: row.ai_claim_id,
    aiSource: row.ai_source,
    task: row.review_task,
    severity: row.severity,
    findingCode: row.finding_code,
    findingHash: row.finding_hash,
    findingText: row.finding_text,
    citationRefs: row.citation_refs,
    status: row.status,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at ? toIsoString(row.accepted_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function contractAiReviewSeverity(
  claim: ContractAiReviewMaterializeClaimInput,
  task: ContractAiReviewMaterializeInput['task'],
): ContractAiReviewFindingDto['severity'] {
  if (task === 'risk_extraction' || claim.isLegalConclusion) return 'critical';
  if (claim.kind === 'risk' || claim.kind === 'issue') return 'warning';
  return 'info';
}

function contractAiReviewFindingCode(
  claim: ContractAiReviewMaterializeClaimInput,
  task: ContractAiReviewMaterializeInput['task'],
): string {
  const kind = claim.kind.toLowerCase().replace(/[^a-z0-9._:-]+/g, '_').slice(0, 48);
  return `contract.ai.${task}.${kind || 'claim'}`.slice(0, 120);
}

function compactRules(rules: readonly string[]): string[] {
  return [...new Set(rules)].slice(0, 20).map((rule) => rule.slice(0, 120));
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function canonicalJson(input: unknown): string {
  return JSON.stringify(sortJson(input));
}

function sortJson(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sortJson);
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, sortJson(value)]),
    );
  }
  return input;
}

function assertSafeExpression(input: unknown): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (sensitiveExpressionKeys.has(key.toLowerCase())) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      }
      visit(child);
    }
  };
  visit(input);
  const hash = createHash('sha256').update(canonicalJson(input)).digest('hex');
  if (!hash) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
}
