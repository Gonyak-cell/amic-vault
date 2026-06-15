import { describe, expect, it } from 'vitest';
import {
  createOutlookEmailFilingRequestSchema,
  outlookAttachmentRefSchema,
  outlookItemRefSchema,
} from './outlook-types';

const hash = 'a'.repeat(64);

describe('Outlook add-in DTO contracts', () => {
  it('accepts reference-only message and attachment DTOs', () => {
    expect(
      outlookItemRefSchema.parse({
        mailboxFingerprint: hash,
        outlookItemIdHash: hash,
        internetMessageIdHash: hash,
        canonicalMessageSha256: hash,
        hasExternalParticipants: true,
        participantDomainHashes: [hash],
      }),
    ).toMatchObject({
      mailboxFingerprint: hash,
      canonicalMessageSha256: hash,
    });

    expect(
      outlookAttachmentRefSchema.parse({
        attachmentIdHash: hash,
        ordinal: 0,
        sizeBytes: 42,
        sha256: hash,
        selectedForFiling: true,
      }),
    ).toMatchObject({ ordinal: 0, selectedForFiling: true });
  });

  it('rejects raw Outlook/mailbox/message fields by schema', () => {
    expect(() =>
      createOutlookEmailFilingRequestSchema.parse({
        matterId: '11111111-1111-4111-8111-111111111111',
        message: {
          mailboxFingerprint: hash,
          mailboxAddress: 'lawyer@example.com',
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          subject: 'Privileged memo',
          body: 'Confidential body',
          hasExternalParticipants: false,
          participantDomainHashes: [],
        },
        attachments: [
          {
            attachmentIdHash: hash,
            filename: 'secret.pdf',
            ordinal: 0,
            sizeBytes: 42,
            selectedForFiling: true,
          },
        ],
        sourceClient: 'outlook-web-addin',
        clientRequestId: 'client-1',
        idempotencyKey: 'idem-1',
      }),
    ).toThrow();
  });
});
