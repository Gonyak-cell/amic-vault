import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { FileObjectService } from '../storage/file-object.service';
import { promotedDocumentExistsSql } from '../file-security/promoted-file.guard';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import {
  PREVIEW_MAX_INPUT_BYTES,
  PreviewConversionUnavailableError,
  PreviewConvertJob,
  previewConvertQueueName,
  readPreviewBytes,
} from './preview-convert.job';
import { PreviewSessionService, type PreviewSessionTarget } from './preview-session.service';

type PreviewFileRow = PreviewSessionTarget;

export interface PreviewArtifactRow {
  file_object_id: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  size_bytes: string;
  sha256: string;
}

export const PREVIEW_CHUNK_BYTES = 3 * 1024 * 1024;

export type PreparedPreview =
  | { status: 'ready'; file: PreviewArtifactRow }
  | { status: 'pending' | 'failed'; file: null; converterProfileSha256: string };

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

  async getPreparedPreview(tenantId: TenantId, original: PreviewSessionTarget): Promise<PreparedPreview> {
    if (original.tenant_id !== tenantId) throw conversionUnavailable();
    if (original.mime_type === 'application/pdf') return { status: 'ready', file: original };
    if (!isOfficePreviewMimeType(original.mime_type)) throw conversionUnavailable();
    const profile = await this.converterProfile(tenantId);
    return this.auditService.transaction<PreparedPreview>(tenantId, async (tx) => {
      const file = await this.findReadyArtifact(tx, tenantId, original.version_id, original.sha256, profile);
      if (file) return { status: 'ready', file };
      const state = await tx.query<{ status: string }>(
        `SELECT status FROM document_preview_artifacts
         WHERE tenant_id = $1 AND version_id = $2
           AND ((source_sha256 = $3 AND converter_profile_sha256 = $4)
             OR (source_sha256 IS NULL AND converter_profile_sha256 IS NULL)) LIMIT 1`,
        [tenantId, original.version_id, original.sha256, profile],
      );
      return { status: state.rows[0]?.status === 'failed' ? 'failed' : 'pending', file: null,
        converterProfileSha256: profile };
    });
  }

  async readPreparedChunk(
    tenantId: TenantId,
    file: PreviewArtifactRow,
    offset: number,
  ): Promise<Buffer> {
    const size = Number(file.size_bytes);
    if (file.mime_type !== 'application/pdf' || !/^[a-f0-9]{64}$/u.test(file.sha256)
        || !Number.isSafeInteger(size) || size < 1
        || !Number.isSafeInteger(offset) || offset < 0 || offset >= size
        || offset % PREVIEW_CHUNK_BYTES !== 0) throw conversionUnavailable();
    const length = Math.min(PREVIEW_CHUNK_BYTES, size - offset);
    const object = await this.storageService.getRangeByStorageUri(
      tenantId, file.storage_uri, offset, offset + length - 1,
    );
    return readPreviewBytes(object.body, PREVIEW_CHUNK_BYTES, length);
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
    const profile = await this.converterProfile(tenantId);
    const cached = await this.auditService.transaction(tenantId, (tx) =>
      this.findReadyArtifact(tx, tenantId, original.version_id, original.sha256, profile),
    );
    if (cached) return cached;

    let pdf: Buffer;
    try {
      const expectedSize = Number(original.size_bytes);
      if (!Number.isSafeInteger(expectedSize) || expectedSize < 1
          || expectedSize > PREVIEW_MAX_INPUT_BYTES || !/^[a-f0-9]{64}$/u.test(original.sha256)) {
        throw conversionUnavailable();
      }
      const sourceObject = await this.storageService.getByStorageUri(tenantId, original.storage_uri);
      const source = await readPreviewBytes(sourceObject.body, PREVIEW_MAX_INPUT_BYTES, expectedSize);
      if (sha256(source) !== original.sha256) throw conversionUnavailable();
      pdf = await this.previewConvertJob.convertOfficeToPdf({
        tenantId,
        filename: original.normalized_filename,
        contentType: original.mime_type,
        body: source,
        converterProfileSha256: profile,
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
      const artifact = await this.auditService.transaction(tenantId, async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`${previewConvertQueueName}:${tenantId}:${original.version_id}`]);
        const winner = await this.findReadyArtifact(tx, tenantId, original.version_id, original.sha256, profile);
        if (winner) return winner;
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
              tenant_id, document_id, version_id, file_object_id, status, failure_reason_code,
              source_sha256, converter_profile_sha256
            )
            VALUES ($1, $2, $3, $4, 'ready', NULL, $5, $6)
            ON CONFLICT (tenant_id, version_id)
            DO UPDATE SET
              file_object_id = EXCLUDED.file_object_id,
              source_sha256 = EXCLUDED.source_sha256,
              converter_profile_sha256 = EXCLUDED.converter_profile_sha256,
              status = 'ready',
              failure_reason_code = NULL,
              updated_at = now()
          `,
          [tenantId, original.document_id, original.version_id, fileObjectId, original.sha256, profile],
        );
        const artifact = await this.findReadyArtifact(tx, tenantId, original.version_id, original.sha256, profile);
        if (!artifact) throw conversionUnavailable();
        return artifact;
      });
      if (artifact.file_object_id !== fileObjectId) {
        await this.storageService.deleteByStorageUri(tenantId, stored.storageUri).catch(() => undefined);
      }
      return artifact;
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
          AND ${promotedDocumentExistsSql('d', 'dv')}
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
    sourceSha256: string,
    converterProfileSha256: string,
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
          AND a.source_sha256 = $3
          AND a.converter_profile_sha256 = $4
        LIMIT 1
      `,
      [tenantId, versionId, sourceSha256, converterProfileSha256],
    );
    return (result.rows[0] as PreviewArtifactRow | undefined) ?? null;
  }

  private async converterProfile(tenantId: TenantId): Promise<string> {
    try {
      return await this.previewConvertJob.getProfileSha256(tenantId);
    } catch {
      throw conversionUnavailable();
    }
  }
}
