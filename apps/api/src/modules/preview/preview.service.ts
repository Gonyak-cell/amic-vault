import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PermissionDecision, TenantId } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { documentViewedAudit } from '../audit/events/document-events';
import { PermissionService } from '../permission/permission.service';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { PreviewConversionUnavailableError, PreviewConvertJob } from './preview-convert.job';

interface PreviewFileRow {
  document_id: string;
  tenant_id: string;
  matter_id: string;
  status: string;
  version_id: string;
  file_object_id: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
}

interface PreviewArtifactRow {
  file_object_id: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
}

export interface PreviewResult {
  body: Readable;
  contentType: string;
  contentLength: number;
  statusCode: 200 | 206;
  contentRange?: string;
  sha256: string;
}

const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function documentLocked(): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED' });
}

function conversionUnavailable(): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    reason: 'PREVIEW_CONVERSION_UNAVAILABLE',
  });
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function parseRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const startRaw = match[1] ?? '';
  const endRaw = match[2] ?? '';
  if (!startRaw && !endRaw) return null;
  const start = startRaw ? Number(startRaw) : Math.max(size - Number(endRaw), 0);
  let end = endRaw && startRaw ? Number(endRaw) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(FileObjectService) private readonly fileObjectService: FileObjectService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(PreviewConvertJob) private readonly previewConvertJob: PreviewConvertJob,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async openPreview(
    actorUserId: string,
    documentId: string,
    rangeHeader?: string,
  ): Promise<PreviewResult> {
    const context = this.tenantContext.require();
    const original = await this.auditService.transaction(context.tenantId, async (tx) => {
      const target = await this.findCurrentPreviewTarget(tx, context.tenantId, documentId);
      if (!target) throw notFoundDenied();
      if (target.status === 'deleted') throw documentLocked();
      await this.assertCanPreview(context.tenantId, actorUserId, documentId);
      return target;
    });

    const previewFile =
      original.mime_type === 'application/pdf'
        ? original
        : await this.resolveDerivedPreview(context.tenantId, actorUserId, original);

    const object = await this.storageService.getByStorageUri(context.tenantId, previewFile.storage_uri);
    const full = await streamToBuffer(object.body);
    const range = parseRange(rangeHeader, full.length);
    if (!range) {
      await this.recordPreviewViewed(context.tenantId, actorUserId, original);
      return {
        body: Readable.from(full),
        contentType: 'application/pdf',
        contentLength: full.length,
        statusCode: 200,
        sha256: previewFile.sha256,
      };
    }
    const body = full.subarray(range.start, range.end + 1);
    return {
      body: Readable.from(body),
      contentType: 'application/pdf',
      contentLength: body.length,
      statusCode: 206,
      contentRange: `bytes ${range.start}-${range.end}/${full.length}`,
      sha256: previewFile.sha256,
    };
  }

  private async recordPreviewViewed(
    tenantId: TenantId,
    actorUserId: string,
    original: PreviewFileRow,
  ): Promise<void> {
    await this.auditService.transaction(tenantId, async (tx) => {
      await this.auditService.log(
        documentViewedAudit({
          tenantId,
          actorId: actorUserId,
          documentId: original.document_id,
          matterId: original.matter_id,
          versionId: original.version_id,
          channel: 'preview',
        }),
        tx,
      );
    });
  }

  private async resolveDerivedPreview(
    tenantId: TenantId,
    actorUserId: string,
    original: PreviewFileRow,
  ): Promise<PreviewArtifactRow> {
    if (original.mime_type !== docxMime) throw conversionUnavailable();
    const cached = await this.auditService.transaction(tenantId, (tx) =>
      this.findReadyArtifact(tx, tenantId, original.version_id),
    );
    if (cached) return cached;

    const sourceObject = await this.storageService.getByStorageUri(tenantId, original.storage_uri);
    const source = await streamToBuffer(sourceObject.body);
    let pdf: Buffer;
    try {
      pdf = await this.previewConvertJob.convertDocxToPdf({
        tenantId,
        filename: original.normalized_filename,
        body: source,
      });
    } catch (error) {
      if (error instanceof PreviewConversionUnavailableError) throw conversionUnavailable();
      this.logger.warn({ code: 'PREVIEW_CONVERT_ERROR', versionId: original.version_id });
      throw conversionUnavailable();
    }

    const fileObjectId = randomUUID();
    const filename = `${original.normalized_filename.replace(/\.docx$/i, '')}.preview.pdf`;
    const stored = await this.storageService.putTenantObject({
      tenantId,
      matterId: original.matter_id,
      documentId: original.document_id,
      fileObjectId,
      body: pdf,
      contentLength: pdf.length,
      contentType: 'application/pdf',
    });
    try {
      return await this.auditService.transaction(tenantId, async (tx) => {
        await this.fileObjectService.create(
          {
            fileObjectId,
            tenantId,
            storageUri: stored.storageUri,
            originalFilename: filename,
            normalizedFilename: filename,
            mimeType: 'application/pdf',
            sizeBytes: pdf.length,
            sha256: sha256(pdf),
            encryptionKeyId: stored.encryptionKeyId,
            sourceSystem: 'preview_derived',
            createdBy: actorUserId,
          },
          tx,
        );
        await tx.query(
          `
            INSERT INTO document_preview_artifacts (
              tenant_id, document_id, version_id, file_object_id, status, failure_reason_code
            )
            VALUES ($1, $2, $3, $4, 'ready', NULL)
            ON CONFLICT (tenant_id, version_id) DO NOTHING
          `,
          [tenantId, original.document_id, original.version_id, fileObjectId],
        );
        const artifact = await this.findReadyArtifact(tx, tenantId, original.version_id);
        if (!artifact) throw conversionUnavailable();
        return artifact;
      });
    } catch (error) {
      await this.storageService.deleteByStorageUri(tenantId, stored.storageUri).catch(() => undefined);
      throw error;
    }
  }

  private async assertCanPreview(
    tenantId: TenantId,
    actorUserId: string,
    documentId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canReadDocument(
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

  private async findCurrentPreviewTarget(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
  ): Promise<PreviewFileRow | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.status,
          dv.version_id, dv.file_object_id, f.storage_uri, f.normalized_filename,
          f.mime_type, f.size_bytes::text, f.sha256
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
          AND dv.document_id = d.document_id
          AND dv.version_status = 'current'
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as PreviewFileRow | undefined) ?? null;
  }

  private async findReadyArtifact(
    client: QueryClient,
    tenantId: TenantId,
    versionId: string,
  ): Promise<PreviewArtifactRow | null> {
    const result = await client.query(
      `
        SELECT f.file_object_id, f.storage_uri, f.normalized_filename,
          f.mime_type, f.size_bytes::text, f.sha256
        FROM document_preview_artifacts a
        JOIN file_objects f
          ON f.tenant_id = a.tenant_id
          AND f.file_object_id = a.file_object_id
        WHERE a.tenant_id = $1
          AND a.version_id = $2
          AND a.status = 'ready'
        LIMIT 1
      `,
      [tenantId, versionId],
    );
    return (result.rows[0] as PreviewArtifactRow | undefined) ?? null;
  }
}
