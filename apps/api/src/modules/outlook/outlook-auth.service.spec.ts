import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutlookAddinSessionExchangeDto } from '@amic-vault/shared';
import { OutlookAuthService } from './outlook-auth.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111101';
const vaultSessionId = '11111111-1111-4111-8111-111111111151';
const addinSessionId = '11111111-1111-4111-8111-111111111251';
const bindingId = '11111111-1111-4111-8111-111111111351';
const mailboxHash = 'a'.repeat(64);
const subjectHash = 'b'.repeat(64);
const clientRequestHash = 'c'.repeat(64);
const assertionHash = 'd'.repeat(64);
const expiresAt = new Date('2026-06-16T01:00:00.000Z');

function exchangeInput(): OutlookAddinSessionExchangeDto {
  return {
    sourceClient: 'outlook-web-addin',
    mailboxFingerprint: mailboxHash,
    identityAssertion: 'synthetic.identity.assertion',
    clientRequestId: 'session-client-1',
  };
}

describe('OutlookAuthService', () => {
  const previousGate = process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED;
  const query = vi.fn();
  const auditService = {
    log: vi.fn(),
    transaction: vi.fn(
      async (_tenantId: string, run: (client: { query: typeof query }) => unknown) =>
        run({ query }),
    ),
  };
  const tenantContext = {
    require: vi.fn(() => ({ tenantId })),
  };
  const identityVerifier = {
    verify: vi.fn(),
  };
  const service = new OutlookAuthService(
    auditService as never,
    tenantContext as never,
    identityVerifier,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED;
  });

  afterEach(() => {
    if (previousGate === undefined) {
      delete process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED;
    } else {
      process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED = previousGate;
    }
  });

  it('fails closed and audits when session exchange gate is disabled', async () => {
    await expect(
      service.exchangeAddinSession(userId, vaultSessionId, exchangeInput()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(identityVerifier.verify).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_ADDIN_SESSION_DENIED',
        result: 'denied',
        metadata: expect.objectContaining({
          mailbox_fingerprint_hash: mailboxHash,
          reason_code: 'integration_gate_closed',
          outlook_status: 'denied',
        }),
      }),
    );
  });

  it('fails closed when the identity verifier is unavailable', async () => {
    process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED = 'true';
    identityVerifier.verify.mockResolvedValue({ effect: 'DENY' });

    await expect(
      service.exchangeAddinSession(userId, vaultSessionId, exchangeInput()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_ADDIN_SESSION_DENIED',
        metadata: expect.objectContaining({
          reason_code: 'policy_denied',
        }),
      }),
    );
  });

  it('denies stale or missing mailbox bindings without issuing a session', async () => {
    process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED = 'true';
    identityVerifier.verify.mockResolvedValue({ effect: 'ALLOW', subjectHash });
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      service.exchangeAddinSession(userId, vaultSessionId, exchangeInput()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('outlook_mailbox_bindings'), [
      tenantId,
      userId,
      mailboxHash,
    ]);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_ADDIN_SESSION_DENIED',
        metadata: expect.objectContaining({ reason_code: 'stale_mailbox' }),
      }),
    );
  });

  it('issues a separate add-in session after verifier and binding pass', async () => {
    process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED = 'true';
    identityVerifier.verify.mockResolvedValue({ effect: 'ALLOW', subjectHash });
    query.mockResolvedValueOnce({
      rows: [
        {
          binding_id: bindingId,
          tenant_id: tenantId,
          user_id: userId,
          mailbox_fingerprint_hash: mailboxHash,
          status: 'active',
        },
      ],
      rowCount: 1,
    });
    query.mockResolvedValueOnce({
      rows: [
        {
          addin_session_id: addinSessionId,
          tenant_id: tenantId,
          user_id: userId,
          binding_id: bindingId,
          source_session_id: vaultSessionId,
          mailbox_fingerprint_hash: mailboxHash,
          identity_assertion_hash: assertionHash,
          identity_subject_hash: subjectHash,
          tenant_hint_hash: null,
          client_request_id_hash: clientRequestHash,
          source_client: 'outlook-web-addin',
          status: 'active',
          expires_at: expiresAt,
        },
      ],
      rowCount: 1,
    });

    await expect(
      service.exchangeAddinSession(userId, vaultSessionId, exchangeInput()),
    ).resolves.toEqual({
      addinSessionId,
      status: 'active',
      mailboxBindingStatus: 'active',
      sourceClient: 'outlook-web-addin',
      expiresAt: expiresAt.toISOString(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_ADDIN_SESSION_EXCHANGED',
        targetType: 'outlook_addin_session',
        targetId: addinSessionId,
        metadata: expect.objectContaining({
          addin_session_id: addinSessionId,
          mailbox_binding_id: bindingId,
          mailbox_fingerprint_hash: mailboxHash,
          outlook_status: 'active',
        }),
      }),
      expect.anything(),
    );
  });
});
