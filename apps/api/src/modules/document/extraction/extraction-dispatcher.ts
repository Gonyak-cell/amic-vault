import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MetricsRegistry } from '../../../common/metrics/metrics.middleware';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { DdService } from '../../dd/dd.service';
import { GraphSyncOutboxWorker } from '../../graph/graph-sync-outbox.worker';
import { promotedDocumentExistsSql } from '../../file-security/promoted-file.guard';
import { SearchIndexSyncHook } from '../../search/index/index-sync.hook';
import { StorageService } from '../../storage/storage.service';
import { StoragePathResolver } from '../../storage/storage-path.resolver';
import type {
  DocumentAnnotationExtractionInput,
  DocumentRevisionExtractionInput,
  ExtractionJobPayload,
  ExtractionResultInput,
  ExtractionTarget,
} from './extraction.types';
import { OcrQueueService } from './ocr-queue.service';
import {
  isExtractionMethod,
  isExtractionStatus,
  normalizeFailureReasonCode,
} from './extraction.types';
import { createIngestionWorkerRequest } from './ingestion-request.factory';

interface WorkerResponse {
  status?: unknown;
  extraction_method?: unknown;
  body_text?: unknown;
  confidence?: unknown;
  failure_reason_code?: unknown;
}

const b10ParserVersion = 'b10-worker-v1';
const revisionChangeTypes = new Set<DocumentRevisionExtractionInput['changeType']>([
  'insert',
  'delete',
  'move_from',
  'move_to',
  'format',
]);
const annotationTypes = new Set([
  'highlight',
  'text',
  'freetext',
  'underline',
  'squiggly',
  'strikeout',
  'line',
  'square',
  'circle',
  'polygon',
  'polyline',
  'ink',
  'stamp',
  'popup',
  'link',
  'unknown',
]);

function workerBaseUrl(): string {
  const configured = process.env.INGESTION_WORKER_URL ?? 'http://127.0.0.1:8000';
  if (process.env.INGESTION_WORKER_IDENTITY_PROFILE === 'private-gateway-mtls') {
    try {
      const gateway = new URL(configured);
      if (
        gateway.protocol !== 'https:' ||
        ['127.0.0.1', '::1', 'localhost'].includes(gateway.hostname)
      ) {
        throw new Error('invalid private gateway');
      }
    } catch {
      throw new Error('WORKER_IDENTITY_CONFIGURATION_INVALID');
    }
  }
  return configured.replace(/\/+$/, '');
}

function extractionWorkerTimeoutMs(): number {
  const parsed = Number(process.env.EXTRACTION_WORKER_TIMEOUT_MS ?? '60000');
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.round(parsed), 60_000) : 60_000;
}

function sanitizeBodyText(value: string): string {
  return value.replaceAll(String.fromCharCode(0), '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedText(value: unknown): string {
  return typeof value === 'string' ? sanitizeBodyText(value).slice(0, 16_000) : '';
}

function boundedLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = sanitizeBodyText(value).trim().slice(0, 160);
  if (!trimmed || /(password|secret|token)/i.test(trimmed)) return null;
  return trimmed;
}

function normalizedIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extensionFromName(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

function normalizeRevisionChangeType(
  value: unknown,
): DocumentRevisionExtractionInput['changeType'] | null {
  if (typeof value !== 'string') return null;
  return revisionChangeTypes.has(value as DocumentRevisionExtractionInput['changeType'])
    ? (value as DocumentRevisionExtractionInput['changeType'])
    : null;
}

function normalizeAnnotationType(value: unknown): string {
  const normalized = typeof value === 'string' ? value.toLowerCase().slice(0, 40) : 'unknown';
  return annotationTypes.has(normalized) ? normalized : 'unknown';
}

function normalizePageNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function normalizeRect(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length !== 4) return [];
  const rect = value.map((item) => Number(item));
  return rect.every(Number.isFinite) ? rect : [];
}

function parseRevisionResponse(payload: unknown): DocumentRevisionExtractionInput[] | undefined {
  if (!isRecord(payload) || payload.status !== 'ready' || !Array.isArray(payload.revisions)) {
    return undefined;
  }
  return payload.revisions.flatMap((revision) => {
    if (!isRecord(revision)) return [];
    const changeType = normalizeRevisionChangeType(revision.change_type);
    if (!changeType) return [];
    return [
      {
        changeType,
        author: boundedLabel(revision.author),
        changedAt: normalizedIsoDate(revision.date),
        beforeText: boundedText(revision.before_text),
        afterText: boundedText(revision.after_text),
      },
    ];
  });
}

