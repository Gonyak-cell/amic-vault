import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { documentDownloadedAudit } from '../../audit/events/document-events';
import { DocumentLifecycleService } from '../../document/document-lifecycle.service';
import { DocumentUploadService } from '../../document/document-upload.service';
import { PermissionService } from '../../permission/permission.service';
import {
  StorageExactVersionMissingError,
  StorageObjectAlreadyExistsError,
} from '../../storage/storage-adapter.interface';
import { StorageService } from '../../storage/storage.service';
import { TenantContextService } from '../../tenant/tenant-context';
import {
  AMIC_OS_VAULT_NATIVE_COPY_MAX_BYTES,
  AMIC_OS_VAULT_NATIVE_COPY_READ_BYTES,
  type AmicOsVaultNativeCopyBaseInput,
  type AmicOsVaultNativeCopyBindingInput,
  type AmicOsVaultNativeCopyExactVersion,
  type AmicOsVaultNativeCopyFile,
  type AmicOsVaultNativeCopyListInput,
  type AmicOsVaultNativeCopyPrepareInput,
  type AmicOsVaultNativeCopyReadInput,
} from './amic-os-vault-document-copy.contract';
import {
  AmicOsVaultProviderConfig,
  type AmicOsVaultProviderPrincipal,
} from './amic-os-vault-provider.guard';

interface NativeCopySourceRow {
  document_id: string;
  matter_id: string;
  document_status: string;
  matter_status: string;
  lawos_matter_id: string | null;
  version_id: string;
  file_object_id: string;
  sha256: string;
  byte_size: string | number;
  mime_type: string;
  filename: string;
  current_version_id: string;
}

