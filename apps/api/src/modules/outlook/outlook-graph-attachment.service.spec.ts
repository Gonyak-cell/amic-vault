import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcquireOutlookGraphAttachmentDto } from '@amic-vault/shared';
import { OutlookGraphAttachmentService } from './outlook-graph-attachment.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111201';
const filingRequestId = '11111111-1111-4111-8111-111111111301';
const addinSessionId = '11111111-1111-4111-8111-111111111401';
const acquisitionId = '11111111-1111-4111-8111-111111111501';
const mailboxHash = 'a'.repeat(64);
const messageHash = 'b'.repeat(64);
const attachmentHash = 'c'.repeat(64);
const contentHash = 'd'.repeat(64);
const scopeHash = 'e'.repeat(64);
const now = new Date('2026-06-16T01:00:00.000Z');

function acquisitionInput(): AcquireOutlookGraphAttachmentDto {
  return {
    sourceClient: 'outlook-web-addin',
    addinSessionId,
    filingRequestId,
    message: {
      mailboxFingerprint: mailboxHash,
      outlookItemIdHash: messageHash,
      canonicalMessageSha256: messageHash,
      hasExternalParticipants: false,
      participantDomainHashes: [],
    },
    attachment: {
      attachmentIdHash: attachmentHash,
      ordinal: 0,
      sizeBytes: 42,
      sha256: contentHash,
      selectedForFiling: true,
    },
    clientRequestId: 'graph-client-1',
  };
}

function filingRequestRow() {
  return {
    request_id: filingRequestId,
    tenant_id: tenantId,
    user_id: userId,
    matter_id: matterId,
    mailbox_fingerprint_hash: mailboxHash,
    canonical_message_sha256: messageHash,
    status: 'queued',
  };
}

function attachmentRow() {
  return {
    attachment_ref_id: '11111111-1111-4111-8111-111111111601',
    tenant_id: tenantId,
    request_id: filingRequestId,
    attachment_id_hash: attachmentHash,
    size_bytes: 42,
    sha256: contentHash,
    selected_for_filing: true,
  };
}

function acquisitionRow() {
  return {
    acquisition_id: acquisitionId,
    tenant_id: tenantId,
    request_id: filingRequestId,
    addin_session_id: addinSessionId,
    attachment_id_hash: attachmentHash,
    status: 'acquired',
    denied_reason_code: null,
    content_sha256: contentHash,
    size_bytes: 42,
    graph_scope_set_hash: scopeHash,
    created_at: now,
  };
}

describe('OutlookGraphAttachmentService', () => {
  const previousGate = process.env.OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED;
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
  };
  const tenantContext = {
    require: vi.fn(() => ({ tenantId })),
  };
  const authService = {
    findActiveAddinSession: vi.fn(),
  };
  const transport = {
    acquire: vi.fn(),
  };
  const service = new OutlookGraphAttachmentService(
    auditService as never,
    permissionService as never,
    tenantContext as never,
    authService as never,
    transport,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED;
  });

  afterEach(() => {
    if (previousGate === undefined) {
      delete process.env.OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED;
    } else {
      process.env.OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED = previousGate;
    }
  });

  it('fails closed and audits when Graph attachment gate is disabled', async () => {
    await expect(service.acquireAttachment(userId, acquisitionInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(authService.findActiveAddinSession).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED',
        result: 'denied',
        metadata: expect.objectContaining({
          request_id: filingRequestId,
          addin_session_id: addinSessionId,
          attachment_id_hash: attachmentHash,
          reason_code: 'integration_gate_closed',
          outlook_status: 'denied',
        }),
      }),
    );
  });

  it('denies stale add-in sessions before looking up filing requests', async () => {
    process.env.OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED = 'true';
    authService.findActiveAddinSession.mockResolvedValue(null);

    await expect(service.acquireAttachment(userId, acquisitionInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(query).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED',
        metadata: expect.objectContaining({ reason_code: 'stale_mailbox' }),
      }),
    );
  });

  it('persists denied transport results with requested and denied audit events', async () => {
    process.env.OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED = 'true';
    authService.findActiveAddinSession.mockResolvedValue({
      addin_session_id: addinSessionId,
      mailbox_fingerprint_hash: mailboxHash,
      status: 'active',
    });
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    transport.acquire.mockResolvedValue({ status: 'denied', reasonCode: 'integration_gate_closed' });
    query.mockResolvedValueOnce({ rows: [filingRequestRow()], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [attachmentRow()], rowCount: 1 });
    query.mockResolvedValueOnce({
      rows: [{ ...acquisitionRow(), status: 'denied', denied_reason_code: 'integration_gate_closed' }],
      rowCount: 1,
    });

    await expect(service.acquireAttachment(userId, acquisitionInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(permissionService.canUploadToMatter).toHaveBeenCalledWith(
      { tenantId, userId },
      matterId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_REQUESTED',
        metadata: expect.objectContaining({
          request_id: filingRequestId,
          attachment_id_hash: attachmentHash,
          outlook_status: 'queued',
        }),
      }),
      expect.anything(),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED',
        metadata: expect.objectContaining({
          reason_code: 'integration_gate_closed',
          outlook_status: 'denied',
        }),
      }),
      expect.anything(),
    );
  });

  it('returns safe acquisition status when an approved transport succeeds', async () => {
    process.env.OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED = 'true';
    authService.findActiveAddinSession.mockResolvedValue({
      addin_session_id: addinSessionId,
      mailbox_fingerprint_hash: mailboxHash,
      status: 'active',
    });
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    transport.acquire.mockResolvedValue({ status: 'acquired', contentSha256: contentHash, sizeBytes: 42 });
    query.mockResolvedValueOnce({ rows: [filingRequestRow()], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [attachmentRow()], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [acquisitionRow()], rowCount: 1 });

    await expect(service.acquireAttachment(userId, acquisitionInput())).resolves.toEqual({
      acquisitionId,
      status: 'acquired',
      filingRequestId,
      attachmentIdHash: attachmentHash,
      contentSha256: contentHash,
      sizeBytes: 42,
      createdAt: now.toISOString(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRED',
        metadata: expect.objectContaining({
          attachment_id_hash: attachmentHash,
          hash: contentHash,
          unit_count: 42,
          outlook_status: 'acquired',
        }),
      }),
      expect.anything(),
    );
  });
});
