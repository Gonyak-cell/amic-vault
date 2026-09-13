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
  converterProfileSha256: 'c'.repeat(64),
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
      headers: { 'content-type': 'application/pdf', 'x-amic-converter-profile': officeInput.converterProfileSha256 },
    }));
    global.fetch = fetchMock as never;
    try {
      const job = new PreviewConvertJob();
      expect(job.queueName).toBe(previewConvertQueueName);
      await expect(
        job.convertOfficeToPdf({
          converterProfileSha256: officeInput.converterProfileSha256,
          tenantId: '11111111-1111-4111-8111-111111111111',
          filename: 'source.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Buffer.from('xlsx'),
        }),
      ).resolves.toEqual(Buffer.from('%PDF-1.7\npreview'));
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/convert/office-to-pdf',
        expect.objectContaining({ method: 'POST', headers: expect.objectContaining({
          'x-amic-converter-profile': officeInput.converterProfileSha256,
        }) }),
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
          converterProfileSha256: officeInput.converterProfileSha256,
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
        converterProfileSha256: officeInput.converterProfileSha256,
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
    const headers = new Headers({ 'content-type': contentType, 'x-amic-converter-profile': officeInput.converterProfileSha256 });
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
      }), { headers: { 'content-type': 'application/pdf', 'x-amic-converter-profile': officeInput.converterProfileSha256 } });
    }));
    const rejected = expect(new PreviewConvertJob().convertOfficeToPdf(officeInput))
      .rejects.toBeInstanceOf(PreviewConversionUnavailableError);
    await vi.advanceTimersByTimeAsync(PREVIEW_CONVERT_TIMEOUT_MS);
    await rejected;
    expect(signals[0]?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gets the current profile through the authenticated fixed worker path before conversion', async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith('/profile')
      ? Response.json({ profile_sha256: officeInput.converterProfileSha256 })
      : new Response('%PDF-1.7\npreview', { headers: {
        'content-type': 'application/pdf', 'x-amic-converter-profile': officeInput.converterProfileSha256,
      } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new PreviewConvertJob().convertOfficeToPdf({ ...officeInput, converterProfileSha256: undefined }))
      .resolves.toEqual(Buffer.from('%PDF-1.7\npreview'));
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8000/convert/office-to-pdf/profile',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({
        'x-amic-tenant-id': officeInput.tenantId, 'x-amic-ingestion-nonce': expect.any(String),
      }) }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    null, {}, { profile_sha256: 'invalid' }, { profile_sha256: 'C'.repeat(64) },
    { profile_sha256: 'c'.repeat(64), extra: true }, { profile_sha256: 'x'.repeat(4096) },
  ])('rejects missing, malformed or oversized converter profiles: %#', async profile => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(profile)));
    await expect(new PreviewConvertJob().getProfileSha256(officeInput.tenantId))
      .rejects.toBeInstanceOf(PreviewConversionUnavailableError);
  });

  it.each([null, 'd'.repeat(64)])('rejects a PDF with a missing or changed converter profile: %s', async profile => {
    const headers = new Headers({ 'content-type': 'application/pdf' });
    if (profile !== null) headers.set('x-amic-converter-profile', profile);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF-1.7\npreview', { headers })));
    await expect(new PreviewConvertJob().convertOfficeToPdf(officeInput))
      .rejects.toBeInstanceOf(PreviewConversionUnavailableError);
  });

  it('bounds a stalled converter profile request and clears the deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })));
    const rejected = expect(new PreviewConvertJob().getProfileSha256(officeInput.tenantId))
      .rejects.toBeInstanceOf(PreviewConversionUnavailableError);
    await vi.advanceTimersByTimeAsync(PREVIEW_CONVERT_TIMEOUT_MS);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
