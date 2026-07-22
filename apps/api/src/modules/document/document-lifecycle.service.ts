import { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  assertDeletable,
  canTransitionDocumentStatus,
  isDocumentStatus,
  LegalHoldBlockedError,
  type DocumentStatusValue,
} from '@amic-vault/domain';
import type {
  DocumentConfidentialityLevel,
  DocumentDto,
  DocumentExtractionMethod,
  DocumentExtractionStatus,
  DocumentPrivilegeStatus,
  DocumentSource,
  DocumentStatus,
  DocumentType,
  PermissionDecision,
  TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  documentDeletedAudit,
  documentDownloadedAudit,
  documentRestoredAudit,
  documentStatusChangedAudit,
} from '../audit/events/document-events';
import { GraphSyncOutboxWorker } from '../graph/graph-sync-outbox.worker';
import { promotedDocumentExistsSql } from '../file-security/promoted-file.guard';
import { PermissionService } from '../permission/permission.service';
import { SearchIndexSyncHook } from '../search/index/index-sync.hook';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { assertDocumentMutationAllowed } from './guards/immutable-state.guard';

interface DocumentLifecycleRow {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  status: DocumentStatus;
  matter_status: string;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
  deleted_previous_status: DocumentStatus | null;
}

interface DownloadTargetRow extends DocumentLifecycleRow {
  version_id: string;
  file_object_id: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
}

interface DocumentStatusTransitionRow extends DocumentLifecycleRow {
  document_family_id: string;
  title: string;
  document_type: DocumentType;
  subtype: string | null;
  confidentiality_level: DocumentConfidentialityLevel;
  privilege_status: DocumentPrivilegeStatus;
  source: DocumentSource;
  ai_allowed: boolean;
  legal_hold: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  matter_name: string | null;
  matter_code: string | null;
  extraction_status: DocumentExtractionStatus | null;
  extraction_method: DocumentExtractionMethod | null;
  extraction_confidence: number | null;
}

export interface DocumentDownloadResult {
  body: Readable;
  contentType: string;
  contentLength: number;
  filename: string;
  sha256: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function documentLocked(): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED' });
}

function transitionBlocked(reason: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code: 'DOCUMENT_LOCKED', reason });
}

function transitionRejected(reason: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code: 'VALIDATION_FAILED', reason });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function statusRef(status: string): string {
  return `document_status:${status}`;
}

