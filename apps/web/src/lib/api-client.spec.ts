import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  assignDocumentSubversionReviewer,
  apiFetch,
  apiFetchFormData,
  createClient,
  createMatterIssue,
  createMatterKeyDate,
  createMatter,
  createMatterParty,
  addDocumentVersion,
  checkInDocumentEditSession,
  createDocumentEditSession,
  createUploadPreflight,
  documentDownloadUrl,
  emailRawDownloadUrl,
  deleteMatterIssue,
  deleteMatterKeyDate,
  forceReleaseDocumentEditSession,
  fileEmailToMatter,
  fetchDocumentPreviewRange,
  fileEmailThreadToMatter,
  getEmailMatterSuggestions,
  getDocument,
  getActiveDocumentEditSession,
  getClient,
  getMatterAppStatus,
  getDocumentEditPackage,
  getNativeDocumentEditDraft,
  issueDocumentPreviewSession,
  addMatterRelatedMatter,
  listClients,
  listDocumentEmailLinks,
  listDocumentVersions,
  listDocumentSubversionReviews,
  listDocumentSubversionReviewers,
  listDocumentSubversions,
  listDocuments,
  listEmailDocumentLinks,
  listMatterConflictChecks,
  listMatterDocuments,
  listMatterIssues,
  listMatterKeyDates,
  listMatterParties,
  listMatterRelatedMatters,
  lookupMatterAppMatters,
  promoteDocumentSubversion,
  resolveMatterConflictCheck,
  removeMatterRelatedMatter,
  revokeDocumentSubversionReviewer,
  runMatterConflictCheck,
  saveDocumentSubversion,
  saveNativeDocumentEditDraft,
  submitDocumentSubversionReview,
  documentEditBaseFileUrl,
  updateClient,
  updateDocumentMetadata,
  updateDocumentStatus,
  updateMatter,
  updateMatterIssue,
  updateMatterKeyDate,
  updateMatterStatus,
  updateParty,
  undoEmailAutofile,
  uploadDocument,
  uploadRawEmailToMatter,
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

    await expect(
      apiFetch('/documents/doc/edit', { redirectOnAuthRequired: false }),
    ).rejects.toMatchObject({
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

  it('uploads raw email through the matter-scoped email endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            email: {
              emailId: '11111111-1111-4111-8111-111111111201',
              tenantId: '11111111-1111-4111-8111-111111111100',
              rawFileObjectId: '11111111-1111-4111-8111-111111111202',
              parser: 'eml',
              parseStatus: 'parsed',
              failureReasonCode: null,
              subject: 'Matter filing receipt',
              sentAt: null,
              receivedAt: null,
              metadataWarningCode: null,
              hasOutsideParticipants: false,
              messageIdHash: 'a'.repeat(64),
              references: [],
              rawSha256: 'b'.repeat(64),
              rawSizeBytes: 10,
              createdBy: '11111111-1111-4111-8111-111111111203',
              createdAt: '2026-07-03T00:00:00.000Z',
            },
            filing: emailFilingResponse(),
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['Subject: 계약 검토'], 'mail.eml', { type: 'message/rfc822' });
    await uploadRawEmailToMatter('11111111-1111-4111-8111-111111111122', file, {
      tenantDomains: ['amic.test', 'client.test'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/matters/11111111-1111-4111-8111-111111111122/emails',
      expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
    );
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined;
    if (!firstCall) throw new Error('missing email upload request');
    const body = firstCall[1]?.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('tenantDomains')).toBe('amic.test,client.test');
  });

  it('calls matter related-matter endpoints with encoded identifiers', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listMatterRelatedMatters('matter/ref');
    await addMatterRelatedMatter('matter/ref', {
      relatedMatterId: '11111111-1111-4111-8111-111111111122',
      relationType: 'parallel',
    });
    await removeMatterRelatedMatter(
      'matter/ref',
      '22222222-2222-4222-8222-222222222222',
      'subsequent',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/matters/matter%2Fref/related-matters',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/matters/matter%2Fref/related-matters',
      expect.objectContaining({
        body: JSON.stringify({
          relatedMatterId: '11111111-1111-4111-8111-111111111122',
          relationType: 'parallel',
        }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/matters/matter%2Fref/related-matters/22222222-2222-4222-8222-222222222222?relationType=subsequent',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('calls matter issue and key-date endpoints with encoded identifiers', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (String(_url).includes('/key-dates')) {
        return new Response(
          JSON.stringify({
            keyDateId: '11111111-1111-4111-8111-111111111333',
            coreKeyDateId: '11111111-1111-4111-8111-111111111333',
            matterId: 'matter/ref',
            title: 'Filing deadline',
            dueDate: '2026-07-10',
            dateType: 'court',
            status: 'pending',
            assignedToUserId: null,
            sourceType: 'core',
            sourceId: '11111111-1111-4111-8111-111111111333',
            mutable: true,
            createdAt: '2026-07-03T00:00:00.000Z',
            updatedAt: '2026-07-03T00:00:00.000Z',
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          issueId: '11111111-1111-4111-8111-111111111222',
          matterId: 'matter/ref',
          title: 'Key risk',
          summary: null,
          status: 'open',
          riskLevel: 'high',
          createdAt: '2026-07-03T00:00:00.000Z',
          updatedAt: '2026-07-03T00:00:00.000Z',
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await listMatterIssues('matter/ref');
    await createMatterIssue('matter/ref', { title: 'Key risk', riskLevel: 'high', status: 'open' });
    await updateMatterIssue('matter/ref', '11111111-1111-4111-8111-111111111222', {
      status: 'monitoring',
    });
    await deleteMatterIssue('matter/ref', '11111111-1111-4111-8111-111111111222');
    await listMatterKeyDates('matter/ref');
    await createMatterKeyDate('matter/ref', {
      title: 'Filing deadline',
      dueDate: '2026-07-10',
      dateType: 'court',
      status: 'pending',
    });
    await updateMatterKeyDate('matter/ref', '11111111-1111-4111-8111-111111111333', {
      status: 'completed',
    });
    await deleteMatterKeyDate('matter/ref', '11111111-1111-4111-8111-111111111333');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/matters/matter%2Fref/issues',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/matters/matter%2Fref/issues',
      expect.objectContaining({
        body: JSON.stringify({ title: 'Key risk', riskLevel: 'high', status: 'open' }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/matters/matter%2Fref/issues/11111111-1111-4111-8111-111111111222',
      expect.objectContaining({
        body: JSON.stringify({ status: 'monitoring' }),
        method: 'PATCH',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3001/v1/matters/matter%2Fref/issues/11111111-1111-4111-8111-111111111222',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://localhost:3001/v1/matters/matter%2Fref/key-dates',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://localhost:3001/v1/matters/matter%2Fref/key-dates',
      expect.objectContaining({
        body: JSON.stringify({
          title: 'Filing deadline',
          dueDate: '2026-07-10',
          dateType: 'court',
          status: 'pending',
        }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'http://localhost:3001/v1/matters/matter%2Fref/key-dates/11111111-1111-4111-8111-111111111333',
      expect.objectContaining({
        body: JSON.stringify({ status: 'completed' }),
        method: 'PATCH',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'http://localhost:3001/v1/matters/matter%2Fref/key-dates/11111111-1111-4111-8111-111111111333',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('loads email Matter suggestions and files an uploaded email', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (String(_url).includes('/autofile/undo')) {
        const filing = emailFilingResponse();
        return new Response(JSON.stringify({ items: [filing], threads: [emailThreadResponse(filing)] }));
      }
      if (String(_url).includes('/email-threads/')) {
        const filing = emailFilingResponse();
        return new Response(JSON.stringify({ items: [filing], threads: [emailThreadResponse(filing)] }));
      }
      if (init?.method === 'POST') return new Response(JSON.stringify(emailFilingResponse()));
      return new Response(
        JSON.stringify({
          items: [
            {
              matterId: '11111111-1111-4111-8111-111111111122',
              matterCode: 'AMIC-2026-0001',
              matterName: 'Investment Advisory',
              clientId: '11111111-1111-4111-8111-111111111133',
              reasonCodes: ['subject'],
              score: 70,
              confidence: 83,
              confidenceBand: 'confirm',
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getEmailMatterSuggestions('11111111-1111-4111-8111-111111111201', { limit: 5 }),
    ).resolves.toMatchObject({ items: [{ matterCode: 'AMIC-2026-0001' }] });
    await expect(
      fileEmailToMatter('11111111-1111-4111-8111-111111111201', {
        matterId: '11111111-1111-4111-8111-111111111122',
      }),
    ).resolves.toMatchObject({ subject: 'Matter filing receipt' });
    await expect(
      fileEmailThreadToMatter('11111111-1111-4111-8111-1111111112ab', {
        matterId: '11111111-1111-4111-8111-111111111122',
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ subject: 'Matter filing receipt' })] });
    await expect(
      undoEmailAutofile('11111111-1111-4111-8111-111111111201', {
        matterId: '11111111-1111-4111-8111-111111111122',
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ subject: 'Matter filing receipt' })] });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/emails/11111111-1111-4111-8111-111111111201/matter-suggestions?limit=5',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/emails/11111111-1111-4111-8111-111111111201/file',
      expect.objectContaining({
        body: JSON.stringify({ matterId: '11111111-1111-4111-8111-111111111122' }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/email-threads/11111111-1111-4111-8111-1111111112ab/file',
      expect.objectContaining({
        body: JSON.stringify({ matterId: '11111111-1111-4111-8111-111111111122' }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3001/v1/emails/11111111-1111-4111-8111-111111111201/autofile/undo',
      expect.objectContaining({
        body: JSON.stringify({ matterId: '11111111-1111-4111-8111-111111111122' }),
        method: 'POST',
      }),
    );
  });

  it('loads direct email-document links and builds raw email download URLs', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              linkId: '11111111-1111-4111-8111-111111111301',
              tenantId: '11111111-1111-4111-8111-111111111100',
              emailId: '11111111-1111-4111-8111-111111111201',
              documentId: '11111111-1111-4111-8111-111111111202',
              fileObjectId: '11111111-1111-4111-8111-111111111203',
              attachmentIndex: 0,
              attachmentFilename: 'attachment.pdf',
              mediaType: 'application/pdf',
              sizeBytes: 128,
              sha256: 'a'.repeat(64),
              createdAt: '2026-07-03T00:00:00.000Z',
            },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listDocumentEmailLinks('11111111-1111-4111-8111-111111111202'),
    ).resolves.toMatchObject([{ emailId: '11111111-1111-4111-8111-111111111201' }]);
    await expect(
      listEmailDocumentLinks('11111111-1111-4111-8111-111111111201'),
    ).resolves.toMatchObject([{ documentId: '11111111-1111-4111-8111-111111111202' }]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/11111111-1111-4111-8111-111111111202/email-links',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/emails/11111111-1111-4111-8111-111111111201/document-links',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(emailRawDownloadUrl('11111111-1111-4111-8111-111111111201', 'casework')).toBe(
      'http://localhost:3001/v1/emails/11111111-1111-4111-8111-111111111201/raw?reasonCode=casework',
    );
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
            lastSyncAt: '2026-06-20T00:00:00.000Z',
            reflectedCount: 5,
            driftCount: 0,
            syncStateAvailable: true,
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
              lastSyncAt: '2026-06-20T00:00:00.000Z',
              reflectedCount: 5,
              driftCount: 0,
              syncStateAvailable: true,
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

  it('loads and updates document detail metadata and status through document endpoints', async () => {
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documentId: 'doc-ref',
            tenantId: 'tenant-ref',
            matterId: 'matter-ref',
            documentFamilyId: 'family-ref',
            title: 'Updated',
            status: 'counterparty_sent',
            documentType: 'memo',
            subtype: 'closing',
            confidentialityLevel: 'high',
            privilegeStatus: 'none',
            legalHold: false,
            createdBy: 'user-ref',
            createdAt: '2026-06-18T00:00:00.000Z',
            updatedAt: '2026-06-18T00:00:02.000Z',
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
    await updateDocumentStatus('doc-ref', { status: 'counterparty_sent' });

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
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/documents/doc-ref/status',
      expect.objectContaining({
        body: JSON.stringify({ status: 'counterparty_sent' }),
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
      baseCleanVersionId: '11111111-1111-4111-8111-111111111155',
      duplicateDecision: 'new_version',
      renditionType: 'markup',
      versionLabel: 'Counterparty markup v2',
      versionSignificance: 'counterparty_sent',
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
    expect(body.get('baseCleanVersionId')).toBe('11111111-1111-4111-8111-111111111155');
    expect(body.get('duplicateDecision')).toBe('new_version');
    expect(body.get('renditionType')).toBe('markup');
    expect(body.get('versionLabel')).toBe('Counterparty markup v2');
    expect(body.get('versionSignificance')).toBe('counterparty_sent');
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
            editSessionId: 'session-ref',
            documentId: 'doc-ref',
            baseVersionId: 'version-ref',
            baseVersionNo: 2,
            status: 'cancelled',
            clientKind: 'web_upload',
            lockOwnerUserId: 'user-ref',
            checkedOutAt: '2026-06-18T00:00:00.000Z',
            heartbeatAt: '2026-06-18T00:05:00.000Z',
            expiresAt: '2026-06-18T01:05:00.000Z',
            checkedInAt: null,
            cancelledAt: '2026-06-18T00:06:30.000Z',
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
      lockToken: 'lock-token-2026',
      saveReasonCode: 'MANUAL_SAVE',
      visibilityScope: 'matter_editors',
    });
    await listDocumentSubversions('doc-ref');
    await checkInDocumentEditSession('doc-ref', 'session-ref', {
      expectedLastSubversionId: 'subversion-ref',
      lockToken: 'lock-token-2026',
    });
    await forceReleaseDocumentEditSession('doc-ref', 'session-ref', {
      forceReleaseReasonCode: 'OWNER_FORCE_RELEASE',
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
    expect(subversionBody.get('lockToken')).toBe('lock-token-2026');
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
        body: JSON.stringify({
          expectedLastSubversionId: 'subversion-ref',
          lockToken: 'lock-token-2026',
        }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://localhost:3001/v1/documents/doc-ref/edit-sessions/session-ref/force-release',
      expect.objectContaining({
        body: JSON.stringify({
          forceReleaseReasonCode: 'OWNER_FORCE_RELEASE',
        }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
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
      lockToken: 'lock-token-2026',
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
          lockToken: 'lock-token-2026',
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

  it('issues a session before previewing and keeps its opaque token out of the URL', async () => {
    const session = {
      previewSessionId: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2026-07-22T00:05:00.000Z',
      token: '1234567890123456789012345678901234567890123',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 201 }))
      .mockResolvedValueOnce(
        new Response('preview', {
          headers: { 'content-range': 'bytes 0-6/7' },
          status: 206,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(issueDocumentPreviewSession('doc-ref')).resolves.toEqual(session);
    await expect(fetchDocumentPreviewRange('doc-ref', session, 'bytes=0-6')).resolves.toBeInstanceOf(
      Response,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/documents/doc-ref/preview-sessions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/documents/doc-ref/preview',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        headers: {
          range: 'bytes=0-6',
          'x-amic-preview-session': session.previewSessionId,
          'x-amic-preview-token': session.token,
        },
      }),
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain(session.token);
    expect(documentDownloadUrl('doc-ref', 'casework')).toBe(
      'http://localhost:3001/v1/documents/doc-ref/download?reasonCode=casework',
    );
  });

  it('lists and mutates matter parties through encoded party endpoints', async () => {
    const party = {
      createdAt: '2026-07-02T00:00:00.000Z',
      createdBy: 'user-ref',
      isRestricted: false,
      matterId: 'matter/ref',
      name: 'Hanbit Electronics',
      partyId: 'party/ref',
      partyRole: 'counterparty',
      partyType: 'corporation',
      relatedClientId: null,
      tenantId: 'tenant-ref',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [party] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(party), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...party, isRestricted: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...party,
            name: 'Hanbit Holdings',
            partyRole: 'witness',
            partyType: 'individual',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await listMatterParties('matter/ref', { isRestricted: false, partyRole: 'counterparty' });
    await createMatterParty('matter/ref', {
      name: 'Hanbit Electronics',
      partyRole: 'counterparty',
      partyType: 'corporation',
    });
    await updateParty('party/ref', { isRestricted: true });
    await updateParty('party/ref', {
      name: 'Hanbit Holdings',
      partyRole: 'witness',
      partyType: 'individual',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/matters/matter%2Fref/parties?isRestricted=false&partyRole=counterparty',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/matters/matter%2Fref/parties',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Hanbit Electronics',
          partyRole: 'counterparty',
          partyType: 'corporation',
        }),
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/parties/party%2Fref',
      expect.objectContaining({
        body: JSON.stringify({ isRestricted: true }),
        method: 'PATCH',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3001/v1/parties/party%2Fref',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Hanbit Holdings',
          partyRole: 'witness',
          partyType: 'individual',
        }),
        method: 'PATCH',
      }),
    );
  });

  it('creates matters through the existing matter API', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            clientId: '11111111-1111-4111-8111-111111111111',
            createdAt: '2026-07-02T00:00:00.000Z',
            createdBy: '11111111-1111-4111-8111-111111111112',
            displayName: '신규 자문',
            legalHold: false,
            matterCode: 'AMIC-2026-1001',
            matterId: '11111111-1111-4111-8111-111111111122',
            matterName: '신규 자문',
            matterType: 'advisory',
            metadata: {},
            openedAt: null,
            closedAt: null,
            practiceGroup: null,
            safeLabel: '신규 자문',
            status: 'proposed',
            tenantId: '11111111-1111-4111-8111-111111111100',
            updatedAt: '2026-07-02T00:00:00.000Z',
            leadLawyerId: null,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createMatter({
      clientId: '11111111-1111-4111-8111-111111111111',
      matterCode: 'AMIC-2026-1001',
      matterName: '신규 자문',
      matterType: 'advisory',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/matters',
      expect.objectContaining({
        body: JSON.stringify({
          clientId: '11111111-1111-4111-8111-111111111111',
          matterCode: 'AMIC-2026-1001',
          matterName: '신규 자문',
          matterType: 'advisory',
        }),
        method: 'POST',
      }),
    );
  });

  it('updates matter access scope through encoded paths', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            accessScope: 'restricted',
            clientId: '11111111-1111-4111-8111-111111111111',
            createdAt: '2026-07-02T00:00:00.000Z',
            createdBy: '11111111-1111-4111-8111-111111111112',
            displayName: '신규 자문',
            legalHold: false,
            matterCode: 'AMIC-2026-1001',
            matterId: 'matter/ref',
            matterName: '신규 자문',
            matterType: 'advisory',
            metadata: {},
            openedAt: null,
            closedAt: null,
            practiceGroup: null,
            safeLabel: '신규 자문',
            status: 'proposed',
            tenantId: '11111111-1111-4111-8111-111111111100',
            updatedAt: '2026-07-02T00:00:00.000Z',
            leadLawyerId: null,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updateMatter('matter/ref', { accessScope: 'restricted' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/matters/matter%2Fref',
      expect.objectContaining({
        body: JSON.stringify({ accessScope: 'restricted' }),
        method: 'PATCH',
      }),
    );
  });

  it('updates matter status and conflict checks through encoded matter endpoints', async () => {
    const conflictCheck = {
      conflictCheckId: 'check/ref',
      matterId: 'matter/ref',
      status: 'in_review',
      targetNames: [],
      candidates: [],
      createdBy: 'user-ref',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
      resolvedBy: null,
      resolvedAt: null,
      resolutionRationale: null,
    };
    const matter = {
      accessScope: 'firm_open',
      clientId: 'client/ref',
      conflictsStatus: 'cleared',
      createdAt: '2026-07-02T00:00:00.000Z',
      createdBy: 'user-ref',
      legalHold: false,
      matterCode: 'AMIC-2026-1001',
      matterId: 'matter/ref',
      matterName: '신규 자문',
      matterType: 'advisory',
      metadata: {},
      openedAt: null,
      closedAt: null,
      practiceGroup: null,
      safeLabel: '신규 자문',
      status: 'open',
      tenantId: 'tenant/ref',
      updatedAt: '2026-07-02T00:00:00.000Z',
      leadLawyerId: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(matter), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [conflictCheck] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(conflictCheck), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...conflictCheck,
            status: 'cleared',
            resolutionRationale: '내부 검토 완료',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await updateMatterStatus('matter/ref', { status: 'open' });
    await listMatterConflictChecks('matter/ref');
    await runMatterConflictCheck('matter/ref');
    await resolveMatterConflictCheck('matter/ref', 'check/ref', {
      status: 'cleared',
      rationale: '내부 검토 완료',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/matters/matter%2Fref/status',
      expect.objectContaining({
        body: JSON.stringify({ status: 'open' }),
        method: 'PATCH',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/matters/matter%2Fref/conflict-checks',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/v1/matters/matter%2Fref/conflict-checks',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3001/v1/matters/matter%2Fref/conflict-checks/check%2Fref',
      expect.objectContaining({
        body: JSON.stringify({ status: 'cleared', rationale: '내부 검토 완료' }),
        method: 'PATCH',
      }),
    );
  });

  it('lists clients with bounded query parameters', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [],
            page: 1,
            pageSize: 20,
            totalCount: 0,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listClients({ pageSize: 20, q: '한빛' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/clients?pageSize=20&q=%ED%95%9C%EB%B9%9B',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('creates clients through the client API with aliases', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            aliases: ['한빛전자'],
            clientId: '11111111-1111-4111-8111-111111111111',
            clientType: 'corporation',
            confidentialityLevel: 'standard',
            createdAt: '2026-07-02T00:00:00.000Z',
            createdBy: '11111111-1111-4111-8111-111111111112',
            displayName: 'Hanbit Electronics',
            metadata: {},
            name: 'Hanbit Electronics',
            safeLabel: 'Hanbit Electronics',
            status: 'active',
            tenantId: '11111111-1111-4111-8111-111111111100',
            updatedAt: '2026-07-02T00:00:00.000Z',
          }),
          { status: 201 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createClient({
      aliases: ['한빛전자'],
      clientType: 'corporation',
      confidentialityLevel: 'standard',
      name: 'Hanbit Electronics',
      status: 'active',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/clients',
      expect.objectContaining({
        body: JSON.stringify({
          aliases: ['한빛전자'],
          clientType: 'corporation',
          confidentialityLevel: 'standard',
          name: 'Hanbit Electronics',
          status: 'active',
        }),
        method: 'POST',
      }),
    );
  });

  it('reads and updates individual clients through encoded paths', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            aliases: [],
            clientId: 'client/ref',
            clientType: 'corporation',
            confidentialityLevel: 'high',
            createdAt: '2026-07-02T00:00:00.000Z',
            createdBy: null,
            displayName: 'Client',
            metadata: {},
            name: 'Client',
            safeLabel: 'Client',
            status: 'active',
            tenantId: '11111111-1111-4111-8111-111111111100',
            updatedAt: '2026-07-02T00:00:00.000Z',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getClient('client/ref');
    await updateClient('client/ref', { aliases: ['Old Client'], status: 'dormant' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/v1/clients/client%2Fref',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/v1/clients/client%2Fref',
      expect.objectContaining({
        body: JSON.stringify({ aliases: ['Old Client'], status: 'dormant' }),
        method: 'PATCH',
      }),
    );
  });
});

function emailFilingResponse() {
  return {
    filingId: '11111111-1111-4111-8111-111111111221',
    tenantId: '11111111-1111-4111-8111-111111111100',
    emailId: '11111111-1111-4111-8111-111111111201',
    matterId: '11111111-1111-4111-8111-111111111122',
    subject: 'Matter filing receipt',
    sentAt: null,
    hasOutsideParticipants: false,
    warningCodes: [],
    participantClasses: [],
    privilegeTagSuggestion: null,
    thread: {
      threadId: '11111111-1111-4111-8111-1111111112ab',
      rootMessageHash: 'c'.repeat(64),
      conversationIdHash: null,
      directReferenceCount: 0,
      relatedEmailCount: 0,
      referenceHashes: [],
    },
    documentIds: [],
    filedBy: '11111111-1111-4111-8111-111111111203',
    filedAt: '2026-07-03T00:00:00.000Z',
  };
}

function emailThreadResponse(filing: ReturnType<typeof emailFilingResponse>) {
  return {
    threadId: filing.thread.threadId,
    rootMessageHash: filing.thread.rootMessageHash,
    conversationIdHash: filing.thread.conversationIdHash,
    relatedEmailCount: 1,
    filedEmailCount: 1,
    documentIds: filing.documentIds,
    latestFiledAt: filing.filedAt,
    items: [filing],
  };
}
