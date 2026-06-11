import { describe, expect, it, vi } from 'vitest';
import {
  PreviewConversionUnavailableError,
  PreviewConvertJob,
  previewConvertQueueName,
} from './preview-convert.job';

describe('PreviewConvertJob', () => {
  it('uses the preview conversion queue contract and accepts only pdf responses', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response('%PDF-1.7\npreview', {
      headers: { 'content-type': 'application/pdf' },
    })) as never;
    try {
      const job = new PreviewConvertJob();
      expect(job.queueName).toBe(previewConvertQueueName);
      await expect(
        job.convertDocxToPdf({
          tenantId: '11111111-1111-4111-8111-111111111111',
          filename: 'source.docx',
          body: Buffer.from('docx'),
        }),
      ).resolves.toEqual(Buffer.from('%PDF-1.7\npreview'));
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
        new PreviewConvertJob().convertDocxToPdf({
          tenantId: '11111111-1111-4111-8111-111111111111',
          filename: 'source.docx',
          body: Buffer.from('docx'),
        }),
      ).rejects.toBeInstanceOf(PreviewConversionUnavailableError);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