interface NativeCopyRow {
  copy_id: string;
  snapshot_id: string;
  source_document_id: string;
  source_version_id: string;
  source_file_object_id: string;
  source_matter_id: string;
  source_current_version_id: string;
  lawos_matter_id: string;
  quarantine_ref: string;
  title: string;
  filename: string;
  sha256: string;
  byte_size: string | number;
  mime_type: string;
  mode: 'clone' | 'upload';
  state: 'prepared' | 'retained' | 'saved' | 'blocked';
  blocked_reason: 'base_version_stale' | 'snapshot_unavailable' | null;
  saved_document_id: string | null;
  saved_version_id: string | null;
  saved_file_object_id: string | null;
  saved_sha256: string | null;
  saved_byte_size: string | number | null;
  saved_mime_type: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface NativeCopyCursor {
  sourceDocumentId: string;
  actorUserId: string;
  createdAt: string;
  copyId: string;
  snapshotId: string;
}

const copyRowSelect = `
  SELECT c.copy_id, c.snapshot_id, c.source_document_id, c.source_version_id,
         c.source_file_object_id, c.source_matter_id, c.lawos_matter_id,
         c.quarantine_ref, c.title, c.filename, c.sha256, c.byte_size,
         c.mime_type, c.mode, c.state, c.blocked_reason,
         c.saved_document_id, c.saved_version_id, c.saved_file_object_id,
         c.created_by, c.created_at, c.updated_at,
         current.version_id AS source_current_version_id,
         saved_version.file_hash AS saved_sha256,
         saved_file.size_bytes AS saved_byte_size,
         saved_file.mime_type AS saved_mime_type
  FROM amic_os_native_document_copies c
  LEFT JOIN document_versions current
    ON current.tenant_id = c.tenant_id
   AND current.document_id = c.source_document_id
   AND current.version_status = 'current'
  LEFT JOIN document_versions saved_version
    ON saved_version.tenant_id = c.tenant_id
   AND saved_version.version_id = c.saved_version_id
   AND saved_version.document_id = c.saved_document_id
   AND saved_version.file_object_id = c.saved_file_object_id
  LEFT JOIN file_objects saved_file
    ON saved_file.tenant_id = saved_version.tenant_id
   AND saved_file.file_object_id = saved_version.file_object_id`;

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function conflict(reason: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', reason });
}

class NativeCopySnapshotUnavailableError extends BadRequestException {
  constructor() {
    super({ code: 'VALIDATION_FAILED', reason: 'native_copy_snapshot_mismatch' });
  }
}

async function readBounded(
  body: Readable,
  expected: number,
  mismatch: () => Error = () => conflict('native_copy_snapshot_mismatch'),
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of body) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    size += chunk.byteLength;
    if (size > expected || size > AMIC_OS_VAULT_NATIVE_COPY_MAX_BYTES) {
      throw mismatch();
    }
    chunks.push(chunk);
  }
  if (size !== expected) throw mismatch();
  return Buffer.concat(chunks, size);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function deterministicUuid(...values: string[]): string {
  const bytes = createHash('sha256').update(values.join('\0')).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function exactFromSource(row: NativeCopySourceRow): AmicOsVaultNativeCopyExactVersion {
  return {
    document_id: row.document_id,
    version_id: row.version_id,
    file_object_id: row.file_object_id,
    sha256: row.sha256,
    byte_size: Number(row.byte_size),
    mime_type: row.mime_type,
  };
}

function exactFromCopy(row: NativeCopyRow): AmicOsVaultNativeCopyExactVersion {
  return {
    document_id: row.source_document_id,
    version_id: row.source_version_id,
    file_object_id: row.source_file_object_id,
    sha256: row.sha256,
    byte_size: Number(row.byte_size),
    mime_type: row.mime_type,
  };
}

function fileFromCopy(row: NativeCopyRow): AmicOsVaultNativeCopyFile {
  return {
    filename: row.filename,
    sha256: row.sha256,
    byte_size: Number(row.byte_size),
    mime_type: row.mime_type,
  };
}

function sameExact(
  left: AmicOsVaultNativeCopyExactVersion,
  right: AmicOsVaultNativeCopyExactVersion,
): boolean {
  return left.document_id === right.document_id && left.version_id === right.version_id &&
    left.file_object_id === right.file_object_id && left.sha256 === right.sha256 &&
    left.byte_size === right.byte_size && left.mime_type === right.mime_type;
}

function encodeCursor(row: NativeCopyRow): string {
  return `dcp1.${Buffer.from(JSON.stringify([
    row.source_document_id,
    row.created_by,
    row.created_at.toISOString(),
    row.copy_id,
    row.snapshot_id,
  ])).toString('base64url')}`;
}

function decodeCursor(value: string | undefined): NativeCopyCursor | null {
  if (value === undefined) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value.slice('dcp1.'.length), 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 5 ||
        !parsed.every((item) => typeof item === 'string') ||
        !Number.isFinite(Date.parse(parsed[2] as string))) {
      throw new Error('invalid cursor');
    }
    return {
      sourceDocumentId: parsed[0] as string,
      actorUserId: parsed[1] as string,
      createdAt: parsed[2] as string,
      copyId: parsed[3] as string,
      snapshotId: parsed[4] as string,
    };
  } catch {
    throw conflict('native_copy_cursor_invalid');
  }
}

