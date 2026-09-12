import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { TenantId } from '@amic-vault/shared';
import { PREVIEW_MAX_INPUT_BYTES, PreviewConversionUnavailableError, previewConvertQueueName } from './preview-convert.job';
import {
  isPreviewConvertQueueWorkerEnabled,
  previewConvertDeadLetterQueueName,
  previewConvertQueueSendOptions,
  PreviewPrecreateQueueService,
  type PreviewPrecreateJobPayload,
} from './preview-precreate-queue.service';
import { PREVIEW_CHUNK_BYTES, PreviewService } from './preview.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const documentId = '11111111-1111-4111-8111-111111111133';
const versionId = '11111111-1111-4111-8111-111111111155';
const fileObjectId = '11111111-1111-4111-8111-111111111144';
const actorUserId = '11111111-1111-4111-8111-111111111101';

const payload: PreviewPrecreateJobPayload = {
  tenantId,
  documentId,
  versionId,
  fileObjectId,
  actorUserId,
};

describe('PreviewPrecreateQueueService', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('uses bounded retries, exponential backoff, and a dead letter queue', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ id: 'preview-queued' }] })),
    };
    const options = previewConvertQueueSendOptions(payload, client as never);

    expect(options).toMatchObject({
      singletonKey: versionId,
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: previewConvertDeadLetterQueueName,
    });
    await expect(options.db?.executeSql('SELECT 1', [])).resolves.toEqual({
      rows: [{ id: 'preview-queued' }],
    });
  });

  it('uses PROCESS_ROLE as the default worker activation contract', () => {
    delete process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(false);

    delete process.env.PROCESS_ROLE;
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(false);
  });

  it('keeps the preview worker flag as an explicit override', () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED = 'true';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'worker';
    process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED = 'false';
    expect(isPreviewConvertQueueWorkerEnabled()).toBe(false);
  });

  it('never registers an API process as a queue consumer', async () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED = 'true';
    const queueRegistry = {
      register: vi.fn(),
      consumer: vi.fn(),
    };
    const service = new PreviewPrecreateQueueService(
      { precreatePreview: vi.fn(), markPrecreateFailed: vi.fn() } as never,
      queueRegistry as never,
    );

    await service.onModuleInit();

    expect(queueRegistry.register).toHaveBeenCalledTimes(2);
    expect(queueRegistry.consumer).not.toHaveBeenCalled();
  });

  it('enqueues only Office preview conversion jobs after upload commit', async () => {
    const client = {
      query: vi.fn(async () => ({
        rowCount: 1,
        rows: [
          {
            mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          },
        ],
      })),
    };
    const boss = {
      send: vi.fn(async () => 'preview-job-id'),
      stop: vi.fn(async () => undefined),
    };
    const queueRegistry = {
      register: vi.fn(),
      producer: vi.fn(async () => boss),
    };
    const service = new PreviewPrecreateQueueService(
      { precreatePreview: vi.fn(), markPrecreateFailed: vi.fn() } as never,
      queueRegistry as never,
    );

    await expect(service.enqueueVersionCreated(payload, client as never)).resolves.toBe(
      'preview-job-id',
    );
    expect(boss.send).toHaveBeenCalledWith(
      previewConvertQueueName,
      payload,
      expect.objectContaining({
        singletonKey: versionId,
        retryLimit: 3,
        deadLetter: previewConvertDeadLetterQueueName,
      }),
    );

    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ mime_type: 'application/pdf' }],
    });
    await expect(service.enqueueVersionCreated(payload, client as never)).resolves.toBeNull();
    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(queueRegistry.register).toHaveBeenCalledTimes(2);
    expect(queueRegistry.producer).toHaveBeenCalledWith(previewConvertQueueName);
  });

  it('routes worker jobs to precreate and dead letters to failed status marking', async () => {
    process.env.PROCESS_ROLE = 'worker';
    process.env.PREVIEW_CONVERT_QUEUE_WORKER_ENABLED = 'true';
    const handlers = new Map<
      string,
      (jobs: Array<{ data: PreviewPrecreateJobPayload }>) => Promise<void>
    >();
    const boss = {
      work: vi.fn(
        async (
          queueName: string,
          _options: unknown,
          handler: (jobs: Array<{ data: PreviewPrecreateJobPayload }>) => Promise<void>,
        ) => {
          handlers.set(queueName, handler);
        },
      ),
      stop: vi.fn(async () => undefined),
    };
    const queueRegistry = {
      register: vi.fn(),
      consumer: vi.fn(async () => boss),
    };
    const previewService = {
      precreatePreview: vi.fn(async () => 'ready' as const),
      markPrecreateFailed: vi.fn(async () => undefined),
    };
    const service = new PreviewPrecreateQueueService(
      previewService as never,
      queueRegistry as never,
    );

    await service.onModuleInit();

    expect(queueRegistry.register).toHaveBeenCalledTimes(2);
    expect(queueRegistry.consumer).toHaveBeenCalledWith(previewConvertQueueName);
    expect(boss.work).toHaveBeenCalledTimes(2);
    await handlers.get(previewConvertQueueName)?.([{ data: payload }]);
    await handlers.get(previewConvertDeadLetterQueueName)?.([{ data: payload }]);

    expect(previewService.precreatePreview).toHaveBeenCalledWith(payload);
    expect(previewService.markPrecreateFailed).toHaveBeenCalledWith(payload);
  });

  it('records failed preview precreation without overwriting ready artifacts', async () => {
    const query = vi.fn(async (_sql: string, _params?: readonly unknown[]) => {
      void _sql;
      void _params;
      return {
        rowCount: 1,
        rows: [],
      };
    });
    const tx = {
      query,
    };
    const transaction = vi.fn(
      async (_tenantId: TenantId, callback: (client: typeof tx) => Promise<void>) =>
        callback(tx),
    );
    const service = new PreviewService(
      { transaction } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.markPrecreateFailed(payload);

    const sql = String(tx.query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("failure_reason_code = EXCLUDED.failure_reason_code");
    expect(sql).toContain("WHERE document_preview_artifacts.status <> 'ready'");
    expect(tx.query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      documentId,
      versionId,
      fileObjectId,
      'PREVIEW_CONVERSION_UNAVAILABLE',
    ]);
  });
});

