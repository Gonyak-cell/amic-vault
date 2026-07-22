import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  MatterClosingBinderDto,
  MatterClosingBinderItemType,
  MatterClosingBinderManifestDownloadDto,
  MatterClosingBinderManifestDto,
  MatterClosingBinderManifestItemDto,
  MatterClosingBinderResponseDto,
  MatterClosingBinderStatus,
  TenantId,
} from '@amic-vault/shared';
import { buildStoredZip, type StoredZipFile } from '../../common/zip-store';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { isDocumentPromoted } from '../file-security/promoted-file.guard';
import { PermissionService } from '../permission/permission.service';
import { RecordsService } from '../records/records.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';

interface ClosingBinderRow {
  closing_binder_id: string;
  matter_id: string;
  manifest_json: MatterClosingBinderManifestDto;
  manifest_sha256: string;
  status: MatterClosingBinderStatus;
  created_by: string;
  finalized_by: string | null;
  finalized_at: Date | null;
  records_archive_count: number;
  created_at: Date;
  updated_at: Date;
}

interface BinderDocumentRow {
  document_id: string;
  title: string;
  status: string;
  version_id: string;
  version_no: number;
  version_label: string | null;
  version_significance: string;
  sha256: string;
  created_at: Date;
}

interface BinderEmailRow {
  email_id: string;
  title: string | null;
  raw_sha256: string;
  created_at: Date;
}

interface BinderArchiveObjectRow {
  item_id: string;
  storage_uri: string;
  normalized_filename: string;
  sha256: string;
}

interface BinderArchiveSource {
  item: MatterClosingBinderManifestItemDto;
  storageUri: string;
  normalizedFilename: string;
  sha256: string;
}

interface MatterClosingBinderArchiveDownload {
  body: Buffer;
  filename: string;
  mimeType: string;
  sha256: string;
  fileCount: number;
  itemCount: number;
}

type BinderManifestFormat = 'csv' | 'json';

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

function safeArchiveFilename(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/[\\/:]+/gu, '-')
    .replace(/\.\.+/gu, '.')
    .replace(/^\.+/u, '')
    .trim();
  return cleaned || 'item';
}

function archiveEntryName(index: number, source: BinderArchiveSource): string {
  const number = String(index + 1).padStart(3, '0');
  return `files/${number}-${safeArchiveFilename(source.normalizedFilename || source.item.title)}`;
}

