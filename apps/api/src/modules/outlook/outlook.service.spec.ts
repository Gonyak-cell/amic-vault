import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateOutlookEmailFilingRequestDto } from '@amic-vault/shared';
import { OutlookService } from './outlook.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111201';
const requestId = '11111111-1111-4111-8111-111111111301';
const hash = 'a'.repeat(64);
const secondHash = 'b'.repeat(64);
const now = new Date('2026-06-15T00:00:00.000Z');

function createInput(): CreateOutlookEmailFilingRequestDto {
  return {
    matterId,
    message: {
      mailboxFingerprint: hash,
      outlookItemIdHash: secondHash,
      canonicalMessageSha256: hash,
      hasExternalParticipants: false,
      participantDomainHashes: [],
    },
    attachments: [
      {
        attachmentIdHash: secondHash,
        ordinal: 0,
        sizeBytes: 42,
        sha256: hash,
        selectedForFiling: true,
      },
    ],
    sourceClient: 'outlook-web-addin',
    clientRequestId: 'client-1',
    idempotencyKey: 'idem-1',
  };
}

function createRow(overrides: Record<string, unknown> = {}) {
  return {
    request_id: requestId,
    tenant_id: tenantId,
    user_id: userId,
    matter_id: matterId,
    mailbox_fingerprint_hash: hash,
    canonical_message_sha256: hash,
    attachment_set_hash: hash,
    client_request_id_hash: hash,
    idempotency_key_hash: hash,
    selected_attachment_count: 1,
    status: 'queued',
    denied_reason_code: null,
    email_record_id: null,
    filed_attachment_count: 0,
    created_at: now,
    updated_at: now,
    duplicate: false,
    ...overrides,
  };
}

describe('OutlookService', () => {
  const previousGate = process.env.OUTLOOK_ADDIN_ENABLED;
  const query = vi.fn();
  const auditService = {
    log: vi.fn(),
    transaction: vi.fn(
      async (_tenantId: string, run: (client: { query: typeof query }) => unknown) =>
        run({ query }),
    ),
  };
  const permissionService = {
    canUploadToMatter: vi.fn(),
    canReadMatter: vi.fn(),
  };
  const tenantContext = {
    require: vi.fn(() => ({ tenantId })),
  };
  const service = new OutlookService(
    auditService as never,
    permissionService as never,
    tenantContext as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OUTLOOK_ADDIN_ENABLED;
  });

  afterEach(() => {
    if (previousGate === undefined) {
      delete process.env.OUTLOOK_ADDIN_ENABLED;
    } else {
      process.env.OUTLOOK_ADDIN_ENABLED = previousGate;
    }
  });

  it('fails closed and audits when the Outlook integration gate is disabled', async () => {
    await expect(service.createFilingRequest(userId, createInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(permissionService.canUploadToMatter).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_EMAIL_FILE_DENIED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'integration_gate_closed',
          message_hash: hash,
          attachment_count: 1,
        }),
      }),
    );
  });

  it('queues an enabled filing request through PermissionService and audit', async () => {
    process.env.OUTLOOK_ADDIN_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query.mockResolvedValueOnce({ rows: [createRow()], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(service.createFilingRequest(userId, createInput())).resolves.toMatchObject({
      id: requestId,
      status: 'queued',
      matterId,
      filedAttachmentCount: 0,
    });

    expect(permissionService.canUploadToMatter).toHaveBeenCalledWith(
      { tenantId, userId },
      matterId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_EMAIL_FILE_REQUESTED',
        metadata: expect.objectContaining({
          outlook_status: 'queued',
          message_hash: hash,
          attachment_count: 1,
        }),
      }),
      expect.anything(),
    );
  });

  it('marks duplicate manual filing requests in audit metadata', async () => {
    process.env.OUTLOOK_ADDIN_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query.mockResolvedValueOnce({ rows: [createRow({ duplicate: true })], rowCount: 1 });

    await expect(service.createFilingRequest(userId, createInput())).resolves.toMatchObject({
      id: requestId,
      status: 'queued',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_EMAIL_FILE_REQUESTED',
        metadata: expect.objectContaining({
          reason_code: 'duplicate',
          idempotency_hash: hash,
        }),
      }),
      expect.anything(),
    );
  });

  it('requires the same user and current matter read permission for status lookup', async () => {
    permissionService.canReadMatter.mockResolvedValue({ effect: 'ALLOW' });
    query.mockResolvedValueOnce({ rows: [createRow()], rowCount: 1 });

    await expect(service.getFilingRequestStatus(userId, requestId)).resolves.toMatchObject({
      id: requestId,
      status: 'queued',
    });

    expect(permissionService.canReadMatter).toHaveBeenCalledWith({ tenantId, userId }, matterId);
  });

  it('denies status lookup for a different user without leaking existence', async () => {
    query.mockResolvedValueOnce({
      rows: [createRow({ user_id: '11111111-1111-4111-8111-111111111999' })],
      rowCount: 1,
    });

    await expect(service.getFilingRequestStatus(userId, requestId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(permissionService.canReadMatter).not.toHaveBeenCalled();
  });
});