const source = Buffer.from('PK synthetic Office document');
const pdf = Buffer.from('%PDF-1.7\nsynthetic derivative');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function fixture(overrides: { bytes?: Buffer; size?: string; hash?: string } = {}) {
  const original = {
    document_id: payload.documentId,
    tenant_id: payload.tenantId,
    matter_id: '11111111-1111-4111-8111-111111111166',
    status: 'draft',
    version_id: payload.versionId,
    file_object_id: payload.fileObjectId,
    storage_uri: 's3://private/original.docx',
    normalized_filename: '검증 계약서.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size_bytes: overrides.size ?? String(source.byteLength),
    sha256: overrides.hash ?? digest(source),
  };
  let persisted = false;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM documents d')) return { rows: [original], rowCount: 1 };
    if (sql.includes('INSERT INTO document_preview_artifacts')) persisted = true;
    return { rows: persisted ? [{ file_object_id: 'derived-file', sha256: digest(pdf) }] : [], rowCount: persisted ? 1 : 0 };
  });
  const tx = { query };
  const transaction = async <T>(_tenantId: TenantId, callback: (client: typeof tx) => Promise<T>) => callback(tx);
  const convert = vi.fn(async () => pdf);
  const create = vi.fn(async () => undefined);
  const storage = {
    getByStorageUri: vi.fn(async () => ({ body: Readable.from([overrides.bytes ?? source]) })),
    getRangeByStorageUri: vi.fn(async () => ({ body: Readable.from([pdf]) })),
    putTenantObject: vi.fn(async () => ({ storageUri: 's3://private/derived.pdf', encryptionKeyId: 'test-key' })),
    deleteByStorageUri: vi.fn(async () => undefined),
  };
  const service = new PreviewService(
    { transaction } as never,
    { create } as never,
    { convertOfficeToPdf: convert } as never,
    {} as never,
    storage as never,
    {} as never,
  );
  return { service, original, query, convert, create, storage };
}

