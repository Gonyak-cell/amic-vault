import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { TextDecoder } from 'node:util';
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
import { buildSafeLabel } from '@amic-vault/shared';
import type {
  AssignDocumentSubversionReviewerDto,
  CheckInDocumentEditSessionDto,
  CreateDocumentEditSessionDto,
  DocumentEditPackageDto,
  DocumentEditSessionDto,
  DocumentEditSessionStatus,
  DocumentNativeEditDraftDto,
  DocumentSubversionDto,
  DocumentSubversionListDto,
  DocumentSubversionReviewDecision,
  DocumentSubversionReviewDto,
  DocumentSubversionReviewGateDto,
  DocumentSubversionReviewListDto,
  DocumentSubversionReviewerDto,
  DocumentSubversionReviewerListDto,
  DocumentSubversionStatus,
  HeartbeatDocumentEditSessionDto,
  PermissionDecision,
  PromoteDocumentSubversionDto,
  PromoteDocumentSubversionResponseDto,
  SaveDocumentSubversionFieldsDto,
  SaveNativeDocumentEditDraftDto,
  SubmitDocumentSubversionReviewDto,
  TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  documentCheckedInAudit,
  documentCheckedOutAudit,
  documentCheckinCancelledAudit,
  documentDownloadedAudit,
  documentEditConflictAudit,
  documentLockExpiredAudit,
  documentSubversionReviewSubmittedAudit,
  documentSubversionReviewerAssignedAudit,
  documentSubversionReviewerRevokedAudit,
  documentSubversionSavedAudit,
  documentVersionPromotedAudit,
} from '../audit/events/document-events';
import { PermissionService } from '../permission/permission.service';
import { SearchIndexSyncHook } from '../search/index/index-sync.hook';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { ExtractionQueueService } from './extraction/extraction-queue.service';
import { assertDocumentMutationAllowed } from './guards/immutable-state.guard';
import { sha256File } from './integrity/sha256.util';
import type { UploadedDiskFile } from './document-upload.service';
import { FileExtensionValidator } from './validators/file-extension.validator';
import { FileSizeValidator } from './validators/file-size.validator';
import { MimeTypeValidator } from './validators/mime-type.validator';
import { VersionNumberResolver } from './version-number.resolver';

