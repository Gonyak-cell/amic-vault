import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptExternalNda,
  createExternalQuestion,
  getExternalAccessStatus,
  getExternalDownloadTicket,
  getExternalManifest,
  listExternalQa,
} from './external-portal';

describe('external portal API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls public token endpoints without credentialed session scope', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(new Response(JSON.stringify({ status: 'ready', messages: [] })));
    });
    vi.stubGlobal('fetch', fetchMock);

    await getExternalAccessStatus('tok_123');
    await acceptExternalNda('tok_123');
    await getExternalManifest('tok_123');
    await getExternalDownloadTicket('tok_123');
    await listExternalQa('tok_123');
    await createExternalQuestion('tok_123', 'Please clarify item 1.');

    const calls = (fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>).map(
      ([url, init]) => ({ url: String(url), init: init ?? {} }),
    );
    expect(calls.map((call) => call.url)).toEqual([
      'http://localhost:3001/v1/external/access/tok_123',
      'http://localhost:3001/v1/external/access/tok_123/nda',
      'http://localhost:3001/v1/external/access/tok_123/manifest',
      'http://localhost:3001/v1/external/access/tok_123/download-ticket',
      'http://localhost:3001/v1/external/access/tok_123/qa',
      'http://localhost:3001/v1/external/access/tok_123/qa/questions',
    ]);
    expect(calls.every((call) => call.init.credentials === undefined)).toBe(true);
    expect(calls.every((call) => call.init.cache === 'no-store')).toBe(true);
    expect(calls[5]?.init.body ?? '').toBe(JSON.stringify({ messageText: 'Please clarify item 1.' }));
  });
});