function parseAnnotationResponse(payload: unknown): DocumentAnnotationExtractionInput[] | undefined {
  if (!isRecord(payload) || payload.status !== 'ready' || !Array.isArray(payload.annotations)) {
    return undefined;
  }
  return payload.annotations.flatMap((annotation) => {
    if (!isRecord(annotation)) return [];
    return [
      {
        annotationType: normalizeAnnotationType(annotation.annotation_type),
        page: normalizePageNumber(annotation.page),
        author: boundedLabel(annotation.author),
        contents: boundedText(annotation.contents),
        rect: normalizeRect(annotation.rect),
      },
    ];
  });
}

function parseWorkerResponse(payload: WorkerResponse, fallback: ExtractionJobPayload) {
  const status = payload.status;
  const method = payload.extraction_method;
  const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0;
  if (
    typeof status !== 'string' ||
    typeof method !== 'string' ||
    !isExtractionStatus(status) ||
    !isExtractionMethod(method) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return {
      tenantId: fallback.tenantId,
      documentId: fallback.documentId,
      versionId: fallback.versionId,
      fileObjectId: fallback.fileObjectId,
      status: 'failed' as const,
      method: 'failed' as const,
      bodyText: '',
      confidence: 0,
      failureReasonCode: 'WORKER_INVALID_RESPONSE',
    };
  }

  const bodyText =
    status === 'ready' && typeof payload.body_text === 'string'
      ? sanitizeBodyText(payload.body_text)
      : '';
  return {
    tenantId: fallback.tenantId,
    documentId: fallback.documentId,
    versionId: fallback.versionId,
    fileObjectId: fallback.fileObjectId,
    status,
    method,
    bodyText,
    confidence,
    failureReasonCode:
      status === 'failed'
        ? normalizeFailureReasonCode(payload.failure_reason_code, 'WORKER_FAILED')
        : null,
  };
}

@Injectable()
export class ExtractionDispatcher {
  private readonly logger = new Logger(ExtractionDispatcher.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
    @Optional()
    @Inject(SearchIndexSyncHook)
    private readonly searchIndexSync?: SearchIndexSyncHook,
    @Optional()
    @Inject(OcrQueueService)
    private readonly ocrQueue?: OcrQueueService,
    @Optional()
    @Inject(GraphSyncOutboxWorker)
    private readonly graphSyncOutbox?: GraphSyncOutboxWorker,
    @Optional()
    @Inject(DdService)
    private readonly ddService?: DdService,
    @Optional()
    @Inject(StoragePathResolver)
    private readonly storagePathResolver: StoragePathResolver = new StoragePathResolver(),
  ) {}

  async handle(payload: ExtractionJobPayload): Promise<void> {
    await this.handleWithWorker(payload, 'extract');
  }

  async handleOcr(payload: ExtractionJobPayload): Promise<void> {
    await this.handleWithWorker(payload, 'ocr');
  }

  async extractRevisionsForTarget(
    target: ExtractionTarget,
  ): Promise<readonly DocumentRevisionExtractionInput[] | undefined> {
    const extension = extensionFromName(target.normalizedFilename);
    if (
      extension !== 'docx' &&
      target.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return undefined;
    }
    return parseRevisionResponse(await this.callSupplementalWorker(target, 'extract-revisions'));
  }

  private async handleWithWorker(
    payload: ExtractionJobPayload,
    workerPath: 'extract' | 'ocr',
  ): Promise<void> {
    const target = await this.findTarget(payload);
    if (!target) {
      this.logger.warn({ code: 'EXTRACTION_TARGET_MISSING', versionId: payload.versionId });
      await this.storeDeadLetter(payload, 'EXTRACTION_TARGET_MISSING');
      return;
    }

    const result = await this.callWorker(target, payload, workerPath);
    await this.storeResult(result);
  }

  async markDeadLetter(payload: ExtractionJobPayload): Promise<void> {
    await this.storeDeadLetter(payload, 'RETRY_EXHAUSTED');
  }

