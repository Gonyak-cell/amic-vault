import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCitationSources, verifyCitations } from './ai-citations';

const matterId = '11111111-1111-4111-8111-111111111001';
const documentId = '11111111-1111-4111-8111-111111111002';
const versionId = '11111111-1111-4111-8111-111111111003';
const chunkId = '11111111-1111-4111-8111-111111111004';
const hash = 'a'.repeat(64);
const citation = {
  citationRef: `chunk:${chunkId}`,
  matterId,
  documentId,
  versionId,
  chunkId,
  quoteHash: hash,
  sourceTextHash: hash,
};

describe('AI citation API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts source panel citation requests without raw text fields', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ sources: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCitationSources({ matterId, citations: [citation] })).resolves.toEqual({
      sources: [],
    });

    const calls = (
      fetchMock as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }
    ).mock.calls;
    const request = calls[0]?.[1];
    expect(request).toBeDefined();
    if (!request) throw new Error('missing fetch request init');
    expect(request.method).toBe('POST');
    expect(String(request.body)).not.toContain('raw');
    expect(String(request.body)).not.toContain('body text');
  });

  it('posts hashed claim verification payloads', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ warnings: [], legalConclusionAutoApproval: false }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      verifyCitations({
        citations: [citation],
        claims: [{ claimId: 'claim-1', claimHash: 'b'.repeat(64), citationRefs: [] }],
      }),
    ).resolves.toEqual({ warnings: [], legalConclusionAutoApproval: false });
  });
});
