import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PermissionDecision, TenantId } from '@amic-vault/shared';
import { createDlpReviewRequestSchema } from '@amic-vault/shared';
import { AuditService, type QueryClient, type AuditLogInput } from '../../audit/audit.service';
import type { UploadedDiskFile } from '../../document/document-upload.service';
import { DocumentVersionService } from '../../document/document-version.service';
import { DlpService } from '../../dlp/dlp.service';
import { FileExtensionValidator } from '../../document/validators/file-extension.validator';
import { MimeTypeValidator } from '../../document/validators/mime-type.validator';
import { sha256File } from '../../document/integrity/sha256.util';
import { FileScanQueueService } from '../../file-security/file-scan-queue.service';
import { fileSecuritySignatureIsFresh } from '../../file-security/file-security-reconciler.service';
import { ClientDocumentAuthorityContext, type ClientDocumentAuthority } from '../../permission/client-document-authority';
import { PermissionService } from '../../permission/permission.service';
import { FileObjectService } from '../../storage/file-object.service';
import { StorageService } from '../../storage/storage.service';
import { assertActiveUserLifecycleFence } from '../../user/active-user-lifecycle-fence';
import { clientDocumentProviderRevision, clientDocumentSchemaVersion, maxClientDocumentBytes,
  type ClientDocumentEnvelope, type ClientDocumentMetadata, type ClientDocumentOperation } from './amic-os-vault-client.contract';

interface ScopeRow { client_scope_id: string; status: string }
interface EntryRow {
  document_id: string; title: string; status: string; created_at: Date; updated_at: Date | null;
  client_metadata_revision: number; client_document_metadata: ClientDocumentMetadata | null;
  current_version_id: string; version_id: string; version_no: number; file_object_id: string;
  file_hash: string; sha256: string; size_bytes: string; mime_type: string; storage_uri: string;
  version_created_at: Date; version_created_by: string; legal_hold: boolean;
}
interface UploadRow {
  upload_id: string; request_hash: string; scan_id: string; quarantine_ref: string;
  quarantine_storage_uri: string; expected_sha256: string; observed_sha256: string | null;
  size_bytes: string; state: string; result_code: string; signature_at: Date | null;
  filename: string; normalized_filename: string; mime_type: string; title: string;
  document_id: string | null; expected_version_id: string | null;
  promoted_document_id: string | null; promoted_version_id: string | null;
}
const entryProjection = `d.document_id, d.title, d.status, d.created_at, d.updated_at,
  d.client_metadata_revision, d.client_document_metadata, d.legal_hold,
  (SELECT cv.version_id FROM document_versions cv WHERE cv.tenant_id = d.tenant_id
    AND cv.document_id = d.document_id AND cv.version_status = 'current') AS current_version_id,
  v.version_id, v.version_no, v.file_object_id, v.file_hash, v.created_at AS version_created_at,
  v.created_by AS version_created_by, f.sha256, f.size_bytes::text, f.mime_type, f.storage_uri`;
const entryJoins = `JOIN document_versions v ON v.tenant_id = d.tenant_id AND v.document_id = d.document_id
  JOIN file_objects f ON f.tenant_id = v.tenant_id AND f.file_object_id = v.file_object_id
  JOIN file_security_promotions p ON p.tenant_id = v.tenant_id AND p.document_id = v.document_id
    AND p.version_id = v.version_id AND p.file_object_id = v.file_object_id AND p.primary_sha256 = v.file_hash
  JOIN file_security_scans s ON s.tenant_id = p.tenant_id AND s.scan_id = p.scan_id
    AND s.state = 'promoted' AND s.client_scope_id = d.client_scope_id`;
function denied(): never { throw new ForbiddenException({ code: 'PERMISSION_DENIED' }); }
function missing(): never { throw new NotFoundException({ code: 'PERMISSION_DENIED' }); }
function invalid(): never { throw new BadRequestException({ code: 'VALIDATION_FAILED' }); }
function conflict(): never { throw new ConflictException({ code: 'VALIDATION_FAILED' }); }
function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function allowed(decision: PermissionDecision): void { if (decision.effect !== 'ALLOW') denied(); }