  async markOcrDeadLetter(payload: ExtractionJobPayload): Promise<void> {
    await this.storeResult({
      ...payload,
      status: 'failed',
      method: 'ocr',
      bodyText: '',
      confidence: 0,
      failureReasonCode: 'OCR_RETRY_EXHAUSTED',
    });
  }

  private async callWorker(
    target: ExtractionTarget,
    payload: ExtractionJobPayload,
    workerPath: 'extract' | 'ocr',
  ): Promise<ExtractionResultInput> {
    const workerLabel = workerPath === 'extract' ? 'extraction' : 'ocr';
    const response = await this.postWorkerRequest(target, workerPath, workerLabel);

    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      this.metrics.recordExtractionResult('failed');
      throw new Error(`transient ${workerLabel} worker failure: ${response.status}`);
    }

    if (!response.ok) {
      return {
        ...payload,
        status: 'failed',
        method: 'failed',
        bodyText: '',
        confidence: 0,
        failureReasonCode: 'WORKER_REJECTED',
      };
    }

    const responseJson = await this.readWorkerJson(response);
    const result = parseWorkerResponse(
      isRecord(responseJson) ? (responseJson as WorkerResponse) : {},
      payload,
    );
    if (workerPath === 'extract') {
      return this.attachSupplementalExtraction(target, result);
    }
    return result;
  }

  private async attachSupplementalExtraction(
    target: ExtractionTarget,
    result: ExtractionResultInput,
  ): Promise<ExtractionResultInput> {
    if (result.status !== 'ready') return result;
    const extension = extensionFromName(target.normalizedFilename);
    if (
      result.method === 'docx' ||
      extension === 'docx' ||
      target.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const revisions = parseRevisionResponse(
        await this.callSupplementalWorker(target, 'extract-revisions'),
      );
      return revisions === undefined ? result : { ...result, revisions };
    }
    if (result.method === 'pdf_text' || extension === 'pdf' || target.mimeType === 'application/pdf') {
      const annotations = parseAnnotationResponse(
        await this.callSupplementalWorker(target, 'extract-annotations'),
      );
      return annotations === undefined ? result : { ...result, annotations };
    }
    return result;
  }

  private async callSupplementalWorker(
    target: ExtractionTarget,
    workerPath: 'extract-revisions' | 'extract-annotations',
  ): Promise<unknown | null> {
    const response = await this.postWorkerRequest(target, workerPath, 'extraction');
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      this.metrics.recordExtractionResult('failed');
      throw new Error(`transient extraction worker failure: ${response.status}`);
    }
    if (!response.ok) return null;
    return this.readWorkerJson(response);
  }

  private async postWorkerRequest(
    target: ExtractionTarget,
    workerPath: 'extract' | 'ocr' | 'extract-revisions' | 'extract-annotations',
    workerLabel: string,
  ): Promise<Response> {
    const request = await createIngestionWorkerRequest({
      target,
      parserProfile: workerPath === 'ocr' ? 'ocr' : 'extract',
      storageService: this.storageService,
      storagePathResolver: this.storagePathResolver,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), extractionWorkerTimeoutMs());
    try {
      return await fetch(`${workerBaseUrl()}/${workerPath}`, {
        method: 'POST',
        headers: request.headers,
        signal: controller.signal,
        body: JSON.stringify(request.job),
      });
    } catch (error) {
      if (controller.signal.aborted) {
        this.metrics.recordExtractionResult('failed');
        throw new Error(`transient ${workerLabel} worker failure: timeout`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readWorkerJson(response: Response): Promise<unknown | null> {
    if (response.bodyUsed || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 256 * 1024) return null;
        chunks.push(next.value);
      }
      const payload = new TextDecoder().decode(Buffer.concat(chunks));
      return JSON.parse(payload) as unknown;
    } catch {
      return null;
    } finally {
      reader.releaseLock();
    }
  }

  private async findTarget(payload: ExtractionJobPayload): Promise<ExtractionTarget | null> {
    return this.auditService.transaction(payload.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT dv.tenant_id, dv.document_id, d.matter_id, dv.version_id,
            dv.file_object_id, f.storage_uri, f.normalized_filename, f.mime_type,
            f.sha256, f.size_bytes::text
          FROM document_versions dv
          JOIN documents d
            ON d.tenant_id = dv.tenant_id
            AND d.document_id = dv.document_id
          JOIN file_objects f
            ON f.tenant_id = dv.tenant_id
            AND f.file_object_id = dv.file_object_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_id = $3
          AND dv.file_object_id = $4
          AND ${promotedDocumentExistsSql('d', 'dv')}
        LIMIT 1
        `,
        [payload.tenantId, payload.documentId, payload.versionId, payload.fileObjectId],
      );
      const row = result.rows[0] as
        | {
            tenant_id: string;
            document_id: string;
            matter_id: string;
            version_id: string;
            file_object_id: string;
            storage_uri: string;
            normalized_filename: string;
            mime_type: string;
            sha256: string;
            size_bytes: string;
          }
        | undefined;
      return row
        ? {
            tenantId: row.tenant_id,
            documentId: row.document_id,
            matterId: row.matter_id,
            versionId: row.version_id,
            fileObjectId: row.file_object_id,
            storageUri: row.storage_uri,
            normalizedFilename: row.normalized_filename,
            mimeType: row.mime_type,
            sha256: row.sha256,
            sizeBytes: Number(row.size_bytes),
          }
        : null;
    });
  }

  private async storeDeadLetter(payload: ExtractionJobPayload, reasonCode: string): Promise<void> {
    await this.storeResult({
      ...payload,
      status: 'failed',
      method: 'failed',
      bodyText: '',
      confidence: 0,
      failureReasonCode: reasonCode,
    });
  }

  private async storeResult(input: ExtractionResultInput): Promise<void> {
    await this.auditService.transaction(input.tenantId, async (tx) => {
      const target = await this.findTargetInTransaction(input, tx);
      if (!target) {
        this.logger.warn({ code: 'EXTRACTION_RESULT_TARGET_MISSING', versionId: input.versionId });
        return;
      }
      await tx.query(
        `
          INSERT INTO canonical_documents (
            tenant_id, version_id, body_text, extraction_status, extraction_method,
            confidence, failure_reason_code, extracted_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
          ON CONFLICT (tenant_id, version_id)
          DO UPDATE SET
            body_text = EXCLUDED.body_text,
            extraction_status = EXCLUDED.extraction_status,
            extraction_method = EXCLUDED.extraction_method,
            confidence = EXCLUDED.confidence,
            failure_reason_code = EXCLUDED.failure_reason_code,
            extracted_at = EXCLUDED.extracted_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          input.tenantId,
          input.versionId,
          input.bodyText,
          input.status,
          input.method,
          input.confidence,
          input.failureReasonCode,
        ],
      );
      await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorType: 'system',
          actorId: null,
          action: 'DOCUMENT_TEXT_EXTRACTED',
          targetType: 'document',
          targetId: input.documentId,
          matterId: target.matterId,
          metadata: {
            document_id: input.documentId,
            matter_id: target.matterId,
            version_id: input.versionId,
            extraction_status: input.status,
            extraction_method: input.method,
            confidence: input.confidence,
            ...(input.failureReasonCode ? { reason_code: input.failureReasonCode } : {}),
          },
        },
        tx,
      );
      await this.storeDocumentRevisions(input, target, tx);
      await this.storeDocumentAnnotations(input, target, tx);
      if (input.status === 'ready') {
        await this.ddService?.suggestMappingsFromExtraction(tx, {
          tenantId: input.tenantId,
          matterId: target.matterId,
          documentId: input.documentId,
          versionId: input.versionId,
          bodyText: input.bodyText,
        });
        await this.searchIndexSync?.enqueueVersion(
          {
            tenantId: input.tenantId,
            documentId: input.documentId,
            versionId: input.versionId,
          },
          tx,
        );
        await this.graphSyncOutbox?.enqueue(
          {
            tenantId: input.tenantId,
            matterId: target.matterId,
            reasonCode: 'document_text_extracted',
            requestedBy: null,
          },
          tx,
        );
      }
      if (input.status === 'ocr_pending') {
        await this.ocrQueue?.enqueueOcrRequired(
          {
            tenantId: input.tenantId,
            documentId: input.documentId,
            versionId: input.versionId,
            fileObjectId: input.fileObjectId,
          },
          tx,
        );
      }
      this.metrics.recordExtractionResult(input.status);
    });
  }

  private async findTargetInTransaction(
    input: ExtractionJobPayload,
    queryClient: QueryClient,
  ): Promise<{ matterId: string } | null> {
    const result = await queryClient.query(
      `
        SELECT d.matter_id
        FROM document_versions dv
        JOIN documents d
          ON d.tenant_id = dv.tenant_id
          AND d.document_id = dv.document_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_id = $3
          AND dv.file_object_id = $4
          AND ${promotedDocumentExistsSql('d', 'dv')}
        LIMIT 1
      `,
      [input.tenantId, input.documentId, input.versionId, input.fileObjectId],
    );
    const row = result.rows[0] as { matter_id: string } | undefined;
    return row ? { matterId: row.matter_id } : null;
  }

  private async storeDocumentRevisions(
    input: ExtractionResultInput,
    target: { matterId: string },
    tx: QueryClient,
  ): Promise<void> {
    if (input.revisions === undefined) return;
    await tx.query(
      `
        UPDATE document_revisions
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
          AND subversion_id IS NULL
          AND stale = false
      `,
      [input.tenantId, input.versionId],
    );
    for (const [sequenceNo, revision] of input.revisions.entries()) {
      await tx.query(
        `
          INSERT INTO document_revisions (
            tenant_id, matter_id, document_id, version_id, subversion_id,
            sequence_no, change_type, author_label, changed_at,
            before_text, after_text, before_text_hash, after_text_hash,
            parser_version, stale
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false)
        `,
        [
          input.tenantId,
          target.matterId,
          input.documentId,
          input.versionId,
          null,
          sequenceNo,
          revision.changeType,
          revision.author,
          revision.changedAt,
          revision.beforeText,
          revision.afterText,
          sha256Hex(revision.beforeText),
          sha256Hex(revision.afterText),
          b10ParserVersion,
        ],
      );
    }
    await this.auditService.log(
      {
        tenantId: input.tenantId,
        actorType: 'system',
        actorId: null,
        action: 'DOCUMENT_REVISIONS_EXTRACTED',
        targetType: 'document',
        targetId: input.documentId,
        matterId: target.matterId,
        metadata: {
          document_id: input.documentId,
          matter_id: target.matterId,
          version_id: input.versionId,
          item_count: input.revisions.length,
          parser_status: 'success',
          hash: sha256Hex(
            input.revisions
              .map((revision) =>
                [
                  revision.changeType,
                  revision.author ?? '',
                  revision.changedAt ?? '',
                  sha256Hex(revision.beforeText),
                  sha256Hex(revision.afterText),
                ].join(':'),
              )
              .join('|'),
          ),
        },
      },
      tx,
    );
  }

  private async storeDocumentAnnotations(
    input: ExtractionResultInput,
    target: { matterId: string },
    tx: QueryClient,
  ): Promise<void> {
    if (input.annotations === undefined) return;
    await tx.query(
      `
        UPDATE document_annotations
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
          AND subversion_id IS NULL
          AND stale = false
      `,
      [input.tenantId, input.versionId],
    );
    for (const [sequenceNo, annotation] of input.annotations.entries()) {
      await tx.query(
        `
          INSERT INTO document_annotations (
            tenant_id, matter_id, document_id, version_id, subversion_id,
            sequence_no, annotation_type, page_number, author_label,
            contents, contents_hash, rect, parser_version, stale
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::numeric[], $13, false)
        `,
        [
          input.tenantId,
          target.matterId,
          input.documentId,
          input.versionId,
          null,
          sequenceNo,
          annotation.annotationType,
          annotation.page,
          annotation.author,
          annotation.contents,
          sha256Hex(annotation.contents),
          annotation.rect,
          b10ParserVersion,
        ],
      );
    }
    await this.auditService.log(
      {
        tenantId: input.tenantId,
        actorType: 'system',
        actorId: null,
        action: 'DOCUMENT_ANNOTATIONS_EXTRACTED',
        targetType: 'document',
        targetId: input.documentId,
        matterId: target.matterId,
        metadata: {
          document_id: input.documentId,
          matter_id: target.matterId,
          version_id: input.versionId,
          item_count: input.annotations.length,
          parser_status: 'success',
          hash: sha256Hex(
            input.annotations
              .map((annotation) =>
                [
                  annotation.annotationType,
                  annotation.page,
                  annotation.author ?? '',
                  sha256Hex(annotation.contents),
                  annotation.rect.join(','),
                ].join(':'),
              )
              .join('|'),
          ),
        },
      },
      tx,
    );
  }
}
