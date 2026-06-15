import type { OutlookDeniedReasonCode, OutlookFilingRequestStatus } from '@amic-vault/shared';
import type { AuditLogInput } from '../audit/audit.service';

interface BaseOutlookAuditInput {
  tenantId: string;
  actorId: string;
  requestId: string;
  matterId: string;
  mailboxFingerprintHash: string;
  messageHash: string;
  attachmentCount: number;
  idempotencyHash: string;
  clientRequestHash: string;
}

function baseMetadata(input: BaseOutlookAuditInput) {
  return {
    request_id: input.requestId,
    matter_id: input.matterId,
    mailbox_fingerprint_hash: input.mailboxFingerprintHash,
    message_hash: input.messageHash,
    attachment_count: input.attachmentCount,
    idempotency_hash: input.idempotencyHash,
    client_request_hash: input.clientRequestHash,
  };
}

export function outlookEmailFileRequestedAudit(
  input: BaseOutlookAuditInput & {
    status: OutlookFilingRequestStatus;
    duplicate: boolean;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_EMAIL_FILE_REQUESTED',
    targetType: 'outlook_filing_request',
    targetId: input.requestId,
    matterId: input.matterId,
    metadata: {
      ...baseMetadata(input),
      outlook_status: input.status,
      ...(input.duplicate ? { reason_code: 'duplicate' } : {}),
    },
  };
}

export function outlookEmailFileDeniedAudit(
  input: BaseOutlookAuditInput & {
    reasonCode: OutlookDeniedReasonCode;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_EMAIL_FILE_DENIED',
    targetType: 'outlook_filing_request',
    targetId: input.requestId,
    matterId: input.matterId,
    result: 'denied',
    metadata: {
      ...baseMetadata(input),
      outlook_status: 'denied',
      reason_code: input.reasonCode,
    },
  };
}

export function outlookEmailFileCancelledAudit(
  input: BaseOutlookAuditInput & {
    statusBefore: OutlookFilingRequestStatus;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_EMAIL_FILE_CANCELLED',
    targetType: 'outlook_filing_request',
    targetId: input.requestId,
    matterId: input.matterId,
    metadata: {
      ...baseMetadata(input),
      status_before: input.statusBefore,
      status_after: 'cancelled',
      outlook_status: 'cancelled',
      reason_code: 'cancelled',
    },
  };
}