const DEFAULT_EDIT_TTL_SECONDS = 3600;
const NATIVE_EDIT_MAX_BYTES = 1_000_000;
const NATIVE_EDITABLE_MIME_TYPES = new Set([
  'application/json',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

interface DocumentTargetRow {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  status: string;
  matter_status: string;
}

interface CurrentVersionRow {
  version_id: string;
  version_no: number;
}

interface EditSessionRow {
  edit_session_id: string;
  document_id: string;
  matter_id: string;
  base_version_id: string;
  base_version_no: number;
  status: DocumentEditSessionStatus;
  client_kind: DocumentEditSessionDto['clientKind'];
  lock_owner_user_id: string;
  checked_out_at: Date;
  heartbeat_at: Date;
  expires_at: Date;
  checked_in_at: Date | null;
  cancelled_at: Date | null;
  expired_at: Date | null;
  conflicted_at: Date | null;
}

interface SubversionRow {
  subversion_id: string;
  document_id: string;
  matter_id: string;
  base_version_id: string;
  base_version_no: number;
  subversion_no: number;
  edit_session_id: string;
  status: DocumentSubversionStatus;
  visibility_scope: DocumentSubversionDto['visibilityScope'];
  file_object_id: string;
  file_hash: string;
  created_by: string;
  created_at: Date;
  submitted_at: Date | null;
  promoted_version_id: string | null;
  active_reviewers?: number | string | null;
  approved_reviews?: number | string | null;
  changes_requested_reviews?: number | string | null;
}

interface SubversionReviewerRow {
  subversion_reviewer_id: string;
  subversion_id: string;
  document_id: string;
  reviewer_user_id: string;
  assigned_by: string;
  status: DocumentSubversionReviewerDto['status'];
  created_at: Date;
  revoked_at: Date | null;
  reviewer_display_email?: string | null;
  reviewer_display_name?: string | null;
}

interface SubversionReviewRow {
  subversion_review_id: string;
  subversion_reviewer_id: string;
  subversion_id: string;
  document_id: string;
  reviewer_user_id: string;
  decision: DocumentSubversionReviewDecision;
  decided_at: Date;
  reviewer_display_email?: string | null;
  reviewer_display_name?: string | null;
}

interface SubversionReviewGateRow {
  active_reviewers: number | string;
  approved_reviews: number | string;
  changes_requested_reviews: number | string;
}

interface PromotionVersionRow {
  version_id: string;
  document_id: string;
  version_no: number;
  version_status: 'current';
  file_object_id: string;
  file_hash: string;
  created_by: string;
  created_at: Date;
  supersedes_version_id: string;
  promoted_from_subversion_id: string;
  published_at: Date;
}

interface PreparedEditFile {
  fileObjectId: string;
  originalFilename: string;
  normalizedFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

interface SavePreparedSubversionInput {
  actorUserId: string;
  documentId: string;
  editSessionId: string;
  fields: SaveDocumentSubversionFieldsDto;
  prepared: PreparedEditFile;
  body: () => Buffer | Readable;
}

interface BaseVersionFileRow {
  version_id: string;
  version_no: number;
  storage_uri: string;
  original_filename: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: number | string;
  sha256: string;
}

interface StoredFileRow {
  storage_uri: string;
  original_filename: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: number | string;
  sha256: string;
}

export interface DocumentEditBaseFileDownload {
  body: Readable;
  contentType: string;
  contentLength: number;
  filename: string;
  sha256: string;
}

type PermissionCheck = (
  context: { tenantId: TenantId; userId: string },
  documentId: string,
) => Promise<PermissionDecision>;

const nativeTextDecoder = new TextDecoder('utf-8', { fatal: true });

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function documentLocked(reason: string): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED', reason });
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

function isUploadedDiskFile(file: UploadedDiskFile | undefined): file is UploadedDiskFile {
  return (
    typeof file?.path === 'string' &&
    typeof file.originalname === 'string' &&
    typeof file.mimetype === 'string' &&
    Number.isSafeInteger(file.size)
  );
}

function isNativeEditableMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || NATIVE_EDITABLE_MIME_TYPES.has(mimeType);
}

function editPackageMode(mimeType: string): DocumentEditPackageDto['mode'] {
  return isNativeEditableMimeType(mimeType) ? 'vault_text' : 'binary_roundtrip';
}

function shouldValidateEditPackageSave(fields: SaveDocumentSubversionFieldsDto): boolean {
  return Boolean(fields.expectedBaseSha256 || fields.editPackageMode);
}

function nativeEditMimeType(filename: string, fallback: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  return isNativeEditableMimeType(fallback) ? fallback : 'text/plain';
}

async function streamToBufferLimited(body: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) throw validationFailed('native_edit_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes);
}

function decodeNativeText(buffer: Buffer): string {
  try {
    return nativeTextDecoder.decode(buffer);
  } catch {
    throw validationFailed('native_edit_unsupported');
  }
}

function normalizeTransportFilename(filename: string): string {
  const repaired = Buffer.from(filename, 'latin1').toString('utf8');
  return repaired.includes('\uFFFD') ? filename : repaired;
}

function hashLockToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function randomLockTokenHash(): string {
  return hashLockToken(randomBytes(32).toString('hex'));
}

function ttlExpiry(seconds = DEFAULT_EDIT_TTL_SECONDS): Date {
  return new Date(Date.now() + seconds * 1000);
}

function iso(value: Date): string {
  return value.toISOString();
}

function nullableIso(value: Date | null): string | null {
  return value ? iso(value) : null;
}

function isExpired(row: Pick<EditSessionRow, 'expires_at'>): boolean {
  return row.expires_at.getTime() <= Date.now();
}

function mapReviewGate(row: SubversionRow): DocumentSubversionReviewGateDto {
  const activeReviewerCount = Number(row.active_reviewers ?? 0);
  const approvedReviewCount = Number(row.approved_reviews ?? 0);
  const changesRequestedCount = Number(row.changes_requested_reviews ?? 0);
  let status: DocumentSubversionReviewGateDto['status'] = 'not_required';
  if (changesRequestedCount > 0) {
    status = 'changes_requested';
  } else if (activeReviewerCount > 0 && approvedReviewCount >= activeReviewerCount) {
    status = 'approved';
  } else if (activeReviewerCount > 0 || row.visibility_scope === 'reviewers') {
    status = 'pending';
  }
  return {
    status,
    activeReviewerCount,
    approvedReviewCount,
    changesRequestedCount,
  };
}

function mapSession(row: EditSessionRow): DocumentEditSessionDto {
  return {
    editSessionId: row.edit_session_id,
    documentId: row.document_id,
    baseVersionId: row.base_version_id,
    baseVersionNo: row.base_version_no,
    status: row.status,
    clientKind: row.client_kind,
    lockOwnerUserId: row.lock_owner_user_id,
    checkedOutAt: iso(row.checked_out_at),
    heartbeatAt: iso(row.heartbeat_at),
    expiresAt: iso(row.expires_at),
    checkedInAt: nullableIso(row.checked_in_at),
    cancelledAt: nullableIso(row.cancelled_at),
    expiredAt: nullableIso(row.expired_at),
    conflictedAt: nullableIso(row.conflicted_at),
  };
}

function mapSubversion(row: SubversionRow): DocumentSubversionDto {
  return {
    subversionId: row.subversion_id,
    documentId: row.document_id,
    baseVersionId: row.base_version_id,
    baseVersionNo: row.base_version_no,
    subversionNo: row.subversion_no,
    displayVersion: `v${row.base_version_no}.${row.subversion_no}`,
    editSessionId: row.edit_session_id,
    status: row.status,
    visibilityScope: row.visibility_scope,
    fileObjectId: row.file_object_id,
    fileHash: row.file_hash,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    submittedAt: nullableIso(row.submitted_at),
    promotedVersionId: row.promoted_version_id,
    reviewGate: mapReviewGate(row),
  };
}

function mapPromotionResponse(
  documentId: string,
  subversionId: string,
  version: PromotionVersionRow,
): PromoteDocumentSubversionResponseDto {
  return {
    documentId,
    subversionId,
    promotedVersionId: version.version_id,
    versionNo: version.version_no,
    versionStatus: version.version_status,
    supersedesVersionId: version.supersedes_version_id,
    promotedFromSubversionId: version.promoted_from_subversion_id,
    publishedAt: iso(version.published_at),
  };
}

function mapSubversionReviewer(row: SubversionReviewerRow): DocumentSubversionReviewerDto {
  const displayEmail = row.reviewer_display_email ?? null;
  const displayName = row.reviewer_display_name ?? null;
  return {
    canViewSensitiveRef: false,
    displayEmail,
    displayName,
    safeLabel: buildSafeLabel(displayName, displayEmail),
    subversionReviewerId: row.subversion_reviewer_id,
    subversionId: row.subversion_id,
    documentId: row.document_id,
    reviewerUserId: row.reviewer_user_id,
    assignedBy: row.assigned_by,
    status: row.status,
    createdAt: iso(row.created_at),
    revokedAt: nullableIso(row.revoked_at),
  };
}

function mapSubversionReview(row: SubversionReviewRow): DocumentSubversionReviewDto {
  const displayEmail = row.reviewer_display_email ?? null;
  const displayName = row.reviewer_display_name ?? null;
  return {
    canViewSensitiveRef: false,
    displayEmail,
    displayName,
    safeLabel: buildSafeLabel(displayName, displayEmail),
    subversionReviewId: row.subversion_review_id,
    subversionReviewerId: row.subversion_reviewer_id,
    subversionId: row.subversion_id,
    documentId: row.document_id,
    reviewerUserId: row.reviewer_user_id,
    decision: row.decision,
    decidedAt: iso(row.decided_at),
  };
}

@Injectable()
export class DocumentEditingService {
  private readonly logger = new Logger(DocumentEditingService.name);
  private readonly extensionValidator = new FileExtensionValidator();
  private readonly fileSizeValidator = new FileSizeValidator();
  private readonly mimeTypeValidator = new MimeTypeValidator();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(FileObjectService) private readonly fileObjectService: FileObjectService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(VersionNumberResolver) private readonly versionNumberResolver: VersionNumberResolver,
    @Optional()
    @Inject(ExtractionQueueService)
    private readonly extractionQueue?: ExtractionQueueService,
    @Optional()
    @Inject(SearchIndexSyncHook)
    private readonly searchIndexSync?: SearchIndexSyncHook,
  ) {}

  async checkout(
    actorUserId: string,
    documentId: string,
    input: CreateDocumentEditSessionDto,
  ): Promise<DocumentEditSessionDto> {
    const context = this.tenantContext.require();
    const result = await this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findTarget(context.tenantId, documentId, tx, true);
      if (!target) throw notFoundDenied();
      assertDocumentMutationAllowed({
        documentStatus: target.status,
        matterStatus: target.matter_status,
      });
      await this.assertAllowed(
        this.permissionService.canCheckoutDocument.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );

      const current = await this.findCurrentVersion(context.tenantId, documentId, tx);
      if (!current) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
      if (input.baseVersionId && input.baseVersionId !== current.version_id) {
        await this.auditService.log(
          documentEditConflictAudit({
            tenantId: context.tenantId,
            actorId: actorUserId,
            documentId,
            matterId: target.matter_id,
            baseVersionId: input.baseVersionId,
            currentVersionId: current.version_id,
            reasonCode: 'BASE_VERSION_STALE',
          }),
          tx,
        );
        return { staleBaseVersion: true as const };
      }

      const active = await this.findActiveSession(context.tenantId, documentId, tx, true);
      if (active) {
        if (isExpired(active)) {
          await this.expireSession(context.tenantId, actorUserId, active, tx);
        } else if (
          active.lock_owner_user_id === actorUserId &&
          active.base_version_id === current.version_id
        ) {
          return { session: mapSession(active) };
        } else {
          throw documentLocked('document_already_checked_out');
        }
      }

      const expiresAt = ttlExpiry(input.requestedTtlSeconds);
      const inserted = await tx.query(
        `
          WITH inserted AS (
            INSERT INTO document_edit_sessions (
              tenant_id, document_id, base_version_id, lock_owner_user_id, status,
              client_kind, lock_token_hash, checkout_reason_code, expires_at
            )
            VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)
            RETURNING edit_session_id, document_id, base_version_id, status, client_kind,
              lock_owner_user_id, checked_out_at, heartbeat_at, expires_at, checked_in_at,
              cancelled_at, expired_at, conflicted_at
          )
          SELECT inserted.*, d.matter_id, $9::integer AS base_version_no
          FROM inserted
          JOIN documents d
            ON d.tenant_id = $1
            AND d.document_id = inserted.document_id
        `,
        [
          context.tenantId,
          documentId,
          current.version_id,
          actorUserId,
          input.clientKind,
          randomLockTokenHash(),
          input.checkoutReasonCode ?? null,
          expiresAt,
          current.version_no,
        ],
      );
      const row = inserted.rows[0] as EditSessionRow | undefined;
      if (!row) throw new Error('document edit session insert returned no row');
      const audit = await this.auditService.log(
        documentCheckedOutAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: target.matter_id,
          editSessionId: row.edit_session_id,
          baseVersionId: current.version_id,
          baseVersionNo: current.version_no,
          clientKind: input.clientKind,
          expiresAt: iso(expiresAt),
          ...(input.checkoutReasonCode ? { reasonCode: input.checkoutReasonCode } : {}),
        }),
        tx,
      );
      await tx.query(
        `
          UPDATE document_edit_sessions
          SET created_audit_event_id = $4,
            last_audit_event_id = $4,
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND edit_session_id = $3
        `,
        [context.tenantId, documentId, row.edit_session_id, audit.eventId],
      );
      return { session: mapSession(row) };
    });
    if ('staleBaseVersion' in result) throw validationFailed('base_version_stale');
    return result.session;
  }

  async getActiveSession(
    actorUserId: string,
    documentId: string,
  ): Promise<DocumentEditSessionDto | null> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findTarget(context.tenantId, documentId, tx, false);
      if (!target) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canReadDocumentSubversion.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      const active = await this.findActiveSession(context.tenantId, documentId, tx, false);
      if (!active) return null;
      if (isExpired(active)) {
        await this.expireSession(context.tenantId, actorUserId, active, tx);
        return null;
      }
      return mapSession(active);
    });
  }

  async heartbeat(
    actorUserId: string,
    documentId: string,
    editSessionId: string,
    input: HeartbeatDocumentEditSessionDto,
  ): Promise<DocumentEditSessionDto> {
    const context = this.tenantContext.require();
    const result = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        actorUserId,
        documentId,
        editSessionId,
        this.permissionService.canSaveDocumentSubversion.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      const expiresAt = ttlExpiry(input.requestedTtlSeconds);
      const updated = await tx.query(
        `
          WITH updated AS (
            UPDATE document_edit_sessions
            SET heartbeat_at = now(),
              expires_at = $4,
              updated_at = now()
            WHERE tenant_id = $1
              AND document_id = $2
              AND edit_session_id = $3
            RETURNING edit_session_id, document_id, base_version_id, status, client_kind,
              lock_owner_user_id, checked_out_at, heartbeat_at, expires_at, checked_in_at,
              cancelled_at, expired_at, conflicted_at
          )
          SELECT updated.*, d.matter_id, bv.version_no AS base_version_no
          FROM updated
          JOIN documents d
            ON d.tenant_id = $1
            AND d.document_id = updated.document_id
          JOIN document_versions bv
            ON bv.tenant_id = $1
            AND bv.version_id = updated.base_version_id
        `,
        [context.tenantId, documentId, editSessionId, expiresAt],
      );
      const row = updated.rows[0] as EditSessionRow | undefined;
      if (!row) throw notFoundDenied();
      return { session: mapSession(row) };
    });
    if ('expired' in result) throw documentLocked('edit_session_expired');
    return result.session;
  }

  async saveSubversion(input: {
    actorUserId: string;
    documentId: string;
    editSessionId: string;
    fields: SaveDocumentSubversionFieldsDto;
    file: UploadedDiskFile | undefined;
  }): Promise<DocumentSubversionDto> {
    const file = input.file;
    if (!isUploadedDiskFile(file)) {
      await this.unlinkTempFile(file);
      throw validationFailed();
    }

    try {
      const prepared = await this.prepareEditFile(file);
      return await this.savePreparedSubversion({
        actorUserId: input.actorUserId,
        documentId: input.documentId,
        editSessionId: input.editSessionId,
        fields: input.fields,
        prepared,
        body: () => createReadStream(file.path),
      });
    } finally {
      await this.unlinkTempFile(file);
    }
  }

  async getEditPackage(
    actorUserId: string,
    documentId: string,
    editSessionId: string,
  ): Promise<DocumentEditPackageDto> {
    const context = this.tenantContext.require();
    const result = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        actorUserId,
        documentId,
        editSessionId,
        this.permissionService.canSaveDocumentSubversion.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      const baseFile = await this.findBaseVersionFile(
        context.tenantId,
        documentId,
        session.base_version_id,
        tx,
      );
      if (!baseFile) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
      const mode = editPackageMode(baseFile.mime_type);
      return {
        package: {
          documentId,
          editSessionId,
          baseVersionId: session.base_version_id,
          baseVersionNo: session.base_version_no,
          filename: baseFile.original_filename || baseFile.normalized_filename,
          mimeType: baseFile.mime_type,
          sizeBytes: Number(baseFile.size_bytes),
          sha256: baseFile.sha256,
          mode,
          canOpenInVaultEditor: mode === 'vault_text',
          baseFileUrl: `/v1/documents/${documentId}/edit-sessions/${editSessionId}/base-file`,
          saveSubversionUrl: `/v1/documents/${documentId}/edit-sessions/${editSessionId}/subversions`,
          checkInUrl: `/v1/documents/${documentId}/edit-sessions/${editSessionId}/check-in`,
          nativeDraftUrl:
            mode === 'vault_text'
              ? `/v1/documents/${documentId}/edit-sessions/${editSessionId}/native-draft`
              : null,
          expiresAt: iso(session.expires_at),
        },
      };
    });
    if ('expired' in result) throw documentLocked('edit_session_expired');
    return result.package;
  }

  async getEditBaseFile(
    actorUserId: string,
    documentId: string,
    editSessionId: string,
  ): Promise<DocumentEditBaseFileDownload> {
    const context = this.tenantContext.require();
    const target = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        actorUserId,
        documentId,
        editSessionId,
        this.permissionService.canSaveDocumentSubversion.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      const baseFile = await this.findBaseVersionFile(
        context.tenantId,
        documentId,
        session.base_version_id,
        tx,
      );
      if (!baseFile) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
      await this.auditService.log(
        documentDownloadedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: session.matter_id,
          versionId: session.base_version_id,
          hash: baseFile.sha256,
          reasonCode: 'EDIT_SESSION_BASE_FILE',
        }),
        tx,
      );
      return { baseFile };
    });
    if ('expired' in target) throw documentLocked('edit_session_expired');
    const object = await this.storageService.getByStorageUri(
      context.tenantId,
      target.baseFile.storage_uri,
    );
    return {
      body: object.body,
      contentType: target.baseFile.mime_type,
      contentLength: Number(target.baseFile.size_bytes),
      filename: target.baseFile.normalized_filename,
      sha256: target.baseFile.sha256,
    };
  }

  async getSubversionFile(
    actorUserId: string,
    documentId: string,
    subversionId: string,
  ): Promise<DocumentEditBaseFileDownload> {
    const context = this.tenantContext.require();
    const target = await this.auditService.transaction(context.tenantId, async (tx) => {
      const documentTarget = await this.findTarget(context.tenantId, documentId, tx, false);
      if (!documentTarget) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canReadDocumentSubversion.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      const subversion = await this.findVisibleSubversionById(
        context.tenantId,
        documentId,
        subversionId,
        actorUserId,
        tx,
      );
      if (!subversion) throw notFoundDenied();
      const file = await this.findSubversionFile(context.tenantId, subversionId, tx);
      if (!file) throw validationFailed('subversion_not_found');
      await this.auditService.log(
        documentDownloadedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: subversion.matter_id,
          versionId: subversion.base_version_id,
          subversionId,
          hash: file.sha256,
          reasonCode: 'SUBVERSION_REVIEW_FILE',
        }),
        tx,
      );
      return { file };
    });
    const object = await this.storageService.getByStorageUri(
      context.tenantId,
      target.file.storage_uri,
    );
    return {
      body: object.body,
      contentType: target.file.mime_type,
      contentLength: Number(target.file.size_bytes),
      filename: target.file.normalized_filename,
      sha256: target.file.sha256,
    };
  }

  async getNativeDraft(
    actorUserId: string,
    documentId: string,
    editSessionId: string,
  ): Promise<DocumentNativeEditDraftDto> {
    const context = this.tenantContext.require();
    const preflight = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        actorUserId,
        documentId,
        editSessionId,
        this.permissionService.canSaveDocumentSubversion.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      const baseFile = await this.findBaseVersionFile(
        context.tenantId,
        documentId,
        session.base_version_id,
        tx,
      );
      if (!baseFile) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
      this.assertNativeEditableBaseFile(baseFile);
      return { baseFile, session };
    });
    if ('expired' in preflight) throw documentLocked('edit_session_expired');

    const object = await this.storageService.getByStorageUri(
      context.tenantId,
      preflight.baseFile.storage_uri,
    );
    const contentBuffer = await streamToBufferLimited(object.body, NATIVE_EDIT_MAX_BYTES);
    const content = decodeNativeText(contentBuffer);
    return {
      documentId,
      editSessionId,
      baseVersionId: preflight.session.base_version_id,
      baseVersionNo: preflight.session.base_version_no,
      filename: preflight.baseFile.original_filename || preflight.baseFile.normalized_filename,
      mimeType: preflight.baseFile.mime_type,
      content,
      sizeBytes: contentBuffer.byteLength,
      sha256: preflight.baseFile.sha256,
    };
  }

  async saveNativeDraft(
    actorUserId: string,
    documentId: string,
    editSessionId: string,
    input: SaveNativeDocumentEditDraftDto,
  ): Promise<DocumentSubversionDto> {
    const context = this.tenantContext.require();
    const preflight = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        actorUserId,
        documentId,
        editSessionId,
        this.permissionService.canSaveDocumentSubversion.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      const baseFile = await this.findBaseVersionFile(
        context.tenantId,
        documentId,
        session.base_version_id,
        tx,
      );
      if (!baseFile) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
      this.assertNativeEditableBaseFile(baseFile);
      return { baseFile };
    });
    if ('expired' in preflight) throw documentLocked('edit_session_expired');

    const body = Buffer.from(input.content, 'utf8');
    if (body.byteLength > NATIVE_EDIT_MAX_BYTES) throw validationFailed('native_edit_too_large');
    const filename = preflight.baseFile.original_filename || preflight.baseFile.normalized_filename;
    const prepared: PreparedEditFile = {
      fileObjectId: randomUUID(),
      originalFilename: filename,
      normalizedFilename: preflight.baseFile.normalized_filename || filename,
      mimeType: nativeEditMimeType(filename, preflight.baseFile.mime_type),
      sizeBytes: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
    return this.savePreparedSubversion({
      actorUserId,
      documentId,
      editSessionId,
      fields: input,
      prepared,
      body: () => body,
    });
  }

  async listSubversions(
    actorUserId: string,
    documentId: string,
  ): Promise<DocumentSubversionListDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findTarget(context.tenantId, documentId, tx, false);
      if (!target) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canReadDocumentSubversion.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      const result = await tx.query(
        `
          SELECT sv.subversion_id, sv.document_id, d.matter_id, sv.base_version_id,
            bv.version_no AS base_version_no, sv.subversion_no, sv.edit_session_id,
            sv.status, sv.visibility_scope, sv.file_object_id, sv.file_hash,
            sv.created_by, sv.created_at, sv.submitted_at, sv.promoted_version_id,
            COALESCE(review_gate.active_reviewers, 0)::int AS active_reviewers,
            COALESCE(review_gate.approved_reviews, 0)::int AS approved_reviews,
            COALESCE(review_gate.changes_requested_reviews, 0)::int AS changes_requested_reviews
          FROM document_subversions sv
          JOIN documents d
            ON d.tenant_id = sv.tenant_id
            AND d.document_id = sv.document_id
          JOIN document_versions bv
            ON bv.tenant_id = sv.tenant_id
            AND bv.version_id = sv.base_version_id
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) FILTER (WHERE reviewer.status = 'active')::int AS active_reviewers,
              COUNT(review.subversion_review_id) FILTER (
                WHERE reviewer.status = 'active'
                  AND review.decision = 'approved'
              )::int AS approved_reviews,
              COUNT(review.subversion_review_id) FILTER (
                WHERE reviewer.status = 'active'
                  AND review.decision = 'changes_requested'
              )::int AS changes_requested_reviews
            FROM document_subversion_reviewers reviewer
            LEFT JOIN document_subversion_review_decisions review
              ON review.tenant_id = reviewer.tenant_id
              AND review.subversion_id = reviewer.subversion_id
              AND review.reviewer_user_id = reviewer.reviewer_user_id
            WHERE reviewer.tenant_id = sv.tenant_id
              AND reviewer.subversion_id = sv.subversion_id
          ) review_gate ON true
          LEFT JOIN matter_members mm
            ON mm.tenant_id = d.tenant_id
            AND mm.matter_id = d.matter_id
            AND mm.user_id = $3
          WHERE sv.tenant_id = $1
            AND sv.document_id = $2
            AND (
              sv.created_by = $3
              OR EXISTS (
                SELECT 1
                FROM document_subversion_reviewers reviewer
                WHERE reviewer.tenant_id = sv.tenant_id
                  AND reviewer.subversion_id = sv.subversion_id
                  AND reviewer.reviewer_user_id = $3
                  AND reviewer.status = 'active'
              )
              OR (sv.visibility_scope = 'matter_owners' AND mm.matter_role = 'owner')
              OR (
                sv.visibility_scope = 'matter_editors'
                AND (mm.matter_role = 'owner' OR mm.access_level = 'edit')
              )
            )
          ORDER BY bv.version_no DESC, sv.subversion_no DESC, sv.created_at DESC
        `,
        [context.tenantId, documentId, actorUserId],
      );
      return { items: (result.rows as SubversionRow[]).map(mapSubversion) };
    });
  }

  async listReviewers(
    actorUserId: string,
    documentId: string,
    subversionId: string,
  ): Promise<DocumentSubversionReviewerListDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findTarget(context.tenantId, documentId, tx, false);
      if (!target) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canReadDocumentSubversion.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      const visibleSubversion = await this.findVisibleSubversionById(
        context.tenantId,
        documentId,
        subversionId,
        actorUserId,
        tx,
      );
      if (!visibleSubversion) throw notFoundDenied();

      const result = await tx.query(
        `
          SELECT reviewer.subversion_reviewer_id, reviewer.subversion_id,
            $3::uuid AS document_id, reviewer.reviewer_user_id, reviewer.assigned_by,
            reviewer.status, reviewer.created_at, reviewer.revoked_at,
            u.name AS reviewer_display_name, u.email AS reviewer_display_email
          FROM document_subversion_reviewers reviewer
          JOIN users u
            ON u.tenant_id = reviewer.tenant_id
            AND u.user_id = reviewer.reviewer_user_id
          WHERE reviewer.tenant_id = $1
            AND reviewer.subversion_id = $2
          ORDER BY
            CASE reviewer.status WHEN 'active' THEN 0 ELSE 1 END,
            reviewer.created_at DESC
        `,
        [context.tenantId, subversionId, documentId],
      );
      return { items: (result.rows as SubversionReviewerRow[]).map(mapSubversionReviewer) };
    });
  }

  async listReviewDecisions(
    actorUserId: string,
    documentId: string,
    subversionId: string,
  ): Promise<DocumentSubversionReviewListDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findTarget(context.tenantId, documentId, tx, false);
      if (!target) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canReadDocumentSubversion.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      const visibleSubversion = await this.findVisibleSubversionById(
        context.tenantId,
        documentId,
        subversionId,
        actorUserId,
        tx,
      );
      if (!visibleSubversion) throw notFoundDenied();

      const result = await tx.query(
        `
          SELECT review.subversion_review_id, review.subversion_reviewer_id,
            review.subversion_id, $3::uuid AS document_id, review.reviewer_user_id,
            review.decision, review.decided_at,
            u.name AS reviewer_display_name, u.email AS reviewer_display_email
          FROM document_subversion_review_decisions review
          JOIN users u
            ON u.tenant_id = review.tenant_id
            AND u.user_id = review.reviewer_user_id
          WHERE review.tenant_id = $1
            AND review.subversion_id = $2
          ORDER BY review.decided_at DESC
        `,
        [context.tenantId, subversionId, documentId],
      );
      return { items: (result.rows as SubversionReviewRow[]).map(mapSubversionReview) };
    });
  }

  async submitReviewDecision(
    actorUserId: string,
    documentId: string,
    subversionId: string,
    input: SubmitDocumentSubversionReviewDto,
  ): Promise<DocumentSubversionReviewDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findTarget(context.tenantId, documentId, tx, false);
      if (!target) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canReadDocumentSubversion.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      const subversion = await this.findVisibleSubversionById(
        context.tenantId,
        documentId,
        subversionId,
        actorUserId,
        tx,
      );
      if (!subversion) throw notFoundDenied();
      if (subversion.status !== 'saved' && subversion.status !== 'submitted') {
        throw validationFailed('review_not_allowed');
      }

      const upserted = await tx.query(
        `
          WITH active_reviewer AS (
            SELECT subversion_reviewer_id, reviewer_user_id
            FROM document_subversion_reviewers
            WHERE tenant_id = $1
              AND subversion_id = $2
              AND reviewer_user_id = $3
              AND status = 'active'
          ),
          upserted AS (
            INSERT INTO document_subversion_review_decisions (
              tenant_id, subversion_id, subversion_reviewer_id, reviewer_user_id, decision
            )
            SELECT $1, $2, active_reviewer.subversion_reviewer_id,
              active_reviewer.reviewer_user_id, $4
            FROM active_reviewer
            ON CONFLICT (tenant_id, subversion_id, reviewer_user_id)
            DO UPDATE SET decision = EXCLUDED.decision,
              decided_at = now(),
              subversion_reviewer_id = EXCLUDED.subversion_reviewer_id
            RETURNING subversion_review_id, subversion_reviewer_id, subversion_id,
              $5::uuid AS document_id, reviewer_user_id, decision, decided_at
          )
          SELECT upserted.*, u.name AS reviewer_display_name,
            u.email AS reviewer_display_email
          FROM upserted
          JOIN users u
            ON u.tenant_id = $1
            AND u.user_id = upserted.reviewer_user_id
        `,
        [context.tenantId, subversionId, actorUserId, input.decision, documentId],
      );
      const row = upserted.rows[0] as SubversionReviewRow | undefined;
      if (!row) throw permissionDenied();
      const audit = await this.auditService.log(
        documentSubversionReviewSubmittedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: subversion.matter_id,
          subversionId,
          baseVersionId: subversion.base_version_id,
          subversionReviewId: row.subversion_review_id,
          subversionReviewerId: row.subversion_reviewer_id,
          reviewerUserId: row.reviewer_user_id,
          decision: row.decision,
        }),
        tx,
      );
      await tx.query(
        `
          UPDATE document_subversion_review_decisions
          SET last_audit_event_id = $4
          WHERE tenant_id = $1
            AND subversion_id = $2
            AND subversion_review_id = $3
        `,
        [context.tenantId, subversionId, row.subversion_review_id, audit.eventId],
      );
      await tx.query(
        `
          UPDATE document_subversions
          SET last_audit_event_id = $4,
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND subversion_id = $3
        `,
        [context.tenantId, documentId, subversionId, audit.eventId],
      );
      return mapSubversionReview(row);
    });
  }

  async assignReviewer(
    actorUserId: string,
    documentId: string,
    subversionId: string,
    input: AssignDocumentSubversionReviewerDto,
  ): Promise<DocumentSubversionReviewerDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const subversion = await this.findSubversionById(
        context.tenantId,
        documentId,
        subversionId,
        tx,
        true,
      );
      if (!subversion) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canCheckInDocument.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      if (subversion.status !== 'saved' && subversion.status !== 'submitted') {
        throw validationFailed('subversion_not_promotable');
      }
      const upserted = await tx.query(
        `
          WITH reviewer AS (
            SELECT user_id, name, email
            FROM users
            WHERE tenant_id = $1
              AND user_id = $3
          ),
          upserted AS (
            INSERT INTO document_subversion_reviewers (
              tenant_id, subversion_id, reviewer_user_id, assigned_by
            )
            SELECT $1, $2, reviewer.user_id, $4
            FROM reviewer
            ON CONFLICT (tenant_id, subversion_id, reviewer_user_id)
            DO UPDATE SET status = 'active',
              assigned_by = EXCLUDED.assigned_by,
              revoked_at = NULL
            RETURNING subversion_reviewer_id, subversion_id, $5::uuid AS document_id,
              reviewer_user_id, assigned_by, status, created_at, revoked_at
          )
          SELECT upserted.*, reviewer.name AS reviewer_display_name,
            reviewer.email AS reviewer_display_email
          FROM upserted
          JOIN reviewer
            ON reviewer.user_id = upserted.reviewer_user_id
        `,
        [context.tenantId, subversionId, input.reviewerUserId, actorUserId, documentId],
      );
      const row = upserted.rows[0] as SubversionReviewerRow | undefined;
      if (!row) throw validationFailed('subversion_not_found');
      const audit = await this.auditService.log(
        documentSubversionReviewerAssignedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: subversion.matter_id,
          subversionId,
          baseVersionId: subversion.base_version_id,
          subversionReviewerId: row.subversion_reviewer_id,
          reviewerUserId: row.reviewer_user_id,
        }),
        tx,
      );
      await tx.query(
        `
          UPDATE document_subversions
          SET last_audit_event_id = $4,
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND subversion_id = $3
        `,
        [context.tenantId, documentId, subversionId, audit.eventId],
      );
      return mapSubversionReviewer(row);
    });
  }

  async revokeReviewer(
    actorUserId: string,
    documentId: string,
    subversionId: string,
    reviewerUserId: string,
  ): Promise<DocumentSubversionReviewerDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const subversion = await this.findSubversionById(
        context.tenantId,
        documentId,
        subversionId,
        tx,
        true,
      );
      if (!subversion) throw notFoundDenied();
      await this.assertAllowed(
        this.permissionService.canCheckInDocument.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      if (subversion.status !== 'saved' && subversion.status !== 'submitted') {
        throw validationFailed('subversion_not_promotable');
      }
      const updated = await tx.query(
        `
          WITH updated AS (
            UPDATE document_subversion_reviewers
            SET status = 'revoked',
              revoked_at = now()
            WHERE tenant_id = $1
              AND subversion_id = $2
              AND reviewer_user_id = $3
              AND status = 'active'
            RETURNING subversion_reviewer_id, subversion_id, $4::uuid AS document_id,
              reviewer_user_id, assigned_by, status, created_at, revoked_at
          )
          SELECT updated.*, u.name AS reviewer_display_name,
            u.email AS reviewer_display_email
          FROM updated
          JOIN users u
            ON u.tenant_id = $1
            AND u.user_id = updated.reviewer_user_id
        `,
        [context.tenantId, subversionId, reviewerUserId, documentId],
      );
      const row = updated.rows[0] as SubversionReviewerRow | undefined;
      if (!row) throw notFoundDenied();
      const audit = await this.auditService.log(
        documentSubversionReviewerRevokedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: subversion.matter_id,
          subversionId,
          baseVersionId: subversion.base_version_id,
          subversionReviewerId: row.subversion_reviewer_id,
          reviewerUserId: row.reviewer_user_id,
        }),
        tx,
      );
      await tx.query(
        `
          UPDATE document_subversions
          SET last_audit_event_id = $4,
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND subversion_id = $3
        `,
        [context.tenantId, documentId, subversionId, audit.eventId],
      );
      return mapSubversionReviewer(row);
    });
  }

  async checkIn(
    actorUserId: string,
    documentId: string,
    editSessionId: string,
    input: CheckInDocumentEditSessionDto,
  ): Promise<DocumentEditSessionDto> {
    const context = this.tenantContext.require();
    const result = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        actorUserId,
        documentId,
        editSessionId,
        this.permissionService.canCheckInDocument.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      const latest = await this.findLatestSavedSubversion(context.tenantId, editSessionId, tx);
      if (!latest) throw validationFailed('subversion_required');
      if (input.expectedLastSubversionId && input.expectedLastSubversionId !== latest.subversion_id) {
        throw validationFailed('edit_session_conflict');
      }
      await tx.query(
        `
          UPDATE document_subversions
          SET status = 'submitted',
            submitted_by = $4,
            submitted_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND subversion_id = $3
            AND status = 'saved'
        `,
        [context.tenantId, documentId, latest.subversion_id, actorUserId],
      );
      const audit = await this.auditService.log(
        documentCheckedInAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: session.matter_id,
          editSessionId,
          baseVersionId: session.base_version_id,
          subversionId: latest.subversion_id,
        }),
        tx,
      );
      const updated = await tx.query(
        `
          WITH updated AS (
            UPDATE document_edit_sessions
            SET status = 'checked_in',
              checked_in_at = now(),
              last_audit_event_id = $4,
              updated_at = now()
            WHERE tenant_id = $1
              AND document_id = $2
              AND edit_session_id = $3
              AND status = 'active'
            RETURNING edit_session_id, document_id, base_version_id, status, client_kind,
              lock_owner_user_id, checked_out_at, heartbeat_at, expires_at, checked_in_at,
              cancelled_at, expired_at, conflicted_at
          )
          SELECT updated.*, d.matter_id, bv.version_no AS base_version_no
          FROM updated
          JOIN documents d
            ON d.tenant_id = $1
            AND d.document_id = updated.document_id
          JOIN document_versions bv
            ON bv.tenant_id = $1
            AND bv.version_id = updated.base_version_id
        `,
        [context.tenantId, documentId, editSessionId, audit.eventId],
      );
      const row = updated.rows[0] as EditSessionRow | undefined;
      if (!row) throw validationFailed('edit_session_conflict');
      return { session: mapSession(row) };
    });
    if ('expired' in result) throw documentLocked('edit_session_expired');
    return result.session;
  }

  async cancel(
    actorUserId: string,
    documentId: string,
    editSessionId: string,
    reasonCode?: string,
  ): Promise<DocumentEditSessionDto> {
    const context = this.tenantContext.require();
    const result = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        actorUserId,
        documentId,
        editSessionId,
        this.permissionService.canCheckInDocument.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      await tx.query(
        `
          UPDATE document_subversions
          SET status = 'abandoned',
            abandoned_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND edit_session_id = $3
            AND status = 'saved'
        `,
        [context.tenantId, documentId, editSessionId],
      );
      const audit = await this.auditService.log(
        documentCheckinCancelledAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: session.matter_id,
          editSessionId,
          baseVersionId: session.base_version_id,
          ...(reasonCode ? { reasonCode } : {}),
        }),
        tx,
      );
      const updated = await tx.query(
        `
          WITH updated AS (
            UPDATE document_edit_sessions
            SET status = 'cancelled',
              cancelled_at = now(),
              cancelled_reason_code = $4,
              last_audit_event_id = $5,
              updated_at = now()
            WHERE tenant_id = $1
              AND document_id = $2
              AND edit_session_id = $3
              AND status = 'active'
            RETURNING edit_session_id, document_id, base_version_id, status, client_kind,
              lock_owner_user_id, checked_out_at, heartbeat_at, expires_at, checked_in_at,
              cancelled_at, expired_at, conflicted_at
          )
          SELECT updated.*, d.matter_id, bv.version_no AS base_version_no
          FROM updated
          JOIN documents d
            ON d.tenant_id = $1
            AND d.document_id = updated.document_id
          JOIN document_versions bv
            ON bv.tenant_id = $1
            AND bv.version_id = updated.base_version_id
        `,
        [context.tenantId, documentId, editSessionId, reasonCode ?? null, audit.eventId],
      );
      const row = updated.rows[0] as EditSessionRow | undefined;
      if (!row) throw validationFailed('edit_session_conflict');
      return { session: mapSession(row) };
    });
    if ('expired' in result) throw documentLocked('edit_session_expired');
    return result.session;
  }

  async promote(
    actorUserId: string,
    documentId: string,
    subversionId: string,
    input: PromoteDocumentSubversionDto,
  ): Promise<PromoteDocumentSubversionResponseDto> {
    const context = this.tenantContext.require();
    const result = await this.auditService.transaction(context.tenantId, async (tx) => {
      const subversion = await this.findSubversionForPromotion(
        context.tenantId,
        documentId,
        subversionId,
        tx,
      );
      if (!subversion) throw notFoundDenied();
      if (input.expectedBaseVersionId !== subversion.base_version_id) {
        throw validationFailed('base_version_stale');
      }
      await this.assertAllowed(
        this.permissionService.canPromoteDocumentVersion.bind(this.permissionService),
        context.tenantId,
        actorUserId,
        documentId,
      );
      if (subversion.status === 'promoted') {
        const promotedVersion = await this.findPromotedVersionBySubversion(
          context.tenantId,
          documentId,
          subversionId,
          tx,
        );
        if (!promotedVersion) throw validationFailed('promotion_conflict');
        return {
          response: mapPromotionResponse(documentId, subversionId, promotedVersion),
        };
      }
      if (subversion.status !== 'submitted') {
        throw validationFailed('subversion_not_promotable');
      }
      await this.assertReviewGateSatisfied(
        context.tenantId,
        subversion.subversion_id,
        subversion.visibility_scope,
        tx,
      );
      const target = await this.findTarget(context.tenantId, documentId, tx, true);
      if (!target) throw notFoundDenied();
      assertDocumentMutationAllowed({
        documentStatus: target.status,
        matterStatus: target.matter_status,
      });
      const current = await this.findCurrentVersion(context.tenantId, documentId, tx);
      if (!current) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
      if (current.version_id !== subversion.base_version_id) {
        await this.auditService.log(
          documentEditConflictAudit({
            tenantId: context.tenantId,
            actorId: actorUserId,
            documentId,
            matterId: subversion.matter_id,
            editSessionId: subversion.edit_session_id,
            subversionId,
            baseVersionId: subversion.base_version_id,
            currentVersionId: current.version_id,
            reasonCode: 'BASE_VERSION_STALE',
          }),
          tx,
        );
        return { conflict: true as const };
      }
      const nextVersionNo = this.versionNumberResolver.nextAfter(current.version_no);
      const superseded = await tx.query(
        `
          UPDATE document_versions
          SET version_status = 'superseded'
          WHERE tenant_id = $1
            AND document_id = $2
            AND version_id = $3
            AND version_status = 'current'
        `,
        [context.tenantId, documentId, current.version_id],
      );
      if (superseded.rowCount !== 1) throw validationFailed('promotion_conflict');
      await this.searchIndexSync?.enqueueVersion(
        { tenantId: context.tenantId, documentId, versionId: current.version_id },
        tx,
      );
      const inserted = await tx.query(
        `
          INSERT INTO document_versions (
            tenant_id, document_id, version_no, version_status, file_object_id, file_hash,
            created_by, supersedes_version_id, promoted_from_subversion_id, published_by,
            published_at, publish_reason_code
          )
          VALUES ($1, $2, $3, 'current', $4, $5, $6, $7, $8, $6, now(), $9)
          RETURNING version_id, document_id, version_no, version_status, file_object_id,
            file_hash, created_by, created_at, supersedes_version_id,
            promoted_from_subversion_id, published_at
        `,
        [
          context.tenantId,
          documentId,
          nextVersionNo,
          subversion.file_object_id,
          subversion.file_hash,
          actorUserId,
          current.version_id,
          subversionId,
          input.publishReasonCode ?? null,
        ],
      );
      const version = inserted.rows[0] as PromotionVersionRow | undefined;
      if (!version) throw new Error('promoted document version insert returned no row');
      await this.extractionQueue?.enqueueVersionCreated(
        {
          tenantId: context.tenantId,
          documentId,
          versionId: version.version_id,
          fileObjectId: version.file_object_id,
        },
        tx,
      );
      const audit = await this.auditService.log(
        documentVersionPromotedAudit({
          tenantId: context.tenantId,
          actorId: actorUserId,
          documentId,
          matterId: subversion.matter_id,
          subversionId,
          baseVersionId: subversion.base_version_id,
          promotedVersionId: version.version_id,
          versionNo: version.version_no,
          ...(input.publishReasonCode ? { reasonCode: input.publishReasonCode } : {}),
        }),
        tx,
      );
      const updatedSubversion = await tx.query(
        `
          UPDATE document_subversions
          SET status = 'promoted',
            promoted_by = $4,
            promoted_at = $5,
            promoted_version_id = $6,
            last_audit_event_id = $7,
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
            AND subversion_id = $3
            AND status = 'submitted'
        `,
        [
          context.tenantId,
          documentId,
          subversionId,
          actorUserId,
          version.published_at,
          version.version_id,
          audit.eventId,
        ],
      );
      if (updatedSubversion.rowCount !== 1) throw validationFailed('promotion_conflict');
      return {
        response: mapPromotionResponse(documentId, subversionId, version),
      };
    });
    if ('conflict' in result) throw validationFailed('base_version_stale');
    return result.response;
  }

  private async assertReviewGateSatisfied(
    tenantId: TenantId,
    subversionId: string,
    visibilityScope: DocumentSubversionDto['visibilityScope'],
    tx: QueryClient,
  ): Promise<void> {
    const result = await tx.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE reviewer.status = 'active')::int AS active_reviewers,
          COUNT(review.subversion_review_id) FILTER (
            WHERE reviewer.status = 'active'
              AND review.decision = 'approved'
          )::int AS approved_reviews,
          COUNT(review.subversion_review_id) FILTER (
            WHERE reviewer.status = 'active'
              AND review.decision = 'changes_requested'
          )::int AS changes_requested_reviews
        FROM document_subversion_reviewers reviewer
        LEFT JOIN document_subversion_review_decisions review
          ON review.tenant_id = reviewer.tenant_id
          AND review.subversion_id = reviewer.subversion_id
          AND review.reviewer_user_id = reviewer.reviewer_user_id
        WHERE reviewer.tenant_id = $1
          AND reviewer.subversion_id = $2
      `,
      [tenantId, subversionId],
    );
    const row = result.rows[0] as SubversionReviewGateRow | undefined;
    const activeReviewers = Number(row?.active_reviewers ?? 0);
    const approvedReviews = Number(row?.approved_reviews ?? 0);
    const changesRequestedReviews = Number(row?.changes_requested_reviews ?? 0);
    if (changesRequestedReviews > 0) throw validationFailed('review_changes_requested');
    if (activeReviewers > 0 && approvedReviews < activeReviewers) {
      throw validationFailed('review_required');
    }
    if (visibilityScope === 'reviewers' && activeReviewers === 0) {
      throw validationFailed('review_required');
    }
  }

  private async prepareEditFile(file: UploadedDiskFile): Promise<PreparedEditFile> {
    this.fileSizeValidator.validate(file.size);
    const originalFilename = normalizeTransportFilename(file.originalname);
    const { extension, normalizedFilename } = this.extensionValidator.validate(originalFilename);
    const sniffed = await this.mimeTypeValidator.validate({
      path: file.path,
      sizeBytes: file.size,
      extension,
      declaredMimeType: file.mimetype,
    });
    return {
      fileObjectId: randomUUID(),
      originalFilename,
      normalizedFilename,
      mimeType: sniffed.mimeType,
      sizeBytes: file.size,
      sha256: await sha256File(file.path),
    };
  }

  private async savePreparedSubversion(
    input: SavePreparedSubversionInput,
  ): Promise<DocumentSubversionDto> {
    const context = this.tenantContext.require();
    const preflight = await this.auditService.transaction(context.tenantId, async (tx) => {
      const session = await this.requireOwnedActiveSession(
        context.tenantId,
        input.actorUserId,
        input.documentId,
        input.editSessionId,
        this.permissionService.canSaveDocumentSubversion.bind(this.permissionService),
        tx,
      );
      if (session === 'expired') return { expired: true as const };
      if (shouldValidateEditPackageSave(input.fields)) {
        const baseFile = await this.findBaseVersionFile(
          context.tenantId,
          input.documentId,
          session.base_version_id,
          tx,
        );
        if (!baseFile) throw validationFailed('DOCUMENT_VERSION_BASELINE_MISSING');
        this.assertEditPackageSaveMatchesBaseFile(input.fields, baseFile);
      }
      if (input.fields.clientSaveId) {
        const existing = await this.findSubversionByClientSaveId(
          context.tenantId,
          input.documentId,
          input.editSessionId,
          input.fields.clientSaveId,
          tx,
        );
        if (existing) {
          return { existing: mapSubversion(existing) };
        }
      }
      return { session };
    });
    if ('expired' in preflight) throw documentLocked('edit_session_expired');
    if ('existing' in preflight) return preflight.existing;

    const storage = await this.storageService.putTenantObject({
      tenantId: context.tenantId,
      matterId: preflight.session.matter_id,
      documentId: input.documentId,
      fileObjectId: input.prepared.fileObjectId,
      body: input.body(),
      contentLength: input.prepared.sizeBytes,
      contentType: input.prepared.mimeType,
    });

    try {
      const saved = await this.auditService.transaction(context.tenantId, async (tx) => {
        const session = await this.requireOwnedActiveSession(
          context.tenantId,
          input.actorUserId,
          input.documentId,
          input.editSessionId,
          this.permissionService.canSaveDocumentSubversion.bind(this.permissionService),
          tx,
        );
        if (session === 'expired') return { expired: true as const };
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `${context.tenantId}:${session.base_version_id}`,
        ]);
        const nextNo = await tx.query(
          `
            SELECT COALESCE(MAX(subversion_no), 0) + 1 AS next_no
            FROM document_subversions
            WHERE tenant_id = $1
              AND base_version_id = $2
          `,
          [context.tenantId, session.base_version_id],
        );
        const nextSubversionNo = Number(
          (nextNo.rows[0] as { next_no?: number | string } | undefined)?.next_no ?? 1,
        );
        await this.fileObjectService.create(
          {
            fileObjectId: input.prepared.fileObjectId,
            tenantId: context.tenantId,
            storageUri: storage.storageUri,
            originalFilename: input.prepared.originalFilename,
            normalizedFilename: input.prepared.normalizedFilename,
            mimeType: input.prepared.mimeType,
            sizeBytes: input.prepared.sizeBytes,
            sha256: input.prepared.sha256,
            encryptionKeyId: storage.encryptionKeyId,
            sourceSystem: 'document_edit',
            createdBy: input.actorUserId,
          },
          tx,
        );
        const inserted = await tx.query(
          `
            INSERT INTO document_subversions (
              tenant_id, document_id, base_version_id, edit_session_id, subversion_no,
              file_object_id, file_hash, status, visibility_scope, save_reason_code,
              client_save_id, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'saved', $8, $9, $10, $11)
            RETURNING subversion_id, document_id, base_version_id, subversion_no,
              edit_session_id, status, visibility_scope, file_object_id, file_hash,
              created_by, created_at, submitted_at, promoted_version_id
          `,
          [
            context.tenantId,
            input.documentId,
            session.base_version_id,
            input.editSessionId,
            nextSubversionNo,
            input.prepared.fileObjectId,
            input.prepared.sha256,
            input.fields.visibilityScope,
            input.fields.saveReasonCode ?? null,
            input.fields.clientSaveId ?? null,
            input.actorUserId,
          ],
        );
        const row = inserted.rows[0] as
          | (Omit<SubversionRow, 'matter_id' | 'base_version_no'> & {
              matter_id?: never;
              base_version_no?: never;
            })
          | undefined;
        if (!row) throw new Error('document subversion insert returned no row');
        const subversion: SubversionRow = {
          ...row,
          matter_id: session.matter_id,
          base_version_no: session.base_version_no,
        };
        const audit = await this.auditService.log(
          documentSubversionSavedAudit({
            tenantId: context.tenantId,
            actorId: input.actorUserId,
            documentId: input.documentId,
            matterId: session.matter_id,
            editSessionId: input.editSessionId,
            baseVersionId: session.base_version_id,
            subversionId: subversion.subversion_id,
            baseVersionNo: session.base_version_no,
            subversionNo: subversion.subversion_no,
            fileObjectId: input.prepared.fileObjectId,
            hash: input.prepared.sha256,
            visibilityScope: input.fields.visibilityScope,
            ...(input.fields.saveReasonCode ? { reasonCode: input.fields.saveReasonCode } : {}),
          }),
          tx,
        );
        await tx.query(
          `
            UPDATE document_edit_sessions
            SET last_audit_event_id = $4,
              heartbeat_at = now(),
              updated_at = now()
            WHERE tenant_id = $1
              AND document_id = $2
              AND edit_session_id = $3
          `,
          [context.tenantId, input.documentId, input.editSessionId, audit.eventId],
        );
        await tx.query(
          `
            UPDATE document_subversions
            SET last_audit_event_id = $4,
              updated_at = now()
            WHERE tenant_id = $1
              AND document_id = $2
              AND subversion_id = $3
          `,
          [context.tenantId, input.documentId, subversion.subversion_id, audit.eventId],
        );
        return { subversion: mapSubversion(subversion) };
      });
      if ('expired' in saved) throw documentLocked('edit_session_expired');
      return saved.subversion;
    } catch (error) {
      await this.compensateStorageObject(context.tenantId, storage.storageUri);
      throw error;
    }
  }

  private assertNativeEditableBaseFile(file: BaseVersionFileRow): void {
    const sizeBytes = Number(file.size_bytes);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw validationFailed('native_edit_unsupported');
    }
    if (sizeBytes > NATIVE_EDIT_MAX_BYTES || !isNativeEditableMimeType(file.mime_type)) {
      throw validationFailed('native_edit_unsupported');
    }
  }

  private assertEditPackageSaveMatchesBaseFile(
    fields: SaveDocumentSubversionFieldsDto,
    file: BaseVersionFileRow,
  ): void {
    if (fields.expectedBaseSha256 && fields.expectedBaseSha256 !== file.sha256) {
      throw validationFailed('base_version_stale');
    }
    if (fields.editPackageMode && fields.editPackageMode !== editPackageMode(file.mime_type)) {
      throw validationFailed('base_version_stale');
    }
  }

  private async requireOwnedActiveSession(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
    editSessionId: string,
    permissionCheck: PermissionCheck,
    tx: PoolClient,
  ): Promise<EditSessionRow | 'expired'> {
    const row = await this.findSessionById(tenantId, documentId, editSessionId, tx, true);
    if (!row) throw notFoundDenied();
    await this.assertAllowed(permissionCheck, tenantId, actorUserId, documentId);
    if (row.lock_owner_user_id !== actorUserId) throw permissionDenied();
    if (row.status !== 'active') throw validationFailed('edit_session_not_found');
    if (!isExpired(row)) return row;
    await this.expireSession(tenantId, actorUserId, row, tx);
    return 'expired';
  }

  private async assertAllowed(
    permissionCheck: PermissionCheck,
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await permissionCheck({ tenantId, userId: actorUserId }, documentId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }

  private async expireSession(
    tenantId: TenantId,
    actorUserId: string,
    row: EditSessionRow,
    tx: PoolClient,
  ): Promise<void> {
    const audit = await this.auditService.log(
      documentLockExpiredAudit({
        tenantId,
        actorId: actorUserId,
        documentId: row.document_id,
        matterId: row.matter_id,
        editSessionId: row.edit_session_id,
        baseVersionId: row.base_version_id,
      }),
      tx,
    );
    await tx.query(
      `
        UPDATE document_edit_sessions
        SET status = 'expired',
          expired_at = now(),
          last_audit_event_id = $4,
          updated_at = now()
        WHERE tenant_id = $1
          AND document_id = $2
          AND edit_session_id = $3
          AND status = 'active'
      `,
      [tenantId, row.document_id, row.edit_session_id, audit.eventId],
    );
  }

  private async findTarget(
    tenantId: TenantId,
    documentId: string,
    client: QueryClient,
    lockDocument: boolean,
  ): Promise<DocumentTargetRow | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.status, m.status AS matter_status
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
    return (result.rows[0] as DocumentTargetRow | undefined) ?? null;
  }

  private async findCurrentVersion(
    tenantId: TenantId,
    documentId: string,
    client: QueryClient,
  ): Promise<CurrentVersionRow | null> {
    const result = await client.query(
      `
        SELECT version_id, version_no
        FROM document_versions
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_status = 'current'
        ORDER BY version_no DESC
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as CurrentVersionRow | undefined) ?? null;
  }

  private async findActiveSession(
    tenantId: TenantId,
    documentId: string,
    client: QueryClient,
    lockSession: boolean,
  ): Promise<EditSessionRow | null> {
    const result = await client.query(
      `
        SELECT es.edit_session_id, es.document_id, d.matter_id, es.base_version_id,
          bv.version_no AS base_version_no, es.status, es.client_kind, es.lock_owner_user_id,
          es.checked_out_at, es.heartbeat_at, es.expires_at, es.checked_in_at,
          es.cancelled_at, es.expired_at, es.conflicted_at
        FROM document_edit_sessions es
        JOIN documents d
          ON d.tenant_id = es.tenant_id
          AND d.document_id = es.document_id
        JOIN document_versions bv
          ON bv.tenant_id = es.tenant_id
          AND bv.version_id = es.base_version_id
        WHERE es.tenant_id = $1
          AND es.document_id = $2
          AND es.status = 'active'
        ORDER BY es.checked_out_at DESC
        LIMIT 1
        ${lockSession ? 'FOR UPDATE OF es' : ''}
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as EditSessionRow | undefined) ?? null;
  }

  private async findSessionById(
    tenantId: TenantId,
    documentId: string,
    editSessionId: string,
    client: QueryClient,
    lockSession: boolean,
  ): Promise<EditSessionRow | null> {
    const result = await client.query(
      `
        SELECT es.edit_session_id, es.document_id, d.matter_id, es.base_version_id,
          bv.version_no AS base_version_no, es.status, es.client_kind, es.lock_owner_user_id,
          es.checked_out_at, es.heartbeat_at, es.expires_at, es.checked_in_at,
          es.cancelled_at, es.expired_at, es.conflicted_at
        FROM document_edit_sessions es
        JOIN documents d
          ON d.tenant_id = es.tenant_id
          AND d.document_id = es.document_id
        JOIN document_versions bv
          ON bv.tenant_id = es.tenant_id
          AND bv.version_id = es.base_version_id
        WHERE es.tenant_id = $1
          AND es.document_id = $2
          AND es.edit_session_id = $3
        LIMIT 1
        ${lockSession ? 'FOR UPDATE OF es' : ''}
      `,
      [tenantId, documentId, editSessionId],
    );
    return (result.rows[0] as EditSessionRow | undefined) ?? null;
  }

  private async findLatestSavedSubversion(
    tenantId: TenantId,
    editSessionId: string,
    client: QueryClient,
  ): Promise<SubversionRow | null> {
    const result = await client.query(
      `
        SELECT sv.subversion_id, sv.document_id, d.matter_id, sv.base_version_id,
          bv.version_no AS base_version_no, sv.subversion_no, sv.edit_session_id,
          sv.status, sv.visibility_scope, sv.file_object_id, sv.file_hash,
          sv.created_by, sv.created_at, sv.submitted_at, sv.promoted_version_id
        FROM document_subversions sv
        JOIN documents d
          ON d.tenant_id = sv.tenant_id
          AND d.document_id = sv.document_id
        JOIN document_versions bv
          ON bv.tenant_id = sv.tenant_id
          AND bv.version_id = sv.base_version_id
        WHERE sv.tenant_id = $1
          AND sv.edit_session_id = $2
          AND sv.status = 'saved'
        ORDER BY sv.subversion_no DESC, sv.created_at DESC
        LIMIT 1
        FOR UPDATE OF sv
      `,
      [tenantId, editSessionId],
    );
    return (result.rows[0] as SubversionRow | undefined) ?? null;
  }

  private async findSubversionByClientSaveId(
    tenantId: TenantId,
    documentId: string,
    editSessionId: string,
    clientSaveId: string,
    client: QueryClient,
  ): Promise<SubversionRow | null> {
    const result = await client.query(
      `
        SELECT sv.subversion_id, sv.document_id, d.matter_id, sv.base_version_id,
          bv.version_no AS base_version_no, sv.subversion_no, sv.edit_session_id,
          sv.status, sv.visibility_scope, sv.file_object_id, sv.file_hash,
          sv.created_by, sv.created_at, sv.submitted_at, sv.promoted_version_id
        FROM document_subversions sv
        JOIN documents d
          ON d.tenant_id = sv.tenant_id
          AND d.document_id = sv.document_id
        JOIN document_versions bv
          ON bv.tenant_id = sv.tenant_id
          AND bv.version_id = sv.base_version_id
        WHERE sv.tenant_id = $1
          AND sv.document_id = $2
          AND sv.edit_session_id = $3
          AND sv.client_save_id = $4
        LIMIT 1
      `,
      [tenantId, documentId, editSessionId, clientSaveId],
    );
    return (result.rows[0] as SubversionRow | undefined) ?? null;
  }

  private async findBaseVersionFile(
    tenantId: TenantId,
    documentId: string,
    baseVersionId: string,
    client: QueryClient,
  ): Promise<BaseVersionFileRow | null> {
    const result = await client.query(
      `
        SELECT dv.version_id, dv.version_no, fo.storage_uri, fo.original_filename,
          fo.normalized_filename, fo.mime_type, fo.size_bytes, fo.sha256
        FROM document_versions dv
        JOIN file_objects fo
          ON fo.tenant_id = dv.tenant_id
          AND fo.file_object_id = dv.file_object_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_id = $3
        LIMIT 1
      `,
      [tenantId, documentId, baseVersionId],
    );
    return (result.rows[0] as BaseVersionFileRow | undefined) ?? null;
  }

  private async findSubversionFile(
    tenantId: TenantId,
    subversionId: string,
    client: QueryClient,
  ): Promise<StoredFileRow | null> {
    const result = await client.query(
      `
        SELECT fo.storage_uri, fo.original_filename, fo.normalized_filename,
          fo.mime_type, fo.size_bytes, fo.sha256
        FROM document_subversions sv
        JOIN file_objects fo
          ON fo.tenant_id = sv.tenant_id
          AND fo.file_object_id = sv.file_object_id
        WHERE sv.tenant_id = $1
          AND sv.subversion_id = $2
        LIMIT 1
      `,
      [tenantId, subversionId],
    );
    return (result.rows[0] as StoredFileRow | undefined) ?? null;
  }

  private async findSubversionForPromotion(
    tenantId: TenantId,
    documentId: string,
    subversionId: string,
    client: QueryClient,
  ): Promise<SubversionRow | null> {
    return this.findSubversionById(tenantId, documentId, subversionId, client, true);
  }

  private async findPromotedVersionBySubversion(
    tenantId: TenantId,
    documentId: string,
    subversionId: string,
    client: QueryClient,
  ): Promise<PromotionVersionRow | null> {
    const result = await client.query(
      `
        SELECT version_id, document_id, version_no, version_status, file_object_id,
          file_hash, created_by, created_at, supersedes_version_id,
          promoted_from_subversion_id, published_at
        FROM document_versions
        WHERE tenant_id = $1
          AND document_id = $2
          AND promoted_from_subversion_id = $3
        LIMIT 1
      `,
      [tenantId, documentId, subversionId],
    );
    return (result.rows[0] as PromotionVersionRow | undefined) ?? null;
  }

  private async findSubversionById(
    tenantId: TenantId,
    documentId: string,
    subversionId: string,
    client: QueryClient,
    lockSubversion: boolean,
  ): Promise<SubversionRow | null> {
    const result = await client.query(
      `
        SELECT sv.subversion_id, sv.document_id, d.matter_id, sv.base_version_id,
          bv.version_no AS base_version_no, sv.subversion_no, sv.edit_session_id,
          sv.status, sv.visibility_scope, sv.file_object_id, sv.file_hash,
          sv.created_by, sv.created_at, sv.submitted_at, sv.promoted_version_id
        FROM document_subversions sv
        JOIN documents d
          ON d.tenant_id = sv.tenant_id
          AND d.document_id = sv.document_id
        JOIN document_versions bv
          ON bv.tenant_id = sv.tenant_id
          AND bv.version_id = sv.base_version_id
        WHERE sv.tenant_id = $1
          AND sv.document_id = $2
          AND sv.subversion_id = $3
        LIMIT 1
        ${lockSubversion ? 'FOR UPDATE OF sv' : ''}
      `,
      [tenantId, documentId, subversionId],
    );
    return (result.rows[0] as SubversionRow | undefined) ?? null;
  }

  private async findVisibleSubversionById(
    tenantId: TenantId,
    documentId: string,
    subversionId: string,
    actorUserId: string,
    client: QueryClient,
  ): Promise<SubversionRow | null> {
    const result = await client.query(
      `
        SELECT sv.subversion_id, sv.document_id, d.matter_id, sv.base_version_id,
          bv.version_no AS base_version_no, sv.subversion_no, sv.edit_session_id,
          sv.status, sv.visibility_scope, sv.file_object_id, sv.file_hash,
          sv.created_by, sv.created_at, sv.submitted_at, sv.promoted_version_id
        FROM document_subversions sv
        JOIN documents d
          ON d.tenant_id = sv.tenant_id
          AND d.document_id = sv.document_id
        JOIN document_versions bv
          ON bv.tenant_id = sv.tenant_id
          AND bv.version_id = sv.base_version_id
        LEFT JOIN matter_members mm
          ON mm.tenant_id = d.tenant_id
          AND mm.matter_id = d.matter_id
          AND mm.user_id = $4
        WHERE sv.tenant_id = $1
          AND sv.document_id = $2
          AND sv.subversion_id = $3
          AND (
            sv.created_by = $4
            OR EXISTS (
              SELECT 1
              FROM document_subversion_reviewers reviewer
              WHERE reviewer.tenant_id = sv.tenant_id
                AND reviewer.subversion_id = sv.subversion_id
                AND reviewer.reviewer_user_id = $4
                AND reviewer.status = 'active'
            )
            OR (sv.visibility_scope = 'matter_owners' AND mm.matter_role = 'owner')
            OR (
              sv.visibility_scope = 'matter_editors'
              AND (mm.matter_role = 'owner' OR mm.access_level = 'edit')
            )
          )
        LIMIT 1
      `,
      [tenantId, documentId, subversionId, actorUserId],
    );
    return (result.rows[0] as SubversionRow | undefined) ?? null;
  }

  private async compensateStorageObject(tenantId: TenantId, storageUri: string): Promise<void> {
    try {
      await this.storageService.deleteByStorageUri(tenantId, storageUri);
    } catch {
      this.logger.warn({ code: 'EDIT_STORAGE_COMPENSATION_FAILED' });
    }
  }

  private async unlinkTempFile(file: UploadedDiskFile | undefined): Promise<void> {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch {
      this.logger.warn({ code: 'EDIT_UPLOAD_TEMP_UNLINK_FAILED' });
    }
  }
}