function mapLifecycleDocument(row: DocumentStatusTransitionRow): DocumentDto {
  return {
    documentId: row.document_id,
    tenantId: row.tenant_id,
    matterId: row.matter_id,
    matterDisplayName: row.matter_name,
    matterDisplayCode: row.matter_code,
    documentFamilyId: row.document_family_id,
    title: row.title,
    status: row.status,
    documentType: row.document_type,
    subtype: row.subtype,
    confidentialityLevel: row.confidentiality_level,
    privilegeStatus: row.privilege_status,
    source: row.source,
    aiAllowed: row.ai_allowed,
    legalHold: row.legal_hold,
    extractionStatus: row.extraction_status,
    extractionMethod: row.extraction_method,
    extractionConfidence: row.extraction_confidence,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function domainDocumentStatus(status: DocumentStatus): DocumentStatusValue {
  if (!isDocumentStatus(status)) throw validationFailed();
  return status;
}

@Injectable()
export class DocumentLifecycleService {
  private readonly logger = new Logger(DocumentLifecycleService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
    @Optional()
    @Inject(SearchIndexSyncHook)
    private readonly searchIndexSync?: SearchIndexSyncHook,
    @Optional()
    @Inject(GraphSyncOutboxWorker)
    private readonly graphSyncOutbox?: GraphSyncOutboxWorker,
  ) {}

  async softDelete(actorUserId: string, documentId: string): Promise<void> {
    const context = this.tenantContext.require();
    await this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findLifecycleTarget(tx, context.tenantId, documentId, true);
      if (!target) throw notFoundDenied();
      if (target.status === 'deleted') return;
      await this.assertCanEditMatter(context.tenantId, actorUserId, target.matter_id);
      assertDocumentMutationAllowed({
        documentStatus: target.status,
        matterStatus: target.matter_status,
      });
      this.assertDeletePreconditions(target);

      const updated = await tx.query(
        `
          UPDATE documents
          SET status = 'deleted',
              deleted_at = now(),
              deleted_by = $3,
              deleted_previous_status = $4,
              updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND status <> 'deleted'
        `,
        [context.tenantId, documentId, actorUserId, target.status],
      );
      if (updated.rowCount !== 1) throw validationFailed('DOCUMENT_DELETE_CONFLICT');
      await this.auditService.log(
        documentDeletedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: target.matter_id,
          beforeRef: statusRef(target.status),
          afterRef: statusRef('deleted'),
        }),
        tx,
      );
      await this.searchIndexSync?.enqueueCurrentVersionForDocument(
        { tenantId: context.tenantId, documentId },
        tx,
      );
      await this.graphSyncOutbox?.enqueue(
        {
          tenantId: context.tenantId,
          matterId: target.matter_id,
          reasonCode: 'document_deleted',
          requestedBy: actorUserId,
        },
        tx,
      );
    });
  }

  async transitionStatus(
    actorUserId: string,
    documentId: string,
    toStatus: DocumentStatus,
    note?: string,
  ): Promise<DocumentDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findLifecycleTarget(tx, context.tenantId, documentId, true);
      if (!target) throw notFoundDenied();
      await this.assertCanEditMatter(context.tenantId, actorUserId, target.matter_id);
      if (target.document_legal_hold || target.matter_legal_hold) {
        throw transitionBlocked('DOCUMENT_LEGAL_HOLD');
      }
      assertDocumentMutationAllowed({
        documentStatus: target.status,
        matterStatus: target.matter_status,
      });
      if (toStatus === 'deleted') throw transitionRejected('DOCUMENT_DELETE_ENDPOINT_REQUIRED');
      if (target.status === toStatus) throw transitionRejected('DOCUMENT_STATUS_NOOP');
      if (!canTransitionDocumentStatus(domainDocumentStatus(target.status), domainDocumentStatus(toStatus))) {
        throw transitionRejected('DOCUMENT_STATUS_TRANSITION_NOT_ALLOWED');
      }

      const updated = await tx.query(
        `
          UPDATE documents
          SET status = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND status = $4
          RETURNING document_id
        `,
        [context.tenantId, documentId, toStatus, target.status],
      );
      if (updated.rowCount !== 1) throw validationFailed('DOCUMENT_STATUS_CONFLICT');
      const document = await this.findStatusTransitionDocument(tx, context.tenantId, documentId);
      if (!document) throw notFoundDenied();
      await this.auditService.log(
        documentStatusChangedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: target.matter_id,
          beforeStatus: target.status,
          afterStatus: toStatus,
          noteProvided: Boolean(note?.trim()),
        }),
        tx,
      );
      await this.searchIndexSync?.enqueueCurrentVersionForDocument(
        { tenantId: context.tenantId, documentId },
        tx,
      );
      await this.graphSyncOutbox?.enqueue(
        {
          tenantId: context.tenantId,
          matterId: target.matter_id,
          reasonCode: 'document_status_changed',
          requestedBy: actorUserId,
        },
        tx,
      );
      return mapLifecycleDocument(document);
    });
  }

  async restore(actorUserId: string, documentId: string): Promise<void> {
    const context = this.tenantContext.require();
    await this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findLifecycleTarget(tx, context.tenantId, documentId, true);
      if (!target) throw notFoundDenied();
      await this.assertCanRestore(context.tenantId, actorUserId, target.matter_id, tx);
      if (target.status !== 'deleted' || !target.deleted_previous_status) {
        throw validationFailed('DOCUMENT_RESTORE_NOT_DELETED');
      }
      assertDocumentMutationAllowed({
        documentStatus: target.deleted_previous_status,
        matterStatus: target.matter_status,
      });

      const restored = await tx.query(
        `
          UPDATE documents
          SET status = $3,
              deleted_at = NULL,
              deleted_by = NULL,
              deleted_previous_status = NULL,
              updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND status = 'deleted'
        `,
        [context.tenantId, documentId, target.deleted_previous_status],
      );
      if (restored.rowCount !== 1) throw validationFailed('DOCUMENT_RESTORE_CONFLICT');
      await this.auditService.log(
        documentRestoredAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: target.matter_id,
          beforeRef: statusRef('deleted'),
          afterRef: statusRef(target.deleted_previous_status),
        }),
        tx,
      );
      await this.searchIndexSync?.enqueueCurrentVersionForDocument(
        { tenantId: context.tenantId, documentId },
        tx,
      );
      await this.graphSyncOutbox?.enqueue(
        {
          tenantId: context.tenantId,
          matterId: target.matter_id,
          reasonCode: 'document_restored',
          requestedBy: actorUserId,
        },
        tx,
      );
    });
  }

  async download(
    actorUserId: string,
    documentId: string,
    reasonCode?: string,
  ): Promise<DocumentDownloadResult> {
    const context = this.tenantContext.require();
    const target = await this.auditService.transaction(context.tenantId, async (tx) => {
      const row = await this.findDownloadTarget(tx, context.tenantId, documentId);
      if (!row) throw notFoundDenied();
      if (row.status === 'deleted') throw documentLocked();
      await this.assertCanDownloadDocument(context.tenantId, actorUserId, documentId, reasonCode);
      const auditInput = {
        tenantId: context.tenantId,
        actorId: actorUserId,
        documentId,
        matterId: row.matter_id,
        versionId: row.version_id,
        hash: row.sha256,
      };
      await this.auditService.log(
        documentDownloadedAudit(reasonCode ? { ...auditInput, reasonCode } : auditInput),
        tx,
      );
      return row;
    });

    const object = await this.storageService.getByStorageUri(context.tenantId, target.storage_uri);
    return {
      body: object.body,
      contentType: target.mime_type,
      contentLength: Number(target.size_bytes),
      filename: target.normalized_filename,
      sha256: target.sha256,
    };
  }

  private assertDeletePreconditions(target: DocumentLifecycleRow): void {
    try {
      assertDeletable({
        documentLegalHold: target.document_legal_hold,
        matterLegalHold: target.matter_legal_hold,
      });
    } catch (error) {
      if (error instanceof LegalHoldBlockedError) throw documentLocked();
      throw error;
    }
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canEditMatter({ tenantId, userId: actorUserId }, matterId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', matterId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }

  private async assertCanDownloadDocument(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
    reasonCode?: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canDownloadDocument(
        { tenantId, userId: actorUserId },
        documentId,
        reasonCode,
      );
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'DOCUMENT_LOCKED') throw documentLocked();
    if (decision?.reasonCode === 'VALIDATION_FAILED') {
      throw validationFailed('DOWNLOAD_REASON_REQUIRED');
    }
    throw notFoundDenied();
  }

  private async assertCanRestore(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
    client: QueryClient,
  ): Promise<void> {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    if (actor?.status === 'active' && actor.role === 'firm_admin') return;
    const member = await client.query(
      `
        SELECT matter_role
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
          AND matter_role = 'owner'
        LIMIT 1
      `,
      [tenantId, matterId, actorUserId],
    );
    if (member.rowCount === 1) return;
    throw permissionDenied();
  }

  private async findLifecycleTarget(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
    lockDocument: boolean,
  ): Promise<DocumentLifecycleRow | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.status,
          m.status AS matter_status, d.legal_hold AS document_legal_hold,
          m.legal_hold AS matter_legal_hold, d.deleted_previous_status
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
        ${lockDocument ? 'FOR UPDATE OF d' : ''}
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as DocumentLifecycleRow | undefined) ?? null;
  }

  private async findDownloadTarget(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
  ): Promise<DownloadTargetRow | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.status,
          m.status AS matter_status, d.legal_hold AS document_legal_hold,
          m.legal_hold AS matter_legal_hold, d.deleted_previous_status,
          dv.version_id, dv.file_object_id, f.storage_uri, f.normalized_filename,
          f.mime_type, f.size_bytes::text, f.sha256
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND ${promotedDocumentExistsSql('d')}
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as DownloadTargetRow | undefined) ?? null;
  }

  private async findStatusTransitionDocument(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
  ): Promise<DocumentStatusTransitionRow | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.document_family_id, d.title,
          d.status, d.document_type, d.subtype, d.confidentiality_level, d.privilege_status,
          d.source, d.ai_allowed, d.legal_hold, d.legal_hold AS document_legal_hold,
          d.created_by, d.created_at, d.updated_at,
          d.deleted_previous_status, m.status AS matter_status, m.legal_hold AS matter_legal_hold,
          m.matter_name, m.matter_code, cd.extraction_status, cd.extraction_method,
          cd.confidence::float8 AS extraction_confidence
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
    return (result.rows[0] as DocumentStatusTransitionRow | undefined) ?? null;
  }
}
