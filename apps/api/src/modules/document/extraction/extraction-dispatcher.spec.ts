import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetricsRegistry } from '../../../common/metrics/metrics.middleware';
import { ExtractionDispatcher } from './extraction-dispatcher';
import type { ExtractionJobPayload } from './extraction.types';

const tenantId = '11111111-1111-4111-8111-111111111111';
const documentId = '11111111-1111-4111-8111-111111111133';
const matterId = '11111111-1111-4111-8111-111111111122';
const versionId = '11111111-1111-4111-8111-111111111155';
const fileObjectId = '11111111-1111-4111-8111-111111111144';

const payload: ExtractionJobPayload = {
  tenantId,
  documentId,
  versionId,
  fileObjectId,
};

function targetRow() {
  return {
    tenant_id: tenantId,
    document_id: documentId,
    matter_id: matterId,
    version_id: versionId,
    file_object_id: fileObjectId,
    storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
    normalized_filename: 'Fixture.pdf',
    mime_type: 'application/pdf',
  };
}

describe('ExtractionDispatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env.EXTRACTION_WORKER_TIMEOUT_MS;
  });

  it('stores worker text in canonical documents and keeps audit metadata reference-only', async () => {
    const firstTx = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [targetRow()] })),
    };
    const secondTx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ matter_id: matterId }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const auditLog = vi.fn(async () => undefined);
    const transaction = vi
      .fn()
      .mockImplementationOnce(
        async (_tenant: string, run: (tx: typeof firstTx) => Promise<unknown>) => run(firstTx),
      )
      .mockImplementationOnce(
        async (_tenant: string, run: (tx: typeof secondTx) => Promise<unknown>) => run(secondTx),
      );
    const metrics = new MetricsRegistry();
    const enqueueVersion = vi.fn(async () => undefined);
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: auditLog } as never,
      {
        getByStorageUri: vi.fn(async () => ({
          key: 'key',
          contentLength: 7,
          contentType: 'application/pdf',
          etag: null,
          body: Readable.from(Buffer.from('%PDF')),
        })),
      } as never,
      metrics,
      { enqueueVersion } as never,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ready',
          extraction_method: 'pdf_text',
          body_text: 'Confidential fixture text',
          confidence: 1,
          failure_reason_code: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await dispatcher.handle(payload);

    expect(secondTx.query.mock.calls[1]?.[1]).toEqual([
      tenantId,
      versionId,
      'Confidential fixture text',
      'ready',
      'pdf_text',
      1,
      null,
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_TEXT_EXTRACTED',
        metadata: expect.objectContaining({
          document_id: documentId,
          matter_id: matterId,
          version_id: versionId,
          extraction_status: 'ready',
          extraction_method: 'pdf_text',
          confidence: 1,
        }),
      }),
      secondTx,
    );
    expect(enqueueVersion).toHaveBeenCalledWith(
      { tenantId, documentId, versionId },
      secondTx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Confidential fixture text');
    expect(metrics.render()).toContain('document_extraction_results_total{status="ready"} 1');
  });

  it('removes NUL bytes from worker text before storing canonical body text', async () => {
    const firstTx = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [targetRow()] })),
    };
    const secondTx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ matter_id: matterId }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const transaction = vi
      .fn()
      .mockImplementationOnce(
        async (_tenant: string, run: (tx: typeof firstTx) => Promise<unknown>) => run(firstTx),
      )
      .mockImplementationOnce(
        async (_tenant: string, run: (tx: typeof secondTx) => Promise<unknown>) => run(secondTx),
      );
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: vi.fn() } as never,
      {
        getByStorageUri: vi.fn(async () => ({
          key: 'key',
          contentLength: 7,
          contentType: 'application/pdf',
          etag: null,
          body: Readable.from(Buffer.from('%PDF')),
        })),
      } as never,
      new MetricsRegistry(),
      { enqueueVersion: vi.fn(async () => undefined) } as never,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ready',
          extraction_method: 'pdf_text',
          body_text: 'Alpha\u0000Beta',
          confidence: 1,
          failure_reason_code: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await dispatcher.handle(payload);

    expect(secondTx.query.mock.calls[1]?.[1]?.[2]).toBe('AlphaBeta');
  });

  it('throws transient worker failures so pg-boss can retry', async () => {
    const tx = { query: vi.fn(async () => ({ rowCount: 1, rows: [targetRow()] })) };
    const transaction = vi.fn(
      async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: vi.fn() } as never,
      {
        getByStorageUri: vi.fn(async () => ({
          key: 'key',
          contentLength: 7,
          contentType: 'application/pdf',
          etag: null,
          body: Readable.from(Buffer.from('%PDF')),
        })),
      } as never,
      new MetricsRegistry(),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));

    await expect(dispatcher.handle(payload)).rejects.toThrow(/transient extraction worker failure/);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('times out stalled worker requests as transient failures', async () => {
    vi.useFakeTimers();
    process.env.EXTRACTION_WORKER_TIMEOUT_MS = '5';
    const tx = { query: vi.fn(async () => ({ rowCount: 1, rows: [targetRow()] })) };
    const transaction = vi.fn(
      async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: vi.fn() } as never,
      {
        getByStorageUri: vi.fn(async () => ({
          key: 'key',
          contentLength: 7,
          contentType: 'application/pdf',
          etag: null,
          body: Readable.from(Buffer.from('%PDF')),
        })),
      } as never,
      new MetricsRegistry(),
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const pending = dispatcher.handle(payload);
    const expectation = expect(pending).rejects.toThrow(
      /transient extraction worker failure: timeout/,
    );
    await vi.advanceTimersByTimeAsync(6);

    await expectation;
  });
});
