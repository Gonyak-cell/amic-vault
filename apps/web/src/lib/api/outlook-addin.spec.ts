import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import {
  createOutlookDocumentInsertion,
  createOutlookFolderMapping,
  createOutlookSendFileRequest,
  createOutlookFilingRequest,
  evaluateOutlookSendPolicy,
  getOutlookFilingRequestStatus,
  getOutlookIntegrationAdminStatus,
  getOutlookMatterSuggestions,
  searchOutlookInsertableDocuments,
  updateOutlookFolderMapping,
} from './outlook-addin';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async () => ({ items: [] })),
}));

const hash = 'a'.repeat(64);

describe('Outlook add-in API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts hash-only matter suggestion queries without auth redirects', async () => {
    await getOutlookMatterSuggestions({
      sourceClient: 'outlook-web-addin',
      mailboxFingerprint: hash,
      participantDomainHashes: [hash],
      subjectHash: hash,
      limit: 5,
    });

    expect(apiFetch).toHaveBeenCalledWith('/search/matter-suggestions', {
      method: 'POST',
      body: JSON.stringify({
        sourceClient: 'outlook-web-addin',
        mailboxFingerprint: hash,
        participantDomainHashes: [hash],
        subjectHash: hash,
        limit: 5,
      }),
      redirectOnAuthRequired: false,
    });
  });

  it('searches insertable documents through permission-bound search without auth redirects', async () => {
    await searchOutlookInsertableDocuments({
      query: 'closing',
      mode: 'keyword',
      filters: { versionStatus: 'current' },
      page: 1,
      pageSize: 5,
    });

    expect(apiFetch).toHaveBeenCalledWith('/search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'closing',
        mode: 'keyword',
        filters: { versionStatus: 'current' },
        page: 1,
        pageSize: 5,
      }),
      redirectOnAuthRequired: false,
    });
  });

  it('creates and reads filing requests through the gated M365 endpoints', async () => {
    await createOutlookFilingRequest({
      matterId: '11111111-1111-4111-8111-111111111111',
      message: {
        mailboxFingerprint: hash,
        outlookItemIdHash: hash,
        canonicalMessageSha256: hash,
        hasExternalParticipants: false,
        participantDomainHashes: [],
      },
      attachments: [],
      sourceClient: 'outlook-web-addin',
      clientRequestId: 'oa05:test',
      idempotencyKey: `oa05:${hash}`,
    });
    await getOutlookFilingRequestStatus('11111111-1111-4111-8111-111111111112');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/m365/outlook/filing-requests', {
      method: 'POST',
      body: JSON.stringify({
        matterId: '11111111-1111-4111-8111-111111111111',
        message: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: false,
          participantDomainHashes: [],
        },
        attachments: [],
        sourceClient: 'outlook-web-addin',
        clientRequestId: 'oa05:test',
        idempotencyKey: `oa05:${hash}`,
      }),
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/m365/outlook/filing-requests/11111111-1111-4111-8111-111111111112',
      {
        redirectOnAuthRequired: false,
      },
    );
  });

  it('reads the admin integration status through the app-authenticated route', async () => {
    await getOutlookIntegrationAdminStatus();

    expect(apiFetch).toHaveBeenCalledWith('/m365/outlook/admin-status');
  });

  it('posts Smart Alert policy and send-and-file requests without auth redirects', async () => {
    await evaluateOutlookSendPolicy({
      sourceClient: 'outlook-web-addin',
      matterId: '11111111-1111-4111-8111-111111111111',
      message: {
        mailboxFingerprint: hash,
        outlookItemIdHash: hash,
        canonicalMessageSha256: hash,
        hasExternalParticipants: true,
        participantDomainHashes: [hash],
      },
      attachments: [],
      subjectHash: hash,
      clientRequestId: 'oa07:policy',
    });
    await createOutlookSendFileRequest({
      sourceClient: 'outlook-web-addin',
      matterId: '11111111-1111-4111-8111-111111111111',
      message: {
        mailboxFingerprint: hash,
        outlookItemIdHash: hash,
        canonicalMessageSha256: hash,
        hasExternalParticipants: true,
        participantDomainHashes: [hash],
      },
      attachments: [],
      subjectHash: hash,
      clientRequestId: 'oa07:file',
      idempotencyKey: `oa07:${hash}`,
      acknowledgedWarningCodes: ['external_recipient'],
    });

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/m365/outlook/send-policy-decisions', {
      method: 'POST',
      body: JSON.stringify({
        sourceClient: 'outlook-web-addin',
        matterId: '11111111-1111-4111-8111-111111111111',
        message: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: true,
          participantDomainHashes: [hash],
        },
        attachments: [],
        subjectHash: hash,
        clientRequestId: 'oa07:policy',
      }),
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/m365/outlook/send-file-requests', {
      method: 'POST',
      body: JSON.stringify({
        sourceClient: 'outlook-web-addin',
        matterId: '11111111-1111-4111-8111-111111111111',
        message: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: true,
          participantDomainHashes: [hash],
        },
        attachments: [],
        subjectHash: hash,
        clientRequestId: 'oa07:file',
        idempotencyKey: `oa07:${hash}`,
        acknowledgedWarningCodes: ['external_recipient'],
      }),
      redirectOnAuthRequired: false,
    });
  });

  it('posts document insertion requests through the gated M365 endpoint', async () => {
    await createOutlookDocumentInsertion({
      sourceClient: 'outlook-web-addin',
      documentId: '11111111-1111-4111-8111-111111111111',
      versionId: '11111111-1111-4111-8111-111111111112',
      targetMessage: {
        mailboxFingerprint: hash,
        outlookItemIdHash: hash,
        canonicalMessageSha256: hash,
        hasExternalParticipants: false,
        participantDomainHashes: [],
      },
      insertionMode: 'internal-reference',
      hasExternalRecipients: false,
      clientRequestId: 'oa08:insert',
      idempotencyKey: `oa08:${hash}`,
    });

    expect(apiFetch).toHaveBeenLastCalledWith('/m365/outlook/document-insertions', {
      method: 'POST',
      body: JSON.stringify({
        sourceClient: 'outlook-web-addin',
        documentId: '11111111-1111-4111-8111-111111111111',
        versionId: '11111111-1111-4111-8111-111111111112',
        targetMessage: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: false,
          participantDomainHashes: [],
        },
        insertionMode: 'internal-reference',
        hasExternalRecipients: false,
        clientRequestId: 'oa08:insert',
        idempotencyKey: `oa08:${hash}`,
      }),
      redirectOnAuthRequired: false,
    });
  });

  it('posts folder mapping creation and approval through the gated M365 endpoints', async () => {
    await createOutlookFolderMapping({
      sourceClient: 'outlook-web-addin',
      matterId: '11111111-1111-4111-8111-111111111111',
      mailboxFingerprint: hash,
      folderRefHash: hash,
      folderPathHash: hash,
      mappingMode: 'manual',
      autoFileRequested: false,
      clientRequestId: 'oa09:folder',
      idempotencyKey: `oa09:${hash}`,
    });
    await updateOutlookFolderMapping('11111111-1111-4111-8111-111111111112', {
      approvalDecision: 'approve',
      autoFileEnabled: false,
      clientRequestId: 'oa09:approve',
    });

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/m365/outlook/folder-mappings', {
      method: 'POST',
      body: JSON.stringify({
        sourceClient: 'outlook-web-addin',
        matterId: '11111111-1111-4111-8111-111111111111',
        mailboxFingerprint: hash,
        folderRefHash: hash,
        folderPathHash: hash,
        mappingMode: 'manual',
        autoFileRequested: false,
        clientRequestId: 'oa09:folder',
        idempotencyKey: `oa09:${hash}`,
      }),
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/m365/outlook/folder-mappings/11111111-1111-4111-8111-111111111112',
      {
        method: 'PATCH',
        body: JSON.stringify({
          approvalDecision: 'approve',
          autoFileEnabled: false,
          clientRequestId: 'oa09:approve',
        }),
        redirectOnAuthRequired: false,
      },
    );
  });
});
