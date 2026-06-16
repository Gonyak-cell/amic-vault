import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  outlookApprovedScopeSetHashSource,
  outlookApprovedScopeNames,
  type AcquireOutlookGraphAttachmentDto,
  type OutlookDeniedReasonCode,
  type OutlookFilingRequestStatus,
  type OutlookGraphAttachmentAcquisitionDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import {
  outlookGraphAttachmentAcquiredAudit,
  outlookGraphAttachmentAcquireDeniedAudit,
  outlookGraphAttachmentAcquireRequestedAudit,
} from './outlook-audit.events';
import { OutlookAuthService } from './outlook-auth.service';
import {
  OUTLOOK_GRAPH_ATTACHMENT_TRANSPORT,
  type OutlookGraphAttachmentTransport,
} from './outlook-graph-attachment-transport';
import { OutlookOperationalGateService } from './outlook-operational-gate';

interface OutlookFilingRequestRow {
  request_id: string;
  tenant_id: string;
  user_id: string;
  matter_id: string;
  mailbox_fingerprint_hash: string;
  canonical_message_sha256: string;
  status: OutlookFilingRequestStatus;
}

interface OutlookAttachmentRefRow {
  attachment_ref_id: string;
  tenant_id: string;
  request_id: string;
  attachment_id_hash: string;
  size_bytes: number | string;
  sha256: string | null;
  selected_for_filing: boolean;
}

interface OutlookGraphAttachmentAcquisitionRow {
  acquisition_id: string;
  tenant_id: string;
  request_id: string;
  addin_session_id: string;
  attachment_id_hash: string;
  status: 'queued' | 'acquired' | 'denied' | 'failed';
  denied_reason_code: OutlookDeniedReasonCode | null;
  content_sha256: string | null;
  size_bytes: number | string | null;
  created_at: Date;
}

interface PersistAcquisitionInput {
  tenantId: string;
  actorUserId: string;
  acquisitionId: string;
  request: OutlookFilingRequestRow;
  addinSessionId: string;
  attachmentIdHash: string;
  mailboxFingerprintHash: string;
  messageHash: string;
  clientRequestHash: string;
  scopeCount: number;
  scopeSetHash: string;
  status: 'acquired' | 'denied';
  deniedReasonCode: OutlookDeniedReasonCode | null;
  contentSha256: string | null;
  sizeBytes: number | null;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function scopeSetHash(): string {
  return createHash('sha256').update(outlookApprovedScopeSetHashSource()).digest('hex');
}

@Injectable()
export class OutlookGraphAttachmentService {
  private readonly fallbackOperationalGate = new OutlookOperationalGateService();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(OutlookAuthService) private readonly authService: OutlookAuthService,
    @Inject(OUTLOOK_GRAPH_ATTACHMENT_TRANSPORT)
    private readonly graphTransport: OutlookGraphAttachmentTransport,
    @Optional()
    @Inject(OutlookOperationalGateService)
    private readonly operationalGate?: OutlookOperationalGateService,
  ) {}

  async acquireAttachment(
    actorUserId: string,
    input: AcquireOutlookGraphAttachmentDto,
  ): Promise<OutlookGraphAttachmentAcquisitionDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const acquisitionId = randomUUID();
    const clientRequestHash = namespacedHash(
      'outlook-graph-client-request',
      input.clientRequestId,
    );
    const scopeCount = outlookApprovedScopeNames().length;
    const graphScopeSetHash = scopeSetHash();

    if (!this.isOutlookFeatureAllowed()) {
      await this.recordAcquireDenied({
        tenantId,
        actorUserId,
        acquisitionId,
        requestId: input.filingRequestId,
        addinSessionId: input.addinSessionId,
        mailboxFingerprintHash: input.message.mailboxFingerprint,
        messageHash: input.message.canonicalMessageSha256,
        attachmentIdHash: input.attachment.attachmentIdHash,
        clientRequestHash,
        scopeCount,
        scopeSetHash: graphScopeSetHash,
        reasonCode: 'integration_gate_closed',
      });
      throw permissionDenied();
    }

    const addinSession = await this.authService.findActiveAddinSession(
      tenantId,
      actorUserId,
      input.addinSessionId,
      input.message.mailboxFingerprint,
    );
    if (!addinSession) {
      await this.recordAcquireDenied({
        tenantId,
        actorUserId,
        acquisitionId,
        requestId: input.filingRequestId,
        addinSessionId: input.addinSessionId,
        mailboxFingerprintHash: input.message.mailboxFingerprint,
        messageHash: input.message.canonicalMessageSha256,
        attachmentIdHash: input.attachment.attachmentIdHash,
        clientRequestHash,
        scopeCount,
        scopeSetHash: graphScopeSetHash,
        reasonCode: 'stale_mailbox',
      });
      throw permissionDenied();
    }

