import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  PREVIEW_CONVERT_TIMEOUT_MS,
  PREVIEW_MAX_OUTPUT_BYTES,
  PreviewConversionUnavailableError,
  PreviewConvertJob,
  previewConvertQueueName,
  readPreviewBytes,
} from './preview-convert.job';

const officeInput = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  filename: 'source.docx',
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  body: Buffer.from('PK office fixture'),
};

describe('bounded preview bytes', () => {
  it('accepts an exact multi-chunk byte stream', async () => {
    await expect(readPreviewBytes(Readable.from([Buffer.from('ab'), new Uint8Array([99, 100])]), 4, 4))
      .resolves.toEqual(Buffer.from('abcd'));
  });

  it.each([
    { chunks: [Buffer.from('abc'), Buffer.from('def')], maximum: 5, expected: undefined },
    { chunks: [Buffer.from('abc')], maximum: 5, expected: 4 },
    { chunks: [Buffer.from('abcd')], maximum: 5, expected: 3 },
    { chunks: [], maximum: 5, expected: undefined },
    { chunks: ['text is not a byte stream'], maximum: 50, expected: undefined },
  ])('rejects overflow, truncated, empty or non-byte input and closes the stream: %#', async ({ chunks, maximum, expected }) => {
    const stream = Readable.from(chunks);
    await expect(readPreviewBytes(stream, maximum, expected)).rejects.toBeInstanceOf(PreviewConversionUnavailableError);
    expect(stream.destroyed).toBe(true);
  });
});

describe('PreviewConvertJob', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('uses the preview conversion queue contract and accepts only pdf responses', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn(async () => new Response('%PDF-1.7\npreview', {
      headers: { 'content-type': 'application/pdf' },
    }));
    global.fetch = fetchMock as never;
    try {
      const job = new PreviewConvertJob();
      expect(job.queueName).toBe(previewConvertQueueName);
      await expect(
        job.convertOfficeToPdf({
          tenantId: '11111111-1111-4111-8111-111111111111',
          filename: 'source.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.from('xlsx'),
        }),
      ).resolves.toEqual(Buffer.from('%PDF-1.7\npreview'));
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/convert/office-to-pdf',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fails closed on non-pdf worker responses', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response('not pdf', {
      headers: { 'content-type': 'text/plain' },
    })) as never;
    try {
      await expect(
        new PreviewConvertJob().convertOfficeToPdf({
          tenantId: '11111111-1111-4111-8111-111111111111',
          filename: 'source.pptx',
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          body: Buffer.from('docx'),
        }),
      ).rejects.toBeInstanceOf(PreviewConversionUnavailableError);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects direct or plaintext worker URLs when the private gateway profile is selected', async () => {
    vi.stubEnv('INGESTION_WORKER_IDENTITY_PROFILE', 'private-gateway-mtls');
    vi.stubEnv('INGESTION_WORKER_URL', 'http://127.0.0.1:8000');
    await expect(
      new PreviewConvertJob().convertOfficeToPdf({
        tenantId: '11111111-1111-4111-8111-111111111111',
        filename: 'source.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: Buffer.from('docx'),
      }),
    ).rejects.toBeInstanceOf(PreviewConversionUnavailableError);
  });

  it.each([
    { contentType: 'application/pdf-extra', contentLength: null, bytes: '%PDF-1.7\npreview' },
    { contentType: 'application/pdf', contentLength: 'invalid', bytes: '%PDF-1.7\npreview' },
    { contentType: 'application/pdf', contentLength: String(PREVIEW_MAX_OUTPUT_BYTES + 1), bytes: '%PDF-1.7\npreview' },
    { contentType: 'application/pdf', contentLength: '100', bytes: '%PDF-1.7\npreview' },
    { contentType: 'application/pdf', contentLength: '4', bytes: '%PDF-1.7\npreview' },
    { contentType: 'application/pdf', contentLength: null, bytes: '%PDFbad' },
  ])('rejects invalid worker MIME, length or PDF header: %#', async ({ contentType, contentLength, bytes }) => {
    const headers = new Headers({ 'content-type': contentType });
    if (contentLength !== null) headers.set('content-length', contentLength);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers })));
    await expect(new PreviewConvertJob().convertOfficeToPdf(officeInput))
      .rejects.toBeInstanceOf(PreviewConversionUnavailableError);
  });

  it.each(['headers', 'body'])('aborts a worker stalled at %s and releases its deadline timer', async stage => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      if (!signal) throw new Error('Expected a bounded request');
      signals.push(signal);
      if (stage === 'headers') {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Worker request aborted')), { once: true });
        });
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener('abort', () => controller.error(new Error('Worker body aborted')), { once: true });
        },
      }), { headers: { 'content-type': 'application/pdf' } });
    }));
    const rejected = expect(new PreviewConvertJob().convertOfficeToPdf(officeInput))
      .rejects.toBeInstanceOf(PreviewConversionUnavailableError);
    await vi.advanceTimersByTimeAsync(PREVIEW_CONVERT_TIMEOUT_MS);
    await rejected;
    expect(signals[0]?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
