import type {
  OutlookDeniedReasonCode,
  OutlookFilingRequestKind,
  OutlookFilingRequestStatus,
  OutlookSendPolicyDecision,
  OutlookSendWarningReasonCode,
} from '@amic-vault/shared';
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

interface BaseOutlookSendPolicyAuditInput {
  tenantId: string;
  actorId: string;
  decisionId: string;
  matterId: string | null;
  mailboxFingerprintHash: string;
  messageHash: string;
  attachmentCount: number;
  clientRequestHash: string;
}

interface BaseOutlookSessionAuditInput {
  tenantId: string;
  actorId: string;
  addinSessionId: string;
  mailboxFingerprintHash: string;
  clientRequestHash: string;
}

interface BaseOutlookGraphAcquisitionAuditInput {
  tenantId: string;
  actorId: string;
  acquisitionId: string;
  requestId: string;
  addinSessionId: string;
  mailboxFingerprintHash: string;
  messageHash: string;
  attachmentIdHash: string;
  attachmentCount: number;
  clientRequestHash: string;
  scopeCount: number;
  scopeSetHash: string;
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

function baseSendPolicyMetadata(input: BaseOutlookSendPolicyAuditInput) {
  return {
    request_id: input.decisionId,
    ...(input.matterId ? { matter_id: input.matterId } : {}),
    mailbox_fingerprint_hash: input.mailboxFingerprintHash,
    message_hash: input.messageHash,
    attachment_count: input.attachmentCount,
    client_request_hash: input.clientRequestHash,
  };
}

function baseSessionMetadata(input: BaseOutlookSessionAuditInput) {
  return {
    addin_session_id: input.addinSessionId,
    mailbox_fingerprint_hash: input.mailboxFingerprintHash,
    client_request_hash: input.clientRequestHash,
  };
}

function baseGraphAcquisitionMetadata(input: BaseOutlookGraphAcquisitionAuditInput) {
  return {
    acquisition_id: input.acquisitionId,
    request_id: input.requestId,
    addin_session_id: input.addinSessionId,
    mailbox_fingerprint_hash: input.mailboxFingerprintHash,
    message_hash: input.messageHash,
    attachment_id_hash: input.attachmentIdHash,
    attachment_count: input.attachmentCount,
    client_request_hash: input.clientRequestHash,
    scope_count: input.scopeCount,
    scope_set_hash: input.scopeSetHash,
  };
}

export function outlookAddinSessionExchangedAudit(
  input: BaseOutlookSessionAuditInput & {
    mailboxBindingId: string;
    expiresAt: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_ADDIN_SESSION_EXCHANGED',
    targetType: 'outlook_addin_session',
    targetId: input.addinSessionId,
    metadata: {
      ...baseSessionMetadata(input),
      mailbox_binding_id: input.mailboxBindingId,
      expires_at: input.expiresAt,
      outlook_status: 'active',
    },
  };
}

export function outlookAddinSessionDeniedAudit(
  input: BaseOutlookSessionAuditInput & {
    reasonCode: OutlookDeniedReasonCode;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_ADDIN_SESSION_DENIED',
    targetType: 'outlook_addin_session',
    targetId: input.addinSessionId,
    result: 'denied',
    metadata: {
      ...baseSessionMetadata(input),
      outlook_status: 'denied',
      reason_code: input.reasonCode,
    },
  };
}

export function outlookEmailFileRequestedAudit(
  input: BaseOutlookAuditInput & {
    status: OutlookFilingRequestStatus;
    duplicate: boolean;
    requestKind?: OutlookFilingRequestKind;
    policyDecision?: OutlookSendPolicyDecision;
    warningCodes?: readonly OutlookSendWarningReasonCode[];
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
      ...(input.requestKind ? { request_kind: input.requestKind } : {}),
      ...(input.policyDecision ? { policy_decision: input.policyDecision } : {}),
      ...(input.warningCodes?.length
        ? { warning_count: input.warningCodes.length, warning_codes: input.warningCodes }
        : {}),
      ...(input.duplicate ? { reason_code: 'duplicate' } : {}),
    },
  };
}

