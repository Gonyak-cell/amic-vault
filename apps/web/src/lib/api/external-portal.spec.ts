import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptExternalNda,
  createExternalAnswer,
  createExternalLink,
  createExternalQuestion,
  createExternalUser,
  createExternalWorkspace,
  getExternalAccessStatus,
  getExternalDownloadTicket,
  getExternalManifest,
  listExternalWorkspaces,
  listExternalQa,
  listWorkspaceQa,
  reviewExternalAnswer,
  revokeExternalLink,
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

  it('calls internal external-sharing endpoints through the credentialed API client', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const hash = 'a'.repeat(64);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            workspaceId: uuid,
            matterId: uuid,
            workspaceCode: 'EXT-ROOM',
            displayRef: 'Clean Room',
            status: 'active',
            expiresAt: '2026-07-01T00:00:00.000Z',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
            externalUserId: uuid,
            emailHash: hash,
            linkId: uuid,
            documentId: uuid,
            versionId: null,
            ndaRequired: true,
            watermarkRequired: true,
            dlpWarningStatus: 'not_required',
            link: {
              linkId: uuid,
              workspaceId: uuid,
              externalUserId: uuid,
              documentId: uuid,
              versionId: null,
              status: 'active',
              expiresAt: '2026-07-01T00:00:00.000Z',
              ndaRequired: true,
              watermarkRequired: true,
              dlpWarningStatus: 'not_required',
              createdAt: '2026-06-01T00:00:00.000Z',
              updatedAt: '2026-06-01T00:00:00.000Z',
            },
            linkToken: 'x'.repeat(43),
            workspaces: [],
            messages: [],
          }),
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await listExternalWorkspaces(uuid);
    await createExternalWorkspace({
      matterId: uuid,
      workspaceCode: 'EXT-ROOM',
      displayRef: 'Clean Room',
      expiresAt: '2026-07-01T00:00:00.000Z',
    });
    await createExternalUser({ workspaceId: uuid, emailHash: hash, displayRef: 'Recipient' });
    await createExternalLink({
      workspaceId: uuid,
      externalUserId: uuid,
      documentId: uuid,
      expiresAt: '2026-07-01T00:00:00.000Z',
      ndaVersion: 'NDA-R11-V1',
      watermarkRequired: true,
      dlpWarningAccepted: false,
    });
    await revokeExternalLink(uuid);
    await listWorkspaceQa(uuid);
    await createExternalAnswer(uuid, {
      messageText: 'Bounded answer.',
      visibilityScope: 'asker_only',
    });
    await reviewExternalAnswer(uuid, { decision: 'approve' });

    const calls = (fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>).map(
      ([url, init]) => ({ url: String(url), init: init ?? {} }),
    );
    expect(calls.map((call) => call.url)).toEqual([
      `http://localhost:3001/v1/external/workspaces?matterId=${uuid}`,
      'http://localhost:3001/v1/external/workspaces',
      'http://localhost:3001/v1/external/users',
      'http://localhost:3001/v1/external/links',
      `http://localhost:3001/v1/external/links/${uuid}/revoke`,
      `http://localhost:3001/v1/external/workspaces/${uuid}/qa`,
      `http://localhost:3001/v1/external/qa/${uuid}/answers`,
      `http://localhost:3001/v1/external/qa/${uuid}/review`,
    ]);
    expect(calls.every((call) => call.init.credentials === 'include')).toBe(true);
    expect(calls.every((call) => call.init.cache === 'no-store')).toBe(true);
  });
});
