import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiClientMocks = vi.hoisted(() => ({
  fetchDocumentPreviewRange: vi.fn(),
  issueDocumentPreviewSession: vi.fn(),
}));

vi.mock('@/lib/api-client', () => apiClientMocks);

import { loadPreviewWithOneRetry, PreviewSessionFrame, previewMaxBytes, previewTotalBytes } from './preview-session-frame';

const firstSession = {
  expiresAt: '2026-07-22T00:05:00.000Z',
  previewSessionId: '11111111-1111-4111-8111-111111111111',
  token: '1234567890123456789012345678901234567890123',
};
const secondSession = {
  ...firstSession,
  previewSessionId: '11111111-1111-4111-8111-111111111112',
  token: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_12',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('PreviewSessionFrame', () => {
  it('accepts only bounded preview range totals', () => {
    expect(previewTotalBytes('bytes 0-6/7')).toBe(7);
    expect(previewTotalBytes(`bytes 0-6/${previewMaxBytes + 1}`)).toBeNull();
    expect(previewTotalBytes('invalid')).toBeNull();
  });

  it('reissues exactly once after a failed first range request', async () => {
    apiClientMocks.issueDocumentPreviewSession.mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession);
    apiClientMocks.fetchDocumentPreviewRange
      .mockRejectedValueOnce(new Error('expired'))
      .mockResolvedValueOnce(
        new Response('preview', { headers: { 'content-range': 'bytes 0-6/7' }, status: 206 }),
      );

    const chunks = await loadPreviewWithOneRetry('document-ref');

    expect(chunks).toHaveLength(1);
    expect(apiClientMocks.issueDocumentPreviewSession).toHaveBeenCalledTimes(2);
    expect(apiClientMocks.fetchDocumentPreviewRange).toHaveBeenNthCalledWith(
      2,
      'document-ref',
      secondSession,
      'bytes=0-1048575',
    );
  });

  it('stops after the controlled retry and never renders a token into initial HTML', async () => {
    apiClientMocks.issueDocumentPreviewSession.mockRejectedValue(new Error('unavailable'));

    await expect(loadPreviewWithOneRetry('document-ref')).rejects.toThrow('unavailable');
    expect(apiClientMocks.issueDocumentPreviewSession).toHaveBeenCalledTimes(2);

    const html = renderToStaticMarkup(<PreviewSessionFrame documentId="document-ref" title="Advice" />);
    expect(html).toContain('미리보기를 준비하고 있습니다.');
    expect(html).not.toContain(firstSession.token);
    expect(html).not.toContain('x-amic-preview-token');
  });
});