describe('PreviewService original preservation', () => {
  const preparedFile = {
    file_object_id: '11111111-1111-4111-8111-111111111188',
    storage_uri: 's3://private/derived.pdf', normalized_filename: 'preview.pdf',
    mime_type: 'application/pdf', size_bytes: String(pdf.byteLength), sha256: digest(pdf),
  };

  it('checks prepared state without invoking the converter and preserves source PDF identity', async () => {
    const f = fixture();
    await expect(f.service.getPreparedPreview(tenantId, f.original)).resolves.toEqual({ status: 'pending', file: null });
    const originalPdf = { ...f.original, mime_type: 'application/pdf' };
    await expect(f.service.getPreparedPreview(tenantId, originalPdf)).resolves.toEqual({ status: 'ready', file: originalPdf });
    expect(f.convert).not.toHaveBeenCalled();
    expect(f.storage.getByStorageUri).not.toHaveBeenCalled();
    await expect(f.service.getPreparedPreview('other-tenant' as TenantId, originalPdf)).rejects.toThrow();
  });

  it('reads a bounded PDF range and rejects truncated or oversized range bodies', async () => {
    const f = fixture();
    await expect(f.service.readPreparedChunk(tenantId, preparedFile, 0)).resolves.toEqual(pdf);
    expect(f.storage.getRangeByStorageUri).toHaveBeenCalledWith(tenantId, preparedFile.storage_uri, 0, pdf.byteLength - 1);
    for (const bytes of [pdf.subarray(0, -1), Buffer.concat([pdf, Buffer.from('extra')])]) {
      const body = Readable.from([bytes]);
      f.storage.getRangeByStorageUri.mockResolvedValueOnce({ body });
      await expect(f.service.readPreparedChunk(tenantId, preparedFile, 0)).rejects.toBeInstanceOf(PreviewConversionUnavailableError);
      expect(body.destroyed).toBe(true);
    }
  });

  it.each([-1, 1, PREVIEW_CHUNK_BYTES, Number.MAX_SAFE_INTEGER + 1])('rejects invalid or out-of-bounds offset %s before storage access', async offset => {
    const f = fixture();
    await expect(f.service.readPreparedChunk(tenantId, preparedFile, offset)).rejects.toThrow();
    expect(f.storage.getRangeByStorageUri).not.toHaveBeenCalled();
  });

  it('converts the verified bytes and stores only a separate PDF file object', async () => {
    const f = fixture();
    const original = structuredClone(f.original);
    await expect(f.service.precreatePreview(payload)).resolves.toBe('ready');
    expect(f.convert).toHaveBeenCalledWith(expect.objectContaining({ body: source, filename: '검증 계약서.docx' }));
    expect(f.storage.putTenantObject).toHaveBeenCalledWith(expect.objectContaining({
      documentId: payload.documentId, body: pdf, contentLength: pdf.byteLength, contentType: 'application/pdf',
    }));
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({
      sha256: digest(pdf), sourceSystem: 'preview_derived', normalizedFilename: '검증 계약서.preview.pdf',
    }), expect.anything());
    expect(f.storage.putTenantObject).not.toHaveBeenCalledWith(expect.objectContaining({ fileObjectId: payload.fileObjectId }));
    expect(f.original).toEqual(original);
    expect(f.storage.deleteByStorageUri).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => /(?:UPDATE|INSERT INTO) document_versions/u.test(sql))).toBe(false);
  });

  it('leaves the source and storage unchanged when conversion fails', async () => {
    const f = fixture();
    f.convert.mockRejectedValueOnce(new PreviewConversionUnavailableError());
    await expect(f.service.precreatePreview(payload)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'PREVIEW_CONVERSION_UNAVAILABLE' },
    });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.storage.putTenantObject).not.toHaveBeenCalled();
    expect(f.storage.deleteByStorageUri).not.toHaveBeenCalled();
  });

  it.each([
    { hash: '0'.repeat(64) },
    { bytes: source.subarray(0, source.byteLength - 1) },
    { bytes: Buffer.concat([source, Buffer.from('extra')]) },
  ])('rejects source corruption or length mismatch before conversion and storage writes: %#', async overrides => {
    const f = fixture(overrides);
    await expect(f.service.precreatePreview(payload)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'PREVIEW_CONVERSION_UNAVAILABLE' },
    });
    expect(f.convert).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.storage.putTenantObject).not.toHaveBeenCalled();
    expect(f.storage.deleteByStorageUri).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'invalid', String(PREVIEW_MAX_INPUT_BYTES + 1)])('rejects invalid recorded size %s before reading the source object', async size => {
    const f = fixture({ size });
    await expect(f.service.precreatePreview(payload)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'PREVIEW_CONVERSION_UNAVAILABLE' },
    });
    expect(f.storage.getByStorageUri).not.toHaveBeenCalled();
    expect(f.convert).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
});
