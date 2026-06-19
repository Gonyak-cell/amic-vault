import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { isMatterMutationBlockedState, isMatterState } from '@amic-vault/domain';
import type {
  DocumentConfidentialityLevel,
  DocumentDto,
  DocumentExtractionMethod,
  DocumentExtractionStatus,
  DocumentListDto,
  DocumentPrivilegeStatus,
  DocumentStatus,
  DocumentType,
  ListDocumentSort,
  ListDocumentsQueryDto,
  PermissionDecision,
  TenantId,
  UpdateDocumentMetadataDto,
  UpdateLegalHoldDto,
  UserRole,
} from '@amic-vault/shared';
import { buildSafeLabel } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { markAndAuditAiPrepArtifactsStale } from '../ai/prep/ai-prep-lifecycle';
import { documentMetadataChangedAudit, documentViewedAudit } from '../audit/events/document-events';
import { PermissionService } from '../permission/permission.service';
import { SearchIndexSyncHook } from '../search/index/index-sync.hook';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
} from '../search/permission/search-permission-scope.provider';
import type { SearchSqlFragment } from '../search/query/search-filter.builder';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { assertDocumentMutationAllowed } from './guards/immutable-state.guard';

const documentMetadataDiffOrder = [
  'title',
  'document_type',
  'subtype',
  'confidentiality_level',
] as const;

export interface CreateDraftDocumentInput {
  documentId: string;
  tenantId: string;
  matterId: string;
  documentFamilyId: string;
  title: string;
  documentType?: DocumentType | undefined;
  subtype?: string | null | undefined;
  confidentialityLevel?: DocumentConfidentialityLevel | undefined;
  privilegeStatus?: DocumentPrivilegeStatus | undefined;
  aiAllowed?: boolean | undefined;
  createdBy: string;
}

interface DocumentRow {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  matter_name?: string | null;
  matter_code?: string | null;
  document_family_id: string;
  title: string;
  status: DocumentStatus;
  document_type: DocumentType;
  subtype: string | null;
  confidentiality_level: DocumentConfidentialityLevel;
  privilege_status: DocumentPrivilegeStatus;
  ai_allowed: boolean;
  legal_hold: boolean;
  version_id?: string | null;
  extraction_status?: DocumentExtractionStatus | null;
  extraction_method?: DocumentExtractionMethod | null;
  extraction_confidence?: number | null;
  created_by: string;
  created_at: Date;
  updated_at: Date | null;
}

interface DocumentWithMatterRow extends DocumentRow {
  matter_status: string;
}

interface IndexedDocumentListRow extends DocumentRow {
  total: number | string;
}

function mapDocument(row: DocumentRow): DocumentDto {
  const document: DocumentDto = {
    documentId: row.document_id,
    tenantId: row.tenant_id,
    matterId: row.matter_id,
    matterDisplayName: row.matter_name ?? null,
    matterDisplayCode: row.matter_code ?? null,
    documentFamilyId: row.document_family_id,
    title: row.title,
    displayName: row.title,
    safeLabel: buildSafeLabel(row.title),
    canViewSensitiveRef: false,
    status: row.status,
    documentType: row.document_type,
    subtype: row.subtype,
    confidentialityLevel: row.confidentiality_level,
    privilegeStatus: row.privilege_status,
    aiAllowed: row.ai_allowed,
    legalHold: row.legal_hold,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: (row.updated_at ?? row.created_at).toISOString(),
  };
  if ('extraction_status' in row) {
    document.extractionStatus = row.extraction_status ?? null;
    document.extractionMethod = row.extraction_method ?? null;
    document.extractionConfidence = row.extraction_confidence ?? null;
  }
  return document;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function documentLocked(): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function canonicalDocumentMetadata(row: DocumentRow): string {
  return JSON.stringify({
    confidentiality_level: row.confidentiality_level,
    document_type: row.document_type,
    subtype: row.subtype,
    title: row.title,
  });
}

function metadataRef(row: DocumentRow): string {
  return `document_metadata:${createHash('sha256')
    .update(canonicalDocumentMetadata(row))
    .digest('hex')}`;
}

function documentMetadataDiffKeys(
  before: DocumentRow,
  input: UpdateDocumentMetadataDto,
): Array<(typeof documentMetadataDiffOrder)[number]> {
  return documentMetadataDiffOrder.filter((key) => {
    if (key === 'title') return input.title !== undefined && input.title !== before.title;
    if (key === 'document_type') {
      return input.documentType !== undefined && input.documentType !== before.document_type;
    }
    if (key === 'subtype') return input.subtype !== undefined && input.subtype !== before.subtype;
    return (
      input.confidentialityLevel !== undefined &&
      input.confidentialityLevel !== before.confidentiality_level
    );
  });
}

function isLegalHoldAdminRole(role: UserRole): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

function pushParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function bindSearchScope(scope: SearchSqlFragment): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let nextParam = 0;
  const sql = scope.sql.replace(/\?/g, () => {
    if (nextParam >= scope.params.length) {
      throw new Error('Search SQL fragment has fewer params than placeholders');
    }
    params.push(scope.params[nextParam]);
    nextParam += 1;
    return `$${params.length}`;
  });
  if (nextParam !== scope.params.length) {
    throw new Error('Search SQL fragment has more params than placeholders');
  }
  return { sql, params };
}

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function documentListOrderBy(sortBy: ListDocumentSort | undefined): string {
  switch (sortBy) {
    case 'updated_asc':
      return 'idx.updated_at ASC, idx.document_id ASC';
    case 'title_asc':
      return 'lower(idx.title) ASC, idx.document_id ASC';
    case 'matter_asc':
      return "lower(coalesce(m.matter_code, '')) ASC, lower(m.matter_name) ASC, idx.document_id ASC";
    case 'type_asc':
      return 'idx.document_type ASC, lower(idx.title) ASC, idx.document_id ASC';
    case 'status_asc':
      return 'doc.status ASC, idx.updated_at DESC, idx.document_id ASC';
    case 'updated_desc':
    default:
      return 'idx.updated_at DESC, idx.document_id ASC';
  }
}

