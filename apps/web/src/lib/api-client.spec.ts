import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  apiFetch,
  apiFetchFormData,
  addDocumentVersion,
  documentDownloadUrl,
  documentPreviewUrl,
  getDocument,
  listDocumentVersions,
  listDocuments,
  listMatterDocuments,
  updateDocumentMetadata,
  uploadDocument,
} from './api-client';

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses standard error code responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'AUTH_REQUIRED', requestId: 'req-1' }), {
            status: 401,
          }),
      ),
    );

    await expect(
      apiFetch('/tenant/settings', { redirectOnAuthRequired: false }),
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      requestId: 'req-1',
      status: 401,
    });
  });

  it('returns JSON on success with credentials included', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch<{ ok: boolean }>('/health/live')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/health/live',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('forces API fetches to no-store even when a caller passes cache options', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch<{ ok: boolean }>('/health/live', { cache: 'force-cache' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/health/live',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('accepts empty 204 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(
      apiFetch<void>('/matters/id/members/user-id', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('uses ApiClientError for non-standard responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );

    await expect(apiFetch('/boom', { redirectOnAuthRequired: false })).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it('sends multipart form data without forcing a JSON content type', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.set('file', new Blob(['pdf']), 'contract.pdf');

    await expect(
      apiFetchFormData<{ ok: boolean }>('/matters/matter-ref/documents', formData, {
        headers: { 'content-type': 'application/json', 'x-requested-by': 'web' },
        method: 'POST',
      }),
    ).resolves.toEqual({ ok: true });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    if (!call) throw new Error('missing fetch call');
    const init = call[1];
    expect(init).toEqual(
      expect.objectContaining({
        body: formData,
        cache: 'no-store',
        credentials: 'include',
        method: 'POST',
      }),
    );
    expect(init?.headers).toBeInstanceOf(Headers);
    const headers = init.headers as Headers;
    expect(headers.get('content-type')).toBeNull();
    expect(headers.get('x-requested-by')).toBe('web');
  });

  it('uploads documents through the matter-scoped document endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            matterId: 'matter-ref',
            fileObjectId: 'file-ref',
            status: 'draft',
            title: 'Contract',
            documentType: 'contract',
            subtype: null,
            confidentialityLevel: 'standard',
            privilegeStatus: 'none',
            aiAllowed: true,
            metadataSuggestion: {},
            duplicates: [],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['pdf'], 'contract.pdf', { type: 'application/pdf' });
    await uploadDocument('matter-ref', file, {
      confidentialityLevel: 'standard',
      documentType: 'contract',
      aiAllowed: true,
      title: 'Contract',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/matters/matter-ref/documents',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
    );
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined;
    if (!firstCall) throw new Error('missing upload request');
    const body = firstCall[1]?.body as FormData;
    expect(body.get('aiAllowed')).toBe('true');
  });

  it('lists matter documents through the matter-scoped endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], page: 2, pageSize: 10, totalCount: 0 }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listMatterDocuments('matter-ref', { page: 2, pageSize: 10 })).resolves.toEqual({
      items: [],
      page: 2,
      pageSize: 10,
      totalCount: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/matters/matter-ref/documents?page=2&pageSize=10',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('lists all authorized documents through the document vault endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], page: 2, pageSize: 10, totalCount: 0 }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listDocuments({
        aiAllowed: false,
        documentType: 'contract',
        extractionStatus: 'failed',
        legalHold: true,
        matterCode: 'AMIC-2026',
        page: 2,
        pageSize: 10,
        sortBy: 'matter_asc',
        title: '계약서',
      }),
    ).resolves.toEqual({
      items: [],
      page: 2,
      pageSize: 10,
      totalCount: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/documents?aiAllowed=false&documentType=contract&extractionStatus=failed&legalHold=true&matterCode=AMIC-2026&page=2&pageSize=10&sortBy=matter_asc&title=%EA%B3%84%EC%95%BD%EC%84%9C',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('loads and updates document detail metadata through document endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            tenantId: 'tenant-ref',
            matterId: 'matter-ref',
            documentFamilyId: 'family-ref',
            title: 'Contract',
            status: 'draft',
            documentType: 'contract',
            subtype: null,
            confidentialityLevel: 'standard',
            privilegeStatus: 'none',
            legalHold: false,
            createdBy: 'user-ref',
            createdAt: '2026-06-18T00:00:00.000Z',
            updatedAt: '2026-06-18T00:00:00.000Z',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            tenantId: 'tenant-ref',
            matterId: 'matter-ref',
            documentFamilyId: 'family-ref',
            title: 'Updated',
            status: 'draft',
            documentType: 'memo',
            subtype: 'closing',
            confidentialityLevel: 'high',
            privilegeStatus: 'none',
            legalHold: false,
            createdBy: 'user-ref',
            createdAt: '2026-06-18T00:00:00.000Z',
            updatedAt: '2026-06-18T00:00:01.000Z',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await getDocument('doc-ref');
    await updateDocumentMetadata('doc-ref', {
      confidentialityLevel: 'high',
      documentType: 'memo',
      subtype: 'closing',
      title: 'Updated',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/doc-ref',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/documents/doc-ref/metadata',
      expect.objectContaining({
        body: JSON.stringify({
          confidentialityLevel: 'high',
          documentType: 'memo',
          subtype: 'closing',
          title: 'Updated',
        }),
        method: 'PATCH',
      }),
    );
  });

  it('lists document versions and uploads a new immutable version', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            matterId: 'matter-ref',
            versionId: 'version-ref',
            versionNo: 2,
            versionStatus: 'current',
            fileObjectId: 'file-ref',
            sha256: 'abc',
            metadataSuggestion: {},
            duplicates: [],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await listDocumentVersions('doc-ref', { status: 'current' });
    await addDocumentVersion('doc-ref', new File(['v2'], 'contract-v2.pdf'));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/doc-ref/versions?status=current',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/documents/doc-ref/versions',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
    );
  });

  it('builds preview and controlled download URLs without exposing raw refs beyond the route id', () => {
    expect(documentPreviewUrl('doc-ref')).toBe(
      'http://localhost:3001/v1/documents/doc-ref/preview',
    );
    expect(
      documentPreviewUrl('doc-ref', {
        searchHit: {
          hitCount: 80,
          hitIndex: 99,
          target: 'body',
        },
      }),
    ).toBe(
      'http://localhost:3001/v1/documents/doc-ref/preview#vault-preview-hit=50&vault-preview-hit-count=50&vault-preview-target=body',
    );
    expect(documentDownloadUrl('doc-ref', 'casework')).toBe(
      'http://localhost:3001/v1/documents/doc-ref/download?reasonCode=casework',
    );
  });
});