export function outlookSendPolicyEvaluatedAudit(
  input: BaseOutlookSendPolicyAuditInput & {
    decision: OutlookSendPolicyDecision;
    warningCodes: readonly OutlookSendWarningReasonCode[];
    deniedReasonCode?: OutlookDeniedReasonCode;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_SEND_POLICY_EVALUATED',
    targetType: 'outlook_send_policy',
    targetId: input.decisionId,
    matterId: input.matterId,
    result: input.decision === 'block' ? 'denied' : 'success',
    metadata: {
      ...baseSendPolicyMetadata(input),
      outlook_status: input.decision,
      policy_decision: input.decision,
      warning_count: input.warningCodes.length,
      ...(input.warningCodes.length > 0 ? { warning_codes: input.warningCodes } : {}),
      ...(input.deniedReasonCode ? { reason_code: input.deniedReasonCode } : {}),
    },
  };
}

export function outlookSendFileRequestedAudit(
  input: BaseOutlookAuditInput & {
    status: OutlookFilingRequestStatus;
    duplicate: boolean;
    policyDecision: Exclude<OutlookSendPolicyDecision, 'block'>;
    warningCodes: readonly OutlookSendWarningReasonCode[];
  },
): AuditLogInput {
  return {
    ...outlookEmailFileRequestedAudit({
      ...input,
      requestKind: 'send_and_file',
      policyDecision: input.policyDecision,
      warningCodes: input.warningCodes,
    }),
    action: 'OUTLOOK_SEND_FILE_REQUESTED',
  };
}

export function outlookGraphAttachmentAcquireRequestedAudit(
  input: BaseOutlookGraphAcquisitionAuditInput,
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_REQUESTED',
    targetType: 'outlook_graph_attachment_acquisition',
    targetId: input.acquisitionId,
    result: 'success',
    metadata: {
      ...baseGraphAcquisitionMetadata(input),
      outlook_status: 'queued',
    },
  };
}

export function outlookGraphAttachmentAcquiredAudit(
  input: BaseOutlookGraphAcquisitionAuditInput & {
    contentSha256: string;
    sizeBytes: number;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRED',
    targetType: 'outlook_graph_attachment_acquisition',
    targetId: input.acquisitionId,
    result: 'success',
    metadata: {
      ...baseGraphAcquisitionMetadata(input),
      hash: input.contentSha256,
      unit_count: input.sizeBytes,
      outlook_status: 'acquired',
    },
  };
}

export function outlookGraphAttachmentAcquireDeniedAudit(
  input: BaseOutlookGraphAcquisitionAuditInput & {
    reasonCode: OutlookDeniedReasonCode;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED',
    targetType: 'outlook_graph_attachment_acquisition',
    targetId: input.acquisitionId,
    result: 'denied',
    metadata: {
      ...baseGraphAcquisitionMetadata(input),
      outlook_status: 'denied',
      reason_code: input.reasonCode,
    },
  };
}

export function outlookEmailFileDeniedAudit(
  input: BaseOutlookAuditInput & {
    reasonCode: OutlookDeniedReasonCode;
    requestKind?: OutlookFilingRequestKind;
    policyDecision?: OutlookSendPolicyDecision;
    warningCodes?: readonly OutlookSendWarningReasonCode[];
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
      ...(input.requestKind ? { request_kind: input.requestKind } : {}),
      ...(input.policyDecision ? { policy_decision: input.policyDecision } : {}),
      ...(input.warningCodes?.length
        ? { warning_count: input.warningCodes.length, warning_codes: input.warningCodes }
        : {}),
      reason_code: input.reasonCode,
    },
  };
}

export function outlookSendFileDeniedAudit(
  input: BaseOutlookAuditInput & {
    reasonCode: OutlookDeniedReasonCode;
    policyDecision?: OutlookSendPolicyDecision;
    warningCodes?: readonly OutlookSendWarningReasonCode[];
  },
): AuditLogInput {
  return {
    ...outlookEmailFileDeniedAudit({
      ...input,
      requestKind: 'send_and_file',
      ...(input.policyDecision ? { policyDecision: input.policyDecision } : {}),
      ...(input.warningCodes ? { warningCodes: input.warningCodes } : {}),
    }),
    action: 'OUTLOOK_SEND_FILE_DENIED',
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