@Injectable()
export class AmicOsVaultClientService {
  private readonly extension = new FileExtensionValidator();
  private readonly mime = new MimeTypeValidator();
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PermissionService) private readonly permissions: PermissionService,
    @Inject(ClientDocumentAuthorityContext) private readonly authorityContext: ClientDocumentAuthorityContext,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(FileObjectService) private readonly files: FileObjectService,
    @Inject(DocumentVersionService) private readonly versions: DocumentVersionService,
    @Inject(DlpService) private readonly dlp: DlpService,
    @Inject(FileScanQueueService) private readonly scans: FileScanQueueService,
  ) {}

  async execute(operation: ClientDocumentOperation, envelope: ClientDocumentEnvelope, file?: UploadedDiskFile) {
    const authority = this.authorityContext.current();
    if (!authority || authority.requestId !== envelope.request_id) denied();
    const ctx = { tenantId: authority.tenantId, userId: authority.actorUserId };
    allowed(await this.permissions.canAccessClientScope(ctx, authority.action));
    if (operation === 'workspaces/resolve') return this.resolveWorkspace(authority, envelope);
    const scope = await this.findScope(authority);
    allowed(await this.permissions.canAccessClientScope(ctx, authority.action, scope.client_scope_id));
    if (operation === 'uploads/stage') return this.stage(authority, scope, envelope, file);
    if (operation === 'uploads/complete' || operation === 'uploads/readback') {
      return this.uploadState(authority, scope, envelope, operation === 'uploads/complete');
    }
    if (operation === 'documents/list') return this.list(authority, scope, envelope);
    const documentId = String(envelope.input.document_id);
    await this.documentPermission(authority, documentId);
    if (operation === 'dlp/reviews/create') {
      const versionId = String(envelope.input.version_id);
      const input = createDlpReviewRequestSchema.parse({ decision: envelope.input.decision,
        reasonCode: envelope.input.reason_code, expiresAt: envelope.input.expires_at });
      return this.audit.transaction(authority.tenantId, async (tx) => {
        await this.entryRow(tx, authority, scope, documentId, versionId);
        const { review, auditEventId } = await this.dlp.createClientDocumentReview(
          { tenantId: authority.tenantId, userId: authority.actorUserId },
          String(envelope.input.assessment_id), input,
          { documentId, versionId, requestId: authority.requestId, decisionRef: authority.decisionRef }, tx);
        return this.respond(tx, authority, envelope,
          { document_id: documentId, version_id: versionId, assessment_id: review.assessmentId,
            review_id: review.reviewId, decision: review.decision, reason_code: review.reasonCode,
            expires_at: review.expiresAt, reviewed_at: review.reviewedAt },
          'DLP_REVIEW_RECORDED', review.assessmentId, 200, auditEventId);
      });
    }
    return this.audit.transaction(authority.tenantId, async (tx) => {
      const row = await this.entryRow(tx, authority, scope, documentId,
        operation === 'documents/download' || operation === 'dlp/assessments/read'
          ? envelope.input.version_id as string : null);
      if (operation === 'dlp/assessments/read') {
        const versionId = String(envelope.input.version_id);
        const assessment = await this.dlp.inspectClientDocumentAssessment(tx, {
          tenantId: authority.tenantId, documentId, versionId: row.version_id,
          userId: authority.actorUserId,
        });
        return this.respond(tx, authority, envelope, { document_id: documentId, version_id: versionId,
          assessment: { assessment_id: assessment.assessmentId, allowed: assessment.allowed,
            review_id: assessment.reviewId, scan_state: assessment.scanState,
            reason_code: assessment.reasonCode, requires_review: assessment.requiresReview,
            policy_version: assessment.policyVersion, result_hash: assessment.resultHash,
            finding_count: assessment.findingCount, restricted_finding_count: assessment.restrictedFindingCount } },
        'DOCUMENT_VIEWED', documentId);
      }
      if (operation === 'metadata/update') {
        if (row.client_metadata_revision !== envelope.input.expected_revision) conflict();
        const metadata = { category: envelope.input.category, issued_on: envelope.input.issued_on,
          viewed_on: envelope.input.viewed_on };
        const updated = await tx.query(`UPDATE documents SET client_document_metadata = $4::jsonb,
          client_metadata_revision = client_metadata_revision + 1, updated_at = now()
          WHERE tenant_id = $1 AND document_id = $2 AND client_metadata_revision = $3
            AND status NOT IN ('archived', 'disposal_locked', 'deleted') RETURNING document_id`,
        [authority.tenantId, documentId, envelope.input.expected_revision, JSON.stringify(metadata)]);
        if (updated.rowCount !== 1) conflict();
        const fresh = await this.entryRow(tx, authority, scope, documentId, null);
        return this.respond(tx, authority, envelope, this.entry(authority, fresh), 'DOCUMENT_METADATA_CHANGED', documentId);
      }
      if (operation === 'documents/versions') {
        const rows = await tx.query(`SELECT ${entryProjection} FROM documents d ${entryJoins}
          WHERE d.tenant_id = $1 AND d.client_scope_id = $2 AND d.document_id = $3
          ORDER BY v.version_no DESC`, [authority.tenantId, scope.client_scope_id, documentId]);
        return this.respond(tx, authority, envelope, { document: this.entry(authority, row).document,
          versions: (rows.rows as EntryRow[]).map((version) => ({ ...this.exact(version),
            version_number: version.version_no, created_by: version.version_created_by,
            created_at: version.version_created_at.toISOString() })) }, 'DOCUMENT_VIEWED', documentId);
      }
      if (operation === 'documents/download') return this.download(tx, authority, envelope, row);
      return this.respond(tx, authority, envelope, this.entry(authority, row), 'DOCUMENT_VIEWED', documentId);
    });
  }

  private async resolveWorkspace(authority: Readonly<ClientDocumentAuthority>, envelope: ClientDocumentEnvelope) {
    return this.audit.transaction(authority.tenantId, async (tx) => {
      await assertActiveUserLifecycleFence(tx, authority.tenantId as TenantId, authority.actorUserId);
      let created = false;
      if (envelope.input.mode === 'ensure') {
        const inserted = await tx.query(`INSERT INTO client_document_scopes
          (tenant_id, os_tenant_id, party_id, workspace_ref, created_by) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, os_tenant_id, party_id) DO NOTHING RETURNING client_scope_id`,
        [authority.tenantId, authority.osTenantId, authority.partyId, authority.workspaceRef, authority.actorUserId]);
        created = inserted.rowCount === 1;
      }
      const scope = await this.findScope(authority, tx);
      return this.respond(tx, authority, envelope, { workspace_id: authority.workspaceRef,
        party_id: authority.partyId, status: 'active', created }, 'CLIENT_DOCUMENT_SCOPE_RESOLVED', scope.client_scope_id);
    });
  }

  private async list(authority: Readonly<ClientDocumentAuthority>, scope: ScopeRow, envelope: ClientDocumentEnvelope) {
    const filter = await this.permissions.clientDocumentReadFilter(
      { tenantId: authority.tenantId, userId: authority.actorUserId }, scope.client_scope_id);
    const page = Number(envelope.input.page); const pageSize = Number(envelope.input.page_size);
    return this.audit.transaction(authority.tenantId, async (tx) => {
      if (filter.sql === 'FALSE') denied();
      const rows = await tx.query(`SELECT ${entryProjection} FROM documents d ${entryJoins}
        WHERE ${filter.sql} AND v.version_status = 'current' ORDER BY d.created_at DESC, d.document_id
        LIMIT $5 OFFSET $6`, [...filter.params, pageSize + 1, (page - 1) * pageSize]);
      const items = rows.rows as EntryRow[];
      return this.respond(tx, authority, envelope, { items: items.slice(0, pageSize).map((row) => this.entry(authority, row)),
        page_info: { page, page_size: pageSize, has_more: items.length > pageSize } },
      'CLIENT_DOCUMENT_LISTED', scope.client_scope_id);
    });
  }

  private async stage(authority: Readonly<ClientDocumentAuthority>, scope: ScopeRow,
    envelope: ClientDocumentEnvelope, file?: UploadedDiskFile) {
    const input = envelope.input;
    const expected = input.file as { filename: string; mime_type: string; byte_size: number; sha256: string };
    if (!file || file.size !== expected.byte_size || file.size > maxClientDocumentBytes) invalid();
    const validated = this.extension.validate(expected.filename);
    const sniffed = await this.mime.validate({ path: file.path, sizeBytes: file.size,
      extension: validated.extension, declaredMimeType: expected.mime_type });
    if (sniffed.mimeType !== expected.mime_type || await sha256File(file.path) !== expected.sha256) invalid();
    if (input.document_id) await this.documentPermission(authority, String(input.document_id));
    const requestHash = hash(JSON.stringify([authority.tenantId, authority.actorUserId, scope.client_scope_id,
      input.document_id, input.expected_version_id, input.title, expected.filename, expected.mime_type,
      expected.byte_size, expected.sha256]));
    const quarantineRef = randomUUID();
    let createdStorage: string | undefined;
    try {
      return await this.audit.transaction(authority.tenantId, async (tx) => {
        await assertActiveUserLifecycleFence(tx, authority.tenantId as TenantId, authority.actorUserId);
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`client-upload:${authority.tenantId}:${scope.client_scope_id}:${authority.actorUserId}:${String(input.idempotency_key)}`]);
        const existing = await this.findUpload(tx, authority, scope, 'u.idempotency_key = $4', String(input.idempotency_key));
        if (existing) {
          if (existing.request_hash !== requestHash) conflict();
          return this.uploadResponse(tx, authority, scope, envelope, existing);
        }
        if (input.document_id) {
          const target = await this.entryRow(tx, authority, scope, String(input.document_id), null);
          if (target.current_version_id !== input.expected_version_id) conflict();
        }
        const body = createReadStream(file.path);
        let object;
        try { object = await this.storage.putQuarantineObject({ tenantId: authority.tenantId,
          quarantineRef, body, contentLength: file.size, contentType: sniffed.mimeType }); }
        finally { body.destroy(); }
        createdStorage = object.storageUri;
        if (await this.storage.sha256ByStorageUri(authority.tenantId, object.storageUri) !== expected.sha256) invalid();
        const scan = await tx.query(`INSERT INTO file_security_scans
          (tenant_id, client_scope_id, quarantine_ref, quarantine_storage_uri, expected_sha256, size_bytes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING scan_id`, [authority.tenantId, scope.client_scope_id,
          quarantineRef, object.storageUri, expected.sha256, file.size, authority.actorUserId]);
        const scanId = (scan.rows[0] as { scan_id: string }).scan_id;
        const upload = await tx.query(`INSERT INTO client_document_uploads
          (tenant_id, client_scope_id, actor_id, idempotency_key, request_hash, scan_id, document_id,
          expected_version_id, filename, normalized_filename, mime_type, title)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING upload_id`,
        [authority.tenantId, scope.client_scope_id, authority.actorUserId, input.idempotency_key, requestHash,
          scanId, input.document_id, input.expected_version_id, expected.filename, validated.normalizedFilename,
          sniffed.mimeType, input.title]);
        const uploadId = (upload.rows[0] as { upload_id: string }).upload_id;
        await this.audit.log({ tenantId: authority.tenantId, actorId: authority.actorUserId,
          action: 'FILE_QUARANTINED', targetType: 'file_security_scan', targetId: scanId,
          metadata: { hash: expected.sha256, request_id: authority.requestId,
            decision_ref: authority.decisionRef, correlation_id: authority.requestId, idempotency_hash: hash(String(input.idempotency_key)) } }, tx);
        await this.scans.enqueue({ tenantId: authority.tenantId, quarantineRef, expectedSha256: expected.sha256 }, tx);
        const row = await this.findUpload(tx, authority, scope, 'u.upload_id = $4::uuid', uploadId);
        if (!row) missing();
        return this.uploadResponse(tx, authority, scope, envelope, row);
      });
    } catch (error) {
      if (createdStorage) await this.storage.deleteByStorageUri(authority.tenantId, createdStorage);
      throw error;
    }
  }

  private async uploadState(authority: Readonly<ClientDocumentAuthority>, scope: ScopeRow,
    envelope: ClientDocumentEnvelope, complete: boolean) {
    let createdStorage: string | undefined;
    try {
      return await this.audit.transaction(authority.tenantId, async (tx) => {
        await assertActiveUserLifecycleFence(tx, authority.tenantId as TenantId, authority.actorUserId);
        const row = await this.findUpload(tx, authority, scope, 'u.upload_id = $4::uuid', String(envelope.input.upload_id), true);
        if (!row) missing();
        if (row.document_id !== envelope.input.document_id
          || row.expected_version_id !== envelope.input.expected_version_id) denied();
        if (row.document_id) await this.documentPermission(authority, row.document_id);
        let promotedNow = false;
        if (complete && row.state === 'clean') {
          if (row.result_code !== 'clean' || row.observed_sha256 !== row.expected_sha256
            || !fileSecuritySignatureIsFresh(row.signature_at)) denied();
          let documentId = row.document_id;
          if (documentId) {
            await tx.query('SELECT document_id FROM documents WHERE tenant_id = $1 AND document_id = $2 FOR UPDATE',
              [authority.tenantId, documentId]);
            const current = await this.entryRow(tx, authority, scope, documentId, null);
            if (current.current_version_id !== row.expected_version_id) conflict();
          } else {
            documentId = randomUUID();
            await tx.query(`INSERT INTO documents (document_id,tenant_id,client_scope_id,document_family_id,title,created_by)
              VALUES ($1,$2,$3,$1,$4,$5)`, [documentId, authority.tenantId, scope.client_scope_id, row.title, authority.actorUserId]);
          }
          const fileObjectId = randomUUID();
          const source = await this.storage.getByStorageUri(authority.tenantId, row.quarantine_storage_uri);
          if (source.contentLength !== Number(row.size_bytes) || source.contentType !== row.mime_type) { source.body.destroy(); invalid(); }
          let stored;
          try { stored = await this.storage.putClientObject({ tenantId: authority.tenantId,
            clientScopeId: scope.client_scope_id, documentId, fileObjectId, body: source.body,
            contentLength: Number(row.size_bytes), contentType: row.mime_type }); }
          finally { source.body.destroy(); }
          createdStorage = stored.storageUri;
          if (await this.storage.sha256ByStorageUri(authority.tenantId, stored.storageUri) !== row.expected_sha256) invalid();
          await this.files.create({ fileObjectId, tenantId: authority.tenantId, storageUri: stored.storageUri,
            originalFilename: row.filename, normalizedFilename: row.normalized_filename, mimeType: row.mime_type,
            sizeBytes: Number(row.size_bytes), sha256: row.expected_sha256, encryptionKeyId: stored.encryptionKeyId,
            createdBy: authority.actorUserId }, tx);
          const versionInput = { tenantId: authority.tenantId as TenantId, documentId, fileObjectId,
            fileHash: row.expected_sha256, createdBy: authority.actorUserId, clientScopeId: scope.client_scope_id };
          const version = row.document_id ? await this.versions.addNextVersion(versionInput, tx)
            : await this.versions.createInitialVersion(versionInput, tx);
          if (row.expected_version_id && version.versionId === row.expected_version_id) conflict();
          await tx.query(`INSERT INTO file_security_promotions
            (scan_id,tenant_id,document_id,version_id,file_object_id,primary_sha256,promoted_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`, [row.scan_id, authority.tenantId, documentId,
            version.versionId, fileObjectId, row.expected_sha256, authority.actorUserId]);
          await tx.query(`UPDATE file_security_scans SET state='promoted', promoted_at=now(), updated_at=now()
            WHERE tenant_id=$1 AND scan_id=$2 AND state='clean'`, [authority.tenantId, row.scan_id]);
          await this.audit.log({ tenantId: authority.tenantId, actorId: authority.actorUserId,
            action: row.document_id ? 'DOCUMENT_VERSION_ADDED' : 'DOCUMENT_UPLOADED',
            targetType: 'document', targetId: documentId,
            metadata: { version_id: version.versionId, hash: row.expected_sha256,
              decision_ref: authority.decisionRef, correlation_id: authority.requestId } }, tx);
          await this.audit.log({ tenantId: authority.tenantId, actorId: authority.actorUserId,
            action: 'FILE_PROMOTED', targetType: 'file_security_scan', targetId: row.scan_id,
            metadata: { version_id: version.versionId, hash: row.expected_sha256,
              decision_ref: authority.decisionRef, correlation_id: authority.requestId } }, tx);
          promotedNow = true;
          row.state = 'promoted'; row.promoted_document_id = documentId; row.promoted_version_id = version.versionId;
        }
        return this.uploadResponse(tx, authority, scope, envelope, row, promotedNow);
      });
    } catch (error) {
      if (createdStorage) await this.storage.deleteByStorageUri(authority.tenantId, createdStorage);
      throw error;
    }
  }

  private async uploadResponse(tx: QueryClient, authority: Readonly<ClientDocumentAuthority>, scope: ScopeRow,
    envelope: ClientDocumentEnvelope, row: UploadRow, promotedNow = false) {
    let entry = null;
    if (row.state === 'promoted') {
      if (!row.promoted_document_id || !row.promoted_version_id) invalid();
      if (!promotedNow) await this.documentPermission(authority, row.promoted_document_id);
      entry = this.entry(authority, await this.entryRow(tx, authority, scope, row.promoted_document_id, row.promoted_version_id));
    } else if (!['quarantined', 'scanning', 'clean'].includes(row.state)) denied();
    return this.respond(tx, authority, envelope, { upload_id: row.upload_id,
      state: row.state === 'clean' ? 'ready_for_completion' : row.state, entry },
    'CLIENT_DOCUMENT_UPLOAD_READBACK', row.scan_id, row.state === 'promoted' ? 200 : 202);
  }

  private async findScope(authority: Readonly<ClientDocumentAuthority>, client?: QueryClient): Promise<ScopeRow> {
    const read = async (tx: QueryClient) => {
      const result = await tx.query(`SELECT client_scope_id, status FROM client_document_scopes
        WHERE tenant_id=$1 AND os_tenant_id=$2 AND party_id=$3 AND workspace_ref=$4 AND status='active'`,
      [authority.tenantId, authority.osTenantId, authority.partyId, authority.workspaceRef]);
      return (result.rows[0] as ScopeRow | undefined) ?? missing();
    };
    return client ? read(client) : this.audit.transaction(authority.tenantId, read);
  }

  private async findUpload(tx: QueryClient, authority: Readonly<ClientDocumentAuthority>, scope: ScopeRow,
    selector: string, value: string, lock = false): Promise<UploadRow | null> {
    const result = await tx.query(`SELECT u.*, s.quarantine_ref, s.quarantine_storage_uri,
      s.expected_sha256, s.observed_sha256, s.size_bytes::text, s.state, s.result_code, s.signature_at,
      p.document_id AS promoted_document_id, p.version_id AS promoted_version_id
      FROM client_document_uploads u JOIN file_security_scans s ON s.tenant_id=u.tenant_id AND s.scan_id=u.scan_id
        AND s.client_scope_id=u.client_scope_id
      LEFT JOIN file_security_promotions p ON p.tenant_id=s.tenant_id AND p.scan_id=s.scan_id
      WHERE u.tenant_id=$1 AND u.client_scope_id=$2 AND u.actor_id=$3 AND ${selector}
      ${lock ? 'FOR UPDATE OF s' : ''}`, [authority.tenantId, scope.client_scope_id, authority.actorUserId, value]);
    return (result.rows[0] as UploadRow | undefined) ?? null;
  }

  private async documentPermission(authority: Readonly<ClientDocumentAuthority>, documentId: string) {
    const ctx = { tenantId: authority.tenantId, userId: authority.actorUserId };
    allowed(await (authority.action === 'dms:document:write' ? this.permissions.canWriteClientDocument(ctx, documentId)
      : authority.action === 'dms:document:download' ? this.permissions.canDownloadDocument(ctx, documentId, 'amic_os_client_document')
        : this.permissions.canReadDocument(ctx, documentId)));
  }

  private async entryRow(tx: QueryClient, authority: Readonly<ClientDocumentAuthority>, scope: ScopeRow,
    documentId: string, versionId: string | null): Promise<EntryRow> {
    const result = await tx.query(`SELECT ${entryProjection} FROM documents d ${entryJoins}
      WHERE d.tenant_id=$1 AND d.client_scope_id=$2 AND d.document_id=$3 AND d.matter_id IS NULL
        AND d.status <> 'deleted' AND (($4::uuid IS NULL AND v.version_status='current') OR v.version_id=$4::uuid)`,
    [authority.tenantId, scope.client_scope_id, documentId, versionId]);
    return (result.rows[0] as EntryRow | undefined) ?? missing();
  }

  private exact(row: EntryRow) {
    const size = Number(row.size_bytes);
    if (row.file_hash !== row.sha256 || !/^[a-f0-9]{64}$/u.test(row.sha256)
      || !Number.isSafeInteger(size) || size < 1 || size > maxClientDocumentBytes) invalid();
    return { document_id: row.document_id, version_id: row.version_id, file_object_id: row.file_object_id,
      sha256: row.sha256, byte_size: size, mime_type: row.mime_type };
  }
  private entry(authority: Readonly<ClientDocumentAuthority>, row: EntryRow) {
    const status = row.legal_hold || row.status === 'disposal_locked' ? 'held'
      : row.status === 'archived' ? 'archived' : 'active';
    return { document: { tenant_id: authority.osTenantId, document_id: row.document_id,
      workspace_id: authority.workspaceRef, party_id: authority.partyId, matter_id: null,
      title: row.title, status, current_version_id: row.current_version_id,
      metadata_revision: row.client_metadata_revision, client_document: row.client_document_metadata,
      created_at: row.created_at.toISOString(), updated_at: (row.updated_at ?? row.created_at).toISOString() },
    exact_version: this.exact(row), version_number: row.version_no };
  }

  private async download(tx: QueryClient, authority: Readonly<ClientDocumentAuthority>, envelope: ClientDocumentEnvelope, row: EntryRow) {
    if (row.legal_hold || ['archived', 'disposal_locked', 'deleted'].includes(row.status)) denied();
    const dlp = await this.dlp.evaluateClientDocumentDownload(tx, {
      tenantId: authority.tenantId, documentId: row.document_id,
      versionId: row.version_id, userId: authority.actorUserId,
    });
    if (!dlp.allowed) denied();
    const bytes: Buffer[] = []; let size = 0;
    const source = await this.storage.getByStorageUri(authority.tenantId, row.storage_uri);
    try {
      for await (const chunk of source.body) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += value.length; if (size > maxClientDocumentBytes) invalid(); bytes.push(value);
      }
    } finally { source.body.destroy(); }
    const body = Buffer.concat(bytes);
    if (size !== Number(row.size_bytes) || source.contentType !== row.mime_type || hash(body) !== row.sha256
      || await this.storage.sha256ByStorageUri(authority.tenantId, row.storage_uri) !== row.sha256) invalid();
    return this.respond(tx, authority, envelope, { entry: this.entry(authority, row), download: {
      encoding: 'base64', content_base64: body.toString('base64'), sha256: row.sha256, byte_size: size,
      mime_type: row.mime_type, independent_digest_readback: true } }, 'DOCUMENT_DOWNLOADED', row.document_id);
  }

  private async respond(tx: QueryClient, authority: Readonly<ClientDocumentAuthority>, envelope: ClientDocumentEnvelope,
    result: unknown, action: AuditLogInput['action'], targetId: string, status = 200, existingAuditEventId?: string) {
    const event = existingAuditEventId ? { eventId: existingAuditEventId } : await this.audit.log({ tenantId: authority.tenantId, actorId: authority.actorUserId,
      action, targetType: action.startsWith('DOCUMENT_') ? 'document'
        : action === 'DLP_REVIEW_RECORDED' ? 'dlp_assessment'
          : action === 'CLIENT_DOCUMENT_UPLOAD_READBACK' ? 'file_security_scan' : 'client_document_scope', targetId,
      metadata: { request_id: authority.requestId, correlation_id: authority.requestId, decision_ref: authority.decisionRef } }, tx);
    return { status, body: { schema_version: clientDocumentSchemaVersion, authority_kind: 'amic-vault-api',
      authority_ref: 'amic-vault-api:client-documents-v1', provider_revision: clientDocumentProviderRevision,
      request_id: envelope.request_id, scope: envelope.scope, result,
      audit: { event_id: event.eventId, correlation_id: authority.requestId },
      count_leak_prevented: true, storage_locator_returned: false } };
  }
}