@Injectable()
export class AmicOsVaultDocumentCopyService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentLifecycleService) private readonly lifecycleService: DocumentLifecycleService,
    @Inject(DocumentUploadService) private readonly uploadService: DocumentUploadService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AmicOsVaultProviderConfig) private readonly config: AmicOsVaultProviderConfig,
  ) {}

  async prepare(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultNativeCopyPrepareInput,
  ) {
    this.assertPrincipal(principal, input);
    const source = await this.source(principal, input, true);
    await this.assertAccess(principal, source.document_id, source.matter_id, true);
    const requestedFile = input.file ?? {
      filename: source.filename,
      sha256: input.requested_exact_version.sha256,
      byte_size: input.requested_exact_version.byte_size,
      mime_type: input.requested_exact_version.mime_type,
    };
    this.assertImmutableFile(requestedFile, input.requested_exact_version);

    const copy = await this.auditService.transaction(principal.tenantId, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `amic-os-native-copy:${principal.tenantId}:${input.copy_id}:${input.snapshot_id}`,
      ]);
      const lockedSource = await this.source(principal, input, true, tx, true);
      const quarantineRef = deterministicUuid(
        'amic-os-native-copy-v1',
        principal.tenantId,
        input.copy_id,
        input.snapshot_id,
      );
      await tx.query(
        `INSERT INTO amic_os_native_document_copies (
           tenant_id, copy_id, snapshot_id, source_document_id, source_version_id,
           source_file_object_id, source_matter_id, lawos_matter_id, quarantine_ref,
           title, filename, sha256, byte_size, mime_type, mode, state, created_by
         ) VALUES (
           $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8, $9::uuid,
           $10, $11, $12, $13, $14, $15, 'prepared', $16::uuid
         ) ON CONFLICT (tenant_id, copy_id, snapshot_id) DO NOTHING`,
        [
          principal.tenantId,
          input.copy_id,
          input.snapshot_id,
          lockedSource.document_id,
          lockedSource.version_id,
          lockedSource.file_object_id,
          lockedSource.matter_id,
          input.lawos_matter_id,
          quarantineRef,
          input.title,
          requestedFile.filename,
          requestedFile.sha256,
          requestedFile.byte_size,
          requestedFile.mime_type,
          input.mode,
          principal.actorUserId,
        ],
      );
      const row = await this.copy(principal, input.copy_id, input.snapshot_id, tx, true);
      if (!row) throw conflict('native_copy_prepare_failed');
      this.assertBinding(principal, input, row, input.title, input.mode, requestedFile);
      if (row.state !== 'prepared') return row;

      let createdStorage = false;
      const storageUri = this.storageService.quarantineStorageUri(
        principal.tenantId,
        row.quarantine_ref,
      );
      try {
        const downloaded = await this.lifecycleService.download(
          principal.actorUserId,
          lockedSource.document_id,
          'AMIC_OS_NATIVE_COPY',
        );
        const bytes = await readBounded(downloaded.body, input.requested_exact_version.byte_size);
        if (downloaded.contentLength !== input.requested_exact_version.byte_size ||
            downloaded.contentType !== input.requested_exact_version.mime_type ||
            downloaded.sha256 !== input.requested_exact_version.sha256 ||
            sha256(bytes) !== input.requested_exact_version.sha256) {
          throw conflict('native_copy_snapshot_mismatch');
        }

        try {
          await this.storageService.putQuarantineObject({
            tenantId: principal.tenantId,
            quarantineRef: row.quarantine_ref,
            body: bytes,
            contentLength: bytes.byteLength,
            contentType: row.mime_type,
          });
          createdStorage = true;
        } catch (error) {
          if (!(error instanceof StorageObjectAlreadyExistsError)) throw error;
          await this.readAndVerifySnapshot(principal, row);
        }
        await this.assertAccess(
          principal,
          lockedSource.document_id,
          lockedSource.matter_id,
          true,
        );
        await this.source(principal, input, true, tx, true);
        await tx.query(
          `UPDATE amic_os_native_document_copies
           SET state = 'retained', blocked_reason = NULL, updated_at = now()
           WHERE tenant_id = $1::uuid AND copy_id = $2 AND snapshot_id = $3
             AND state = 'prepared'`,
          [principal.tenantId, input.copy_id, input.snapshot_id],
        );
        const retained = await this.copy(principal, input.copy_id, input.snapshot_id, tx, true);
        if (!retained) throw conflict('native_copy_prepare_failed');
        return retained;
      } catch (error) {
        if (createdStorage) {
          await this.storageService.deleteByStorageUri(principal.tenantId, storageUri);
        }
        throw error;
      }
    });
    return this.result(copy);
  }

  async complete(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultNativeCopyBindingInput,
  ) {
    this.assertPrincipal(principal, input);
    let copy = await this.requireCopy(principal, input);
    await this.assertAccess(principal, copy.source_document_id, copy.source_matter_id, true);
    if (copy.state === 'prepared') {
      try {
        await this.readAndVerifySnapshot(principal, copy);
      } catch (error) {
        if (!(error instanceof NativeCopySnapshotUnavailableError) &&
            !(error instanceof StorageExactVersionMissingError)) {
          throw error;
        }
        copy = await this.auditService.transaction(principal.tenantId, async (tx) => {
          await tx.query(
            `UPDATE amic_os_native_document_copies
             SET state = 'blocked', blocked_reason = 'snapshot_unavailable', updated_at = now()
             WHERE tenant_id = $1::uuid AND copy_id = $2 AND snapshot_id = $3
               AND state = 'prepared'`,
            [principal.tenantId, input.copy_id, input.snapshot_id],
          );
          const row = await this.copy(principal, input.copy_id, input.snapshot_id, tx, true);
          if (!row) throw permissionDenied();
          return row;
        });
        return this.result(copy);
      }
      copy = await this.auditService.transaction(principal.tenantId, async (tx) => {
        await tx.query(
          `UPDATE amic_os_native_document_copies
           SET state = 'retained', blocked_reason = NULL, updated_at = now()
           WHERE tenant_id = $1::uuid AND copy_id = $2 AND snapshot_id = $3
             AND state = 'prepared'`,
          [principal.tenantId, input.copy_id, input.snapshot_id],
        );
        const row = await this.copy(principal, input.copy_id, input.snapshot_id, tx, true);
        if (!row) throw permissionDenied();
        return row;
      });
    }
    return this.result(copy);
  }

  async list(principal: AmicOsVaultProviderPrincipal, input: AmicOsVaultNativeCopyListInput) {
    this.assertPrincipal(principal, input);
    const source = await this.source(principal, input, false);
    await this.assertAccess(principal, source.document_id, source.matter_id, false);
    const cursor = decodeCursor(input.cursor);
    if (cursor && (cursor.sourceDocumentId !== source.document_id ||
        cursor.actorUserId !== principal.actorUserId)) {
      throw conflict('native_copy_cursor_invalid');
    }
    const rows = await this.auditService.transaction(principal.tenantId, async (tx) => {
      const result = await tx.query(
        `${copyRowSelect}
         WHERE c.tenant_id = $1::uuid AND c.source_document_id = $2::uuid
           AND c.created_by = $3::uuid
           AND c.source_matter_id = $4::uuid AND c.lawos_matter_id = $5
           AND ($6::timestamptz IS NULL OR
             (c.created_at, c.copy_id, c.snapshot_id) < ($6::timestamptz, $7, $8))
         ORDER BY c.created_at DESC, c.copy_id DESC, c.snapshot_id DESC
         LIMIT $9`,
        [
          principal.tenantId,
          source.document_id,
          principal.actorUserId,
          source.matter_id,
          source.lawos_matter_id,
          cursor?.createdAt ?? null,
          cursor?.copyId ?? '',
          cursor?.snapshotId ?? '',
          input.limit + 1,
        ],
      );
      return result.rows as NativeCopyRow[];
    });
    const page = rows.slice(0, input.limit);
    return {
      ...this.authority(),
      items: page.map((row) => this.result(row)),
      next_cursor: rows.length > input.limit && page.length > 0
        ? encodeCursor(page[page.length - 1]!)
        : null,
    };
  }

  async read(principal: AmicOsVaultProviderPrincipal, input: AmicOsVaultNativeCopyReadInput) {
    this.assertPrincipal(principal, input);
    const copy = await this.requireCopy(principal, input);
    if (!['retained', 'saved'].includes(copy.state) || input.offset >= Number(copy.byte_size)) {
      throw conflict('native_copy_snapshot_not_ready');
    }
    await this.assertAccess(principal, copy.source_document_id, copy.source_matter_id, false);
    const bytes = await this.readAndVerifySnapshot(principal, copy);
    const nextOffset = Math.min(input.offset + AMIC_OS_VAULT_NATIVE_COPY_READ_BYTES, bytes.byteLength);
    const chunk = bytes.subarray(input.offset, nextOffset);
    await this.auditService.log(documentDownloadedAudit({
      tenantId: principal.tenantId,
      actorId: principal.actorUserId,
      documentId: copy.source_document_id,
      matterId: copy.source_matter_id,
      versionId: copy.source_version_id,
      hash: copy.sha256,
      reasonCode: 'AMIC_OS_NATIVE_COPY',
    }));
    return {
      ...this.result(copy),
      offset: input.offset,
      bytes_base64: chunk.toString('base64'),
      next_offset: nextOffset,
      final: nextOffset === bytes.byteLength,
    };
  }

  async commit(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultNativeCopyBindingInput,
  ) {
    this.assertPrincipal(principal, input);
    let copy = await this.requireCopy(principal, input);
    await this.assertAccess(principal, copy.source_document_id, copy.source_matter_id, true);
    if (copy.state === 'saved') return this.result(copy);
    if (copy.state !== 'retained' || copy.blocked_reason !== null ||
        copy.source_current_version_id !== copy.source_version_id) {
      throw conflict('base_version_stale');
    }
    const sourceInput = this.sourceInput(copy, input.principal);
    await this.source(principal, sourceInput, true);
    const bytes = await this.readAndVerifySnapshot(principal, copy);

    await this.uploadService.uploadBuffer({
      actorUserId: principal.actorUserId,
      matterId: copy.source_matter_id,
      originalFilename: copy.filename,
      mimeType: copy.mime_type,
      body: bytes,
      fields: {
        title: copy.title,
        duplicateDecision: 'new_document',
        versionSignificance: 'internal_draft',
        tags: [`amic-os-native-copy:${copy.copy_id.slice('document-copy:'.length)}`],
      },
      afterUploadAudit: async (tx, uploaded) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `amic-os-native-copy-publish:${principal.tenantId}:${copy.copy_id}`,
        ]);
        await this.assertAccess(
          principal,
          copy.source_document_id,
          copy.source_matter_id,
          true,
        );
        await this.source(principal, sourceInput, true, tx, true);
        const published = await tx.query(
          `SELECT snapshot_id
           FROM amic_os_native_document_copies
           WHERE tenant_id = $1::uuid AND copy_id = $2 AND state = 'saved'
           FOR UPDATE`,
          [principal.tenantId, copy.copy_id],
        );
        if (published.rows.length > 0) throw conflict('native_copy_already_saved');
        const updated = await tx.query(
          `UPDATE amic_os_native_document_copies
           SET state = 'saved', blocked_reason = NULL,
               saved_document_id = $4::uuid, saved_version_id = $5::uuid,
               saved_file_object_id = $6::uuid, updated_at = now()
           WHERE tenant_id = $1::uuid AND copy_id = $2 AND snapshot_id = $3
             AND state = 'retained' AND blocked_reason IS NULL`,
          [
            principal.tenantId,
            copy.copy_id,
            copy.snapshot_id,
            uploaded.documentId,
            uploaded.versionId,
            uploaded.fileObjectId,
          ],
        );
        if (updated.rowCount !== 1 || uploaded.sha256 !== copy.sha256) {
          throw conflict('native_copy_commit_conflict');
        }
      },
    });
    copy = await this.requireCopy(principal, input);
    if (copy.state !== 'saved') throw conflict('native_copy_commit_failed');
    return this.result(copy);
  }

  private authority() {
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: 'generic-copy-v1' as const,
    };
  }

  private result(row: NativeCopyRow) {
    const source = exactFromCopy(row);
    const stale = row.source_current_version_id !== row.source_version_id;
    const blockedReason = row.blocked_reason ?? (stale ? 'base_version_stale' : null);
    const state = row.state;
    let exactVersion: AmicOsVaultNativeCopyExactVersion | null = null;
    if (state === 'saved') {
      if (!row.saved_document_id || !row.saved_version_id || !row.saved_file_object_id ||
          row.saved_sha256 !== row.sha256 || Number(row.saved_byte_size) !== Number(row.byte_size) ||
          row.saved_mime_type !== row.mime_type || row.saved_document_id === row.source_document_id) {
        throw permissionDenied();
      }
      exactVersion = {
        document_id: row.saved_document_id,
        version_id: row.saved_version_id,
        file_object_id: row.saved_file_object_id,
        sha256: row.saved_sha256,
        byte_size: Number(row.saved_byte_size),
        mime_type: row.saved_mime_type,
      };
    }
    return {
      ...this.authority(),
      copy_id: row.copy_id,
      snapshot_id: row.snapshot_id,
      title: row.title,
      source: {
        authority_kind: 'amic-vault-api' as const,
        lawos_matter_id: row.lawos_matter_id,
        exact_version: source,
      },
      file: fileFromCopy(row),
      state,
      scan_state: state === 'saved' ? 'promoted' as const
        : state === 'retained' ? 'clean' as const : null,
      blocked_reason: blockedReason,
      exact_version: exactVersion,
      created_at: row.created_at.toISOString(),
      ...(state === 'saved' ? { saved: true as const } : {}),
    };
  }

  private assertPrincipal(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultNativeCopyBaseInput,
  ): void {
    const context = this.tenantContext.require();
    if (context.source !== 'amic-os-provider' || context.tenantId !== principal.tenantId ||
        principal.accountLedgerId !== input.principal.user_id) {
      throw permissionDenied();
    }
  }

  private async assertAccess(
    principal: AmicOsVaultProviderPrincipal,
    documentId: string,
    matterId: string,
    write: boolean,
  ): Promise<void> {
    const context = { tenantId: principal.tenantId, userId: principal.actorUserId };
    const checks = [];
    try {
      checks.push(await this.permissionService.canReadDocument(context, documentId));
      checks.push(await this.permissionService.canDownloadDocument(
        context,
        documentId,
        'AMIC_OS_NATIVE_COPY',
      ));
      if (write) checks.push(await this.permissionService.canUploadToMatter(context, matterId));
    } catch {
      throw permissionDenied();
    }
    if (checks.length !== (write ? 3 : 2) || checks.some((decision) => decision.effect !== 'ALLOW')) {
      throw permissionDenied();
    }
  }

  private async source(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultNativeCopyBaseInput,
    requireCurrent: boolean,
    client?: QueryClient,
    lock = false,
  ): Promise<NativeCopySourceRow> {
    const query = async (tx: QueryClient) => {
      const result = await tx.query(
        `SELECT d.document_id, d.matter_id, d.status AS document_status,
                m.status AS matter_status,
                coalesce(nullif(m.metadata_json ->> 'lawosMatterId', ''),
                         nullif(m.metadata_json ->> 'matterAppMatterId', '')) AS lawos_matter_id,
                selected.version_id, selected.file_object_id,
                selected.file_hash AS sha256, selected_file.size_bytes AS byte_size,
                selected_file.mime_type,
                coalesce(nullif(selected_file.original_filename, ''),
                         selected_file.normalized_filename) AS filename,
                current.version_id AS current_version_id
         FROM documents d
         JOIN matters m ON m.tenant_id = d.tenant_id AND m.matter_id = d.matter_id
         JOIN document_versions selected ON selected.tenant_id = d.tenant_id
           AND selected.document_id = d.document_id AND selected.version_id = $3::uuid
         JOIN file_objects selected_file ON selected_file.tenant_id = selected.tenant_id
           AND selected_file.file_object_id = selected.file_object_id
         JOIN document_versions current ON current.tenant_id = d.tenant_id
           AND current.document_id = d.document_id AND current.version_status = 'current'
         WHERE d.tenant_id = $1::uuid AND d.document_id = $2::uuid
           AND d.status <> 'deleted'
         ${lock ? 'FOR SHARE OF d, selected, current' : ''}`,
        [principal.tenantId, input.requested_exact_version.document_id,
          input.requested_exact_version.version_id],
      );
      const row = result.rows[0] as NativeCopySourceRow | undefined;
      if (!row || result.rows.length !== 1 || row.lawos_matter_id !== input.lawos_matter_id ||
          !sameExact(exactFromSource(row), input.requested_exact_version) ||
          !['application/pdf', 'message/rfc822'].includes(row.mime_type) ||
          Number(row.byte_size) < 1 || Number(row.byte_size) > AMIC_OS_VAULT_NATIVE_COPY_MAX_BYTES ||
          requireCurrent && row.current_version_id !== row.version_id) {
        throw permissionDenied();
      }
      return row;
    };
    return client ? query(client) : this.auditService.transaction(principal.tenantId, query);
  }

  private async copy(
    principal: AmicOsVaultProviderPrincipal,
    copyId: string,
    snapshotId: string,
    client?: QueryClient,
    lock = false,
  ): Promise<NativeCopyRow | null> {
    const query = async (tx: QueryClient) => {
      const result = await tx.query(
        `${copyRowSelect}
         WHERE c.tenant_id = $1::uuid AND c.copy_id = $2 AND c.snapshot_id = $3
         ${lock ? 'FOR UPDATE OF c' : ''}`,
        [principal.tenantId, copyId, snapshotId],
      );
      if (result.rows.length > 1) throw permissionDenied();
      return (result.rows[0] as NativeCopyRow | undefined) ?? null;
    };
    return client ? query(client) : this.auditService.transaction(principal.tenantId, query);
  }

  private async requireCopy(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultNativeCopyBindingInput,
  ): Promise<NativeCopyRow> {
    const row = await this.copy(principal, input.copy_id, input.snapshot_id);
    if (!row) throw permissionDenied();
    this.assertBinding(principal, input, row);
    return row;
  }

  private assertBinding(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultNativeCopyBindingInput,
    row: NativeCopyRow,
    title?: string,
    mode?: 'clone' | 'upload',
    file?: AmicOsVaultNativeCopyFile,
  ): void {
    if (row.created_by !== principal.actorUserId || row.copy_id !== input.copy_id ||
        row.snapshot_id !== input.snapshot_id || row.lawos_matter_id !== input.lawos_matter_id ||
        !sameExact(exactFromCopy(row), input.requested_exact_version) ||
        title !== undefined && row.title !== title || mode !== undefined && row.mode !== mode ||
        file !== undefined && (row.filename !== file.filename || row.sha256 !== file.sha256 ||
          Number(row.byte_size) !== file.byte_size || row.mime_type !== file.mime_type)) {
      throw conflict('native_copy_idempotency_conflict');
    }
  }

  private assertImmutableFile(
    file: AmicOsVaultNativeCopyFile,
    source: AmicOsVaultNativeCopyExactVersion,
  ): void {
    if (file.sha256 !== source.sha256 || file.byte_size !== source.byte_size ||
        file.mime_type !== source.mime_type) {
      throw conflict('native_copy_immutable_source_required');
    }
  }

  private sourceInput(
    row: NativeCopyRow,
    principal: AmicOsVaultNativeCopyBaseInput['principal'],
  ): AmicOsVaultNativeCopyBaseInput {
    return {
      principal,
      lawos_matter_id: row.lawos_matter_id,
      requested_exact_version: exactFromCopy(row),
    };
  }

  private async readAndVerifySnapshot(
    principal: AmicOsVaultProviderPrincipal,
    row: NativeCopyRow,
  ): Promise<Buffer> {
    const object = await this.storageService.getByStorageUri(
      principal.tenantId,
      this.storageService.quarantineStorageUri(principal.tenantId, row.quarantine_ref),
    );
    if (object.contentLength !== Number(row.byte_size) || object.contentType !== row.mime_type) {
      throw new NativeCopySnapshotUnavailableError();
    }
    const bytes = await readBounded(
      object.body,
      Number(row.byte_size),
      () => new NativeCopySnapshotUnavailableError(),
    );
    if (sha256(bytes) !== row.sha256) throw new NativeCopySnapshotUnavailableError();
    return bytes;
  }
}
