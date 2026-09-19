import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { FileExtensionValidator } from '../../document/validators/file-extension.validator';
import { MimeTypeValidator } from '../../document/validators/mime-type.validator';
import { FilePromotionService } from '../../file-security/file-promotion.service';
import { FileScanQueueService } from '../../file-security/file-scan-queue.service';
import { fileSecuritySignatureIsFresh } from '../../file-security/file-security-reconciler.service';
import { StorageService } from '../../storage/storage.service';
import { AmicOsVaultEditorService } from './amic-os-vault-editor.service';
import type { AmicOsVaultDocumentCopyBindingInput, AmicOsVaultDocumentCopyPrepareInput,
  AmicOsVaultOfficeBaseInput, AmicOsVaultOfficeCopyListInput } from './amic-os-vault-editor.contract';
import { AmicOsVaultProviderConfig, type AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import { AmicOsVaultUploadService, amicOsVaultUploadDeterministicRefs } from './amic-os-vault-upload.service';
import { parseAmicOsVaultUploadPrepareInput, parseAmicOsVaultUploadCompleteInput } from './amic-os-vault-upload.contract';
import type { AmicOsVaultExactVersion, AmicOsVaultUploadFile, AmicOsVaultUploadPreflight } from './amic-os-vault-upload.contract';

type Snapshot = {
  snapshot_id: string; copy_id: string; quarantine_ref: string; source_exact: AmicOsVaultExactVersion;
  file_json: AmicOsVaultUploadFile; mode: 'clone' | 'upload'; preflight_json: AmicOsVaultUploadPreflight;
  request_hash: string; scan_id: string | null; scan_state: string | null; result_code: string | null;
  observed_sha256: string | null; signature_at: Date | null; title: string; created_by: string;
  source_document_id: string; source_version_id: string; working_document_id: string | null;
  final_snapshot_id: string | null; created_at: Date;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const deny = () => new ForbiddenException({ code: 'PERMISSION_DENIED' });
const conflict = (reason: string) => new BadRequestException({ code: 'VALIDATION_FAILED', reason });
function operation(snapshotId: string) {
  const digest = hash(snapshotId);
  return { operation_id: `vaultop_${digest.slice(0, 32)}`, correlation_id: `vaultcorr_${digest.slice(0, 32)}`,
    idempotency_key: `vaultidem:${digest}`, operation_kind: 'save_local_file' as const };
}
function equalExact(a: AmicOsVaultExactVersion, b: AmicOsVaultExactVersion) {
  return a.document_id === b.document_id && a.version_id === b.version_id && a.file_object_id === b.file_object_id
    && a.sha256 === b.sha256 && a.byte_size === b.byte_size && a.mime_type === b.mime_type;
}

@Injectable()
export class AmicOsVaultDocumentCopyService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AmicOsVaultEditorService) private readonly editor: AmicOsVaultEditorService,
    @Inject(AmicOsVaultUploadService) private readonly uploads: AmicOsVaultUploadService,
    @Inject(FilePromotionService) private readonly promotion: FilePromotionService,
    @Inject(FileScanQueueService) private readonly scanQueue: FileScanQueueService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AmicOsVaultProviderConfig) private readonly config: AmicOsVaultProviderConfig,
  ) {}

  async prepare(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultDocumentCopyPrepareInput) {
    const source = await this.editor.documentCopyTarget(actor, input);
    const file = input.file ?? { filename: source.base_filename, sha256: input.requested_exact_version.sha256,
      byte_size: input.requested_exact_version.byte_size, mime_type: input.requested_exact_version.mime_type };
    const extension = new FileExtensionValidator().validate(file.filename);
    const declaration = new MimeTypeValidator().validateDeclaration({ extension: extension.extension, declaredMimeType: file.mime_type });
    if (extension.normalizedFilename !== file.filename || declaration.mimeType !== file.mime_type
        || file.mime_type !== source.base_mime_type || file.byte_size < 1 || file.byte_size > 25 * 1024 * 1024) throw conflict('copy_file_invalid');
    if (input.mode === 'clone' && (file.sha256 !== source.base_sha256 || file.byte_size !== Number(source.base_byte_size))) throw conflict('copy_clone_mismatch');
    const requestHash = hash(JSON.stringify([actor.actorUserId, input.copy_id, input.snapshot_id, input.title,
      input.mode, input.requested_exact_version, file]));
    let snapshot = await this.row(actor, input.snapshot_id);
    if (snapshot && (snapshot.request_hash !== requestHash || !equalExact(snapshot.source_exact, input.requested_exact_version))) throw conflict('copy_snapshot_conflict');
    if (!snapshot) {
      if (source.current_version_id !== source.base_version_id) throw conflict('base_version_stale');
      const op = operation(input.snapshot_id);
      const preflight = await this.uploads.preflight(actor, { principal: input.principal, lawos_matter_id: input.lawos_matter_id,
        requested_workspace_id: null, requested_folder_id: null, operation_id: op.operation_id,
        correlation_id: op.correlation_id, request_id: input.snapshot_id });
      if (preflight.resolved.vault_matter_id !== source.matter_id) throw deny();
      await this.audit.transaction(actor.tenantId, async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${actor.tenantId}:${input.copy_id}`]);
        await tx.query(`INSERT INTO amic_os_office_copies (tenant_id, copy_id, source_document_id, source_version_id,
          initial_snapshot_id, title, state, created_by, copy_kind)
          VALUES ($1, $2, $3, $4, $5, $6, 'creating', $7, 'generic') ON CONFLICT (tenant_id, copy_id) DO NOTHING`,
        [actor.tenantId, input.copy_id, source.document_id, source.base_version_id, input.snapshot_id, input.title, actor.actorUserId]);
        const copies = await tx.query(`SELECT * FROM amic_os_office_copies WHERE tenant_id=$1 AND copy_id=$2 FOR UPDATE`, [actor.tenantId, input.copy_id]);
        const copy = copies.rows[0] as { created_by: string; source_document_id: string; source_version_id: string; title: string; working_document_id: string | null; copy_kind: string } | undefined;
        if (!copy || copy.created_by !== actor.actorUserId || copy.source_document_id !== source.document_id
          || copy.source_version_id !== source.base_version_id || copy.title !== input.title || copy.copy_kind !== 'generic'
          || copy.working_document_id) throw conflict('copy_binding_conflict');
        const inserted = await tx.query(`INSERT INTO amic_os_document_copy_snapshots
          (tenant_id, snapshot_id, copy_id, quarantine_ref, source_exact, file_json, mode, preflight_json, request_hash)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9)
          ON CONFLICT (tenant_id,snapshot_id) DO NOTHING`,
        [actor.tenantId, input.snapshot_id, input.copy_id, amicOsVaultUploadDeterministicRefs.quarantineRef(actor.tenantId, op.operation_id),
          JSON.stringify(input.requested_exact_version), JSON.stringify(file), input.mode, JSON.stringify(preflight), requestHash]);
        if (inserted.rowCount) await this.auditCopy(tx, actor, input.copy_id, source.matter_id, 'COPY_PREPARED', file.sha256);
      });
      snapshot = await this.row(actor, input.snapshot_id);
      if (!snapshot || snapshot.request_hash !== requestHash) throw conflict('copy_snapshot_conflict');
    }
    this.assertBinding(actor, input, snapshot);
    if (snapshot.scan_id || snapshot.working_document_id) return this.status(actor, input, snapshot);
    if (input.mode === 'clone') {
      const existing = await this.storage.headByStorageUri(actor.tenantId, this.storage.quarantineStorageUri(actor.tenantId, snapshot.quarantine_ref));
      if (!existing) {
        const stored = await this.storage.getByStorageUri(actor.tenantId, source.base_storage_uri);
        const bytes = await this.readBounded(stored.body, file.byte_size);
        if (bytes.length !== file.byte_size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw conflict('copy_source_hash_mismatch');
        await this.storage.putQuarantineObject({ tenantId: actor.tenantId, quarantineRef: snapshot.quarantine_ref,
          body: Readable.from([bytes]), contentLength: bytes.length, contentType: file.mime_type });
      }
      return this.complete(actor, input);
    }
    const prepared = await this.uploads.prepare(actor, parseAmicOsVaultUploadPrepareInput({ principal: input.principal, preflight: snapshot.preflight_json,
      operation: operation(snapshot.snapshot_id), file: { filename: file.filename, byte_size: file.byte_size, mime_type: file.mime_type }, request_id: snapshot.snapshot_id }));
    return { ...await this.status(actor, input, snapshot), state: 'transfer_ready' as const,
      method: prepared.method, upload_url: prepared.upload_url, required_headers: prepared.required_headers, expires_at: prepared.expires_at };
  }

  async complete(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultDocumentCopyBindingInput) {
    const source = await this.editor.documentCopyTarget(actor, input);
    const snapshot = await this.requireRow(actor, input);
    if (!snapshot.scan_id) {
      await this.validateStoredSnapshot(actor, snapshot);
      await this.uploads.complete(actor, parseAmicOsVaultUploadCompleteInput({ principal: input.principal, preflight: snapshot.preflight_json,
        operation: operation(snapshot.snapshot_id), transfer: { transfer_ref: `vault-transfer:${snapshot.quarantine_ref}` },
        file: snapshot.file_json, request_id: snapshot.snapshot_id }));
      await this.audit.transaction(actor.tenantId, async (tx) => {
        const updated = await tx.query(`UPDATE amic_os_document_copy_snapshots s SET scan_id = f.scan_id
          FROM file_security_scans f WHERE s.tenant_id=$1 AND s.snapshot_id=$2 AND s.scan_id IS NULL
          AND f.tenant_id=s.tenant_id AND f.quarantine_ref=s.quarantine_ref
          AND f.expected_sha256=s.file_json->>'sha256' RETURNING s.snapshot_id`, [actor.tenantId, snapshot.snapshot_id]);
        if (updated.rowCount) await this.auditCopy(tx, actor, input.copy_id, source.matter_id, 'COPY_QUARANTINED', snapshot.file_json.sha256);
      });
    }
    await this.refreshExpiredScan(actor, snapshot, source.matter_id);
    return this.status(actor, input, await this.requireRow(actor, input));
  }

  async list(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultOfficeCopyListInput) {
    await this.editor.documentCopyTarget(actor, input);
    const rows = await this.audit.transaction(actor.tenantId, (tx) => tx.query(`SELECT s.snapshot_id
      FROM amic_os_document_copy_snapshots s JOIN amic_os_office_copies c USING (tenant_id,copy_id)
      WHERE c.tenant_id=$1 AND c.created_by=$2 AND c.source_document_id=$3
      ORDER BY s.created_at DESC, s.snapshot_id LIMIT $4`, [actor.tenantId, actor.actorUserId,
      input.requested_exact_version.document_id, input.limit]));
    const items = [];
    for (const entry of rows.rows as { snapshot_id: string }[]) {
      const row = await this.row(actor, entry.snapshot_id);
      if (row) items.push(await this.status(actor, input, row));
    }
    return { ...this.authority(), items, next_cursor: null };
  }

  async read(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultDocumentCopyBindingInput & { offset: number }) {
    await this.editor.documentCopyTarget(actor, input);
    const row = await this.requireRow(actor, input);
    const state = await this.status(actor, input, row);
    if (!['retained', 'saved'].includes(state.state)) throw conflict('copy_snapshot_not_clean');
    if (input.offset >= row.file_json.byte_size) throw conflict('copy_offset_invalid');
    const uri = this.storage.quarantineStorageUri(actor.tenantId, row.quarantine_ref);
    if (await this.storage.sha256ByStorageUri(actor.tenantId, uri) !== row.file_json.sha256) throw conflict('copy_snapshot_hash_mismatch');
    const length = Math.min(3 * 1024 * 1024, row.file_json.byte_size - input.offset);
    const stored = await this.storage.getRangeByStorageUri(actor.tenantId, uri, input.offset, input.offset + length - 1);
    const bytes = await this.readBounded(stored.body, length);
    if (bytes.length !== length) throw conflict('copy_snapshot_size_mismatch');
    const source = await this.editor.documentCopyTarget(actor, input);
    await this.audit.transaction(actor.tenantId, (tx) => this.auditCopy(tx, actor, input.copy_id,
      source.matter_id, 'COPY_SNAPSHOT_READ', row.file_json.sha256, 'DOCUMENT_DOWNLOADED'));
    return { ...state, offset: input.offset, bytes_base64: bytes.toString('base64'),
      next_offset: input.offset + length, final: input.offset + length === row.file_json.byte_size };
  }

  async commit(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultDocumentCopyBindingInput) {
    const source = await this.editor.documentCopyTarget(actor, input);
    const row = await this.requireRow(actor, input);
    if (row.working_document_id) {
      if (row.final_snapshot_id !== row.snapshot_id) throw conflict('copy_already_committed');
      return { ...await this.status(actor, input, row), saved: true as const };
    }
    if (source.current_version_id !== source.base_version_id) throw conflict('base_version_stale');
    if (await this.refreshExpiredScan(actor, row, source.matter_id)) throw conflict('copy_snapshot_not_clean');
    const result = await this.promotion.promote({ tenantId: actor.tenantId, quarantineRef: row.quarantine_ref,
      expectedSha256: row.file_json.sha256 }, { snapshotId: row.snapshot_id, actorUserId: actor.actorUserId,
      authorize: async () => {
        const fresh = await this.editor.documentCopyTarget(actor, input);
        if (fresh.current_version_id !== fresh.base_version_id) throw conflict('base_version_stale');
      } }).catch(async (error: unknown) => {
        const completed = await this.requireRow(actor, input);
        if (completed.working_document_id && completed.final_snapshot_id === input.snapshot_id) return { promoted: false };
        throw error;
      });
    if (!result) throw conflict('copy_snapshot_not_clean');
    return { ...await this.status(actor, input, await this.requireRow(actor, input)), saved: true as const };
  }

  private async refreshExpiredScan(actor: AmicOsVaultProviderPrincipal, snapshot: Snapshot, matterId: string) {
    if (!snapshot.scan_id || snapshot.working_document_id || snapshot.scan_state !== 'clean'
      || fileSecuritySignatureIsFresh(snapshot.signature_at)) return false;
    return this.audit.transaction(actor.tenantId, async (tx) => {
      const result = await tx.query('SELECT state, signature_at FROM file_security_scans WHERE tenant_id=$1 AND scan_id=$2 FOR UPDATE',
        [actor.tenantId, snapshot.scan_id]);
      const scan = result.rows[0] as { state: string; signature_at: Date | null } | undefined;
      if (!scan || scan.state !== 'clean' || fileSecuritySignatureIsFresh(scan.signature_at)) return false;
      await tx.query("UPDATE file_security_scans SET state='quarantined', result_code='pending', updated_at=now() WHERE tenant_id=$1 AND scan_id=$2",
        [actor.tenantId, snapshot.scan_id]);
      await this.scanQueue.enqueue({ tenantId: actor.tenantId, quarantineRef: snapshot.quarantine_ref,
        expectedSha256: snapshot.file_json.sha256 }, tx as never);
      await this.auditCopy(tx, actor, snapshot.copy_id, matterId, 'COPY_SCAN_REFRESH_REQUESTED', snapshot.file_json.sha256);
      return true;
    });
  }

  private async validateStoredSnapshot(actor: AmicOsVaultProviderPrincipal, snapshot: Snapshot) {
    const file = snapshot.file_json;
    const stored = await this.storage.getByStorageUri(actor.tenantId,
      this.storage.quarantineStorageUri(actor.tenantId, snapshot.quarantine_ref));
    const bytes = await this.readBounded(stored.body, file.byte_size);
    if (bytes.length !== file.byte_size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw conflict('copy_snapshot_hash_mismatch');
    }
    const directory = await mkdtemp(join(tmpdir(), 'amic-copy-validate-'));
    try {
      const path = join(directory, 'snapshot');
      await writeFile(path, bytes);
      const { extension } = new FileExtensionValidator().validate(file.filename);
      const result = await new MimeTypeValidator().validate({ path, sizeBytes: bytes.length,
        extension, declaredMimeType: file.mime_type });
      if (result.mimeType !== file.mime_type) throw conflict('copy_snapshot_mime_mismatch');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }

  private authority() {
    return { authority_kind: 'amic-vault-api' as const, authority_ref: this.config.uploadAuthorityRef(), provider_revision: 'generic-copy-v1' };
  }
  private async row(actor: AmicOsVaultProviderPrincipal, snapshotId: string): Promise<Snapshot | null> {
    const result = await this.audit.transaction(actor.tenantId, (tx) => tx.query(`SELECT s.*, c.title, c.created_by,
      c.source_document_id, c.source_version_id, c.working_document_id, c.final_snapshot_id,
      coalesce(s.scan_id,f.scan_id) AS scan_id, f.state AS scan_state, f.result_code, f.observed_sha256, f.signature_at
      FROM amic_os_document_copy_snapshots s JOIN amic_os_office_copies c USING (tenant_id,copy_id)
      LEFT JOIN file_security_scans f ON f.tenant_id=s.tenant_id AND f.quarantine_ref=s.quarantine_ref
      WHERE s.tenant_id=$1 AND s.snapshot_id=$2 AND c.created_by=$3 AND c.copy_kind='generic'`,
    [actor.tenantId, snapshotId, actor.actorUserId]));
    return result.rows[0] as Snapshot | undefined ?? null;
  }
  private assertBinding(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultDocumentCopyBindingInput, row: Snapshot) {
    if (row.created_by !== actor.actorUserId || row.copy_id !== input.copy_id
      || !equalExact(row.source_exact, input.requested_exact_version)) throw deny();
  }
  private async requireRow(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultDocumentCopyBindingInput) {
    const row = await this.row(actor, input.snapshot_id);
    if (!row) throw deny();
    this.assertBinding(actor, input, row);
    return row;
  }
  private async status(actor: AmicOsVaultProviderPrincipal, input: AmicOsVaultOfficeBaseInput, row: Snapshot) {
    const source = await this.editor.documentCopyTarget(actor, { ...input, requested_exact_version: row.source_exact });
    const saved = row.final_snapshot_id === row.snapshot_id && Boolean(row.working_document_id);
    const expired = !row.scan_state && Date.parse(row.preflight_json.expires_at) <= Date.now();
    const blocked = expired || ['infected', 'security_hold', 'error'].includes(row.scan_state ?? '');
    const clean = ['clean', 'promoted'].includes(row.scan_state ?? '') && row.result_code === 'clean'
      && row.observed_sha256 === row.file_json.sha256;
    let exactVersion: AmicOsVaultExactVersion | null = null;
    if (saved) {
      const result = await this.audit.transaction(actor.tenantId, (tx) => tx.query(`SELECT p.document_id,p.version_id,p.file_object_id,
        p.primary_sha256 AS sha256,f.size_bytes,f.mime_type,f.storage_uri FROM file_security_promotions p
        JOIN file_objects f ON f.tenant_id=p.tenant_id AND f.file_object_id=p.file_object_id
        WHERE p.tenant_id=$1 AND p.scan_id=$2 AND p.document_id=$3`, [actor.tenantId, row.scan_id, row.working_document_id]));
      const exact = result.rows[0] as (AmicOsVaultExactVersion & { size_bytes: string; storage_uri: string }) | undefined;
      if (!exact || exact.sha256 !== row.file_json.sha256 || Number(exact.size_bytes) !== row.file_json.byte_size
        || exact.mime_type !== row.file_json.mime_type
        || await this.storage.sha256ByStorageUri(actor.tenantId, exact.storage_uri) !== exact.sha256) throw conflict('copy_primary_readback_mismatch');
      exactVersion = { document_id: exact.document_id, version_id: exact.version_id, file_object_id: exact.file_object_id,
        sha256: exact.sha256, byte_size: Number(exact.size_bytes), mime_type: exact.mime_type };
    }
    await this.editor.documentCopyTarget(actor, { ...input, requested_exact_version: row.source_exact });
    return { ...this.authority(), copy_id: row.copy_id, snapshot_id: row.snapshot_id, title: row.title,
      source: { authority_kind: 'amic-vault-api' as const, lawos_matter_id: input.lawos_matter_id, exact_version: row.source_exact },
      file: row.file_json, state: saved ? 'saved' : blocked ? 'blocked' : clean ? 'retained' : row.scan_state ? 'quarantined' : 'prepared',
      scan_state: row.scan_state, blocked_reason: expired ? 'copy_transfer_expired' : blocked ? 'copy_scan_rejected' : source.current_version_id !== source.base_version_id ? 'base_version_stale' : null,
      exact_version: exactVersion, created_at: row.created_at.toISOString() };
  }
  private async auditCopy(tx: QueryClient, actor: AmicOsVaultProviderPrincipal, copyId: string, matterId: string, reason: string, sha256: string, action: 'DOCUMENT_METADATA_CHANGED' | 'DOCUMENT_DOWNLOADED' = 'DOCUMENT_METADATA_CHANGED') {
    await this.audit.log({ tenantId: actor.tenantId, actorId: actor.actorUserId, action,
      targetType: 'amic_os_document_copy', targetId: copyId.slice('document-copy:'.length), matterId, result: 'success',
      metadata: { reason_code: reason, hash: sha256 } }, tx);
  }
  private async readBounded(stream: Readable, maximum: number) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const value of stream) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      size += chunk.length;
      if (size > maximum) throw conflict('copy_file_too_large');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  }
}