    const request = await this.findRequest(
      tenantId,
      actorUserId,
      input.filingRequestId,
      input.message.mailboxFingerprint,
      input.message.canonicalMessageSha256,
    );
    if (!request || !(await this.canUploadToMatter(tenantId, actorUserId, request.matter_id))) {
      await this.recordAcquireDenied({
        tenantId,
        actorUserId,
        acquisitionId,
        requestId: input.filingRequestId,
        addinSessionId: input.addinSessionId,
        mailboxFingerprintHash: input.message.mailboxFingerprint,
        messageHash: input.message.canonicalMessageSha256,
        attachmentIdHash: input.attachment.attachmentIdHash,
        clientRequestHash,
        scopeCount,
        scopeSetHash: graphScopeSetHash,
        reasonCode: 'permission_denied',
      });
      throw permissionDenied();
    }

    const attachment = await this.findSelectedAttachment(
      tenantId,
      input.filingRequestId,
      input.attachment.attachmentIdHash,
    );
    if (!attachment) {
      await this.recordAcquireDenied({
        tenantId,
        actorUserId,
        acquisitionId,
        requestId: input.filingRequestId,
        addinSessionId: input.addinSessionId,
        mailboxFingerprintHash: input.message.mailboxFingerprint,
        messageHash: input.message.canonicalMessageSha256,
        attachmentIdHash: input.attachment.attachmentIdHash,
        clientRequestHash,
        scopeCount,
        scopeSetHash: graphScopeSetHash,
        reasonCode: 'permission_denied',
      });
      throw permissionDenied();
    }

    const transportResult = await this.graphTransport.acquire({
      tenantId,
      actorUserId,
      acquisitionId,
      filingRequestId: input.filingRequestId,
      mailboxFingerprintHash: input.message.mailboxFingerprint,
      messageHash: input.message.canonicalMessageSha256,
      attachmentIdHash: input.attachment.attachmentIdHash,
    });

    if (transportResult.status === 'denied') {
      await this.persistAcquisition({
        tenantId,
        actorUserId,
        acquisitionId,
        request,
        addinSessionId: input.addinSessionId,
        attachmentIdHash: attachment.attachment_id_hash,
        mailboxFingerprintHash: input.message.mailboxFingerprint,
        messageHash: input.message.canonicalMessageSha256,
        clientRequestHash,
        scopeCount,
        scopeSetHash: graphScopeSetHash,
        status: 'denied',
        deniedReasonCode: transportResult.reasonCode,
        contentSha256: null,
        sizeBytes: null,
      });
      throw permissionDenied();
    }

    const row = await this.persistAcquisition({
      tenantId,
      actorUserId,
      acquisitionId,
      request,
      addinSessionId: input.addinSessionId,
      attachmentIdHash: attachment.attachment_id_hash,
      mailboxFingerprintHash: input.message.mailboxFingerprint,
      messageHash: input.message.canonicalMessageSha256,
      clientRequestHash,
      scopeCount,
      scopeSetHash: graphScopeSetHash,
      status: 'acquired',
      deniedReasonCode: null,
      contentSha256: transportResult.contentSha256,
      sizeBytes: transportResult.sizeBytes,
    });