function binderDto(row: ClosingBinderRow): MatterClosingBinderDto {
  return {
    closingBinderId: row.closing_binder_id,
    matterId: row.matter_id,
    status: row.status,
    manifestSha256: row.manifest_sha256,
    manifest: row.manifest_json,
    recordsArchiveCount: row.records_archive_count,
    createdBy: row.created_by,
    finalizedBy: row.finalized_by,
    finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function csvCell(value: string | null): string {
  const text = value ?? '';
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function manifestCsv(manifest: MatterClosingBinderManifestDto): string {
  const rows = [
    ['item_type', 'title', 'document_id', 'version_id', 'version_label', 'email_id', 'sha256'],
    ...manifest.items.map((item) => [
      item.itemType,
      item.title,
      item.documentId,
      item.versionId,
      item.versionLabel,
      item.emailId,
      item.sha256,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function itemTypeForDocument(row: BinderDocumentRow): MatterClosingBinderItemType {
  if (row.status === 'executed' || row.version_significance === 'execution_copy') {
    return 'execution_copy';
  }
  return 'final_version';
}

@Injectable()
export class ClosingBinderService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(RecordsService) private readonly recordsService: RecordsService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async getBinder(actorUserId: string, matterId: string): Promise<MatterClosingBinderResponseDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      await this.assertMatterExists(tx, context.tenantId, matterId);
      const row = await this.findBinder(tx, context.tenantId, matterId, false);
      return { matterId, binder: row ? binderDto(row) : null };
    });
  }

  async downloadManifest(
    actorUserId: string,
    matterId: string,
    format: BinderManifestFormat,
  ): Promise<MatterClosingBinderManifestDownloadDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const row = await this.findBinder(tx, context.tenantId, matterId, false);
      if (!row) throw notFoundDenied();
      const body =
        format === 'csv' ? manifestCsv(row.manifest_json) : `${JSON.stringify(row.manifest_json, null, 2)}\n`;
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'CLOSING_BINDER_MANIFEST_DOWNLOADED',
          targetType: 'closing_binder',
          targetId: row.closing_binder_id,
          matterId,
          metadata: {
            closing_binder_id: row.closing_binder_id,
            matter_id: matterId,
            manifest_hash: row.manifest_sha256,
            item_count: row.manifest_json.items.length,
            export_format: format,
          },
        },
        tx,
      );
      return {
        body,
        filename: `closing-binder-${matterId}.${format}`,
        mimeType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      };
    });
  }

  async downloadArchive(
    actorUserId: string,
    matterId: string,
  ): Promise<MatterClosingBinderArchiveDownload> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    const archive = await this.auditService.transaction(context.tenantId, async (tx) => {
      const row = await this.findBinder(tx, context.tenantId, matterId, false);
      if (!row) throw notFoundDenied();
      if (row.status !== 'finalized') throw validationFailed('CLOSING_BINDER_ARCHIVE_REQUIRES_FINALIZED');
      const sources = await this.collectArchiveSources(tx, context.tenantId, row.manifest_json);
      for (const source of sources) {
        if (
          source.item.documentId &&
          !(await isDocumentPromoted(tx, {
            tenantId: context.tenantId,
            documentId: source.item.documentId,
          }))
        ) {
          throw notFoundDenied();
        }
      }
      return {
        binder: row,
        sources,
      };
    });

    for (const source of archive.sources) {
      if (source.item.documentId) {
        await this.assertCanDownloadDocument(context.tenantId, actorUserId, source.item.documentId);
      }
    }

    const files: StoredZipFile[] = [
      {
        name: 'manifest.json',
        body: `${JSON.stringify(archive.binder.manifest_json, null, 2)}\n`,
      },
    ];
    for (const [index, source] of archive.sources.entries()) {
      const object = await this.storageService.getByStorageUri(context.tenantId, source.storageUri);
      const body = await streamToBuffer(object.body);
      const actualSha256 = sha256Hex(body);
      if (actualSha256 !== source.sha256 || actualSha256 !== source.item.sha256) {
        throw validationFailed('CLOSING_BINDER_ARCHIVE_HASH_MISMATCH');
      }
      files.push({ name: archiveEntryName(index, source), body });
    }

    const body = buildStoredZip(files);
    const archiveSha256 = sha256Hex(body);
    await this.auditService.transaction(context.tenantId, async (tx) => {
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'CLOSING_BINDER_MANIFEST_DOWNLOADED',
          targetType: 'closing_binder',
          targetId: archive.binder.closing_binder_id,
          matterId,
          metadata: {
            closing_binder_id: archive.binder.closing_binder_id,
            matter_id: matterId,
            manifest_hash: archive.binder.manifest_sha256,
            item_count: archive.binder.manifest_json.items.length,
            document_count: archive.sources.filter((source) => source.item.documentId).length,
            archive_count: archive.sources.length,
            export_format: 'zip',
            hash: archiveSha256,
            download_byte_count: body.length,
          },
        },
        tx,
      );
    });

    return {
      body,
      filename: `closing-binder-${matterId}.zip`,
      mimeType: 'application/zip',
      sha256: archiveSha256,
      fileCount: archive.sources.length,
      itemCount: archive.binder.manifest_json.items.length,
    };
  }

  async finalizeForClosedMatter(
    client: QueryClient,
    input: { actorUserId: string; matterId: string; tenantId: TenantId },
  ): Promise<MatterClosingBinderDto> {
    await this.assertMatterClosed(client, input.tenantId, input.matterId);
    const existing = await this.findBinder(client, input.tenantId, input.matterId, true);
    if (existing?.status === 'finalized') return binderDto(existing);

    const manifest = await this.buildManifest(client, input.tenantId, input.matterId);
    const manifestSha256 = sha256Hex(JSON.stringify(manifest));
    const row = existing
      ? await this.updateDraftBinder(client, existing.closing_binder_id, input.tenantId, manifest, manifestSha256)
      : await this.insertDraftBinder(client, input, manifest, manifestSha256);
    if (!existing) await this.logCreated(client, input, row);

    let archiveCount = 0;
    const archivedDocumentIds = new Set<string>();
    for (const item of row.manifest_json.items) {
      if (!item.documentId || archivedDocumentIds.has(item.documentId)) continue;
      await this.recordsService.archiveDocumentForClosingBinder(
        client,
        { tenantId: input.tenantId, userId: input.actorUserId },
        {
          closingBinderId: row.closing_binder_id,
          documentId: item.documentId,
          reasonCode: 'CLOSING_BINDER_FINALIZED',
        },
      );
      archivedDocumentIds.add(item.documentId);
      archiveCount += 1;
    }

    const finalized = await this.finalizeDraftBinder(
      client,
      input.tenantId,
      row.closing_binder_id,
      input.actorUserId,
      archiveCount,
    );
    await this.logFinalized(client, input, finalized);
    return binderDto(finalized);
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService
      .canReadMatter({ tenantId, userId: actorUserId }, matterId)
      .catch(() => undefined);
    if (decision?.effect !== 'ALLOW') throw permissionDenied();
  }

  private async assertCanDownloadDocument(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
  ): Promise<void> {
    const decision = await this.permissionService
      .canDownloadDocument({ tenantId, userId: actorUserId }, documentId, 'CLOSING_BINDER_ARCHIVE')
      .catch(() => undefined);
    if (decision?.effect !== 'ALLOW') throw permissionDenied();
  }

  private async assertMatterExists(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT 1
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    if ((result.rowCount ?? 0) !== 1) throw notFoundDenied();
  }

  private async assertMatterClosed(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT status
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0] as { status: string } | undefined;
    if (!row) throw notFoundDenied();
    if (row.status !== 'closed') throw validationFailed('CLOSING_BINDER_REQUIRES_CLOSED_MATTER');
  }

  private async findBinder(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    lock: boolean,
  ): Promise<ClosingBinderRow | null> {
    const result = await client.query(
      `
        SELECT closing_binder_id, matter_id, manifest_json, manifest_sha256, status,
          created_by, finalized_by, finalized_at, records_archive_count, created_at, updated_at
        FROM closing_binders
        WHERE tenant_id = $1
          AND matter_id = $2
        ${lock ? 'FOR UPDATE' : ''}
      `,
      [tenantId, matterId],
    );
    return (result.rows[0] as ClosingBinderRow | undefined) ?? null;
  }

  private async buildManifest(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterClosingBinderManifestDto> {
    const documents = await this.collectDocumentItems(client, tenantId, matterId);
    const emails = await this.collectEmailItems(client, tenantId, matterId);
    return {
      schemaVersion: 1,
      matterId,
      generatedAt: new Date().toISOString(),
      items: [...documents, ...emails],
    };
  }

  private async collectDocumentItems(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterClosingBinderManifestItemDto[]> {
    const result = await client.query(
      `
        SELECT d.document_id, d.title, d.status, d.created_at,
          dv.version_id, dv.version_no, dv.version_label, dv.version_significance,
          COALESCE(fo.sha256, dv.file_hash) AS sha256
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        JOIN file_objects fo
          ON fo.tenant_id = dv.tenant_id
         AND fo.file_object_id = dv.file_object_id
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
          AND (
            d.status IN ('final', 'executed')
            OR dv.version_significance IN ('final', 'execution_copy')
          )
        ORDER BY
          CASE
            WHEN d.status = 'executed' OR dv.version_significance = 'execution_copy' THEN 0
            ELSE 1
          END,
          d.created_at ASC,
          d.document_id ASC
      `,
      [tenantId, matterId],
    );
    return (result.rows as BinderDocumentRow[]).map((row) => ({
      itemId: row.version_id,
      itemType: itemTypeForDocument(row),
      title: row.title,
      sha256: row.sha256,
      documentId: row.document_id,
      versionId: row.version_id,
      versionLabel: row.version_label ?? `v${row.version_no}`,
      emailId: null,
      sourceRef: `document_version:${row.version_id}`,
    }));
  }

  private async collectEmailItems(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterClosingBinderManifestItemDto[]> {
    const result = await client.query(
      `
        SELECT e.email_id, e.subject AS title, e.raw_sha256, f.created_at
        FROM email_matter_filings f
        JOIN email_messages e
          ON e.tenant_id = f.tenant_id
         AND e.email_id = f.email_id
        WHERE f.tenant_id = $1
          AND f.matter_id = $2
          AND e.parse_status = 'parsed'
        ORDER BY f.created_at DESC, f.filing_id ASC
        LIMIT 20
      `,
      [tenantId, matterId],
    );
    return (result.rows as BinderEmailRow[]).map((row) => ({
      itemId: row.email_id,
      itemType: 'key_email',
      title: row.title ?? `Filed email ${row.email_id.slice(0, 8)}`,
      sha256: row.raw_sha256,
      documentId: null,
      versionId: null,
      versionLabel: null,
      emailId: row.email_id,
      sourceRef: `email:${row.email_id}`,
    }));
  }

  private async collectArchiveSources(
    client: QueryClient,
    tenantId: TenantId,
    manifest: MatterClosingBinderManifestDto,
  ): Promise<BinderArchiveSource[]> {
    const documentVersionIds = manifest.items.flatMap((item) =>
      item.documentId && item.versionId ? [item.versionId] : [],
    );
    const emailIds = manifest.items.flatMap((item) => (item.emailId ? [item.emailId] : []));
    const documentObjects = new Map<string, BinderArchiveObjectRow>();
    const emailObjects = new Map<string, BinderArchiveObjectRow>();

    if (documentVersionIds.length > 0) {
      const result = await client.query(
        `
          SELECT dv.version_id AS item_id, fo.storage_uri, fo.normalized_filename,
            COALESCE(fo.sha256, dv.file_hash) AS sha256
          FROM document_versions dv
          JOIN file_objects fo
            ON fo.tenant_id = dv.tenant_id
           AND fo.file_object_id = dv.file_object_id
          WHERE dv.tenant_id = $1
            AND dv.version_id = ANY($2::uuid[])
        `,
        [tenantId, documentVersionIds],
      );
      for (const row of result.rows as BinderArchiveObjectRow[]) documentObjects.set(row.item_id, row);
    }

    if (emailIds.length > 0) {
      const result = await client.query(
        `
          SELECT e.email_id AS item_id, fo.storage_uri, fo.normalized_filename,
            COALESCE(fo.sha256, e.raw_sha256) AS sha256
          FROM email_messages e
          JOIN file_objects fo
            ON fo.tenant_id = e.tenant_id
           AND fo.file_object_id = e.raw_file_object_id
          WHERE e.tenant_id = $1
            AND e.email_id = ANY($2::uuid[])
        `,
        [tenantId, emailIds],
      );
      for (const row of result.rows as BinderArchiveObjectRow[]) emailObjects.set(row.item_id, row);
    }

    return manifest.items.map((item) => {
      const row =
        item.documentId && item.versionId
          ? documentObjects.get(item.versionId)
          : item.emailId
            ? emailObjects.get(item.emailId)
            : undefined;
      if (!row) throw validationFailed('CLOSING_BINDER_ARCHIVE_SOURCE_MISSING');
      return {
        item,
        storageUri: row.storage_uri,
        normalizedFilename: row.normalized_filename,
        sha256: row.sha256,
      };
    });
  }

  private async insertDraftBinder(
    client: QueryClient,
    input: { actorUserId: string; matterId: string; tenantId: TenantId },
    manifest: MatterClosingBinderManifestDto,
    manifestSha256: string,
  ): Promise<ClosingBinderRow> {
    const result = await client.query(
      `
        INSERT INTO closing_binders (
          tenant_id, matter_id, manifest_json, manifest_sha256, status, created_by
        )
        VALUES ($1, $2, $3::jsonb, $4, 'draft', $5)
        RETURNING closing_binder_id, matter_id, manifest_json, manifest_sha256, status,
          created_by, finalized_by, finalized_at, records_archive_count, created_at, updated_at
      `,
      [input.tenantId, input.matterId, JSON.stringify(manifest), manifestSha256, input.actorUserId],
    );
    const row = result.rows[0] as ClosingBinderRow | undefined;
    if (!row) throw validationFailed('CLOSING_BINDER_CREATE_FAILED');
    return row;
  }

  private async updateDraftBinder(
    client: QueryClient,
    closingBinderId: string,
    tenantId: TenantId,
    manifest: MatterClosingBinderManifestDto,
    manifestSha256: string,
  ): Promise<ClosingBinderRow> {
    const result = await client.query(
      `
        UPDATE closing_binders
        SET manifest_json = $3::jsonb,
          manifest_sha256 = $4,
          updated_at = now()
        WHERE tenant_id = $1
          AND closing_binder_id = $2
          AND status = 'draft'
        RETURNING closing_binder_id, matter_id, manifest_json, manifest_sha256, status,
          created_by, finalized_by, finalized_at, records_archive_count, created_at, updated_at
      `,
      [tenantId, closingBinderId, JSON.stringify(manifest), manifestSha256],
    );
    const row = result.rows[0] as ClosingBinderRow | undefined;
    if (!row) throw validationFailed('CLOSING_BINDER_IMMUTABLE');
    return row;
  }

  private async finalizeDraftBinder(
    client: QueryClient,
    tenantId: TenantId,
    closingBinderId: string,
    actorUserId: string,
    archiveCount: number,
  ): Promise<ClosingBinderRow> {
    const result = await client.query(
      `
        UPDATE closing_binders
        SET status = 'finalized',
          finalized_by = $3,
          finalized_at = now(),
          records_archive_count = $4,
          updated_at = now()
        WHERE tenant_id = $1
          AND closing_binder_id = $2
          AND status = 'draft'
        RETURNING closing_binder_id, matter_id, manifest_json, manifest_sha256, status,
          created_by, finalized_by, finalized_at, records_archive_count, created_at, updated_at
      `,
      [tenantId, closingBinderId, actorUserId, archiveCount],
    );
    const row = result.rows[0] as ClosingBinderRow | undefined;
    if (!row) throw validationFailed('CLOSING_BINDER_IMMUTABLE');
    return row;
  }

  private async logCreated(
    client: QueryClient,
    input: { actorUserId: string; matterId: string; tenantId: TenantId },
    row: ClosingBinderRow,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: input.tenantId,
        actorId: input.actorUserId,
        action: 'CLOSING_BINDER_CREATED',
        targetType: 'closing_binder',
        targetId: row.closing_binder_id,
        matterId: input.matterId,
        metadata: {
          closing_binder_id: row.closing_binder_id,
          matter_id: input.matterId,
          manifest_hash: row.manifest_sha256,
          item_count: row.manifest_json.items.length,
        },
      },
      client,
    );
  }

  private async logFinalized(
    client: QueryClient,
    input: { actorUserId: string; matterId: string; tenantId: TenantId },
    row: ClosingBinderRow,
  ): Promise<void> {
    const documentCount = row.manifest_json.items.filter((item) => item.documentId).length;
    await this.auditService.log(
      {
        tenantId: input.tenantId,
        actorId: input.actorUserId,
        action: 'CLOSING_BINDER_FINALIZED',
        targetType: 'closing_binder',
        targetId: row.closing_binder_id,
        matterId: input.matterId,
        metadata: {
          closing_binder_id: row.closing_binder_id,
          matter_id: input.matterId,
          manifest_hash: row.manifest_sha256,
          item_count: row.manifest_json.items.length,
          document_count: documentCount,
          archive_count: row.records_archive_count,
        },
      },
      client,
    );
  }
}
