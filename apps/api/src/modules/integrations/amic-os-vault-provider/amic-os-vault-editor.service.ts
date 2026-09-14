import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import {
  DocumentEditingService,
  type DocumentEditBaseFileDownload,
} from '../../document/document-editing.service';
import { DocumentUploadService, type UploadedDiskFile } from '../../document/document-upload.service';
import { sha256File } from '../../document/integrity/sha256.util';
import { PermissionService } from '../../permission/permission.service';
import { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenant/tenant-context';
import type {
  AmicOsVaultOfficeBaseInput,
  AmicOsVaultOfficeBoundSessionInput,
  AmicOsVaultOfficeCopyBindingInput,
  AmicOsVaultOfficeCopyCreateInput,
  AmicOsVaultOfficeCopyListInput,
  AmicOsVaultOfficeOpenInput,
  AmicOsVaultOfficeRecoveryInput,
  AmicOsVaultOfficeSaveInput,
  AmicOsVaultOfficeStatusInput,
} from './amic-os-vault-editor.contract';
import {
  AmicOsVaultProviderConfig,
  type AmicOsVaultProviderPrincipal,
} from './amic-os-vault-provider.guard';

interface OfficeDocumentRow {
  document_id: string;
  matter_id: string;
  title: string;
  document_status: string;
  matter_status: string;
  lawos_matter_id: string | null;
  base_version_id: string;
  base_file_object_id: string;
  base_sha256: string;
  base_byte_size: string | number;
  base_mime_type: string;
  base_filename: string;
  base_storage_uri: string;
  current_version_id: string;
  current_file_object_id: string;
  current_sha256: string;
  current_byte_size: string | number;
  current_mime_type: string;
}

interface OfficeCopyRow {
  copy_id: string;
  source_document_id: string;
  source_version_id: string;
  working_document_id: string | null;
  initial_snapshot_id: string;
  final_snapshot_id: string | null;
  title: string;
  state: 'creating' | 'active' | 'retained' | 'saved';
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface OfficeSessionRow {
  edit_session_id: string;
  document_id: string;
  base_version_id: string;
  status: 'active' | 'checked_in' | 'cancelled' | 'expired' | 'conflicted';
  lock_owner_user_id: string;
  lock_token_hash: string;
  expires_at: Date;
}

interface OfficeSubversionRow {
  subversion_id: string;
  client_save_id: string | null;
  status: 'saved' | 'submitted' | 'abandoned' | 'promoted';
  file_hash: string;
  size_bytes: string | number;
  promoted_version_id: string | null;
}

interface OfficeRecoveryRow extends OfficeSessionRow {
  latest_subversion_id: string | null;
  latest_client_save_id: string | null;
  latest_status: 'saved' | 'submitted' | 'abandoned' | 'promoted' | null;
  latest_file_hash: string | null;
  latest_size_bytes: string | number | null;
  latest_promoted_version_id: string | null;
}

type OfficeWorkingEditRow = Pick<OfficeRecoveryRow,
  'edit_session_id' | 'status' | 'expires_at' | 'latest_status' | 'latest_file_hash' | 'latest_size_bytes'
  | 'latest_promoted_version_id'>;

const officeMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function conflict(reason: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', reason });
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function currentExact(row: OfficeDocumentRow) {
  return {
    document_id: row.document_id,
    version_id: row.current_version_id,
    file_object_id: row.current_file_object_id,
    sha256: row.current_sha256,
    byte_size: Number(row.current_byte_size),
    mime_type: row.current_mime_type,
  };
}

async function readBounded(body: Readable, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of body) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    size += chunk.byteLength;
    if (size > maximum) throw conflict('office_edit_file_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

@Injectable()
export class AmicOsVaultEditorService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentEditingService) private readonly editingService: DocumentEditingService,
    @Inject(DocumentUploadService) private readonly uploadService: DocumentUploadService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AmicOsVaultProviderConfig) private readonly config: AmicOsVaultProviderConfig,
  ) {}

  async info(principal: AmicOsVaultProviderPrincipal, input: AmicOsVaultOfficeBaseInput) {
    const target = await this.target(principal, input, true);
    await this.assertEditable(principal, target.document_id);
    return {
      ...this.authority(),
      editable: true as const,
      exact_version: currentExact(target),
      title: target.title,
      filename: target.base_filename,
    };
  }

  async open(principal: AmicOsVaultProviderPrincipal, input: AmicOsVaultOfficeOpenInput) {
    const target = await this.target(principal, input, true);
    await this.assertEditable(principal, target.document_id);
    const binding = this.config.officeEditBinding(JSON.stringify([
      principal.tenantId,
      principal.actorUserId,
      target.document_id,
      target.base_version_id,
      input.idempotency_key,
    ]));
    const session = await this.editingService.checkout(
      principal.actorUserId,
      target.document_id,
      {
        baseVersionId: target.base_version_id,
        clientKind: 'office_web',
        checkoutReasonCode: 'AMIC_OS_OFFICE_EDIT',
        requestedTtlSeconds: 3600,
        idempotencyKey: input.idempotency_key,
      },
      binding,
    );
    if (session.editSessionId !== binding.editSessionId || session.lockToken !== binding.lockToken) {
      throw conflict('document_already_checked_out');
    }
    return {
      ...this.authority(),
      exact_version: currentExact(target),
      title: target.title,
      filename: target.base_filename,
      edit_session_id: session.editSessionId,
      lock_token: binding.lockToken,
      expires_at: session.expiresAt,
    };
  }

  async source(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeBoundSessionInput,
  ): Promise<DocumentEditBaseFileDownload> {
    const target = await this.target(principal, input, false);
    await this.assertEditable(principal, target.document_id);
    await this.requireSession(principal, input);
    const source = await this.editingService.getEditBaseFile(
      principal.actorUserId,
      target.document_id,
      input.edit_session_id,
    );
    if (
      source.sha256 !== input.requested_exact_version.sha256 ||
      source.contentLength !== input.requested_exact_version.byte_size ||
      source.contentType !== input.requested_exact_version.mime_type
    ) {
      throw conflict('base_version_stale');
    }
    return source;
  }

  async heartbeat(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeBoundSessionInput,
  ) {
    await this.target(principal, input, false);
    await this.requireSession(principal, input);
    await this.editingService.heartbeat(
      principal.actorUserId,
      input.requested_exact_version.document_id,
      input.edit_session_id,
      { requestedTtlSeconds: 3600 },
    );
    return this.status(principal, { ...input, client_save_id: null });
  }

  async status(principal: AmicOsVaultProviderPrincipal, input: AmicOsVaultOfficeStatusInput) {
    const target = await this.target(principal, input, false);
    await this.assertEditable(principal, target.document_id);
    const session = await this.requireSession(principal, input);
    const [latest, saved] = await this.auditService.transaction(principal.tenantId, async (tx) => Promise.all([
      this.subversion(tx, principal.tenantId, input.edit_session_id, null),
      input.client_save_id
        ? this.subversion(tx, principal.tenantId, input.edit_session_id, input.client_save_id)
        : Promise.resolve(null),
    ]));
    const expired = session.status === 'active' && session.expires_at.getTime() <= Date.now();
    const state = expired || session.status === 'expired'
      ? 'expired'
      : session.status === 'conflicted'
        ? 'conflicted'
        : session.status === 'active'
          ? 'active'
          : session.status === 'checked_in' && latest?.status !== 'promoted'
            ? 'publishing'
            : 'closed';
    return {
      ...this.authority(),
      state,
      edit_session_id: session.edit_session_id,
      base_version_id: session.base_version_id,
      exact_version: currentExact(target),
      expires_at: session.expires_at.toISOString(),
      latest: this.receipt(latest),
      save: this.receipt(saved),
    };
  }

  async save(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeSaveInput,
    file: UploadedDiskFile | undefined,
  ) {
    const target = await this.target(principal, input, false);
    await this.assertEditable(principal, target.document_id);
    if (
      !file ||
      file.size !== input.file.byte_size ||
      file.mimetype !== input.file.mime_type ||
      file.originalname.normalize('NFC') !== input.file.filename ||
      await sha256File(file.path) !== input.file.sha256
    ) {
      throw conflict('office_edit_file_mismatch');
    }

    let state = await this.status(principal, { ...input, client_save_id: input.client_save_id });
    if (state.save) {
      if (state.save.sha256 !== input.file.sha256 || state.save.byte_size !== input.file.byte_size) {
        throw conflict('office_edit_idempotency_conflict');
      }
    } else {
      if (state.state !== 'active') throw conflict('edit_session_conflict');
      const saved = await this.editingService.saveSubversion({
        actorUserId: principal.actorUserId,
        documentId: target.document_id,
        editSessionId: input.edit_session_id,
        fields: {
          visibilityScope: 'session_owner',
          saveReasonCode: 'AMIC_OS_OFFICE_SAVE',
          clientSaveId: input.client_save_id,
          expectedBaseSha256: input.requested_exact_version.sha256,
          editPackageMode: 'binary_roundtrip',
          lockToken: input.lock_token,
        },
        file,
      });
      if (saved.fileHash !== input.file.sha256) throw conflict('office_edit_file_mismatch');
      state = await this.status(principal, { ...input, client_save_id: input.client_save_id });
    }

    if (!input.close) return state;
    if (state.save?.state === 'committed' && state.save.subversion_id) {
      await this.editingService.promote(
        principal.actorUserId,
        target.document_id,
        state.save.subversion_id,
        {
          expectedBaseVersionId: input.requested_exact_version.version_id,
          publishReasonCode: 'AMIC_OS_OFFICE_SAVE',
          versionSignificance: 'internal_draft',
          idempotencyKey: `office:${input.client_save_id}`,
        },
      );
      return this.status(principal, { ...input, client_save_id: input.client_save_id });
    }
    if (!state.save?.subversion_id) throw conflict('subversion_required');
    if (state.state === 'active') {
      await this.editingService.checkIn(
        principal.actorUserId,
        target.document_id,
        input.edit_session_id,
        { expectedLastSubversionId: state.save.subversion_id, lockToken: input.lock_token },
      );
    } else if (state.state !== 'publishing') {
      throw conflict('edit_session_conflict');
    }
    await this.editingService.promote(
      principal.actorUserId,
      target.document_id,
      state.save.subversion_id,
      {
        expectedBaseVersionId: input.requested_exact_version.version_id,
        publishReasonCode: 'AMIC_OS_OFFICE_SAVE',
        versionSignificance: 'internal_draft',
        idempotencyKey: `office:${input.client_save_id}`,
      },
    );
    return this.status(principal, { ...input, client_save_id: input.client_save_id });
  }

  async cancel(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeBoundSessionInput,
  ) {
    const target = await this.target(principal, input, false);
    let state = await this.status(principal, { ...input, client_save_id: null });
    if (state.state !== 'active') return state;
    if (state.latest?.subversion_id) {
      await this.editingService.checkIn(
        principal.actorUserId,
        target.document_id,
        input.edit_session_id,
        { expectedLastSubversionId: state.latest.subversion_id, lockToken: input.lock_token },
      );
      await this.editingService.promote(
        principal.actorUserId,
        target.document_id,
        state.latest.subversion_id,
        {
          expectedBaseVersionId: input.requested_exact_version.version_id,
          publishReasonCode: 'AMIC_OS_OFFICE_SAVE',
          versionSignificance: 'internal_draft',
          idempotencyKey: `office:${state.latest.subversion_id}`,
        },
      );
    } else {
      await this.editingService.cancel(
        principal.actorUserId,
        target.document_id,
        input.edit_session_id,
        { cancelledReasonCode: 'AMIC_OS_OFFICE_NO_CHANGES', lockToken: input.lock_token },
      );
    }
    state = await this.status(principal, { ...input, client_save_id: null });
    return state;
  }

  async recovery(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeBaseInput,
  ) {
    const target = await this.target(principal, input, false);
    await this.assertEditable(principal, target.document_id);
    const session = await this.recoverySession(principal, input, null);
    if (!session || ['checked_in', 'cancelled'].includes(session.status) || !session.latest_subversion_id
        || !session.latest_file_hash || !Number.isSafeInteger(Number(session.latest_size_bytes))
        || session.latest_status === 'abandoned' || session.latest_status === 'promoted') {
      return { ...this.authority(), state: 'none' as const };
    }
    if (session.status === 'active' && session.expires_at.getTime() > Date.now()) {
      return { ...this.authority(), state: 'active' as const, session_id: session.edit_session_id,
        original_saved: false as const };
    }
    const canResume = target.current_version_id === session.base_version_id;
    return {
      ...this.authority(),
      state: canResume ? 'required' as const : 'retained' as const,
      session_id: session.edit_session_id,
      original_saved: false as const,
      base_version_id: session.base_version_id,
      current_version_id: target.current_version_id,
      can_resume: canResume,
      sha256: session.latest_file_hash,
      byte_size: Number(session.latest_size_bytes),
    };
  }

  async recover(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeRecoveryInput,
  ) {
    let target = await this.target(principal, input, false);
    await this.assertEditable(principal, target.document_id);
    const recoverySaveId = `office-recovery:${input.session_id}`;
    const replayed = await this.recoveryReceipt(principal, target.document_id, recoverySaveId);
    if (replayed?.promoted_version_id) {
      if (target.current_version_id !== replayed.promoted_version_id) {
        return { ...this.authority(), state: 'retained' as const, session_id: input.session_id,
          original_saved: false as const, base_version_id: input.requested_exact_version.version_id,
          current_version_id: target.current_version_id, can_resume: false as const,
          sha256: replayed.file_hash, byte_size: Number(replayed.size_bytes) };
      }
      return this.recoveredResult(input, target, {
        file_hash: replayed.file_hash,
        size_bytes: replayed.size_bytes,
        promoted_version_id: replayed.promoted_version_id,
      });
    }
    const session = await this.recoverySession(principal, input, input.session_id);
    if (!session || !session.latest_subversion_id || !session.latest_file_hash
        || !Number.isSafeInteger(Number(session.latest_size_bytes))
        || !['active', 'expired', 'conflicted'].includes(session.status)
        || session.status === 'active' && session.expires_at.getTime() > Date.now()
        || session.latest_status === 'abandoned' || session.latest_status === 'promoted') {
      throw conflict('office_recovery_not_available');
    }
    if (target.current_version_id !== session.base_version_id) {
      return { ...this.authority(), state: 'retained' as const, session_id: input.session_id,
        original_saved: false as const, base_version_id: session.base_version_id,
        current_version_id: target.current_version_id, can_resume: false as const,
        sha256: session.latest_file_hash, byte_size: Number(session.latest_size_bytes) };
    }

    const source = await this.editingService.getSubversionFile(
      principal.actorUserId,
      target.document_id,
      session.latest_subversion_id,
    );
    const bytes = await readBounded(source.body, input.requested_exact_version.byte_size > source.contentLength
      ? input.requested_exact_version.byte_size : source.contentLength);
    if (bytes.byteLength !== source.contentLength
        || createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
      throw conflict('office_recovery_file_mismatch');
    }
    const opened = await this.open(principal, {
      ...input,
      idempotency_key: recoverySaveId,
    });
    const directory = await mkdtemp(join(tmpdir(), 'amic-vault-office-recovery-'));
    const path = join(directory, 'payload');
    await writeFile(path, bytes);
    try {
      const saved = await this.save(principal, {
        ...input,
        edit_session_id: opened.edit_session_id,
        lock_token: opened.lock_token,
        client_save_id: recoverySaveId,
        close: true,
        file: { filename: source.filename, sha256: source.sha256,
          byte_size: source.contentLength, mime_type: source.contentType },
      }, { path, originalname: source.filename, mimetype: source.contentType, size: source.contentLength });
      const receipt = saved.save;
      if (saved.state !== 'closed' || receipt?.state !== 'committed' || !receipt.version_id) {
        throw conflict('office_recovery_save_failed');
      }
      target = await this.target(principal, {
        ...input,
        requested_exact_version: saved.exact_version,
      }, true);
      return this.recoveredResult(input, target, {
        ...receipt,
        file_hash: receipt.sha256,
        size_bytes: receipt.byte_size,
        promoted_version_id: receipt.version_id,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async createCopy(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeCopyCreateInput,
  ) {
    const source = await this.target(principal, input, input.resume === null);
    await this.assertCopyAllowed(principal, source.document_id, source.matter_id);
    const selectedCopyId = input.resume?.copy_id ?? input.copy_id;
    let copy = input.resume
      ? await this.copyRow(principal, input.resume.copy_id)
      : await this.copyRow(principal, input.copy_id);
    if (copy) {
      this.assertCopyBinding(principal, input, copy);
      if (copy.working_document_id) return this.copyOpenResult(principal, copy);
    }

    await this.auditService.transaction(principal.tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO amic_os_office_copies (
           tenant_id, copy_id, source_document_id, source_version_id,
           working_document_id, initial_snapshot_id, title, state, created_by
         ) VALUES ($1::uuid, $2, $3::uuid, $4::uuid, NULL, $5, $6, 'creating', $7::uuid)
         ON CONFLICT (tenant_id, copy_id) DO NOTHING`,
        [principal.tenantId, selectedCopyId, source.document_id, source.base_version_id,
          input.snapshot_id, input.title, principal.actorUserId],
      );
    });
    copy = await this.copyRow(principal, selectedCopyId);
    if (!copy) throw conflict('office_copy_creation_failed');
    this.assertCopyBinding(principal, input, copy);
    if (!copy.working_document_id) {
      const stored = await this.storageService.getByStorageUri(principal.tenantId, source.base_storage_uri);
      const bytes = await readBounded(stored.body, input.requested_exact_version.byte_size);
      if (bytes.byteLength !== input.requested_exact_version.byte_size
          || createHash('sha256').update(bytes).digest('hex') !== input.requested_exact_version.sha256) {
        throw conflict('base_version_stale');
      }
      await this.uploadService.uploadBuffer({
        actorUserId: principal.actorUserId,
        matterId: source.matter_id,
        originalFilename: source.base_filename,
        mimeType: source.base_mime_type,
        body: bytes,
        fields: {
          title: input.title,
          duplicateDecision: 'new_document',
          versionSignificance: 'internal_draft',
          tags: [`amic-os-copy:${selectedCopyId.slice('document-copy:'.length)}`],
        },
        afterUploadAudit: async (tx, uploaded) => {
          const updated = await tx.query(
          `UPDATE amic_os_office_copies
           SET working_document_id = $3::uuid, state = 'active', updated_at = now()
           WHERE tenant_id = $1::uuid AND copy_id = $2 AND working_document_id IS NULL`,
            [principal.tenantId, selectedCopyId, uploaded.documentId],
          );
          if (updated.rowCount !== 1) throw conflict('office_copy_creation_conflict');
        },
      });
      copy = await this.copyRow(principal, selectedCopyId);
    }
    if (!copy?.working_document_id) throw conflict('office_copy_creation_failed');
    return this.copyOpenResult(principal, copy);
  }

  async retainCopy(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeCopyBindingInput,
  ) {
    await this.target(principal, input, false);
    const copy = await this.copyRow(principal, input.copy_id);
    if (!copy || copy.working_document_id !== input.working_document_id
        || copy.source_document_id !== input.requested_exact_version.document_id
        || copy.source_version_id !== input.requested_exact_version.version_id
        || copy.created_by !== principal.actorUserId || copy.state === 'creating') throw permissionDenied();
    await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `UPDATE amic_os_office_copies
       SET final_snapshot_id = $3, state = CASE WHEN state = 'saved' THEN state ELSE 'retained' END,
           updated_at = now()
       WHERE tenant_id = $1::uuid AND copy_id = $2`,
      [principal.tenantId, input.copy_id, input.snapshot_id],
    ));
    return this.copyOpenResult(principal, (await this.copyRow(principal, input.copy_id))!);
  }

  async commitCopy(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeCopyBindingInput,
  ) {
    await this.target(principal, input, false);
    const copy = await this.copyRow(principal, input.copy_id);
    if (!copy || copy.working_document_id !== input.working_document_id
        || copy.source_document_id !== input.requested_exact_version.document_id
        || copy.source_version_id !== input.requested_exact_version.version_id
        || copy.created_by !== principal.actorUserId || copy.final_snapshot_id !== input.snapshot_id
        || !['retained', 'saved'].includes(copy.state)) throw permissionDenied();
    const working = await this.workingSource(principal, copy.working_document_id);
    await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `UPDATE amic_os_office_copies SET state = 'saved', updated_at = now()
       WHERE tenant_id = $1::uuid AND copy_id = $2`,
      [principal.tenantId, input.copy_id],
    ));
    return {
      ...this.authority(),
      saved: true as const,
      document_id: working.exact_version.document_id,
      version_id: working.exact_version.version_id,
      file_object_id: working.exact_version.file_object_id,
      sha256: working.exact_version.sha256,
      byte_size: working.exact_version.byte_size,
      copy_id: input.copy_id,
      snapshot_id: input.snapshot_id,
    };
  }

  async listCopies(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeCopyListInput,
  ) {
    const source = await this.target(principal, input, false);
    await this.assertCopyAllowed(principal, source.document_id, source.matter_id);
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT copy_id, source_document_id, source_version_id, working_document_id,
              initial_snapshot_id, final_snapshot_id, title, state, created_by,
              created_at, updated_at
       FROM amic_os_office_copies
       WHERE tenant_id = $1::uuid AND source_document_id = $2::uuid
         AND created_by = $3::uuid AND working_document_id IS NOT NULL
       ORDER BY updated_at DESC, copy_id
       LIMIT $4`,
      [principal.tenantId, source.document_id, principal.actorUserId, input.limit],
    ));
    const items = await Promise.all((result.rows as OfficeCopyRow[]).map(async (copy) => {
      const [working, sourceVersion, editState] = await Promise.all([
        this.workingSource(principal, copy.working_document_id!),
        this.workingSource(principal, copy.source_document_id, copy.source_version_id),
        this.workingEditState(principal, copy.working_document_id!),
      ]);
      return this.copyItem(copy, working, sourceVersion, editState);
    }));
    return { ...this.authority(), items, next_cursor: null };
  }

  private authority() {
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
    };
  }

  private recoveredResult(
    input: AmicOsVaultOfficeRecoveryInput,
    target: OfficeDocumentRow,
    receipt: { file_hash: string; size_bytes: string | number; promoted_version_id: string },
  ) {
    return {
      ...this.authority(),
      state: 'retained' as const,
      session_id: input.session_id,
      original_saved: false as const,
      base_version_id: input.requested_exact_version.version_id,
      current_version_id: receipt.promoted_version_id,
      can_resume: true as const,
      sha256: receipt.file_hash,
      byte_size: Number(receipt.size_bytes),
      recovered_source: {
        authority_kind: 'amic-vault-api' as const,
        lawos_matter_id: target.lawos_matter_id!,
        title: target.title,
        filename: target.base_filename,
        exact_version: currentExact(target),
      },
    };
  }

  private async recoverySession(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeBaseInput,
    sessionId: string | null,
  ): Promise<OfficeRecoveryRow | null> {
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT s.edit_session_id, s.document_id, s.base_version_id, s.status,
              s.lock_owner_user_id, s.lock_token_hash, s.expires_at,
              latest.subversion_id AS latest_subversion_id,
              latest.client_save_id AS latest_client_save_id,
              latest.status AS latest_status,
              latest.file_hash AS latest_file_hash,
              latest.size_bytes AS latest_size_bytes,
              latest.promoted_version_id AS latest_promoted_version_id
       FROM document_edit_sessions s
       LEFT JOIN LATERAL (
         SELECT sv.subversion_id, sv.client_save_id, sv.status, sv.file_hash,
                f.size_bytes, sv.promoted_version_id
         FROM document_subversions sv
         JOIN file_objects f ON f.tenant_id = sv.tenant_id AND f.file_object_id = sv.file_object_id
         WHERE sv.tenant_id = s.tenant_id AND sv.edit_session_id = s.edit_session_id
         ORDER BY sv.subversion_no DESC
         LIMIT 1
       ) latest ON true
       WHERE s.tenant_id = $1::uuid AND s.document_id = $2::uuid
         AND s.base_version_id = $3::uuid AND s.lock_owner_user_id = $4::uuid
         AND ($5::uuid IS NULL OR s.edit_session_id = $5::uuid)
       ORDER BY s.checked_out_at DESC
       LIMIT 1`,
      [principal.tenantId, input.requested_exact_version.document_id,
        input.requested_exact_version.version_id, principal.actorUserId, sessionId],
    ));
    return (result.rows[0] as OfficeRecoveryRow | undefined) ?? null;
  }

  private async recoveryReceipt(
    principal: AmicOsVaultProviderPrincipal,
    documentId: string,
    clientSaveId: string,
  ): Promise<OfficeSubversionRow | null> {
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT sv.subversion_id, sv.client_save_id, sv.status, sv.file_hash,
              f.size_bytes, sv.promoted_version_id
       FROM document_subversions sv
       JOIN file_objects f ON f.tenant_id = sv.tenant_id AND f.file_object_id = sv.file_object_id
       WHERE sv.tenant_id = $1::uuid AND sv.document_id = $2::uuid
         AND sv.created_by = $3::uuid AND sv.client_save_id = $4
       ORDER BY sv.created_at DESC
       LIMIT 1`,
      [principal.tenantId, documentId, principal.actorUserId, clientSaveId],
    ));
    return (result.rows[0] as OfficeSubversionRow | undefined) ?? null;
  }

  private async assertCopyAllowed(
    principal: AmicOsVaultProviderPrincipal,
    documentId: string,
    matterId: string,
  ) {
    const context = { tenantId: principal.tenantId, userId: principal.actorUserId };
    const checks = await Promise.all([
      this.permissionService.canReadDocument(context, documentId),
      this.permissionService.canDownloadDocument(context, documentId, 'AMIC_OS_OFFICE_COPY'),
      this.permissionService.canUploadToMatter(context, matterId),
    ]).catch(() => []);
    if (checks.length !== 3 || checks.some((decision) => decision.effect !== 'ALLOW')) throw permissionDenied();
  }

  private assertCopyBinding(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeCopyCreateInput,
    copy: OfficeCopyRow,
  ) {
    const selected = input.resume;
    const selectionChanged = selected
      ? copy.copy_id !== selected.copy_id
        || ![copy.initial_snapshot_id, copy.final_snapshot_id].includes(selected.snapshot_id)
      : copy.copy_id !== input.copy_id || copy.initial_snapshot_id !== input.snapshot_id;
    if (copy.source_document_id !== input.requested_exact_version.document_id
        || copy.source_version_id !== input.requested_exact_version.version_id
        || copy.created_by !== principal.actorUserId
        || copy.title !== input.title
        || selectionChanged) {
      throw conflict('office_copy_idempotency_conflict');
    }
  }

  private async copyRow(
    principal: AmicOsVaultProviderPrincipal,
    copyId: string,
  ): Promise<OfficeCopyRow | null> {
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT copy_id, source_document_id, source_version_id, working_document_id,
              initial_snapshot_id, final_snapshot_id, title, state, created_by,
              created_at, updated_at
       FROM amic_os_office_copies
       WHERE tenant_id = $1::uuid AND copy_id = $2`,
      [principal.tenantId, copyId],
    ));
    return (result.rows[0] as OfficeCopyRow | undefined) ?? null;
  }

  private async workingSource(
    principal: AmicOsVaultProviderPrincipal,
    documentId: string,
    versionId: string | null = null,
  ) {
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT d.document_id, d.title,
              coalesce(nullif(m.metadata_json ->> 'lawosMatterId', ''),
                       nullif(m.metadata_json ->> 'matterAppMatterId', '')) AS lawos_matter_id,
              v.version_id, v.file_object_id, v.file_hash AS sha256,
              f.size_bytes, f.mime_type,
              coalesce(nullif(f.original_filename, ''), f.normalized_filename) AS filename
       FROM documents d
       JOIN matters m ON m.tenant_id = d.tenant_id AND m.matter_id = d.matter_id
       JOIN document_versions v ON v.tenant_id = d.tenant_id
         AND v.document_id = d.document_id
         AND (($3::uuid IS NULL AND v.version_status = 'current') OR v.version_id = $3::uuid)
       JOIN file_objects f ON f.tenant_id = v.tenant_id AND f.file_object_id = v.file_object_id
       WHERE d.tenant_id = $1::uuid AND d.document_id = $2::uuid AND d.status <> 'deleted'`,
      [principal.tenantId, documentId, versionId],
    ));
    const row = result.rows[0] as {
      document_id: string; title: string; lawos_matter_id: string | null;
      version_id: string; file_object_id: string; sha256: string; size_bytes: string | number;
      mime_type: string; filename: string;
    } | undefined;
    const size = Number(row?.size_bytes);
    if (!row || result.rows.length !== 1 || !row.lawos_matter_id || !officeMimeTypes.has(row.mime_type)
        || !Number.isSafeInteger(size) || size < 1 || size > 25 * 1024 * 1024) throw permissionDenied();
    return {
      authority_kind: 'amic-vault-api' as const,
      lawos_matter_id: row.lawos_matter_id,
      title: row.title,
      filename: row.filename,
      exact_version: { document_id: row.document_id, version_id: row.version_id,
        file_object_id: row.file_object_id, sha256: row.sha256, byte_size: size, mime_type: row.mime_type },
    };
  }

  private async workingEditState(
    principal: AmicOsVaultProviderPrincipal,
    documentId: string,
  ): Promise<OfficeWorkingEditRow | null> {
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT s.edit_session_id, s.status, s.expires_at, latest.status AS latest_status,
              latest.file_hash AS latest_file_hash, latest.size_bytes AS latest_size_bytes,
              latest.promoted_version_id AS latest_promoted_version_id
       FROM document_edit_sessions s
       LEFT JOIN LATERAL (
         SELECT sv.status, sv.file_hash, f.size_bytes, sv.promoted_version_id
         FROM document_subversions sv
         JOIN file_objects f ON f.tenant_id = sv.tenant_id AND f.file_object_id = sv.file_object_id
         WHERE sv.tenant_id = s.tenant_id AND sv.edit_session_id = s.edit_session_id
         ORDER BY sv.subversion_no DESC
         LIMIT 1
       ) latest ON true
       WHERE s.tenant_id = $1::uuid AND s.document_id = $2::uuid
         AND s.lock_owner_user_id = $3::uuid
       ORDER BY s.checked_out_at DESC
       LIMIT 1`,
      [principal.tenantId, documentId, principal.actorUserId],
    ));
    return (result.rows[0] as OfficeWorkingEditRow | undefined) ?? null;
  }

  private async copyOpenResult(principal: AmicOsVaultProviderPrincipal, copy: OfficeCopyRow) {
    if (!copy.working_document_id) throw conflict('office_copy_creation_pending');
    const working = await this.workingSource(principal, copy.working_document_id);
    return {
      ...this.authority(),
      copy_id: copy.copy_id,
      snapshot_id: copy.final_snapshot_id ?? copy.initial_snapshot_id,
      state: copy.state,
      title: copy.title,
      working_source: working,
    };
  }

  private copyItem(
    copy: OfficeCopyRow,
    working: Awaited<ReturnType<AmicOsVaultEditorService['workingSource']>>,
    sourceVersion: Awaited<ReturnType<AmicOsVaultEditorService['workingSource']>>,
    editState: OfficeWorkingEditRow | null,
  ) {
    const exact = working.exact_version;
    const retained = Boolean(editState?.latest_file_hash && editState.latest_size_bytes
      && !editState.latest_promoted_version_id && ['saved', 'submitted'].includes(editState.latest_status ?? ''));
    const active = editState?.status === 'active' && editState.expires_at.getTime() > Date.now();
    const retainedFile = retained
      ? { sha256: editState!.latest_file_hash!, byte_size: Number(editState!.latest_size_bytes) }
      : exact;
    return {
      state: copy.state === 'saved' ? 'saved' as const : 'retained' as const,
      request: {
        copy_id: copy.copy_id,
        snapshot_id: copy.final_snapshot_id ?? copy.initial_snapshot_id,
        source: {
          document_id: copy.source_document_id,
          version_id: copy.source_version_id,
        },
        title: copy.title,
        sha256: retainedFile.sha256,
        byte_size: retainedFile.byte_size,
        mime_type: exact.mime_type,
      },
      created_at: copy.created_at.toISOString(),
      editor_recovery_available: retained && !active,
      resume_ready: !active && !retained,
      office_source: sourceVersion,
      working_source: working,
      recovery_session_id: retained && !active ? editState!.edit_session_id : null,
      working_document_id: exact.document_id,
      version_id: exact.version_id,
    };
  }

  private assertPrincipal(principal: AmicOsVaultProviderPrincipal, input: AmicOsVaultOfficeBaseInput) {
    const context = this.tenantContext.require();
    if (
      context.source !== 'amic-os-provider' ||
      context.tenantId !== principal.tenantId ||
      principal.accountLedgerId !== input.principal.user_id
    ) {
      throw permissionDenied();
    }
  }

  private async assertEditable(principal: AmicOsVaultProviderPrincipal, documentId: string) {
    const context = { tenantId: principal.tenantId, userId: principal.actorUserId };
    const checks = await Promise.all([
      this.permissionService.canCheckoutDocument(context, documentId),
      this.permissionService.canSaveDocumentSubversion(context, documentId),
      this.permissionService.canCheckInDocument(context, documentId),
      this.permissionService.canPromoteDocumentVersion(context, documentId),
    ]).catch(() => []);
    if (checks.length !== 4 || checks.some((decision) => decision.effect !== 'ALLOW')) {
      throw permissionDenied();
    }
  }

  private async target(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeBaseInput,
    requireCurrent: boolean,
  ): Promise<OfficeDocumentRow> {
    this.assertPrincipal(principal, input);
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT d.document_id, d.matter_id, d.title, d.status AS document_status,
              m.status AS matter_status,
              coalesce(nullif(m.metadata_json ->> 'lawosMatterId', ''),
                       nullif(m.metadata_json ->> 'matterAppMatterId', '')) AS lawos_matter_id,
              base.version_id AS base_version_id, base.file_object_id AS base_file_object_id,
              base.file_hash AS base_sha256, base_file.size_bytes AS base_byte_size,
              base_file.mime_type AS base_mime_type,
              coalesce(nullif(base_file.original_filename, ''), base_file.normalized_filename) AS base_filename,
              base_file.storage_uri AS base_storage_uri,
              current.version_id AS current_version_id,
              current.file_object_id AS current_file_object_id,
              current.file_hash AS current_sha256, current_file.size_bytes AS current_byte_size,
              current_file.mime_type AS current_mime_type
       FROM documents d
       JOIN matters m ON m.tenant_id = d.tenant_id AND m.matter_id = d.matter_id
       JOIN document_versions base ON base.tenant_id = d.tenant_id
         AND base.document_id = d.document_id AND base.version_id = $3::uuid
       JOIN file_objects base_file ON base_file.tenant_id = base.tenant_id
         AND base_file.file_object_id = base.file_object_id
       JOIN document_versions current ON current.tenant_id = d.tenant_id
         AND current.document_id = d.document_id AND current.version_status = 'current'
       JOIN file_objects current_file ON current_file.tenant_id = current.tenant_id
         AND current_file.file_object_id = current.file_object_id
       WHERE d.tenant_id = $1::uuid AND d.document_id = $2::uuid
         AND d.status <> 'deleted'`,
      [principal.tenantId, input.requested_exact_version.document_id, input.requested_exact_version.version_id],
    ));
    const row = result.rows[0] as OfficeDocumentRow | undefined;
    const exact = input.requested_exact_version;
    if (
      result.rows.length !== 1 ||
      !row ||
      row.lawos_matter_id !== input.lawos_matter_id ||
      row.base_version_id !== exact.version_id ||
      row.base_file_object_id !== exact.file_object_id ||
      row.base_sha256 !== exact.sha256 ||
      Number(row.base_byte_size) !== exact.byte_size ||
      row.base_mime_type !== exact.mime_type ||
      !officeMimeTypes.has(row.base_mime_type) ||
      row.document_status === 'immutable' ||
      row.matter_status === 'closed'
    ) {
      throw permissionDenied();
    }
    if (requireCurrent && row.current_version_id !== exact.version_id) throw conflict('base_version_stale');
    return row;
  }

  private async requireSession(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultOfficeBoundSessionInput,
  ): Promise<OfficeSessionRow> {
    const result = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(
      `SELECT edit_session_id, document_id, base_version_id, status,
              lock_owner_user_id, lock_token_hash, expires_at
       FROM document_edit_sessions
       WHERE tenant_id = $1::uuid AND edit_session_id = $2::uuid
         AND document_id = $3::uuid`,
      [principal.tenantId, input.edit_session_id, input.requested_exact_version.document_id],
    ));
    const row = result.rows[0] as OfficeSessionRow | undefined;
    if (
      result.rows.length !== 1 ||
      !row ||
      row.lock_owner_user_id !== principal.actorUserId ||
      row.base_version_id !== input.requested_exact_version.version_id ||
      row.lock_token_hash !== hashToken(input.lock_token)
    ) {
      throw permissionDenied();
    }
    return row;
  }

  private async subversion(
    tx: QueryClient,
    tenantId: string,
    editSessionId: string,
    clientSaveId: string | null,
  ): Promise<OfficeSubversionRow | null> {
    const result = await tx.query(
      `SELECT sv.subversion_id, sv.client_save_id, sv.status, sv.file_hash,
              f.size_bytes, sv.promoted_version_id
       FROM document_subversions sv
       JOIN file_objects f ON f.tenant_id = sv.tenant_id AND f.file_object_id = sv.file_object_id
       WHERE sv.tenant_id = $1::uuid AND sv.edit_session_id = $2::uuid
         AND ($3::text IS NULL OR sv.client_save_id = $3)
       ORDER BY sv.subversion_no DESC
       LIMIT 1`,
      [tenantId, editSessionId, clientSaveId],
    );
    return (result.rows[0] as OfficeSubversionRow | undefined) ?? null;
  }

  private receipt(row: OfficeSubversionRow | null) {
    if (!row || row.status === 'abandoned') return null;
    return {
      state: row.status === 'promoted' ? 'committed' as const : 'retained' as const,
      subversion_id: row.subversion_id,
      client_save_id: row.client_save_id,
      version_id: row.promoted_version_id,
      sha256: row.file_hash,
      byte_size: Number(row.size_bytes),
    };
  }
}
