import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  OutlookAddinSessionDto,
  OutlookAddinSessionExchangeDto,
  OutlookDeniedReasonCode,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { TenantContextService } from '../tenant/tenant-context';
import {
  outlookAddinSessionDeniedAudit,
  outlookAddinSessionExchangedAudit,
} from './outlook-audit.events';
import {
  OUTLOOK_IDENTITY_VERIFIER,
  type OutlookIdentityVerifier,
} from './outlook-identity-verifier';

const ADDIN_SESSION_TTL_MS = 1000 * 60 * 30;

interface OutlookMailboxBindingRow {
  binding_id: string;
  tenant_id: string;
  user_id: string;
  mailbox_fingerprint_hash: string;
  status: 'active' | 'stale' | 'revoked';
}

export interface OutlookAddinSessionRow {
  addin_session_id: string;
  tenant_id: string;
  user_id: string;
  binding_id: string;
  source_session_id: string;
  mailbox_fingerprint_hash: string;
  status: 'active' | 'denied' | 'expired' | 'revoked';
  expires_at: Date;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function isOutlookAuthExchangeEnabled(): boolean {
  return process.env.OUTLOOK_AUTH_EXCHANGE_ENABLED === 'true';
}

@Injectable()
export class OutlookAuthService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(OUTLOOK_IDENTITY_VERIFIER)
    private readonly identityVerifier: OutlookIdentityVerifier,
  ) {}

  async exchangeAddinSession(
    actorUserId: string,
    vaultSessionId: string,
    input: OutlookAddinSessionExchangeDto,
  ): Promise<OutlookAddinSessionDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const addinSessionId = randomUUID();
    const clientRequestHash = namespacedHash('outlook-auth-client-request', input.clientRequestId);

    if (!isOutlookAuthExchangeEnabled()) {
      await this.recordSessionDenied({
        tenantId,
        actorUserId,
        addinSessionId,
        mailboxFingerprintHash: input.mailboxFingerprint,
        clientRequestHash,
        reasonCode: 'integration_gate_closed',
      });
      throw permissionDenied();
    }

    const verification = await this.verifyIdentity(tenantId, actorUserId, input);
    if (verification.effect !== 'ALLOW') {
      await this.recordSessionDenied({
        tenantId,
        actorUserId,
        addinSessionId,
        mailboxFingerprintHash: input.mailboxFingerprint,
        clientRequestHash,
        reasonCode: 'policy_denied',
      });
      throw permissionDenied();
    }

    const binding = await this.findActiveMailboxBinding(
      tenantId,
      actorUserId,
      input.mailboxFingerprint,
    );
    if (!binding) {
      await this.recordSessionDenied({
        tenantId,
        actorUserId,
        addinSessionId,
        mailboxFingerprintHash: input.mailboxFingerprint,
        clientRequestHash,
        reasonCode: 'stale_mailbox',
      });
      throw permissionDenied();
    }

    const identityAssertionHash = namespacedHash('outlook-identity-assertion', input.identityAssertion);
    const expiresAt = new Date(Date.now() + ADDIN_SESSION_TTL_MS);

    const row = await this.auditService.transaction(tenantId, async (tx) => {
      const inserted = await this.insertAddinSession(tx, {
        tenantId,
        actorUserId,
        addinSessionId,
        sourceSessionId: vaultSessionId,
        bindingId: binding.binding_id,
        mailboxFingerprintHash: input.mailboxFingerprint,
        identityAssertionHash,
        identitySubjectHash: verification.subjectHash,
        tenantHintHash: verification.tenantHintHash ?? null,
        clientRequestHash,
        sourceClient: input.sourceClient,
        expiresAt,
      });
      await this.auditService.log(
        outlookAddinSessionExchangedAudit({
          tenantId,
          actorId: actorUserId,
          addinSessionId: inserted.addin_session_id,
          mailboxBindingId: inserted.binding_id,
          mailboxFingerprintHash: inserted.mailbox_fingerprint_hash,
          clientRequestHash,
          expiresAt: inserted.expires_at.toISOString(),
        }),
        tx,
      );
      return inserted;
    });

    return {
      addinSessionId: row.addin_session_id,
      status: 'active',
      mailboxBindingStatus: 'active',
      sourceClient: input.sourceClient,
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async findActiveAddinSession(
    tenantId: string,
    actorUserId: string,
    addinSessionId: string,
    mailboxFingerprintHash: string,
  ): Promise<OutlookAddinSessionRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT *
          FROM outlook_addin_sessions
          WHERE tenant_id = $1
            AND user_id = $2
            AND addin_session_id = $3
            AND mailbox_fingerprint_hash = $4
            AND status = 'active'
            AND expires_at > now()
          LIMIT 1
        `,
        [tenantId, actorUserId, addinSessionId, mailboxFingerprintHash],
      );
      return (result.rows[0] as OutlookAddinSessionRow | undefined) ?? null;
    });
  }

  private async verifyIdentity(
    tenantId: string,
    actorUserId: string,
    input: OutlookAddinSessionExchangeDto,
  ) {
    try {
      return await this.identityVerifier.verify({
        tenantId,
        actorUserId,
        mailboxFingerprintHash: input.mailboxFingerprint,
        identityAssertion: input.identityAssertion,
      });
    } catch {
      return { effect: 'DENY' as const };
    }
  }

  private async findActiveMailboxBinding(
    tenantId: string,
    actorUserId: string,
    mailboxFingerprintHash: string,
  ): Promise<OutlookMailboxBindingRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT *
          FROM outlook_mailbox_bindings
          WHERE tenant_id = $1
            AND user_id = $2
            AND mailbox_fingerprint_hash = $3
            AND status = 'active'
          LIMIT 1
        `,
        [tenantId, actorUserId, mailboxFingerprintHash],
      );
      return (result.rows[0] as OutlookMailboxBindingRow | undefined) ?? null;
    });
  }

  private async insertAddinSession(
    tx: QueryClient,
    input: {
      tenantId: string;
      actorUserId: string;
      addinSessionId: string;
      sourceSessionId: string;
      bindingId: string;
      mailboxFingerprintHash: string;
      identityAssertionHash: string;
      identitySubjectHash: string;
      tenantHintHash: string | null;
      clientRequestHash: string;
      sourceClient: string;
      expiresAt: Date;
    },
  ): Promise<OutlookAddinSessionRow> {
    const result = await tx.query(
      `
        INSERT INTO outlook_addin_sessions (
          addin_session_id, tenant_id, user_id, binding_id, source_session_id,
          mailbox_fingerprint_hash, identity_assertion_hash, identity_subject_hash,
          tenant_hint_hash, client_request_id_hash, source_client, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `,
      [
        input.addinSessionId,
        input.tenantId,
        input.actorUserId,
        input.bindingId,
        input.sourceSessionId,
        input.mailboxFingerprintHash,
        input.identityAssertionHash,
        input.identitySubjectHash,
        input.tenantHintHash,
        input.clientRequestHash,
        input.sourceClient,
        input.expiresAt,
      ],
    );
    const row = result.rows[0] as OutlookAddinSessionRow | undefined;
    if (!row) throw new Error('outlook add-in session insert returned no row');
    return row;
  }

  private async recordSessionDenied(input: {
    tenantId: string;
    actorUserId: string;
    addinSessionId: string;
    mailboxFingerprintHash: string;
    clientRequestHash: string;
    reasonCode: OutlookDeniedReasonCode;
  }): Promise<void> {
    await this.auditService.log(
      outlookAddinSessionDeniedAudit({
        tenantId: input.tenantId,
        actorId: input.actorUserId,
        addinSessionId: input.addinSessionId,
        mailboxFingerprintHash: input.mailboxFingerprintHash,
        clientRequestHash: input.clientRequestHash,
        reasonCode: input.reasonCode,
      }),
    );
  }
}
