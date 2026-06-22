import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  assignDocumentSubversionReviewer,
  apiFetch,
  apiFetchFormData,
  addDocumentVersion,
  checkInDocumentEditSession,
  createDocumentEditSession,
  createUploadPreflight,
  documentDownloadUrl,
  documentPreviewUrl,
  getDocument,
  getActiveDocumentEditSession,
  getMatterAppStatus,
  getDocumentEditPackage,
  getNativeDocumentEditDraft,
  listDocumentVersions,
  listDocumentSubversionReviews,
  listDocumentSubversionReviewers,
  listDocumentSubversions,
  listDocuments,
  listMatterDocuments,
  lookupMatterAppMatters,
  promoteDocumentSubversion,
  revokeDocumentSubversionReviewer,
  saveDocumentSubversion,
  saveNativeDocumentEditDraft,
  submitDocumentSubversionReview,
  documentEditBaseFileUrl,
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
          new Response(
            JSON.stringify({
              code: 'AUTH_REQUIRED',
              reason: 'edit_session_expired',
              requestId: 'req-1',
            }),
            {
              status: 401,
            },
          ),
      ),
    );

    await expect(
      apiFetch('/tenant/settings', { redirectOnAuthRequired: false }),
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      reason: 'edit_session_expired',
      requestId: 'req-1',
      status: 401,
    });
  });

  it('drops unsafe API error reasons before exposing ApiClientError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'VALIDATION_FAILED', reason: 'bad reason!' }), {
            status: 400,
          }),
      ),
    );

    await expect(apiFetch('/documents/doc/edit', { redirectOnAuthRequired: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: undefined,
      status: 400,
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
      uploadPreflightRef: 'upf_ref',
      duplicateDecision: 'new_document',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/matters/matter-ref/documents',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
    );
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined;
    if (!firstCall) throw new Error('missing upload request');
    const body = firstCall[1]?.body as FormData;
    expect(body.get('aiAllowed')).toBe('true');
    expect(body.get('uploadPreflightRef')).toBe('upf_ref');
    expect(body.get('duplicateDecision')).toBe('new_document');
  });

  it('creates upload preflight through the matter-scoped preflight endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            matterReference: 'matter-ref',
            preflightRef: 'upf_ref',
            expiresAt: '2026-06-20T00:05:00.000Z',
            sourceMode: 'matter_app_api',
            sourceUpdatedAt: null,
            sourceRevision: 'rev-1',
            permissionDecisionRef: 'matter-upload:decision',
            uploadEligible: true,
            blockedReason: null,
            duplicateDecisionRequired: true,
            duplicateCandidates: [
              {
                documentReference: '11111111-1111-4111-8111-111111111123',
                matterCode: 'AMIC-2026-0001',
                matterName: 'Investment Advisory',
                title: 'Investment memo.pdf',
                versionLabel: 'v1 current',
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createUploadPreflight('matter-ref', { sha256: 'a'.repeat(64) }),
    ).resolves.toMatchObject({
      preflightRef: 'upf_ref',
      duplicateDecisionRequired: true,
      uploadEligible: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/matters/matter-ref/documents/upload-preflight',
      expect.objectContaining({
        body: JSON.stringify({ sha256: 'a'.repeat(64) }),
        cache: 'no-store',
        credentials: 'include',
        method: 'POST',
      }),
    );
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

  it('loads Matter app source status through the integration endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            mode: 'matter_app_api',
            requestedMode: 'matter_app_api',
            label: 'Matter app API',
            description: 'Matter app ready',
            sourceConfigured: true,
            runtimeReady: true,
            sourceContractReady: true,
            sourceAvailable: true,
            uploadAuthoritative: true,
            productionRuntime: false,
            projectionFallbackAllowed: false,
            stalenessMaxSeconds: 900,
            sourceUpdatedAt: null,
            sourceStale: false,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMatterAppStatus()).resolves.toMatchObject({
      mode: 'matter_app_api',
      sourceAvailable: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/integrations/matter-app/status',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('looks up Matter app matters without using the generic matter list endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            source: {
              mode: 'matter_app_api',
              requestedMode: 'matter_app_api',
              label: 'Matter app API',
              description: 'Matter app ready',
              sourceConfigured: true,
              runtimeReady: true,
              sourceContractReady: true,
              sourceAvailable: true,
              uploadAuthoritative: true,
              productionRuntime: false,
              projectionFallbackAllowed: false,
              stalenessMaxSeconds: 900,
              sourceUpdatedAt: null,
              sourceStale: false,
            },
            lookupAvailable: true,
            items: [],
            totalCount: 0,
            pageSize: 20,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupMatterAppMatters({ q: 'AMIC', pageSize: 20 })).resolves.toMatchObject({
      lookupAvailable: true,
      items: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/integrations/matter-app/matter-lookup?q=AMIC&pageSize=20',
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
    await addDocumentVersion('doc-ref', new File(['v2'], 'contract-v2.pdf'), {
      duplicateDecision: 'new_version',
    });

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
    const body = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(body.get('duplicateDecision')).toBe('new_version');
  });

  it('drives document edit sessions through subversion and promotion endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            editSessionId: 'session-ref',
            documentId: 'doc-ref',
            baseVersionId: 'version-ref',
            baseVersionNo: 2,
            status: 'active',
            clientKind: 'web_upload',
            lockOwnerUserId: 'user-ref',
            checkedOutAt: '2026-06-18T00:00:00.000Z',
            heartbeatAt: '2026-06-18T00:00:00.000Z',
            expiresAt: '2026-06-18T01:00:00.000Z',
            checkedInAt: null,
            cancelledAt: null,
            expiredAt: null,
            conflictedAt: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('null', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subversionId: 'subversion-ref',
            documentId: 'doc-ref',
            baseVersionId: 'version-ref',
            baseVersionNo: 2,
            subversionNo: 1,
            displayVersion: 'v2.1',
            editSessionId: 'session-ref',
            status: 'saved',
            visibilityScope: 'matter_editors',
            fileObjectId: 'file-ref',
            fileHash: 'hash-ref',
            createdBy: 'user-ref',
            createdAt: '2026-06-18T00:05:00.000Z',
            submittedAt: null,
            promotedVersionId: null,
            reviewGate: {
              status: 'not_required',
              activeReviewerCount: 0,
              approvedReviewCount: 0,
              changesRequestedCount: 0,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            editSessionId: 'session-ref',
            documentId: 'doc-ref',
            baseVersionId: 'version-ref',
            baseVersionNo: 2,
            status: 'checked_in',
            clientKind: 'web_upload',
            lockOwnerUserId: 'user-ref',
            checkedOutAt: '2026-06-18T00:00:00.000Z',
            heartbeatAt: '2026-06-18T00:05:00.000Z',
            expiresAt: '2026-06-18T01:05:00.000Z',
            checkedInAt: '2026-06-18T00:06:00.000Z',
            cancelledAt: null,
            expiredAt: null,
            conflictedAt: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            subversionId: 'subversion-ref',
            promotedVersionId: 'version-3',
            versionNo: 3,
            versionStatus: 'current',
            supersedesVersionId: 'version-ref',
            promotedFromSubversionId: 'subversion-ref',
            publishedAt: '2026-06-18T00:07:00.000Z',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await createDocumentEditSession('doc-ref', {
      clientKind: 'web_upload',
      checkoutReasonCode: 'WEB_EDIT',
      idempotencyKey: 'web-edit-doc-ref',
    });
    await getActiveDocumentEditSession('doc-ref');
    await saveDocumentSubversion('doc-ref', 'session-ref', new File(['v2.1'], 'contract.docx'), {
      editPackageMode: 'binary_roundtrip',
      expectedBaseSha256: 'a'.repeat(64),
      saveReasonCode: 'MANUAL_SAVE',
      visibilityScope: 'matter_editors',
    });
    await listDocumentSubversions('doc-ref');
    await checkInDocumentEditSession('doc-ref', 'session-ref', {
      expectedLastSubversionId: 'subversion-ref',
    });
    await promoteDocumentSubversion('doc-ref', 'subversion-ref', {
      expectedBaseVersionId: 'version-ref',
      publishReasonCode: 'CLIENT_READY',
      idempotencyKey: 'web-promote-subversion-ref',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions',
      expect.objectContaining({
        body: JSON.stringify({
          clientKind: 'web_upload',
          checkoutReasonCode: 'WEB_EDIT',
          idempotencyKey: 'web-edit-doc-ref',
        }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/active',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/session-ref/subversions',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
    );
    const subversionBody = fetchMock.mock.calls[2]?.[1]?.body as FormData;
    expect(subversionBody.get('editPackageMode')).toBe('binary_roundtrip');
    expect(subversionBody.get('expectedBaseSha256')).toBe('a'.repeat(64));
    expect(subversionBody.get('visibilityScope')).toBe('matter_editors');
    expect(subversionBody.get('saveReasonCode')).toBe('MANUAL_SAVE');
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3001/v1/documents/doc-ref/subversions',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/session-ref/check-in',
      expect.objectContaining({
        body: JSON.stringify({ expectedLastSubversionId: 'subversion-ref' }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://localhost:3001/v1/documents/doc-ref/subversions/subversion-ref/promote',
      expect.objectContaining({
        body: JSON.stringify({
          expectedBaseVersionId: 'version-ref',
          publishReasonCode: 'CLIENT_READY',
          idempotencyKey: 'web-promote-subversion-ref',
        }),
        method: 'POST',
      }),
    );
  });

  it('lists, assigns, and revokes document subversion reviewers through ACL endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                subversionReviewerId: 'reviewer-ref',
                subversionId: 'subversion-ref',
                documentId: 'doc-ref',
                reviewerUserId: 'reviewer-user-ref',
                assignedBy: 'user-ref',
                status: 'active',
                createdAt: '2026-06-18T00:08:00.000Z',
                revokedAt: null,
                safeLabel: 'Alpha Reviewer',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subversionReviewerId: 'reviewer-ref',
            subversionId: 'subversion-ref',
            documentId: 'doc-ref',
            reviewerUserId: 'reviewer-user-ref',
            assignedBy: 'user-ref',
            status: 'active',
            createdAt: '2026-06-18T00:08:00.000Z',
            revokedAt: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subversionReviewerId: 'reviewer-ref',
            subversionId: 'subversion-ref',
            documentId: 'doc-ref',
            reviewerUserId: 'reviewer-user-ref',
            assignedBy: 'user-ref',
            status: 'revoked',
            createdAt: '2026-06-18T00:08:00.000Z',
            revokedAt: '2026-06-18T00:09:00.000Z',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await listDocumentSubversionReviewers('doc-ref', 'subversion-ref');
    await assignDocumentSubversionReviewer('doc-ref', 'subversion-ref', {
      reviewerUserId: 'reviewer-user-ref',
    });
    await revokeDocumentSubversionReviewer('doc-ref', 'subversion-ref', 'reviewer-user-ref');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/doc-ref/subversions/subversion-ref/reviewers',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/documents/doc-ref/subversions/subversion-ref/reviewers',
      expect.objectContaining({
        body: JSON.stringify({ reviewerUserId: 'reviewer-user-ref' }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/documents/doc-ref/subversions/subversion-ref/reviewers/reviewer-user-ref',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('lists and submits document subversion review decisions through review endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                subversionReviewId: 'review-ref',
                subversionReviewerId: 'reviewer-ref',
                subversionId: 'subversion-ref',
                documentId: 'doc-ref',
                reviewerUserId: 'reviewer-user-ref',
                decision: 'approved',
                decidedAt: '2026-06-18T00:10:00.000Z',
                safeLabel: 'Alpha Reviewer',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subversionReviewId: 'review-ref',
            subversionReviewerId: 'reviewer-ref',
            subversionId: 'subversion-ref',
            documentId: 'doc-ref',
            reviewerUserId: 'reviewer-user-ref',
            decision: 'changes_requested',
            decidedAt: '2026-06-18T00:11:00.000Z',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await listDocumentSubversionReviews('doc-ref', 'subversion-ref');
    await submitDocumentSubversionReview('doc-ref', 'subversion-ref', {
      decision: 'changes_requested',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/doc-ref/subversions/subversion-ref/reviews',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/documents/doc-ref/subversions/subversion-ref/reviews/me',
      expect.objectContaining({
        body: JSON.stringify({ decision: 'changes_requested' }),
        method: 'POST',
      }),
    );
  });

  it('opens and saves native document edit drafts through the session endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            editSessionId: 'session-ref',
            baseVersionId: 'version-ref',
            baseVersionNo: 2,
            filename: 'draft.txt',
            mimeType: 'text/plain',
            content: 'native draft',
            sizeBytes: 12,
            sha256: 'a'.repeat(64),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subversionId: 'subversion-ref',
            documentId: 'doc-ref',
            baseVersionId: 'version-ref',
            baseVersionNo: 2,
            subversionNo: 2,
            displayVersion: 'v2.2',
            editSessionId: 'session-ref',
            status: 'saved',
            visibilityScope: 'matter_editors',
            fileObjectId: 'file-ref',
            fileHash: 'b'.repeat(64),
            createdBy: 'user-ref',
            createdAt: '2026-06-18T00:05:00.000Z',
            submittedAt: null,
            promotedVersionId: null,
            reviewGate: {
              status: 'not_required',
              activeReviewerCount: 0,
              approvedReviewCount: 0,
              changesRequestedCount: 0,
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await getNativeDocumentEditDraft('doc-ref', 'session-ref');
    await saveNativeDocumentEditDraft('doc-ref', 'session-ref', {
      clientSaveId: 'native-save-2026:0001',
      content: 'updated native draft',
      saveReasonCode: 'NATIVE_SAVE',
      visibilityScope: 'matter_editors',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/session-ref/native-draft',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/session-ref/native-draft',
      expect.objectContaining({
        body: JSON.stringify({
          clientSaveId: 'native-save-2026:0001',
          content: 'updated native draft',
          saveReasonCode: 'NATIVE_SAVE',
          visibilityScope: 'matter_editors',
        }),
        method: 'POST',
      }),
    );
  });

  it('loads edit packages and builds session-scoped base file URLs', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            editSessionId: 'session-ref',
            baseVersionId: 'version-ref',
            baseVersionNo: 2,
            filename: 'draft.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: 2048,
            sha256: 'a'.repeat(64),
            mode: 'binary_roundtrip',
            canOpenInVaultEditor: false,
            baseFileUrl: '/v1/documents/doc-ref/edit-sessions/session-ref/base-file',
            saveSubversionUrl: '/v1/documents/doc-ref/edit-sessions/session-ref/subversions',
            checkInUrl: '/v1/documents/doc-ref/edit-sessions/session-ref/check-in',
            nativeDraftUrl: null,
            expiresAt: '2026-06-18T01:00:00.000Z',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getDocumentEditPackage('doc-ref', 'session-ref');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/session-ref/edit-package',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(documentEditBaseFileUrl('doc-ref', 'session-ref')).toBe(
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/session-ref/base-file',
    );
  });

  it('builds preview and controlled download URLs without exposing raw refs beyond the route id', () => {
    expect(documentPreviewUrl('doc-ref')).toBe(
      'http://localhost:3001/v1/documents/doc-ref/preview',
    );
    expect(
      documentPreviewUrl('doc-ref', {
        searchHit: {
          anchorId: 'vph-1-0-12',
          hitCount: 80,
          hitIndex: 99,
          target: 'body',
        },
      }),
    ).toBe(
      'http://localhost:3001/v1/documents/doc-ref/preview#vault-preview-hit=50&vault-preview-hit-count=50&vault-preview-target=body&vault-preview-anchor=vph-1-0-12',
    );
    expect(
      documentPreviewUrl('doc-ref', {
        searchHit: {
          anchorId: 'raw-query-text',
          hitCount: 1,
          hitIndex: 1,
          target: 'body',
        },
      }),
    ).toBe(
      'http://localhost:3001/v1/documents/doc-ref/preview#vault-preview-hit=1&vault-preview-hit-count=1&vault-preview-target=body',
    );
    expect(documentDownloadUrl('doc-ref', 'casework')).toBe(
      'http://localhost:3001/v1/documents/doc-ref/download?reasonCode=casework',
    );
  });
});
