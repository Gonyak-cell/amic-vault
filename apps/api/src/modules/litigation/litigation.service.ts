import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import {
  litigationCaseMapResponseSchema,
  litigationEvidenceListResponseSchema,
  litigationEvidenceSchema,
  litigationFactListResponseSchema,
  litigationFactSchema,
  litigationIssueListResponseSchema,
  litigationIssueSchema,
  litigationPleadingListResponseSchema,
  litigationPleadingSchema,
  type CreateLitigationEvidenceRequestDto,
  type CreateLitigationFactRequestDto,
  type CreateLitigationIssueRequestDto,
  type CreateLitigationPleadingRequestDto,
  type LitigationCaseMapItemDto,
  type LitigationCaseMapQueryDto,
  type LitigationCaseMapResponseDto,
  type LitigationEvidenceDto,
  type LitigationEvidenceListResponseDto,
  type LitigationEvidenceQueryDto,
  type LitigationFactDto,
  type LitigationFactListResponseDto,
  type LitigationFactQueryDto,
  type LitigationIssueDto,
  type LitigationIssueListResponseDto,
  type LitigationIssueQueryDto,
  type LitigationPleadingDto,
  type LitigationPleadingListResponseDto,
  type LitigationPleadingQueryDto,
  type PermissionContext,
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

interface LitigationEvidenceRow {
  evidence_id: string;
  matter_id: string;
  document_id: string | null;
  version_id: string | null;
  evidence_code: string;
  evidence_type: string;
  exhibit_label: string | null;
  custody_status: string;
  admitted_status: string;
  source_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface LitigationFactRow {
  fact_id: string;
  matter_id: string;
  evidence_id: string | null;
  fact_code: string;
  fact_summary: string;
  fact_date: Date | string | null;
  status: string;
  materiality: string;
  citation_refs: string[];
  created_at: Date;
  updated_at: Date;
}

interface LitigationIssueRow {
  issue_id: string;
  matter_id: string;
  parent_issue_id: string | null;
  issue_code: string;
  label: string;
  issue_type: string;
  status: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

interface LitigationPleadingRow {
  pleading_id: string;
  matter_id: string;
  document_id: string | null;
  version_id: string | null;
  pleading_code: string;
  pleading_type: string;
  filing_status: string;
  internal_deadline: Date | string | null;
  citation_refs: string[];
  created_at: Date;
  updated_at: Date;
}

interface DocumentVersionRow {
  matter_id: string;
  document_id: string;
  version_id: string;
}

type PgParam = SearchSqlValue | null;

@Injectable()
export class LitigationService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentPermissionService)
    private readonly documentPermission: DocumentPermissionService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(SearchFilterBuilder) private readonly filterBuilder: SearchFilterBuilder,
  ) {}

  async createEvidence(
    ctx: PermissionContext,
    input: CreateLitigationEvidenceRequestDto,
  ): Promise<LitigationEvidenceDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    if (input.documentId) await this.assertCanReadDocument(ctx, input.documentId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const version = input.documentId
        ? await this.findDocumentVersion(client, ctx.tenantId, input.documentId, input.versionId)
        : null;
      if (input.documentId && (!version || version.matter_id !== input.matterId)) {
        throw validationFailed();
      }
      const result = await client.query<LitigationEvidenceRow>(
        `
          INSERT INTO litigation_evidence_items (
            tenant_id, matter_id, document_id, version_id, evidence_code,
            evidence_type, exhibit_label, custody_status, admitted_status,
            source_hash, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
          RETURNING
            evidence_id, matter_id, document_id, version_id, evidence_code,
            evidence_type, exhibit_label, custody_status, admitted_status,
            source_hash, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          version?.document_id ?? null,
          version?.version_id ?? null,
          input.evidenceCode,
          input.evidenceType,
          input.exhibitLabel ?? null,
          input.custodyStatus,
          input.admittedStatus,
          input.sourceHash ?? null,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const evidence = parseEvidenceRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_EVIDENCE_CHANGED',
          targetType: 'litigation_evidence',
          targetId: evidence.evidenceId,
          matterId: evidence.matterId,
          metadata: {
            matter_id: evidence.matterId,
            evidence_id: evidence.evidenceId,
            document_id: evidence.documentId,
            version_id: evidence.versionId,
            evidence_type: evidence.evidenceType,
            custody_status: evidence.custodyStatus,
            admitted_status: evidence.admittedStatus,
            hash: evidence.sourceHash,
          },
        },
        client,
      );
      return evidence;
    });
  }

  async listEvidence(
    ctx: PermissionContext,
    input: LitigationEvidenceQueryDto,
  ): Promise<LitigationEvidenceListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const evidence = await this.queryEvidence(client, scope.scope, input);
      return litigationEvidenceListResponseSchema.parse({ matterId: input.matterId, evidence });
    });
  }

  async createFact(
    ctx: PermissionContext,
    input: CreateLitigationFactRequestDto,
  ): Promise<LitigationFactDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.evidenceId) {
        await this.assertEvidenceBelongsToMatter(
          client,
          ctx.tenantId,
          input.evidenceId,
          input.matterId,
        );
      }
      const result = await client.query<LitigationFactRow>(
        `
          INSERT INTO litigation_facts (
            tenant_id, matter_id, evidence_id, fact_code, fact_summary,
            fact_date, status, materiality, citation_refs, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9::text[], $10, $10)
          RETURNING
            fact_id, matter_id, evidence_id, fact_code, fact_summary, fact_date,
            status, materiality, citation_refs, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.evidenceId ?? null,
          input.factCode,
          input.factSummary,
          input.factDate ?? null,
          input.status,
          input.materiality,
          input.citationRefs,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const fact = parseFactRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_FACT_CHANGED',
          targetType: 'litigation_fact',
          targetId: fact.factId,
          matterId: fact.matterId,
          metadata: {
            matter_id: fact.matterId,
            fact_id: fact.factId,
            evidence_id: fact.evidenceId,
            status_after: fact.status,
            severity: fact.materiality,
          },
        },
        client,
      );
      return fact;
    });
  }

  async listFacts(
    ctx: PermissionContext,
    input: LitigationFactQueryDto,
  ): Promise<LitigationFactListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const facts = await this.queryFacts(client, scope.scope, input);
      return litigationFactListResponseSchema.parse({ matterId: input.matterId, facts });
    });
  }

  async createIssue(
    ctx: PermissionContext,
    input: CreateLitigationIssueRequestDto,
  ): Promise<LitigationIssueDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      if (input.parentIssueId) {
        await this.assertIssueBelongsToMatter(
          client,
          ctx.tenantId,
          input.parentIssueId,
          input.matterId,
        );
      }
      const result = await client.query<LitigationIssueRow>(
        `
          INSERT INTO litigation_issue_nodes (
            tenant_id, matter_id, parent_issue_id, issue_code, label,
            issue_type, status, position, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
          RETURNING
            issue_id, matter_id, parent_issue_id, issue_code, label,
            issue_type, status, position, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.parentIssueId ?? null,
          input.issueCode,
          input.label,
          input.issueType,
          input.status,
          input.position,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const issue = parseIssueRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_ISSUE_TREE_CHANGED',
          targetType: 'litigation_issue',
          targetId: issue.issueId,
          matterId: issue.matterId,
          metadata: {
            matter_id: issue.matterId,
            issue_node_id: issue.issueId,
            status_after: issue.status,
            priority: String(issue.position),
          },
        },
        client,
      );
      return issue;
    });
  }

  async listIssues(
    ctx: PermissionContext,
    input: LitigationIssueQueryDto,
  ): Promise<LitigationIssueListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const issues = await this.queryIssues(client, ctx.tenantId, input);
      return litigationIssueListResponseSchema.parse({ matterId: input.matterId, issues });
    });
  }

  async createPleading(
    ctx: PermissionContext,
    input: CreateLitigationPleadingRequestDto,
  ): Promise<LitigationPleadingDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    if (input.documentId) await this.assertCanReadDocument(ctx, input.documentId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const version = input.documentId
        ? await this.findDocumentVersion(client, ctx.tenantId, input.documentId, input.versionId)
        : null;
      if (input.documentId && (!version || version.matter_id !== input.matterId)) {
        throw validationFailed();
      }
      const result = await client.query<LitigationPleadingRow>(
        `
          INSERT INTO litigation_pleadings (
            tenant_id, matter_id, document_id, version_id, pleading_code,
            pleading_type, filing_status, internal_deadline, citation_refs,
            created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::text[], $10, $10)
          RETURNING
            pleading_id, matter_id, document_id, version_id, pleading_code,
            pleading_type, filing_status, internal_deadline, citation_refs,
            created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          version?.document_id ?? null,
          version?.version_id ?? null,
          input.pleadingCode,
          input.pleadingType,
          input.filingStatus,
          input.internalDeadline ?? null,
          input.citationRefs,
          ctx.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      const pleading = parsePleadingRow(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_PLEADING_CHANGED',
          targetType: 'litigation_pleading',
          targetId: pleading.pleadingId,
          matterId: pleading.matterId,
          metadata: {
            matter_id: pleading.matterId,
            pleading_id: pleading.pleadingId,
            document_id: pleading.documentId,
            version_id: pleading.versionId,
            pleading_type: pleading.pleadingType,
            filing_status: pleading.filingStatus,
          },
        },
        client,
      );
      return pleading;
    });
  }

  async listPleadings(
    ctx: PermissionContext,
    input: LitigationPleadingQueryDto,
  ): Promise<LitigationPleadingListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const pleadings = await this.queryPleadings(client, scope.scope, input);
      return litigationPleadingListResponseSchema.parse({
        matterId: input.matterId,
        pleadings,
      });
    });
  }

  async caseMap(
    ctx: PermissionContext,
    input: LitigationCaseMapQueryDto,
  ): Promise<LitigationCaseMapResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const evidence = await this.queryEvidence(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const facts = await this.queryFacts(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const issues = await this.queryIssues(client, ctx.tenantId, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const pleadings = await this.queryPleadings(client, scope.scope, {
        matterId: input.matterId,
        limit: input.limit,
      });
      const caseMap = buildCaseMap(evidence, facts, issues, pleadings).slice(0, input.limit);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'LIT_CASE_MAP_VIEWED',
          targetType: 'litigation_case_map',
          targetId: input.matterId,
          matterId: input.matterId,
          metadata: {
            matter_id: input.matterId,
            query_hash: sha256Hex(`lit-case-map:${input.matterId}:${input.limit}`),
            evidence_count: evidence.length,
            fact_count: facts.length,
            issue_node_count: issues.length,
            pleading_count: pleadings.length,
            case_map_count: caseMap.length,
            filter_refs: compactRules(scope.appliedRules ?? []),
          },
        },
        client,
      );
      return litigationCaseMapResponseSchema.parse({
        matterId: input.matterId,
        evidenceCount: evidence.length,
        factCount: facts.length,
        issueCount: issues.length,
        pleadingCount: pleadings.length,
        caseMap,
      });
    });
  }

  private async queryEvidence(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: LitigationEvidenceQueryDto,
  ): Promise<LitigationEvidenceDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status
      ? `AND lei.custody_status = $${params.push(input.status)}`
      : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationEvidenceRow>(
      `
        ${visibleDocsCte(filters.whereSql)}
        SELECT
          lei.evidence_id, lei.matter_id, lei.document_id, lei.version_id,
          lei.evidence_code, lei.evidence_type, lei.exhibit_label,
          lei.custody_status, lei.admitted_status, lei.source_hash,
          lei.created_at, lei.updated_at
        FROM litigation_evidence_items lei
        LEFT JOIN visible_docs vd
          ON vd.document_id = lei.document_id
        WHERE lei.matter_id = ${matterSql}::uuid
          AND (lei.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY lei.evidence_code, lei.created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseEvidenceRow);
  }

  private async queryFacts(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: LitigationFactQueryDto,
  ): Promise<LitigationFactDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status ? `AND lf.status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationFactRow>(
      `
        ${visibleDocsCte(filters.whereSql)}
        SELECT
          lf.fact_id, lf.matter_id, lf.evidence_id, lf.fact_code, lf.fact_summary,
          lf.fact_date, lf.status, lf.materiality, lf.citation_refs,
          lf.created_at, lf.updated_at
        FROM litigation_facts lf
        LEFT JOIN litigation_evidence_items lei
          ON lei.tenant_id = lf.tenant_id
          AND lei.evidence_id = lf.evidence_id
        LEFT JOIN visible_docs vd
          ON vd.document_id = lei.document_id
        WHERE lf.matter_id = ${matterSql}::uuid
          AND (lf.evidence_id IS NULL OR lei.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY lf.fact_date NULLS LAST, lf.fact_code, lf.created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseFactRow);
  }

  private async queryIssues(
    client: PoolClient,
    tenantId: string,
    input: LitigationIssueQueryDto,
  ): Promise<LitigationIssueDto[]> {
    const params: SearchSqlValue[] = [tenantId, input.matterId];
    const statusFilter = input.status ? `AND status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationIssueRow>(
      `
        SELECT
          issue_id, matter_id, parent_issue_id, issue_code, label, issue_type,
          status, position, created_at, updated_at
        FROM litigation_issue_nodes
        WHERE tenant_id = $1
          AND matter_id = $2
          ${statusFilter}
        ORDER BY position, issue_code, created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parseIssueRow);
  }

  private async queryPleadings(
    client: PoolClient,
    scope: SearchSqlFragment,
    input: LitigationPleadingQueryDto,
  ): Promise<LitigationPleadingDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status
      ? `AND lp.filing_status = $${params.push(input.status)}`
      : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query<LitigationPleadingRow>(
      `
        ${visibleDocsCte(filters.whereSql)}
        SELECT
          lp.pleading_id, lp.matter_id, lp.document_id, lp.version_id,
          lp.pleading_code, lp.pleading_type, lp.filing_status,
          lp.internal_deadline, lp.citation_refs, lp.created_at, lp.updated_at
        FROM litigation_pleadings lp
        LEFT JOIN visible_docs vd
          ON vd.document_id = lp.document_id
        WHERE lp.matter_id = ${matterSql}::uuid
          AND (lp.document_id IS NULL OR vd.document_id IS NOT NULL)
          ${statusFilter}
        ORDER BY lp.internal_deadline NULLS LAST, lp.pleading_code, lp.created_at DESC
        LIMIT ${limitSql}
      `,
      params,
    );
    return result.rows.map(parsePleadingRow);
  }

  private async findDocumentVersion(
    client: PoolClient,
    tenantId: string,
    documentId: string,
    versionId?: string,
  ): Promise<DocumentVersionRow | null> {
    const params: PgParam[] = [tenantId, documentId];
    const versionFilter = versionId
      ? `AND dv.version_id = $${params.push(versionId)}::uuid`
      : `AND dv.version_status = 'current'`;
    const result = await client.query<DocumentVersionRow>(
      `
        SELECT d.matter_id, d.document_id, dv.version_id
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          ${versionFilter}
        ORDER BY dv.created_at DESC
        LIMIT 1
      `,
      params,
    );
    return result.rows[0] ?? null;
  }

  private async assertCanReadMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    let allowed = false;
    try {
      const decision = await this.permissionService.canReadMatter(ctx, matterId);
      allowed = decision.effect === 'ALLOW';
    } catch {
      allowed = false;
    }
    if (!allowed) throw permissionDenied();
  }

  private async assertCanEditMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    let allowed = false;
    try {
      const decision = await this.permissionService.canEditMatter(ctx, matterId);
      allowed = decision.effect === 'ALLOW';
    } catch {
      allowed = false;
    }
    if (!allowed) throw permissionDenied();
  }

  private async assertCanReadDocument(ctx: PermissionContext, documentId: string): Promise<void> {
    let allowed = false;
    try {
      const decision = await this.documentPermission.canReadDocument(ctx, documentId);
      allowed = decision.effect === 'ALLOW';
    } catch {
      allowed = false;
    }
    if (!allowed) throw permissionDenied();
  }

  private async authorizedScope(ctx: PermissionContext): Promise<{
    scope: SearchSqlFragment;
    appliedRules?: string[];
  }> {
    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
    } catch {
      throw permissionDenied();
    }
    if (scopeDecision.effect !== 'ALLOW') throw permissionDenied();
    return scopeDecision;
  }

  private async assertEvidenceBelongsToMatter(
    client: PoolClient,
    tenantId: string,
    evidenceId: string,
    matterId: string,
  ): Promise<void> {
    const result = await client.query<{ evidence_id: string }>(
      `
        SELECT evidence_id
        FROM litigation_evidence_items
        WHERE tenant_id = $1
          AND evidence_id = $2
          AND matter_id = $3
        LIMIT 1
      `,
      [tenantId, evidenceId, matterId],
    );
    if (!result.rows[0]) throw validationFailed();
  }

  private async assertIssueBelongsToMatter(
    client: PoolClient,
    tenantId: string,
    issueId: string,
    matterId: string,
  ): Promise<void> {
    const result = await client.query<{ issue_id: string }>(
      `
        SELECT issue_id
        FROM litigation_issue_nodes
        WHERE tenant_id = $1
          AND issue_id = $2
          AND matter_id = $3
        LIMIT 1
      `,
      [tenantId, issueId, matterId],
    );
    if (!result.rows[0]) throw validationFailed();
  }
}

function visibleDocsCte(whereSql: string): string {
  return `
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
    ),
    visible_docs AS (
      SELECT idx.document_id
      FROM idx
      ${whereSql}
    )
  `;
}

function parseEvidenceRow(row: LitigationEvidenceRow): LitigationEvidenceDto {
  return litigationEvidenceSchema.parse({
    evidenceId: row.evidence_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    evidenceCode: row.evidence_code,
    evidenceType: row.evidence_type,
    exhibitLabel: row.exhibit_label,
    custodyStatus: row.custody_status,
    admittedStatus: row.admitted_status,
    sourceHash: row.source_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseFactRow(row: LitigationFactRow): LitigationFactDto {
  return litigationFactSchema.parse({
    factId: row.fact_id,
    matterId: row.matter_id,
    evidenceId: row.evidence_id,
    factCode: row.fact_code,
    factSummary: row.fact_summary,
    factDate: row.fact_date ? dateOnly(row.fact_date) : null,
    status: row.status,
    materiality: row.materiality,
    citationRefs: row.citation_refs,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseIssueRow(row: LitigationIssueRow): LitigationIssueDto {
  return litigationIssueSchema.parse({
    issueId: row.issue_id,
    matterId: row.matter_id,
    parentIssueId: row.parent_issue_id,
    issueCode: row.issue_code,
    label: row.label,
    issueType: row.issue_type,
    status: row.status,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parsePleadingRow(row: LitigationPleadingRow): LitigationPleadingDto {
  return litigationPleadingSchema.parse({
    pleadingId: row.pleading_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    pleadingCode: row.pleading_code,
    pleadingType: row.pleading_type,
    filingStatus: row.filing_status,
    internalDeadline: row.internal_deadline ? dateOnly(row.internal_deadline) : null,
    citationRefs: row.citation_refs,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function buildCaseMap(
  evidence: LitigationEvidenceDto[],
  facts: LitigationFactDto[],
  issues: LitigationIssueDto[],
  pleadings: LitigationPleadingDto[],
): LitigationCaseMapItemDto[] {
  const byEvidence = new Map(evidence.map((item) => [item.evidenceId, item]));
  const rootIssue = issues[0] ?? null;
  const byDocumentPleading = new Map(
    pleadings
      .filter((pleading) => pleading.documentId)
      .map((pleading) => [pleading.documentId as string, pleading]),
  );
  const items: LitigationCaseMapItemDto[] = [];
  for (const item of evidence) {
    const linkedFacts = facts.filter((fact) => fact.evidenceId === item.evidenceId);
    const pleading = item.documentId ? byDocumentPleading.get(item.documentId) ?? null : null;
    if (linkedFacts.length === 0) {
      items.push(caseMapItem(item, null, rootIssue, pleading));
      continue;
    }
    for (const fact of linkedFacts) {
      items.push(caseMapItem(item, fact, rootIssue, pleading));
    }
  }
  for (const fact of facts) {
    if (fact.evidenceId && byEvidence.has(fact.evidenceId)) continue;
    items.push(caseMapItem(null, fact, rootIssue, null));
  }
  for (const pleading of pleadings) {
    if (pleading.documentId && evidence.some((item) => item.documentId === pleading.documentId)) {
      continue;
    }
    items.push(caseMapItem(null, null, rootIssue, pleading));
  }
  return items;
}

function caseMapItem(
  evidence: LitigationEvidenceDto | null,
  fact: LitigationFactDto | null,
  issue: LitigationIssueDto | null,
  pleading: LitigationPleadingDto | null,
): LitigationCaseMapItemDto {
  return {
    evidenceId: evidence?.evidenceId ?? null,
    factId: fact?.factId ?? null,
    issueId: issue?.issueId ?? null,
    pleadingId: pleading?.pleadingId ?? null,
    documentId: evidence?.documentId ?? pleading?.documentId ?? null,
    statusRefs: [
      evidence ? `evidence:${evidence.custodyStatus}` : null,
      fact ? `fact:${fact.status}` : null,
      issue ? `issue:${issue.status}` : null,
      pleading ? `pleading:${pleading.filingStatus}` : null,
    ].filter((value): value is string => value !== null),
    citationRefs: [...(fact?.citationRefs ?? []), ...(pleading?.citationRefs ?? [])].slice(0, 20),
  };
}

function dateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compactRules(rules: readonly string[]): string[] {
  return rules.map((rule) => sha256Hex(rule).slice(0, 16)).slice(0, 20);
}