    return this.toDto(row);
  }

  private isOutlookFeatureAllowed(): boolean {
    return (this.operationalGate ?? this.fallbackOperationalGate).isFeatureAllowed(
      'GRAPH_ATTACHMENT_ACQUISITION',
    );
  }

  private async findRequest(
    tenantId: string,
    actorUserId: string,
    requestId: string,
    mailboxFingerprintHash: string,
    messageHash: string,
  ): Promise<OutlookFilingRequestRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT *
          FROM outlook_filing_requests
          WHERE tenant_id = $1
            AND user_id = $2
            AND request_id = $3
            AND mailbox_fingerprint_hash = $4
            AND canonical_message_sha256 = $5
            AND status IN ('queued', 'processing')
          LIMIT 1
        `,
        [tenantId, actorUserId, requestId, mailboxFingerprintHash, messageHash],
      );
      return (result.rows[0] as OutlookFilingRequestRow | undefined) ?? null;
    });
  }

  private async findSelectedAttachment(
    tenantId: string,
    requestId: string,
    attachmentIdHash: string,
  ): Promise<OutlookAttachmentRefRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT *
          FROM outlook_filing_request_attachments
          WHERE tenant_id = $1
            AND request_id = $2
            AND attachment_id_hash = $3
            AND selected_for_filing = true
          LIMIT 1
        `,
        [tenantId, requestId, attachmentIdHash],
      );
      return (result.rows[0] as OutlookAttachmentRefRow | undefined) ?? null;
    });
  }

  private async canUploadToMatter(
    tenantId: string,
    actorUserId: string,
    matterId: string,
  ): Promise<boolean> {
    try {
      const decision = await this.permissionService.canUploadToMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
      return decision.effect === 'ALLOW';
    } catch {
      return false;
    }
  }

  private async persistAcquisition(
    input: PersistAcquisitionInput,
  ): Promise<OutlookGraphAttachmentAcquisitionRow> {
    return this.auditService.transaction(input.tenantId, async (tx) => {
      const row = await this.insertAcquisition(tx, input);
      await this.auditService.log(
        outlookGraphAttachmentAcquireRequestedAudit({
          tenantId: input.tenantId,
          actorId: input.actorUserId,
          acquisitionId: row.acquisition_id,
          requestId: row.request_id,
          addinSessionId: row.addin_session_id,
          mailboxFingerprintHash: input.mailboxFingerprintHash,
          messageHash: input.messageHash,
          attachmentIdHash: row.attachment_id_hash,
          attachmentCount: 1,
          clientRequestHash: input.clientRequestHash,
          scopeCount: input.scopeCount,
          scopeSetHash: input.scopeSetHash,
        }),
        tx,
      );
      if (input.status === 'acquired' && input.contentSha256 && input.sizeBytes !== null) {
        await this.auditService.log(
          outlookGraphAttachmentAcquiredAudit({
            tenantId: input.tenantId,
            actorId: input.actorUserId,
            acquisitionId: row.acquisition_id,
            requestId: row.request_id,
            addinSessionId: row.addin_session_id,
            mailboxFingerprintHash: input.mailboxFingerprintHash,
            messageHash: input.messageHash,
            attachmentIdHash: row.attachment_id_hash,
            attachmentCount: 1,
            clientRequestHash: input.clientRequestHash,
            scopeCount: input.scopeCount,
            scopeSetHash: input.scopeSetHash,
            contentSha256: input.contentSha256,
            sizeBytes: input.sizeBytes,
          }),
          tx,
        );
      }
      if (input.status === 'denied' && input.deniedReasonCode) {
        await this.auditService.log(
          outlookGraphAttachmentAcquireDeniedAudit({
            tenantId: input.tenantId,
            actorId: input.actorUserId,
            acquisitionId: row.acquisition_id,
            requestId: row.request_id,
            addinSessionId: row.addin_session_id,
            mailboxFingerprintHash: input.mailboxFingerprintHash,
            messageHash: input.messageHash,
            attachmentIdHash: row.attachment_id_hash,
            attachmentCount: 1,
            clientRequestHash: input.clientRequestHash,
            scopeCount: input.scopeCount,
            scopeSetHash: input.scopeSetHash,
            reasonCode: input.deniedReasonCode,
          }),
          tx,
        );
      }
      return row;
    });
  }

  private async insertAcquisition(
    tx: QueryClient,
    input: PersistAcquisitionInput,
  ): Promise<OutlookGraphAttachmentAcquisitionRow> {
    const result = await tx.query(
      `
        INSERT INTO outlook_graph_attachment_acquisitions (
          acquisition_id, tenant_id, request_id, addin_session_id, attachment_id_hash,
          mailbox_fingerprint_hash, canonical_message_sha256, status, denied_reason_code,
          content_sha256, size_bytes, client_request_id_hash, graph_scope_set_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `,
      [
        input.acquisitionId,
        input.tenantId,
        input.request.request_id,
        input.addinSessionId,
        input.attachmentIdHash,
        input.mailboxFingerprintHash,
        input.messageHash,
        input.status,
        input.deniedReasonCode,
        input.contentSha256,
        input.sizeBytes,
        input.clientRequestHash,
        input.scopeSetHash,
      ],
    );
    const row = result.rows[0] as OutlookGraphAttachmentAcquisitionRow | undefined;
    if (!row) throw new Error('outlook graph attachment acquisition insert returned no row');
    return row;
  }

  private async recordAcquireDenied(input: {
    tenantId: string;
    actorUserId: string;
    acquisitionId: string;
    requestId: string;
    addinSessionId: string;
    mailboxFingerprintHash: string;
    messageHash: string;
    attachmentIdHash: string;
    clientRequestHash: string;
    scopeCount: number;
    scopeSetHash: string;
    reasonCode: OutlookDeniedReasonCode;
  }): Promise<void> {
    await this.auditService.log(
      outlookGraphAttachmentAcquireDeniedAudit({
        tenantId: input.tenantId,
        actorId: input.actorUserId,
        acquisitionId: input.acquisitionId,
        requestId: input.requestId,
        addinSessionId: input.addinSessionId,
        mailboxFingerprintHash: input.mailboxFingerprintHash,
        messageHash: input.messageHash,
        attachmentIdHash: input.attachmentIdHash,
        attachmentCount: 1,
        clientRequestHash: input.clientRequestHash,
        scopeCount: input.scopeCount,
        scopeSetHash: input.scopeSetHash,
        reasonCode: input.reasonCode,
      }),
    );
  }

  private toDto(
    row: OutlookGraphAttachmentAcquisitionRow,
  ): OutlookGraphAttachmentAcquisitionDto {
    return {
      acquisitionId: row.acquisition_id,
      status: row.status,
      filingRequestId: row.request_id,
      attachmentIdHash: row.attachment_id_hash,
      createdAt: row.created_at.toISOString(),
      ...(row.content_sha256 ? { contentSha256: row.content_sha256 } : {}),
      ...(row.size_bytes !== null ? { sizeBytes: Number(row.size_bytes) } : {}),
      ...(row.denied_reason_code ? { deniedReasonCode: row.denied_reason_code } : {}),
    };
  }
}