function documentListFilterClauses(params: unknown[], input: ListDocumentsQueryDto): string[] {
  const clauses: string[] = [];
  if (input.title) {
    clauses.push(`AND idx.title ILIKE ${pushParam(params, likeContains(input.title))} ESCAPE '\\'`);
  }
  if (input.matterCode) {
    clauses.push(
      `AND m.matter_code ILIKE ${pushParam(params, likeContains(input.matterCode))} ESCAPE '\\'`,
    );
  }
  if (input.matterName) {
    clauses.push(
      `AND m.matter_name ILIKE ${pushParam(params, likeContains(input.matterName))} ESCAPE '\\'`,
    );
  }
  if (input.documentType) {
    clauses.push(`AND idx.document_type = ${pushParam(params, input.documentType)}`);
  }
  if (input.status) {
    clauses.push(`AND doc.status = ${pushParam(params, input.status)}`);
  }
  if (input.confidentialityLevel) {
    clauses.push(
      `AND doc.confidentiality_level = ${pushParam(params, input.confidentialityLevel)}`,
    );
  }
  if (input.privilegeStatus) {
    clauses.push(`AND doc.privilege_status = ${pushParam(params, input.privilegeStatus)}`);
  }
  if (input.extractionStatus) {
    clauses.push(
      `AND coalesce(cd.extraction_status, 'pending') = ${pushParam(params, input.extractionStatus)}`,
    );
  }
  if (input.aiAllowed !== undefined) {
    clauses.push(`AND doc.ai_allowed = ${pushParam(params, input.aiAllowed)}`);
  }
  if (input.legalHold !== undefined) {
    clauses.push(`AND doc.legal_hold = ${pushParam(params, input.legalHold)}`);
  }
  return clauses;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @Inject(AuditService) private readonly auditService?: AuditService,
    @Inject(PermissionService) private readonly permissionService?: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext?: TenantContextService,
    @Inject(UserService) private readonly userService?: UserService,
    @Optional()
    @Inject(SearchIndexSyncHook)
    private readonly searchIndexSync?: SearchIndexSyncHook,
    @Optional()
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly searchPermissionScope?: SearchPermissionScopeProvider,
  ) {}

  async createDraft(input: CreateDraftDocumentInput, client: PoolClient): Promise<DocumentDto> {
    const result = await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          document_type, subtype, confidentiality_level, privilege_status, ai_allowed, created_by
        )
        VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11)
        RETURNING document_id, tenant_id, matter_id, document_family_id, title,
          status, document_type, subtype, confidentiality_level, privilege_status,
          ai_allowed, legal_hold, created_by, created_at, updated_at
      `,
      [
        input.documentId,
        input.tenantId,
        input.matterId,
        input.documentFamilyId,
        input.title,
        input.documentType ?? 'other',
        input.subtype ?? null,
        input.confidentialityLevel ?? 'standard',
        input.privilegeStatus ?? 'none',
        input.aiAllowed ?? false,
        input.createdBy,
      ],
    );
    const row = result.rows[0] as DocumentRow | undefined;
    if (!row) throw new Error('document insert returned no row');
    return mapDocument(row);
  }

  async updateMetadata(
    actorUserId: string,
    documentId: string,
    input: UpdateDocumentMetadataDto,
  ): Promise<DocumentDto> {
    const auditService = this.requireAuditService();
    const context = this.requireTenantContext().require();

    return auditService.transaction(context.tenantId, async (tx) => {
      const before = await this.findByIdForTenant(context.tenantId, documentId, tx);
      if (!before) throw notFoundDenied();
      await this.assertCanEditMatter(context.tenantId, actorUserId, before.matter_id);
      this.assertMatterMutationAllowed(before.matter_status);
      assertDocumentMutationAllowed({
        documentStatus: before.status,
        matterStatus: before.matter_status,
      });
      const diffKeys = documentMetadataDiffKeys(before, input);
      if (diffKeys.length === 0) return mapDocument(before);

      const updated = await this.updateDocumentMetadata(tx, context.tenantId, documentId, input);
      if (!updated) throw notFoundDenied();
      await auditService.log(
        documentMetadataChangedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: updated.matter_id,
          diffKeys,
          beforeRef: metadataRef(before),
          afterRef: metadataRef(updated),
        }),
        tx,
      );
      await markAndAuditAiPrepArtifactsStale(auditService, tx, {
        tenantId: context.tenantId,
        actorId: actorUserId,
        documentId,
        staleReason: 'document_metadata_changed',
      });
      await this.searchIndexSync?.enqueueCurrentVersionForDocument(
        { tenantId: context.tenantId, documentId },
        tx,
      );
      return mapDocument(updated);
    });
  }

  async getDocument(actorUserId: string, documentId: string): Promise<DocumentDto> {
    const auditService = this.requireAuditService();
    const context = this.requireTenantContext().require();

    return auditService.transaction(context.tenantId, async (tx) => {
      const document = await this.findByIdWithExtractionForTenant(context.tenantId, documentId, tx);
      if (!document) throw notFoundDenied();
      await this.assertCanReadDocument(context.tenantId, actorUserId, documentId);
      if (!document.version_id) throw validationFailed('DOCUMENT_VERSION_REQUIRED');
      await auditService.log(
        documentViewedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: document.matter_id,
          versionId: document.version_id,
          channel: 'detail',
        }),
        tx,
      );
      return mapDocument(document);
    });
  }

  async listMatterDocuments(
    actorUserId: string,
    matterId: string,
    input: ListDocumentsQueryDto,
  ): Promise<DocumentListDto> {
    const auditService = this.requireAuditService();
    const context = this.requireTenantContext().require();
    const scopeDecision = await this.requireSearchPermissionScope().scopeForSearch({
      tenantId: context.tenantId,
      userId: actorUserId,
    });
    if (scopeDecision.effect !== 'ALLOW') throw permissionDenied();

    return auditService.transaction(context.tenantId, async (tx) => {
      const bound = bindSearchScope(scopeDecision.scope);
      const params = [...bound.params];
      const matterParam = pushParam(params, matterId);
      const deletedParam = pushParam(params, 'deleted');
      const currentParam = pushParam(params, 'current');
      const filterClauses = documentListFilterClauses(params, input);
      const limitParam = pushParam(params, input.pageSize);
      const offsetParam = pushParam(params, (input.page - 1) * input.pageSize);
      const result = await tx.query(
        `
          SELECT
            doc.document_id,
            doc.tenant_id,
            doc.matter_id,
            m.matter_name,
            m.matter_code,
            doc.document_family_id,
            idx.title,
            doc.status,
            idx.document_type,
            doc.subtype,
            doc.confidentiality_level,
            doc.privilege_status,
            doc.ai_allowed,
            doc.legal_hold,
            cd.extraction_status,
            cd.extraction_method,
            cd.confidence::float8 AS extraction_confidence,
            doc.created_by,
            doc.created_at,
            doc.updated_at,
            count(*) OVER() AS total
          FROM document_search_index idx
          JOIN documents doc
            ON doc.tenant_id = idx.tenant_id
           AND doc.document_id = idx.document_id
          JOIN matters m
            ON m.tenant_id = idx.tenant_id
           AND m.matter_id = idx.matter_id
          LEFT JOIN canonical_documents cd
            ON cd.tenant_id = idx.tenant_id
           AND cd.version_id = idx.version_id
          WHERE (${bound.sql})
            AND idx.matter_id = ${matterParam}::uuid
            AND idx.document_status <> ${deletedParam}
            AND idx.version_status = ${currentParam}
            ${filterClauses.join('\n            ')}
          ORDER BY ${documentListOrderBy(input.sortBy)}
          LIMIT ${limitParam}
          OFFSET ${offsetParam}
        `,
        params,
      );
      const rows = result.rows as IndexedDocumentListRow[];
      return {
        items: rows.map((row) => mapDocument(row)),
        totalCount: rows[0] ? Number(rows[0].total) : 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  async listDocuments(actorUserId: string, input: ListDocumentsQueryDto): Promise<DocumentListDto> {
    const auditService = this.requireAuditService();
    const context = this.requireTenantContext().require();
    const scopeDecision = await this.requireSearchPermissionScope().scopeForSearch({
      tenantId: context.tenantId,
      userId: actorUserId,
    });
    if (scopeDecision.effect !== 'ALLOW') throw permissionDenied();

    return auditService.transaction(context.tenantId, async (tx) => {
      const bound = bindSearchScope(scopeDecision.scope);
      const params = [...bound.params];
      const deletedParam = pushParam(params, 'deleted');
      const currentParam = pushParam(params, 'current');
      const filterClauses = documentListFilterClauses(params, input);
      const limitParam = pushParam(params, input.pageSize);
      const offsetParam = pushParam(params, (input.page - 1) * input.pageSize);
      const result = await tx.query(
        `
          SELECT
            doc.document_id,
            doc.tenant_id,
            doc.matter_id,
            m.matter_name,
            m.matter_code,
            doc.document_family_id,
            idx.title,
            doc.status,
            idx.document_type,
            doc.subtype,
            doc.confidentiality_level,
            doc.privilege_status,
            doc.ai_allowed,
            doc.legal_hold,
            cd.extraction_status,
            cd.extraction_method,
            cd.confidence::float8 AS extraction_confidence,
            doc.created_by,
            doc.created_at,
            doc.updated_at,
            count(*) OVER() AS total
          FROM document_search_index idx
          JOIN documents doc
            ON doc.tenant_id = idx.tenant_id
           AND doc.document_id = idx.document_id
          JOIN matters m
            ON m.tenant_id = idx.tenant_id
           AND m.matter_id = idx.matter_id
          LEFT JOIN canonical_documents cd
            ON cd.tenant_id = idx.tenant_id
           AND cd.version_id = idx.version_id
          WHERE (${bound.sql})
            AND idx.document_status <> ${deletedParam}
            AND idx.version_status = ${currentParam}
            ${filterClauses.join('\n            ')}
          ORDER BY ${documentListOrderBy(input.sortBy)}
          LIMIT ${limitParam}
          OFFSET ${offsetParam}
        `,
        params,
      );
      const rows = result.rows as IndexedDocumentListRow[];
      return {
        items: rows.map((row) => mapDocument(row)),
        totalCount: rows[0] ? Number(rows[0].total) : 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }

  async updateLegalHold(
    actorUserId: string,
    documentId: string,
    input: UpdateLegalHoldDto,
  ): Promise<DocumentDto> {
    const auditService = this.requireAuditService();
    const context = this.requireTenantContext().require();
    await this.assertLegalHoldAdmin(context.tenantId, actorUserId);

    return auditService.transaction(context.tenantId, async (tx) => {
      const before = await this.findByIdForTenant(context.tenantId, documentId, tx);
      if (!before) throw notFoundDenied();
      if (before.legal_hold === input.legalHold) return mapDocument(before);

      const updated = await this.updateDocumentLegalHold(
        tx,
        context.tenantId,
        documentId,
        input.legalHold,
      );
      if (!updated) throw notFoundDenied();
      await auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'LEGAL_HOLD_CHANGED',
          targetType: 'document',
          targetId: documentId,
          matterId: updated.matter_id,
          metadata: {
            document_id: documentId,
            matter_id: updated.matter_id,
            before_ref: `legal_hold:${before.legal_hold}`,
            after_ref: `legal_hold:${updated.legal_hold}`,
          },
        },
        tx,
      );
      return mapDocument(updated);
    });
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.requirePermissionService().canEditMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', matterId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }

  private async assertCanReadDocument(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.requirePermissionService().canReadDocument(
        { tenantId, userId: actorUserId },
        documentId,
      );
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'DOCUMENT_LOCKED') throw documentLocked();
    throw notFoundDenied();
  }

  private assertMatterMutationAllowed(status: string): void {
    if (!isMatterState(status)) throw validationFailed();
    if (isMatterMutationBlockedState(status)) throw validationFailed('MATTER_MUTATION_BLOCKED');
  }

  private requireSearchPermissionScope(): SearchPermissionScopeProvider {
    if (!this.searchPermissionScope) throw permissionDenied();
    return this.searchPermissionScope;
  }

  private async assertLegalHoldAdmin(tenantId: TenantId, actorUserId: string): Promise<void> {
    const actor = await this.requireUserService().findByTenantAndId(tenantId, actorUserId);
    if (!actor || !isLegalHoldAdminRole(actor.role)) throw permissionDenied();
  }

  private async findByIdForTenant(
    tenantId: TenantId,
    documentId: string,
    queryClient: QueryClient,
  ): Promise<DocumentWithMatterRow | null> {
    const result = await queryClient.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.document_family_id, d.title,
          d.status, d.document_type, d.subtype, d.confidentiality_level, d.privilege_status,
          d.ai_allowed, d.legal_hold, d.created_by, d.created_at, d.updated_at,
          m.status AS matter_status
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as DocumentWithMatterRow | undefined) ?? null;
  }

  private async findByIdWithExtractionForTenant(
    tenantId: TenantId,
    documentId: string,
    queryClient: QueryClient,
  ): Promise<DocumentWithMatterRow | null> {
    const result = await queryClient.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.document_family_id, d.title,
          d.status, d.document_type, d.subtype, d.confidentiality_level, d.privilege_status,
          d.ai_allowed, d.legal_hold, dv.version_id, cd.extraction_status, cd.extraction_method,
          cd.confidence::float8 AS extraction_confidence,
          d.created_by, d.created_at, d.updated_at, m.status AS matter_status
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
          AND cd.version_id = dv.version_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as DocumentWithMatterRow | undefined) ?? null;
  }

  private async updateDocumentMetadata(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
    input: UpdateDocumentMetadataDto,
  ): Promise<DocumentWithMatterRow | null> {
    const params: unknown[] = [tenantId, documentId];
    const sets: string[] = [];
    if (input.title !== undefined) {
      params.push(input.title);
      sets.push(`title = $${params.length}`);
    }
    if (input.documentType !== undefined) {
      params.push(input.documentType);
      sets.push(`document_type = $${params.length}`);
    }
    if (input.subtype !== undefined) {
      params.push(input.subtype);
      sets.push(`subtype = $${params.length}`);
    }
    if (input.confidentialityLevel !== undefined) {
      params.push(input.confidentialityLevel);
      sets.push(`confidentiality_level = $${params.length}`);
    }
    sets.push('updated_at = now()');

    const result = await client.query(
      `
        UPDATE documents d
        SET ${sets.join(', ')}
        FROM matters m
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        RETURNING d.document_id, d.tenant_id, d.matter_id, d.document_family_id, d.title,
          d.status, d.document_type, d.subtype, d.confidentiality_level, d.privilege_status,
          d.ai_allowed, d.legal_hold, d.created_by, d.created_at, d.updated_at,
          m.status AS matter_status
      `,
      params,
    );
    return (result.rows[0] as DocumentWithMatterRow | undefined) ?? null;
  }

  private async updateDocumentLegalHold(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
    legalHold: boolean,
  ): Promise<DocumentWithMatterRow | null> {
    const result = await client.query(
      `
        UPDATE documents d
        SET legal_hold = $3,
            updated_at = now()
        FROM matters m
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        RETURNING d.document_id, d.tenant_id, d.matter_id, d.document_family_id, d.title,
          d.status, d.document_type, d.subtype, d.confidentiality_level, d.privilege_status,
          d.ai_allowed, d.legal_hold, d.created_by, d.created_at, d.updated_at,
          m.status AS matter_status
      `,
      [tenantId, documentId, legalHold],
    );
    return (result.rows[0] as DocumentWithMatterRow | undefined) ?? null;
  }

  private requireAuditService(): AuditService {
    if (!this.auditService) throw new Error('AuditService is required');
    return this.auditService;
  }

  private requirePermissionService(): PermissionService {
    if (!this.permissionService) throw new Error('PermissionService is required');
    return this.permissionService;
  }

  private requireTenantContext(): TenantContextService {
    if (!this.tenantContext) throw new Error('TenantContextService is required');
    return this.tenantContext;
  }

  private requireUserService(): UserService {
    if (!this.userService) throw new Error('UserService is required');
    return this.userService;
  }
}
