import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { FileObjectService } from '../storage/file-object.service';
import { promotedDocumentExistsSql } from '../file-security/promoted-file.guard';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { PreviewConversionUnavailableError, PreviewConvertJob } from './preview-convert.job';
import { PreviewSessionService, type PreviewSessionTarget } from './preview-session.service';

type PreviewFileRow = PreviewSessionTarget;

interface PreviewArtifactRow {
  file_object_id: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
}

export interface PreviewPrecreateInput {
  tenantId: TenantId;
  documentId: string;
  versionId: string;
  fileObjectId: string;
  actorUserId: string;
}

export type PreviewPrecreateResult = 'ready' | 'skipped';

export interface PreviewResult {
  body: Readable;
  contentType: string;
  contentLength: number;
  statusCode: 200 | 206;
  contentRange?: string;
  sha256: string;
}

const officePreviewMimeTypes = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isOfficePreviewMimeType(mimeType: string): boolean {
  return officePreviewMimeTypes.has(mimeType);
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
  if (!rangeHeader || !Number.isSafeInteger(size) || size <= 0) return null;
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
    @Inject(PreviewConvertJob) private readonly previewConvertJob: PreviewConvertJob,
    @Inject(PreviewSessionService) private readonly previewSessionService: PreviewSessionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async openPreview(
    actorUserId: string,
    documentId: string,
    previewSessionId: string,
    previewToken: string,
    rangeHeader?: string,
  ): Promise<PreviewResult> {
    const context = this.tenantContext.require();
    const original = await this.previewSessionService.authorizeStream(
      actorUserId,
      documentId,
      previewSessionId,
      previewToken,
    );

    const previewFile =
      original.mime_type === 'application/pdf'
        ? original
        : await this.ensureDerivedPreview(context.tenantId, actorUserId, original);

    const fullSize = Number(previewFile.size_bytes);
    const range = parseRange(rangeHeader, fullSize);
    if (!range) {
      const object = await this.storageService.getByStorageUri(
        context.tenantId,
        previewFile.storage_uri,
      );
      return {
        body: object.body,
        contentType: 'application/pdf',
        contentLength:
          Number.isSafeInteger(fullSize) && fullSize > 0 ? fullSize : object.contentLength,
        statusCode: 200,
        sha256: previewFile.sha256,
      };
    }
    const object = await this.storageService.getRangeByStorageUri(
      context.tenantId,
      previewFile.storage_uri,
      range.start,
      range.end,
    );
    return {
      body: object.body,
      contentType: 'application/pdf',
      contentLength: range.end - range.start + 1,
      statusCode: 206,
      contentRange: `bytes ${range.start}-${range.end}/${fullSize}`,
      sha256: previewFile.sha256,
    };
  }

  async precreatePreview(input: PreviewPrecreateInput): Promise<PreviewPrecreateResult> {
    const original = await this.auditService.transaction(input.tenantId, (tx) =>
      this.findVersionPreviewTarget(
        tx,
        input.tenantId,
        input.documentId,
        input.versionId,
        input.fileObjectId,
      ),
    );
    if (!original || original.status === 'deleted') return 'skipped';
    if (!isOfficePreviewMimeType(original.mime_type)) return 'skipped';
    await this.ensureDerivedPreview(input.tenantId, input.actorUserId, original);
    return 'ready';
  }

  async markPrecreateFailed(
    input: PreviewPrecreateInput,
    failureReasonCode = 'PREVIEW_CONVERSION_UNAVAILABLE',
  ): Promise<void> {
    await this.auditService.transaction(input.tenantId, async (tx) => {
      await tx.query(
        `
          INSERT INTO document_preview_artifacts (
            tenant_id, document_id, version_id, file_object_id, status, failure_reason_code
          )
          SELECT dv.tenant_id, dv.document_id, dv.version_id, dv.file_object_id,
            'failed', $5
          FROM document_versions dv
          JOIN documents d
            ON d.tenant_id = dv.tenant_id
            AND d.document_id = dv.document_id
          WHERE dv.tenant_id = $1
            AND dv.document_id = $2
            AND dv.version_id = $3
            AND dv.file_object_id = $4
          ON CONFLICT (tenant_id, version_id)
          DO UPDATE SET
            status = 'failed',
            failure_reason_code = EXCLUDED.failure_reason_code,
            updated_at = now()
          WHERE document_preview_artifacts.status <> 'ready'
        `,
        [input.tenantId, input.documentId, input.versionId, input.fileObjectId, failureReasonCode],
      );
    });
  }

  private async ensureDerivedPreview(
    tenantId: TenantId,
    actorUserId: string,
    original: PreviewFileRow,
  ): Promise<PreviewArtifactRow> {
    if (!isOfficePreviewMimeType(original.mime_type)) throw conversionUnavailable();
    const cached = await this.auditService.transaction(tenantId, (tx) =>
      this.findReadyArtifact(tx, tenantId, original.version_id),
    );
    if (cached) return cached;

    const sourceObject = await this.storageService.getByStorageUri(tenantId, original.storage_uri);
    const source = await streamToBuffer(sourceObject.body);
    let pdf: Buffer;
    try {
      pdf = await this.previewConvertJob.convertOfficeToPdf({
        tenantId,
        filename: original.normalized_filename,
        contentType: original.mime_type,
        body: source,
      });
    } catch (error) {
      if (error instanceof PreviewConversionUnavailableError) throw conversionUnavailable();
      this.logger.warn({ code: 'PREVIEW_CONVERT_ERROR', versionId: original.version_id });
      throw conversionUnavailable();
    }

    const fileObjectId = randomUUID();
    const previewBaseName = original.normalized_filename.replace(
      /\.(doc|docx|xls|xlsx|ppt|pptx)$/i,
      '',
    );
    const filename = `${previewBaseName}.preview.pdf`;
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
            ON CONFLICT (tenant_id, version_id)
            DO UPDATE SET
              file_object_id = EXCLUDED.file_object_id,
              status = 'ready',
              failure_reason_code = NULL,
              updated_at = now()
            WHERE document_preview_artifacts.status <> 'ready'
          `,
          [tenantId, original.document_id, original.version_id, fileObjectId],
        );
        const artifact = await this.findReadyArtifact(tx, tenantId, original.version_id);
        if (!artifact) throw conversionUnavailable();
        return artifact;
      });
    } catch (error) {
      await this.storageService
        .deleteByStorageUri(tenantId, stored.storageUri)
        .catch(() => undefined);
      throw error;
    }
  }

  private async findVersionPreviewTarget(
    client: QueryClient,
    tenantId: TenantId,
    documentId: string,
    versionId: string,
    fileObjectId: string,
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
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND dv.version_id = $3
          AND dv.file_object_id = $4
          AND ${promotedDocumentExistsSql('d')}
        LIMIT 1
      `,
      [tenantId, documentId, versionId, fileObjectId],
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
