import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateOutlookDocumentInsertionDto } from '@amic-vault/shared';
import { OutlookDocumentInsertionService } from './outlook-document-insertion.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111101';
const documentId = '11111111-1111-4111-8111-111111111201';
const versionId = '11111111-1111-4111-8111-111111111202';
const matterId = '11111111-1111-4111-8111-111111111301';
const insertionId = '11111111-1111-4111-8111-111111111401';
const hash = 'a'.repeat(64);
const secondHash = 'b'.repeat(64);
const now = new Date('2026-06-16T00:00:00.000Z');

function insertionInput(
  overrides: Partial<CreateOutlookDocumentInsertionDto> = {},
): CreateOutlookDocumentInsertionDto {
  return {
    sourceClient: 'outlook-web-addin',
    documentId,
    versionId,
    targetMessage: {
      mailboxFingerprint: hash,
      outlookItemIdHash: secondHash,
      canonicalMessageSha256: hash,
      hasExternalParticipants: false,
      participantDomainHashes: [],
    },
    insertionMode: 'internal-reference',
    hasExternalRecipients: false,
    clientRequestId: 'insert-client-1',
    idempotencyKey: 'insert-idem-1',
    ...overrides,
  };
}

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    document_id: documentId,
    version_id: versionId,
    matter_id: matterId,
    document_status: 'draft',
    matter_status: 'active',
    document_legal_hold: false,
    matter_legal_hold: false,
    active_legal_hold: false,
    active_disposal_request: false,
    ...overrides,
  };
}

function insertionRow(overrides: Record<string, unknown> = {}) {
  return {
    insertion_id: insertionId,
    tenant_id: tenantId,
    user_id: userId,
    document_id: documentId,
    version_id: versionId,
    mailbox_fingerprint_hash: hash,
    canonical_message_sha256: hash,
    insertion_mode: 'internal-reference',
    status: 'ready',
    denied_reason_code: null,
    source_client: 'outlook-web-addin',
    client_request_id_hash: hash,
    idempotency_key_hash: hash,
    created_at: now,
    updated_at: now,
    duplicate: false,
    ...overrides,
  };
}

describe('OutlookDocumentInsertionService', () => {
  const previousInsertionGate = process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED;
  const query = vi.fn();
  const auditService = {
    log: vi.fn(),
    transaction: vi.fn(
      async (_tenantId: string, run: (client: { query: typeof query }) => unknown) =>
        run({ query }),
    ),
  };
  const documentPermissionService = {
    canReadDocument: vi.fn(),
  };
  const tenantContext = {
    require: vi.fn(() => ({ tenantId })),
  };
  const service = new OutlookDocumentInsertionService(
    auditService as never,
    documentPermissionService as never,
    tenantContext as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED;
  });

  afterEach(() => {
    if (previousInsertionGate === undefined) {
      delete process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED;
    } else {
      process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED = previousInsertionGate;
    }
  });

  it('fails closed and audits when document insertion gate is disabled', async () => {
    await expect(service.createDocumentInsertion(userId, insertionInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(documentPermissionService.canReadDocument).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_DOCUMENT_INSERT_DENIED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'integration_gate_closed',
          document_id: documentId,
          policy_mode: 'internal-reference',
        }),
      }),
    );
  });

  it('denies external recipient insertions before policy permits the channel', async () => {
    process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED = 'true';
    query.mockResolvedValueOnce({ rows: [targetRow()], rowCount: 1 });
    documentPermissionService.canReadDocument.mockResolvedValue({ effect: 'ALLOW' });

    await expect(
      service.createDocumentInsertion(
        userId,
        insertionInput({
          hasExternalRecipients: true,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(documentPermissionService.canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId },
      documentId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_DOCUMENT_INSERT_DENIED',
        metadata: expect.objectContaining({
          reason_code: 'policy_denied',
          matter_id: matterId,
        }),
      }),
    );
  });

  it('denies attach-copy until a reviewed copy transport exists', async () => {
    process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED = 'true';
    query.mockResolvedValueOnce({ rows: [targetRow()], rowCount: 1 });
    documentPermissionService.canReadDocument.mockResolvedValue({ effect: 'ALLOW' });

    await expect(
      service.createDocumentInsertion(
        userId,
        insertionInput({
          insertionMode: 'attach-copy',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(documentPermissionService.canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId },
      documentId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_DOCUMENT_INSERT_DENIED',
        metadata: expect.objectContaining({
          reason_code: 'policy_denied',
          policy_mode: 'attach-copy',
        }),
      }),
    );
  });

  it('denies when DocumentPermissionService does not allow read', async () => {
    process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED = 'true';
    query.mockResolvedValueOnce({ rows: [targetRow()], rowCount: 1 });
    documentPermissionService.canReadDocument.mockResolvedValue({ effect: 'DENY' });

    await expect(service.createDocumentInsertion(userId, insertionInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(documentPermissionService.canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId },
      documentId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_DOCUMENT_INSERT_DENIED',
        metadata: expect.objectContaining({
          reason_code: 'permission_denied',
        }),
      }),
    );
  });

  it('blocks insertion when legal hold or disposal policy locks the document', async () => {
    process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED = 'true';
    query.mockResolvedValueOnce({
      rows: [
        targetRow({
          active_legal_hold: true,
        }),
      ],
      rowCount: 1,
    });
    documentPermissionService.canReadDocument.mockResolvedValue({ effect: 'ALLOW' });

    await expect(service.createDocumentInsertion(userId, insertionInput())).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(documentPermissionService.canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId },
      documentId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_DOCUMENT_INSERT_DENIED',
        metadata: expect.objectContaining({
          reason_code: 'document_locked',
        }),
      }),
    );
  });

  it('records an idempotent internal-reference insertion with reference-only audit', async () => {
    process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED = 'true';
    query
      .mockResolvedValueOnce({ rows: [targetRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [insertionRow()], rowCount: 1 });
    documentPermissionService.canReadDocument.mockResolvedValue({ effect: 'ALLOW' });

    await expect(service.createDocumentInsertion(userId, insertionInput())).resolves.toMatchObject({
      insertionId,
      status: 'ready',
      documentId,
      versionId,
      insertionMode: 'internal-reference',
      internalReference: `amic-vault://documents/${documentId}/versions/${versionId}`,
      editReference: `amic-vault://documents/${documentId}/edit?versionId=${versionId}`,
      editPath: `/documents/${documentId}?edit=1&versionId=${versionId}#document-editing`,
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
        metadata: expect.objectContaining({
          document_id: documentId,
          version_id: versionId,
          policy_mode: 'internal-reference',
          outlook_status: 'ready',
          message_hash: hash,
        }),
      }),
      expect.anything(),
    );
  });

  it('marks duplicate internal-reference insertions in audit metadata', async () => {
    process.env.OUTLOOK_DOCUMENT_INSERTION_ENABLED = 'true';
    query
      .mockResolvedValueOnce({ rows: [targetRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [insertionRow({ duplicate: true })], rowCount: 1 });
    documentPermissionService.canReadDocument.mockResolvedValue({ effect: 'ALLOW' });

    await expect(service.createDocumentInsertion(userId, insertionInput())).resolves.toMatchObject({
      insertionId,
      status: 'ready',
      documentId,
      versionId,
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
        metadata: expect.objectContaining({
          document_id: documentId,
          reason_code: 'duplicate',
          outlook_status: 'ready',
        }),
      }),
      expect.anything(),
    );
  });
});
