import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateOutlookSendFileRequestDto, EvaluateOutlookSendPolicyDto } from '@amic-vault/shared';
import { OutlookSendFileService } from './outlook-send-file.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111201';
const otherMatterId = '11111111-1111-4111-8111-111111111202';
const requestId = '11111111-1111-4111-8111-111111111301';
const hash = 'a'.repeat(64);
const secondHash = 'b'.repeat(64);
const now = new Date('2026-06-16T00:00:00.000Z');

function policyInput(overrides: Partial<EvaluateOutlookSendPolicyDto> = {}): EvaluateOutlookSendPolicyDto {
  return {
    sourceClient: 'outlook-web-addin',
    matterId,
    message: {
      mailboxFingerprint: hash,
      outlookItemIdHash: secondHash,
      canonicalMessageSha256: hash,
      hasExternalParticipants: false,
      participantDomainHashes: [],
    },
    attachments: [],
    clientRequestId: 'send-policy-1',
    ...overrides,
  };
}

function sendInput(
  overrides: Partial<CreateOutlookSendFileRequestDto> = {},
): CreateOutlookSendFileRequestDto {
  return {
    ...policyInput(),
    matterId,
    idempotencyKey: 'send-file-idem-1',
    acknowledgedWarningCodes: [],
    ...overrides,
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
    selected_attachment_count: 0,
    status: 'queued',
    denied_reason_code: null,
    email_record_id: null,
    filed_attachment_count: 0,
    request_kind: 'send_and_file',
    send_policy_decision: 'allow',
    send_warning_codes: [],
    created_at: now,
    updated_at: now,
    duplicate: false,
    ...overrides,
  };
}

describe('OutlookSendFileService', () => {
  const previousSmartGate = process.env.OUTLOOK_SMART_ALERTS_ENABLED;
  const previousSendGate = process.env.OUTLOOK_SEND_FILE_ENABLED;
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
  const searchService = {
    suggestMatters: vi.fn(),
  };
  const tenantContext = {
    require: vi.fn(() => ({ tenantId })),
  };
  const service = new OutlookSendFileService(
    auditService as never,
    permissionService as never,
    searchService as never,
    tenantContext as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OUTLOOK_SMART_ALERTS_ENABLED;
    delete process.env.OUTLOOK_SEND_FILE_ENABLED;
  });

  afterEach(() => {
    if (previousSmartGate === undefined) {
      delete process.env.OUTLOOK_SMART_ALERTS_ENABLED;
    } else {
      process.env.OUTLOOK_SMART_ALERTS_ENABLED = previousSmartGate;
    }
    if (previousSendGate === undefined) {
      delete process.env.OUTLOOK_SEND_FILE_ENABLED;
    } else {
      process.env.OUTLOOK_SEND_FILE_ENABLED = previousSendGate;
    }
  });

  it('fails closed and audits when Smart Alerts policy gate is disabled', async () => {
    await expect(service.evaluateSendPolicy(userId, policyInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(permissionService.canUploadToMatter).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_SEND_POLICY_EVALUATED',
        result: 'denied',
        metadata: expect.objectContaining({
          policy_decision: 'block',
          reason_code: 'integration_gate_closed',
        }),
      }),
    );
  });

  it('denies send-and-file when policy gate is closed even if send gate is enabled', async () => {
    process.env.OUTLOOK_SEND_FILE_ENABLED = 'true';

    await expect(service.createSendFileRequest(userId, sendInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(permissionService.canUploadToMatter).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_SEND_FILE_DENIED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'integration_gate_closed',
        }),
      }),
    );
  });

  it('warns for no selected matter and external recipients without local filing', async () => {
    process.env.OUTLOOK_SMART_ALERTS_ENABLED = 'true';

    await expect(
      service.evaluateSendPolicy(
        userId,
        policyInput({
          matterId: undefined,
          message: {
            ...policyInput().message,
            hasExternalParticipants: true,
          },
        }),
      ),
    ).resolves.toMatchObject({
      decision: 'warn',
      warningReasonCodes: ['no_matter', 'external_recipient'],
    });

    expect(permissionService.canUploadToMatter).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_SEND_POLICY_EVALUATED',
        result: 'success',
        metadata: expect.objectContaining({
          policy_decision: 'warn',
          warning_codes: ['no_matter', 'external_recipient'],
        }),
      }),
    );
  });

  it('blocks when PermissionService denies upload to the selected matter', async () => {
    process.env.OUTLOOK_SMART_ALERTS_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'DENY' });

    await expect(service.evaluateSendPolicy(userId, policyInput())).resolves.toMatchObject({
      decision: 'block',
      deniedReasonCode: 'permission_denied',
    });

    expect(searchService.suggestMatters).not.toHaveBeenCalled();
  });

  it('warns when server-filtered matter suggestions indicate a likely wrong matter', async () => {
    process.env.OUTLOOK_SMART_ALERTS_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    searchService.suggestMatters.mockResolvedValue({
      items: [
        {
          matterId: otherMatterId,
          matterCode: 'M-2026-002',
          matterName: 'Other Matter',
          clientId: '11111111-1111-4111-8111-111111111203',
          reasonCodes: ['subject_hash'],
          score: 1,
        },
      ],
    });

    await expect(
      service.evaluateSendPolicy(
        userId,
        policyInput({
          subjectHash: secondHash,
        }),
      ),
    ).resolves.toMatchObject({
      decision: 'warn',
      warningReasonCodes: ['wrong_matter'],
    });

    expect(searchService.suggestMatters).toHaveBeenCalledWith(
      { tenantId, userId },
      expect.objectContaining({
        subjectHash: secondHash,
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_SEND_POLICY_EVALUATED',
        metadata: expect.objectContaining({
          warning_codes: ['wrong_matter'],
        }),
      }),
    );
  });

  it('denies send-and-file when warnings are not acknowledged', async () => {
    process.env.OUTLOOK_SMART_ALERTS_ENABLED = 'true';
    process.env.OUTLOOK_SEND_FILE_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });

    await expect(
      service.createSendFileRequest(
        userId,
        sendInput({
          message: {
            ...policyInput().message,
            hasExternalParticipants: true,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(query).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_SEND_FILE_DENIED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'policy_denied',
          warning_codes: ['external_recipient'],
        }),
      }),
    );
  });

  it('queues acknowledged send-and-file requests with reference-only audit', async () => {
    process.env.OUTLOOK_SMART_ALERTS_ENABLED = 'true';
    process.env.OUTLOOK_SEND_FILE_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query.mockResolvedValueOnce({ rows: [createRow()], rowCount: 1 });

    await expect(service.createSendFileRequest(userId, sendInput())).resolves.toMatchObject({
      id: requestId,
      requestKind: 'send_and_file',
      sendPolicyDecision: 'allow',
      warningReasonCodes: [],
    });

    expect(permissionService.canUploadToMatter).toHaveBeenCalledWith(
      { tenantId, userId },
      matterId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_SEND_FILE_REQUESTED',
        metadata: expect.objectContaining({
          request_kind: 'send_and_file',
          policy_decision: 'allow',
          message_hash: hash,
        }),
      }),
      expect.anything(),
    );
  });
});
