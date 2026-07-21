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

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: tenantId,
    document_id: documentId,
    matter_id: matterId,
    version_id: versionId,
    file_object_id: fileObjectId,
    storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
    normalized_filename: 'Fixture.pdf',
    mime_type: 'application/pdf',
    ...overrides,
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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

    await dispatcher.handleOcr(payload);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8000/ocr');
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
    expect(enqueueVersion).toHaveBeenCalledWith({ tenantId, documentId, versionId }, secondTx);
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Confidential fixture text');
    expect(metrics.render()).toContain('document_extraction_results_total{status="ready"} 1');
  });

  it('stores DOCX revision extraction in the same transaction with reference-only audit metadata', async () => {
    const firstTx = {
      query: vi.fn(async () => ({
        rowCount: 1,
        rows: [
          targetRow({
            normalized_filename: 'Tracked-agreement.docx',
            mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
        ],
      })),
    };
    const secondTx = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        void params;
        return sql.includes('SELECT d.matter_id')
          ? { rowCount: 1, rows: [{ matter_id: matterId }] }
          : { rowCount: 1, rows: [] };
      }),
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
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: auditLog } as never,
      {
        getByStorageUri: vi.fn(async () => ({
          key: 'key',
          contentLength: 7,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          etag: null,
          body: Readable.from(Buffer.from('docx')),
        })),
      } as never,
      new MetricsRegistry(),
      { enqueueVersion: vi.fn(async () => undefined) } as never,
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ready',
            extraction_method: 'docx',
            body_text: 'Contract body text',
            confidence: 1,
            failure_reason_code: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ready',
            revisions: [
              {
                change_type: 'insert',
                author: 'Partner A',
                date: '2026-07-01T10:00:00.000Z',
                before_text: '',
                after_text: 'Inserted indemnity clause',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    await dispatcher.handle(payload);

    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:8000/extract-revisions');
    const revisionInsert = secondTx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO document_revisions'),
    );
    expect(revisionInsert?.[1]).toEqual([
      tenantId,
      matterId,
      documentId,
      versionId,
      null,
      0,
      'insert',
      'Partner A',
      '2026-07-01T10:00:00.000Z',
      '',
      'Inserted indemnity clause',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.stringMatching(/^[0-9a-f]{64}$/),
      'b10-worker-v1',
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_REVISIONS_EXTRACTED',
        metadata: expect.objectContaining({
          document_id: documentId,
          matter_id: matterId,
          version_id: versionId,
          item_count: 1,
          parser_status: 'success',
          hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
      secondTx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Inserted indemnity clause');
  });

  it('stores PDF annotations in the same transaction with reference-only audit metadata', async () => {
    const firstTx = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [targetRow()] })),
    };
    const secondTx = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        void params;
        return sql.includes('SELECT d.matter_id')
          ? { rowCount: 1, rows: [{ matter_id: matterId }] }
          : { rowCount: 1, rows: [] };
      }),
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
      new MetricsRegistry(),
      { enqueueVersion: vi.fn(async () => undefined) } as never,
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ready',
            extraction_method: 'pdf_text',
            body_text: 'Annotated PDF body text',
            confidence: 1,
            failure_reason_code: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ready',
            annotations: [
              {
                annotation_type: 'highlight',
                page: 2,
                author: 'Reviewer B',
                contents: 'Review this payment obligation',
                rect: [10, 20, 30, 40],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    await dispatcher.handle(payload);

    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:8000/extract-annotations');
    const annotationInsert = secondTx.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO document_annotations'),
    );
    expect(annotationInsert?.[1]).toEqual([
      tenantId,
      matterId,
      documentId,
      versionId,
      null,
      0,
      'highlight',
      2,
      'Reviewer B',
      'Review this payment obligation',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      [10, 20, 30, 40],
      'b10-worker-v1',
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_ANNOTATIONS_EXTRACTED',
        metadata: expect.objectContaining({
          document_id: documentId,
          matter_id: matterId,
          version_id: versionId,
          item_count: 1,
          parser_status: 'success',
          hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
      secondTx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Review this payment obligation');
  });

  it('passes a presigned storage URL to the worker without downloading the object in API memory', async () => {
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
    const getByStorageUri = vi.fn();
    const createReadUrlByStorageUri = vi.fn(async () => ({
      url: 'https://storage.local/presigned-source.pdf',
      expiresAt: new Date(),
    }));
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: vi.fn() } as never,
      { createReadUrlByStorageUri, getByStorageUri } as never,
      new MetricsRegistry(),
      { enqueueVersion: vi.fn(async () => undefined) } as never,
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ready',
          extraction_method: 'pdf_text',
          body_text: 'Worker fetched source bytes',
          confidence: 1,
          failure_reason_code: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await dispatcher.handle(payload);

    expect(createReadUrlByStorageUri).toHaveBeenCalledWith(tenantId, targetRow().storage_uri, 300);
    expect(getByStorageUri).not.toHaveBeenCalled();
    const form = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(form.get('storage_url')).toBe('https://storage.local/presigned-source.pdf');
    expect(form.get('source_filename')).toBe('Fixture.pdf');
    expect(form.get('file')).toBeNull();
  });

  it('enqueues OCR when extraction stores an ocr_pending result', async () => {
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
    const enqueueVersion = vi.fn(async () => undefined);
    const enqueueOcrRequired = vi.fn(async () => 'ocr-job-id');
    const metrics = new MetricsRegistry();
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
      { enqueueOcrRequired } as never,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ocr_pending',
          extraction_method: 'ocr_required',
          body_text: '',
          confidence: 0,
          failure_reason_code: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await dispatcher.handle(payload);

    expect(secondTx.query.mock.calls[1]?.[1]).toEqual([
      tenantId,
      versionId,
      '',
      'ocr_pending',
      'ocr_required',
      0,
      null,
    ]);
    expect(enqueueVersion).not.toHaveBeenCalled();
    expect(enqueueOcrRequired).toHaveBeenCalledWith(payload, secondTx);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_TEXT_EXTRACTED',
        metadata: expect.objectContaining({
          extraction_status: 'ocr_pending',
          extraction_method: 'ocr_required',
        }),
      }),
      secondTx,
    );
    expect(metrics.render()).toContain('document_extraction_results_total{status="ocr_pending"} 1');
  });

  it('stores OCR-ready worker results with extraction_method ocr', async () => {
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
    const enqueueVersion = vi.fn(async () => undefined);
    const enqueueOcrRequired = vi.fn(async () => 'ocr-job-id');
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
      { enqueueVersion } as never,
      { enqueueOcrRequired } as never,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ready',
          extraction_method: 'ocr',
          body_text: '스캔 계약서 OCR text',
          confidence: 0.7,
          failure_reason_code: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await dispatcher.handle(payload);

    expect(secondTx.query.mock.calls[1]?.[1]).toEqual([
      tenantId,
      versionId,
      '스캔 계약서 OCR text',
      'ready',
      'ocr',
      0.7,
      null,
    ]);
    expect(enqueueVersion).toHaveBeenCalledWith({ tenantId, documentId, versionId }, secondTx);
    expect(enqueueOcrRequired).not.toHaveBeenCalled();
  });

  it('stores HWP5 worker results with extraction_method hwp5', async () => {
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
    const enqueueVersion = vi.fn(async () => undefined);
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: vi.fn() } as never,
      {
        getByStorageUri: vi.fn(async () => ({
          key: 'key',
          contentLength: 7,
          contentType: 'application/x-hwp',
          etag: null,
          body: Readable.from(Buffer.from('\xd0\xcf\x11\xe0')),
        })),
      } as never,
      new MetricsRegistry(),
      { enqueueVersion } as never,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ready',
          extraction_method: 'hwp5',
          body_text: '법원 제출 서면 HWP text',
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
      '법원 제출 서면 HWP text',
      'ready',
      'hwp5',
      1,
      null,
    ]);
    expect(enqueueVersion).toHaveBeenCalledWith({ tenantId, documentId, versionId }, secondTx);
  });

  it('does not enqueue OCR for failed extraction results', async () => {
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
    const enqueueVersion = vi.fn(async () => undefined);
    const enqueueOcrRequired = vi.fn(async () => 'ocr-job-id');
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
      { enqueueVersion } as never,
      { enqueueOcrRequired } as never,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'failed',
          extraction_method: 'failed',
          body_text: '',
          confidence: 0,
          failure_reason_code: 'PDF_PARSE_FAILED',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await dispatcher.handle(payload);

    expect(secondTx.query.mock.calls[1]?.[1]).toEqual([
      tenantId,
      versionId,
      '',
      'failed',
      'failed',
      0,
      'PDF_PARSE_FAILED',
    ]);
    expect(enqueueVersion).not.toHaveBeenCalled();
    expect(enqueueOcrRequired).not.toHaveBeenCalled();
  });

  it('marks exhausted OCR jobs as failed OCR extraction results', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ matter_id: matterId }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const auditLog = vi.fn(async () => undefined);
    const transaction = vi.fn(
      async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const dispatcher = new ExtractionDispatcher(
      { transaction, log: auditLog } as never,
      { getByStorageUri: vi.fn() } as never,
      new MetricsRegistry(),
    );

    await dispatcher.markOcrDeadLetter(payload);

    expect(tx.query.mock.calls[1]?.[1]).toEqual([
      tenantId,
      versionId,
      '',
      'failed',
      'ocr',
      0,
      'OCR_RETRY_EXHAUSTED',
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_TEXT_EXTRACTED',
        metadata: expect.objectContaining({
          extraction_status: 'failed',
          extraction_method: 'ocr',
          reason_code: 'OCR_RETRY_EXHAUSTED',
        }),
      }),
      tx,
    );
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
