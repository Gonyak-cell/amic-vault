import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import {
  createOutlookFilingRequest,
  getOutlookFilingRequestStatus,
  getOutlookMatterSuggestions,
} from './outlook-addin';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async () => ({ items: [] })),
}));

const hash = 'a'.repeat(64);

describe('Outlook add-in API client', () => {
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

    expect(apiFetch).toHaveBeenNthCalledWith(2, '/m365/outlook/filing-requests', {
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
      3,
      '/m365/outlook/filing-requests/11111111-1111-4111-8111-111111111112',
      {
        redirectOnAuthRequired: false,
      },
    );
  });
});
