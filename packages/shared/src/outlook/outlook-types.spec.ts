import { describe, expect, it } from 'vitest';
import {
  acquireOutlookGraphAttachmentSchema,
  createOutlookDocumentInsertionSchema,
  createOutlookSendFileRequestSchema,
  createOutlookEmailFilingRequestSchema,
  createOutlookFolderMappingSchema,
  evaluateOutlookSendPolicySchema,
  matterSuggestionQuerySchema,
  outlookAddinSessionExchangeSchema,
  outlookAttachmentRefSchema,
  outlookItemRefSchema,
  updateOutlookFolderMappingSchema,
} from './outlook-types';
import {
  outlookApprovedGraphScopeRegistry,
  outlookApprovedScopeNames,
  outlookRejectedGraphScopes,
} from './outlook-graph-scopes';

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

  it('accepts matter suggestion inputs only as bounded hashes', () => {
    expect(
      matterSuggestionQuerySchema.parse({
        sourceClient: 'outlook-web-addin',
        mailboxFingerprint: hash,
        participantDomainHashes: [hash],
        subjectHash: hash,
        conversationIdHash: hash,
        limit: 5,
      }),
    ).toMatchObject({
      mailboxFingerprint: hash,
      participantDomainHashes: [hash],
      limit: 5,
    });
  });

  it('rejects raw matter suggestion subject, mailbox, and domain fields', () => {
    expect(() =>
      matterSuggestionQuerySchema.parse({
        sourceClient: 'outlook-web-addin',
        mailboxFingerprint: hash,
        mailboxAddress: 'lawyer@example.com',
        participantDomainHashes: [hash],
        participantDomains: ['example.com'],
        subject: 'Privileged subject',
        limit: 5,
      }),
    ).toThrow();
  });

  it('accepts add-in session exchange while keeping identity out of responses', () => {
    expect(
      outlookAddinSessionExchangeSchema.parse({
        sourceClient: 'outlook-web-addin',
        mailboxFingerprint: hash,
        identityAssertion: 'synthetic.identity.assertion',
        clientRequestId: 'session-client-1',
      }),
    ).toMatchObject({
      sourceClient: 'outlook-web-addin',
      mailboxFingerprint: hash,
      clientRequestId: 'session-client-1',
    });
  });

  it('rejects token aliases and mailbox addresses in add-in session exchange', () => {
    expect(() =>
      outlookAddinSessionExchangeSchema.parse({
        sourceClient: 'outlook-web-addin',
        mailboxFingerprint: hash,
        identityAssertion: 'synthetic.identity.assertion',
        accessToken: 'secret',
        idToken: 'secret',
        mailboxAddress: 'lawyer@example.com',
        clientRequestId: 'session-client-1',
      }),
    ).toThrow();
  });

  it('accepts Graph attachment acquisition refs without raw Graph IDs', () => {
    expect(
      acquireOutlookGraphAttachmentSchema.parse({
        sourceClient: 'outlook-web-addin',
        addinSessionId: '11111111-1111-4111-8111-111111111111',
        filingRequestId: '11111111-1111-4111-8111-111111111112',
        message: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: false,
          participantDomainHashes: [],
        },
        attachment: {
          attachmentIdHash: hash,
          ordinal: 0,
          sizeBytes: 42,
          selectedForFiling: true,
        },
        clientRequestId: 'graph-client-1',
      }),
    ).toMatchObject({
      addinSessionId: '11111111-1111-4111-8111-111111111111',
      filingRequestId: '11111111-1111-4111-8111-111111111112',
    });
  });

  it('rejects raw Graph attachment IDs and token values', () => {
    expect(() =>
      acquireOutlookGraphAttachmentSchema.parse({
        sourceClient: 'outlook-web-addin',
        addinSessionId: '11111111-1111-4111-8111-111111111111',
        filingRequestId: '11111111-1111-4111-8111-111111111112',
        rawGraphMessageId: 'AAMkAGRl...',
        accessToken: 'secret',
        message: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: false,
          participantDomainHashes: [],
        },
        attachment: {
          attachmentIdHash: hash,
          graphAttachmentId: 'AAMkAttachment',
          filename: 'secret.pdf',
          ordinal: 0,
          sizeBytes: 42,
          selectedForFiling: true,
        },
        clientRequestId: 'graph-client-1',
      }),
    ).toThrow();
  });

  it('keeps the Graph scope registry least-privileged for attachment acquisition', () => {
    expect(outlookApprovedScopeNames()).toEqual(['openid', 'profile', 'offline_access', 'Mail.Read']);
    expect(outlookApprovedGraphScopeRegistry).toContainEqual(
      expect.objectContaining({
        scope: 'Mail.Read',
        resource: 'microsoft-graph',
        permissionType: 'delegated',
        purpose: 'attachment_acquisition',
        leastPrivilege: true,
      }),
    );
    expect(outlookRejectedGraphScopes).toContain('Mail.ReadWrite');
    expect(outlookRejectedGraphScopes).toContain('Mail.Send');
  });

  it('accepts Smart Alert policy decisions with hash-only message context', () => {
    expect(
      evaluateOutlookSendPolicySchema.parse({
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
        clientRequestId: 'send-policy-1',
      }),
    ).toMatchObject({
      matterId: '11111111-1111-4111-8111-111111111111',
      subjectHash: hash,
    });
  });

  it('rejects raw Smart Alert subject, body, recipients, and filenames', () => {
    expect(() =>
      evaluateOutlookSendPolicySchema.parse({
        sourceClient: 'outlook-web-addin',
        message: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: true,
          participantDomainHashes: [hash],
          subject: 'Settlement draft',
          body: 'Privileged body',
          to: ['counterparty@example.com'],
        },
        attachments: [
          {
            attachmentIdHash: hash,
            filename: 'privileged.pdf',
            ordinal: 0,
            sizeBytes: 42,
            selectedForFiling: true,
          },
        ],
        clientRequestId: 'send-policy-1',
      }),
    ).toThrow();
  });

  it('accepts send-and-file requests only with bounded warning acknowledgements', () => {
    expect(
      createOutlookSendFileRequestSchema.parse({
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
        clientRequestId: 'send-file-1',
        idempotencyKey: 'send-file-idem-1',
        acknowledgedWarningCodes: ['external_recipient', 'wrong_matter'],
      }),
    ).toMatchObject({
      acknowledgedWarningCodes: ['external_recipient', 'wrong_matter'],
    });
  });

  it('accepts document insertion requests with hash-only target message refs', () => {
    expect(
      createOutlookDocumentInsertionSchema.parse({
        sourceClient: 'outlook-web-addin',
        documentId: '11111111-1111-4111-8111-111111111111',
        versionId: '11111111-1111-4111-8111-111111111112',
        targetMessage: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          hasExternalParticipants: false,
          participantDomainHashes: [hash],
        },
        insertionMode: 'internal-reference',
        hasExternalRecipients: false,
        clientRequestId: 'oa08-insert-1',
        idempotencyKey: 'oa08-insert-idem-1',
      }),
    ).toMatchObject({
      documentId: '11111111-1111-4111-8111-111111111111',
      insertionMode: 'internal-reference',
    });
  });

  it('rejects raw document insertion target data and filenames', () => {
    expect(() =>
      createOutlookDocumentInsertionSchema.parse({
        sourceClient: 'outlook-web-addin',
        documentId: '11111111-1111-4111-8111-111111111111',
        targetMessage: {
          mailboxFingerprint: hash,
          outlookItemIdHash: hash,
          canonicalMessageSha256: hash,
          subject: 'Privileged insert target',
          body: 'Confidential body',
          to: ['counterparty@example.com'],
          hasExternalParticipants: false,
          participantDomainHashes: [],
        },
        insertionMode: 'attach-copy',
        hasExternalRecipients: true,
        filename: 'vault-document.pdf',
        clientRequestId: 'oa08-insert-1',
        idempotencyKey: 'oa08-insert-idem-1',
      }),
    ).toThrow();
  });

  it('accepts folder mappings only as hash-only folder refs', () => {
    expect(
      createOutlookFolderMappingSchema.parse({
        sourceClient: 'outlook-web-addin',
        matterId: '11111111-1111-4111-8111-111111111111',
        mailboxFingerprint: hash,
        folderRefHash: hash,
        folderPathHash: hash,
        mappingMode: 'manual',
        autoFileRequested: false,
        clientRequestId: 'oa09-folder-1',
        idempotencyKey: 'oa09-folder-idem-1',
      }),
    ).toMatchObject({
      matterId: '11111111-1111-4111-8111-111111111111',
      folderRefHash: hash,
      mappingMode: 'manual',
      autoFileRequested: false,
    });
  });

  it('rejects raw folder mapping names, paths, mailbox addresses, and Graph IDs', () => {
    expect(() =>
      createOutlookFolderMappingSchema.parse({
        sourceClient: 'outlook-web-addin',
        matterId: '11111111-1111-4111-8111-111111111111',
        mailboxFingerprint: hash,
        mailboxAddress: 'lawyer@example.com',
        folderRefHash: hash,
        folderName: 'Project Alpha Confidential',
        folderPath: 'Inbox/Project Alpha Confidential',
        graphFolderId: 'AAMkFolderId',
        clientRequestId: 'oa09-folder-1',
        idempotencyKey: 'oa09-folder-idem-1',
      }),
    ).toThrow();
  });

  it('accepts bounded folder mapping approval decisions', () => {
    expect(
      updateOutlookFolderMappingSchema.parse({
        approvalDecision: 'approve',
        autoFileEnabled: false,
        clientRequestId: 'oa09-approve-1',
      }),
    ).toMatchObject({
      approvalDecision: 'approve',
      autoFileEnabled: false,
    });
  });

  it('models admin integration status without evidence ref values', () => {
    const status = {
      provider: 'outlook',
      operationalGateEnforced: true,
      rolloutRing: 'R1_PILOT_PRACTICE',
      auditAvailable: true,
      features: [
        {
          feature: 'SEND_FILE',
          configured: true,
          allowed: true,
        },
      ],
      evidence: [
        {
          kind: 'EV-OUTLOOK-002',
          present: true,
          validFormat: true,
        },
      ],
      generatedAt: '2026-06-17T00:00:00.000Z',
    };

    expect(JSON.stringify(status)).not.toContain('EVREF-OUTLOOK-002');
    expect(status.evidence[0]).toEqual({
      kind: 'EV-OUTLOOK-002',
      present: true,
      validFormat: true,
    });
  });
});
