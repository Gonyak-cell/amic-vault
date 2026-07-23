import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PreviewConversionUnavailableError,
  PreviewConvertJob,
  previewConvertQueueName,
} from './preview-convert.job';

describe('PreviewConvertJob', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
