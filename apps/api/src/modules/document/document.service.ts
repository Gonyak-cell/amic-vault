import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { isMatterMutationBlockedState, isMatterState } from '@amic-vault/domain';
import type {
  DocumentConfidentialityLevel,
  DocumentDto,
  DocumentExtractionMethod,
  DocumentExtractionStatus,
  DocumentPrivilegeStatus,
  DocumentStatus,
  DocumentType,
  PermissionDecision,
  TenantId,
  UpdateDocumentMetadataDto,
  UpdateLegalHoldDto,
  UserRole,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
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
  createdBy: string;
}

interface DocumentRow {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  document_family_id: string;
  title: string;
  status: DocumentStatus;
  document_type: DocumentType;
  subtype: string | null;
  confidentiality_level: DocumentConfidentialityLevel;
  privilege_status: DocumentPrivilegeStatus;
  legal_hold: boolean;
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

function mapDocument(row: DocumentRow): DocumentDto {
  const document: DocumentDto = {
    documentId: row.document_id,
    tenantId: row.tenant_id,
    matterId: row.matter_id,
    documentFamilyId: row.document_family_id,
    title: row.title,
    status: row.status,
    documentType: row.document_type,
    subtype: row.subtype,
    confidentialityLevel: row.confidentiality_level,
    privilegeStatus: row.privilege_status,
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

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @Inject(AuditService) private readonly auditService?: AuditService,
    @Inject(PermissionService) private readonly permissionService?: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext?: TenantContextService,
    @Inject(UserService) private readonly userService?: UserService,
  ) {}

  async createDraft(input: CreateDraftDocumentInput, client: PoolClient): Promise<DocumentDto> {
    const result = await client.query(
      `
        INSERT INTO documents (
          document_id, tenant_id, matter_id, document_family_id, title, status,
          document_type, subtype, confidentiality_level, privilege_status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10)
        RETURNING document_id, tenant_id, matter_id, document_family_id, title,
          status, document_type, subtype, confidentiality_level, privilege_status,
          legal_hold, created_by, created_at, updated_at
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
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'DOCUMENT_METADATA_CHANGED',
          targetType: 'document',
          targetId: documentId,
          matterId: updated.matter_id,
          metadata: {
            document_id: documentId,
            matter_id: updated.matter_id,
            diff_keys: diffKeys,
            before_ref: metadataRef(before),
            after_ref: metadataRef(updated),
          },
        },
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
      await auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'DOCUMENT_VIEWED',
          targetType: 'document',
          targetId: documentId,
          matterId: document.matter_id,
          metadata: {
            document_id: documentId,
            matter_id: document.matter_id,
          },
        },
        tx,
      );
      return mapDocument(document);
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
          d.legal_hold, d.created_by, d.created_at, d.updated_at, m.status AS matter_status
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
          d.legal_hold, cd.extraction_status, cd.extraction_method,
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
          d.legal_hold, d.created_by, d.created_at, d.updated_at, m.status AS matter_status
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
          d.legal_hold, d.created_by, d.created_at, d.updated_at, m.status AS matter_status
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
