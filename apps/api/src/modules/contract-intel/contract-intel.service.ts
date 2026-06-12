import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  contractProcessResponseSchema,
  contractClauseBankResponseSchema,
  contractRuleFindingsResponseSchema,
  playbookRuleResponseSchema,
  type ContractClauseBankItemDto,
  type ContractClauseBankQueryDto,
  type ContractClauseBankResponseDto,
  type ContractClassificationDto,
  type ContractProcessResponseDto,
  type ContractRuleFindingsQueryDto,
  type ContractRuleFindingsResponseDto,
  type CreatePlaybookRuleRequestDto,
  type PermissionContext,
  type PlaybookRuleResponseDto,
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
  evaluatePlaybookRule,
  type ContractRuleClauseFact,
  type ContractRuleFacts,
  type PlaybookRuleForEvaluation,
} from './contract-rule-engine';

interface ContractTargetRow {
  matter_id: string;
  document_id: string;
  version_id: string;
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

interface PlaybookRuleRow {
  rule_id: string;
  rule_key: string;
  rule_type: PlaybookRuleForEvaluation['ruleType'];
  severity: PlaybookRuleForEvaluation['severity'];
  version_number: number;
  matter_id: string | null;
  expression_hash: string;
  expression_json: Record<string, unknown>;
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
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentPermissionService)
    private readonly documentPermission: DocumentPermissionService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(SearchFilterBuilder) private readonly filterBuilder: SearchFilterBuilder,
  ) {}

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
          definedTermCount = await this.upsertDefinedTerms(
            client,
            ctx.tenantId,
            target,
            parsed.definedTerms,
            clauseIds,
          );
          redlineChangeCount = await this.upsertRedlines(
            client,
            ctx.tenantId,
            target,
            parsed.redlineChanges,
            clauseIds,
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
        expression_hash: string;
      }>(
        `
          INSERT INTO playbook_rules (
            rule_id, tenant_id, matter_id, rule_key, rule_type, severity,
            expression_json, expression_hash, version_number, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $10)
          RETURNING rule_id, rule_key, rule_type, severity, status, version_number,
            matter_id, expression_hash
        `,
        [
          ruleId,
          ctx.tenantId,
          input.matterId ?? null,
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
        expressionHash: row.expression_hash,
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
        SELECT DISTINCT ON (rule_key)
          rule_id, rule_key, rule_type, severity, version_number, matter_id,
          expression_hash, expression_json
        FROM playbook_rules
        WHERE tenant_id = $1
          AND status = 'active'
          AND (matter_id IS NULL OR matter_id = $2)
        ORDER BY rule_key, CASE WHEN matter_id = $2 THEN 0 ELSE 1 END, version_number DESC
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
        SELECT d.matter_id, d.document_id, dv.version_id,
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
    for (const [index, clause] of clauses.entries()) {
      await client.query(
        `
          INSERT INTO contract_clause_chunks (
            tenant_id, clause_id, matter_id, document_id, version_id, chunk_ordinal,
            start_offset, end_offset, text_hash, stale, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, now())
          ON CONFLICT (tenant_id, clause_id, chunk_ordinal)
          DO UPDATE SET
            start_offset = EXCLUDED.start_offset,
            end_offset = EXCLUDED.end_offset,
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
          index,
          clause.start_offset,
          clause.end_offset,
          sha256Hex(`${target.version_id}:${clause.start_offset}:${clause.end_offset}`),
        ],
      );
    }
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

function compactRules(rules: readonly string[]): string[] {
  return [...new Set(rules)].slice(0, 20).map((rule) => rule.slice(0, 120));
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
