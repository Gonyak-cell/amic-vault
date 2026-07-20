import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  litigationAiSuggestionListResponseSchema,
  litigationAiSuggestionSchema,
  type CreateLitigationAiSuggestionRequestDto,
  type LitigationAiSuggestionDto,
  type LitigationAiSuggestionListResponseDto,
  type LitigationAiSuggestionQueryDto,
  type PermissionContext,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
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

interface LitigationAiSuggestionRow {
  suggestion_id: string;
  matter_id: string;
  document_id: string;
  version_id: string | null;
  suggestion_kind: string;
  suggested_evidence_direction: string;
  suggested_evidence_type: string;
  suggested_issue_title: string | null;
  confidence: string | number;
  source_artifact_id: string | null;
  source_hash: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface DocumentVersionRow {
  matter_id: string;
  document_id: string;
  version_id: string;
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class LitigationAiClassifierService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentPermissionService)
    private readonly documentPermission: DocumentPermissionService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Inject(SearchFilterBuilder) private readonly filterBuilder: SearchFilterBuilder,
  ) {}

  async createSuggestion(
    ctx: PermissionContext,
    input: CreateLitigationAiSuggestionRequestDto,
  ): Promise<LitigationAiSuggestionDto> {
    await this.assertCanEditMatter(ctx, input.matterId);
    await this.assertCanReadDocument(ctx, input.documentId);

    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const version = await this.findDocumentVersion(
        client,
        ctx.tenantId,
        input.documentId,
        input.versionId,
      );
      if (!version || version.matter_id !== input.matterId) throw validationFailed();
      if (input.sourceArtifactId) {
        await this.assertSourceArtifactBelongsToSuggestion(
          client,
          ctx.tenantId,
          input.sourceArtifactId,
          input.matterId,
          input.documentId,
          version.version_id,
        );
      }

      return this.insertSuggestion(client, {
        tenantId: ctx.tenantId,
        matterId: input.matterId,
        documentId: input.documentId,
        versionId: version.version_id,
        suggestionKind: input.suggestionKind,
        suggestedEvidenceDirection: input.suggestedEvidenceDirection,
        suggestedEvidenceType: input.suggestedEvidenceType,
        suggestedIssueTitle: input.suggestedIssueTitle ?? null,
        confidence: input.confidence,
        sourceArtifactId: input.sourceArtifactId ?? null,
        sourceHash: input.sourceHash,
        createdBy: ctx.userId,
        auditActorType: 'user',
        auditActorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
      });
    });
  }

  async suggestFromAiPrepArtifact(
    client: QueryClient,
    input: {
      tenantId: string;
      matterId: string;
      documentId: string;
      versionId: string;
      sourceArtifactId: string;
      sourceHash: string;
      actorUserId: string;
      suggestedEvidenceDirection: 'gap' | 'eul';
      suggestedEvidenceType: 'document' | 'email' | 'testimony' | 'exhibit' | 'expert' | 'other';
      suggestedIssueTitle?: string | null | undefined;
      confidence: number;
    },
  ): Promise<LitigationAiSuggestionDto> {
    await this.assertSourceArtifactBelongsToSuggestion(
      client,
      input.tenantId,
      input.sourceArtifactId,
      input.matterId,
      input.documentId,
      input.versionId,
    );
    return this.insertSuggestion(client, {
      tenantId: input.tenantId,
      matterId: input.matterId,
      documentId: input.documentId,
      versionId: input.versionId,
      suggestionKind: input.suggestedIssueTitle
        ? 'issue_evidence_mapping'
        : 'evidence_classification',
      suggestedEvidenceDirection: input.suggestedEvidenceDirection,
      suggestedEvidenceType: input.suggestedEvidenceType,
      suggestedIssueTitle: input.suggestedIssueTitle ?? null,
      confidence: input.confidence,
      sourceArtifactId: input.sourceArtifactId,
      sourceHash: input.sourceHash,
      createdBy: input.actorUserId,
      auditActorType: 'system',
      auditActorId: null,
      sessionId: null,
    });
  }

  async listSuggestions(
    ctx: PermissionContext,
    input: LitigationAiSuggestionQueryDto,
  ): Promise<LitigationAiSuggestionListResponseDto> {
    await this.assertCanReadMatter(ctx, input.matterId);
    const scope = await this.authorizedScope(ctx);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const suggestions = await this.querySuggestions(client, scope.scope, input);
      return litigationAiSuggestionListResponseSchema.parse({
        matterId: input.matterId,
        suggestions,
      });
    });
  }

  private async querySuggestions(
    client: QueryClient,
    scope: SearchSqlFragment,
    input: LitigationAiSuggestionQueryDto,
  ): Promise<LitigationAiSuggestionDto[]> {
    const filters = this.filterBuilder.build({ filters: { matterId: input.matterId }, scope });
    const params: SearchSqlValue[] = [...filters.params];
    const matterSql = `$${params.push(input.matterId)}`;
    const statusFilter = input.status ? `AND las.status = $${params.push(input.status)}` : '';
    const limitSql = `$${params.push(input.limit)}`;
    const result = await client.query(
      `
        ${visibleDocsCte(filters.whereSql)}
        SELECT
          las.suggestion_id, las.matter_id, las.document_id, las.version_id,
          las.suggestion_kind, las.suggested_evidence_direction,
          las.suggested_evidence_type, las.suggested_issue_title,
          las.confidence, las.source_artifact_id, las.source_hash,
          las.status, las.created_at, las.updated_at
        FROM litigation_ai_suggestions las
        JOIN visible_docs vd
          ON vd.document_id = las.document_id
        WHERE las.matter_id = ${matterSql}::uuid
          ${statusFilter}
        ORDER BY las.created_at DESC, las.suggestion_id
        LIMIT ${limitSql}
      `,
      params,
    );
    return (result.rows as LitigationAiSuggestionRow[]).map(parseSuggestionRow);
  }

  private async findDocumentVersion(
    client: QueryClient,
    tenantId: string,
    documentId: string,
    versionId?: string,
  ): Promise<DocumentVersionRow | null> {
    const params: Array<string> = [tenantId, documentId];
    const versionFilter = versionId
      ? `AND dv.version_id = $${params.push(versionId)}::uuid`
      : `AND dv.version_status = 'current'`;
    const result = await client.query(
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
    return (result.rows[0] as DocumentVersionRow | undefined) ?? null;
  }

  private async assertSourceArtifactBelongsToSuggestion(
    client: QueryClient,
    tenantId: string,
    artifactId: string,
    matterId: string,
    documentId: string,
    versionId: string,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT ai_prep_artifact_id
        FROM ai_prep_artifacts
        WHERE tenant_id = $1
          AND ai_prep_artifact_id = $2
          AND matter_id = $3
          AND document_id = $4
          AND document_version_id = $5
        LIMIT 1
      `,
      [tenantId, artifactId, matterId, documentId, versionId],
    );
    if (!result.rows[0]) throw validationFailed();
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

  private async insertSuggestion(
    client: QueryClient,
    input: {
      tenantId: string;
      matterId: string;
      documentId: string;
      versionId: string;
      suggestionKind: 'evidence_classification' | 'issue_evidence_mapping';
      suggestedEvidenceDirection: 'gap' | 'eul';
      suggestedEvidenceType: 'document' | 'email' | 'testimony' | 'exhibit' | 'expert' | 'other';
      suggestedIssueTitle: string | null;
      confidence: number;
      sourceArtifactId: string | null;
      sourceHash: string;
      createdBy: string;
      auditActorType: 'user' | 'system';
      auditActorId: string | null;
      sessionId: string | null;
    },
  ): Promise<LitigationAiSuggestionDto> {
    const result = await client.query(
      `
        INSERT INTO litigation_ai_suggestions (
          tenant_id, matter_id, document_id, version_id, suggestion_kind,
          suggested_evidence_direction, suggested_evidence_type, suggested_issue_title,
          confidence, source_artifact_id, source_hash, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::numeric, $10, lower($11), $12)
        RETURNING
          suggestion_id, matter_id, document_id, version_id, suggestion_kind,
          suggested_evidence_direction, suggested_evidence_type, suggested_issue_title,
          confidence, source_artifact_id, source_hash, status, created_at, updated_at
      `,
      [
        input.tenantId,
        input.matterId,
        input.documentId,
        input.versionId,
        input.suggestionKind,
        input.suggestedEvidenceDirection,
        input.suggestedEvidenceType,
        input.suggestedIssueTitle,
        input.confidence,
        input.sourceArtifactId,
        input.sourceHash,
        input.createdBy,
      ],
    );
    const row = result.rows[0] as LitigationAiSuggestionRow | undefined;
    if (!row) throw validationFailed();
    const suggestion = parseSuggestionRow(row);
    await this.auditService.log(
      {
        tenantId: input.tenantId,
        actorType: input.auditActorType,
        actorId: input.auditActorId,
        sessionId: input.sessionId,
        action: 'LIT_EVIDENCE_CHANGED',
        targetType: 'litigation_ai_suggestion',
        targetId: suggestion.suggestionId,
        matterId: suggestion.matterId,
        metadata: {
          matter_id: suggestion.matterId,
          document_id: suggestion.documentId,
          version_id: suggestion.versionId,
          ai_prep_artifact_id: suggestion.sourceArtifactId,
          hash: suggestion.sourceHash,
          confidence: suggestion.confidence,
          evidence_type: suggestion.suggestedEvidenceType,
          status_after: suggestion.status,
        },
      },
      client,
    );
    return suggestion;
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

function parseSuggestionRow(row: LitigationAiSuggestionRow): LitigationAiSuggestionDto {
  return litigationAiSuggestionSchema.parse({
    suggestionId: row.suggestion_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    versionId: row.version_id,
    suggestionKind: row.suggestion_kind,
    suggestedEvidenceDirection: row.suggested_evidence_direction,
    suggestedEvidenceType: row.suggested_evidence_type,
    suggestedIssueTitle: row.suggested_issue_title,
    confidence: Number(row.confidence),
    sourceArtifactId: row.source_artifact_id,
    sourceHash: row.source_hash,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
