import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MetricsRegistry } from '../../../common/metrics/metrics.middleware';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { SearchIndexSyncHook } from '../../search/index/index-sync.hook';
import { StorageService } from '../../storage/storage.service';
import type {
  ExtractionJobPayload,
  ExtractionResultInput,
  ExtractionTarget,
} from './extraction.types';
import {
  isExtractionMethod,
  isExtractionStatus,
  normalizeFailureReasonCode,
} from './extraction.types';

interface WorkerResponse {
  status?: unknown;
  extraction_method?: unknown;
  body_text?: unknown;
  confidence?: unknown;
  failure_reason_code?: unknown;
}

function workerBaseUrl(): string {
  return (process.env.INGESTION_WORKER_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function parseWorkerResponse(payload: WorkerResponse, fallback: ExtractionJobPayload) {
  const status = typeof payload.status === 'string' ? payload.status : 'failed';
  const method =
    typeof payload.extraction_method === 'string' ? payload.extraction_method : 'failed';
  const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0;
  if (
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
    status === 'ready' && typeof payload.body_text === 'string' ? payload.body_text : '';
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
  ) {}

  async handle(payload: ExtractionJobPayload): Promise<void> {
    const target = await this.findTarget(payload);
    if (!target) {
      this.logger.warn({ code: 'EXTRACTION_TARGET_MISSING', versionId: payload.versionId });
      await this.storeDeadLetter(payload, 'EXTRACTION_TARGET_MISSING');
      return;
    }

    const stored = await this.storageService.getByStorageUri(target.tenantId, target.storageUri);
    const fileBuffer = await streamToBuffer(stored.body);
    const result = await this.callWorker(target, fileBuffer, payload);
    await this.storeResult(result);
  }

  async markDeadLetter(payload: ExtractionJobPayload): Promise<void> {
    await this.storeDeadLetter(payload, 'RETRY_EXHAUSTED');
  }

  private async callWorker(
    target: ExtractionTarget,
    fileBuffer: Buffer,
    payload: ExtractionJobPayload,
  ): Promise<ExtractionResultInput> {
    const form = new FormData();
    form.append('tenant_id', target.tenantId);
    form.append('version_id', target.versionId);
    form.append(
      'file',
      new Blob([new Uint8Array(fileBuffer)], { type: target.mimeType }),
      target.normalizedFilename,
    );

    const response = await fetch(`${workerBaseUrl()}/extract`, {
      method: 'POST',
      headers: { 'x-amic-tenant-id': target.tenantId },
      body: form,
    });

    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      this.metrics.recordExtractionResult('failed');
      throw new Error(`transient extraction worker failure: ${response.status}`);
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

    return parseWorkerResponse((await response.json()) as WorkerResponse, payload);
  }

  private async findTarget(payload: ExtractionJobPayload): Promise<ExtractionTarget | null> {
    return this.auditService.transaction(payload.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT dv.tenant_id, dv.document_id, d.matter_id, dv.version_id,
            dv.file_object_id, f.storage_uri, f.normalized_filename, f.mime_type
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
      if (input.status === 'ready') {
        await this.searchIndexSync?.enqueueVersion(
          {
            tenantId: input.tenantId,
            documentId: input.documentId,
            versionId: input.versionId,
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
        LIMIT 1
      `,
      [input.tenantId, input.documentId, input.versionId, input.fileObjectId],
    );
    const row = result.rows[0] as { matter_id: string } | undefined;
    return row ? { matterId: row.matter_id } : null;
  }
}
