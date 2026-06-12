import type { EmailParseStatus } from '@amic-vault/shared';
import type { AuditLogInput } from '../audit.service';

interface BaseEmailEventInput {
  tenantId: string;
  actorId?: string | null;
  emailId: string;
}

export function emailImportedAudit(
  input: BaseEmailEventInput & {
    rawFileObjectId: string;
    rawSha256: string;
    parseStatus: EmailParseStatus;
    failureReasonCode?: string | null;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_IMPORTED',
    targetType: 'email',
    targetId: input.emailId,
    metadata: {
      scope_type: 'email',
      scope_id: input.emailId,
      hash: input.rawSha256,
      before_ref: 'source_system:email_ingest',
      after_ref: `parse_status:${input.parseStatus}`,
      ...(input.failureReasonCode ? { reason_code: input.failureReasonCode } : {}),
      file_object_id: input.rawFileObjectId,
    },
  };
}

export function emailDuplicateBlockedAudit(
  input: BaseEmailEventInput & {
    messageIdHash: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_DUPLICATE_BLOCKED',
    targetType: 'email',
    targetId: input.emailId,
    result: 'denied',
    metadata: {
      scope_type: 'email_message_id',
      scope_id: input.emailId,
      hash: input.messageIdHash,
      reason_code: 'DUPLICATE_MESSAGE_ID',
    },
  };
}

export function emailMetadataUpdatedAudit(
  input: BaseEmailEventInput & {
    participantCount: number;
    warningCode?: string | null;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_METADATA_UPDATED',
    targetType: 'email',
    targetId: input.emailId,
    metadata: {
      scope_type: 'email_metadata',
      scope_id: input.emailId,
      result_count: input.participantCount,
      ...(input.warningCode ? { reason_code: input.warningCode } : {}),
    },
  };
}

export function emailFiledAudit(
  input: BaseEmailEventInput & {
    matterId: string;
    documentIds: readonly string[];
  },
): AuditLogInput {
  const [firstDocumentId] = input.documentIds;
  const filterRefs = input.documentIds
    .slice(0, 4)
    .map((documentId) => `document_id:${documentId}`)
    .join(',');
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_FILED',
    targetType: 'email',
    targetId: input.emailId,
    matterId: input.matterId,
    metadata: {
      scope_type: 'email_filing',
      scope_id: input.emailId,
      matter_id: input.matterId,
      result_count: input.documentIds.length,
      ...(firstDocumentId ? { document_id: firstDocumentId } : {}),
      ...(filterRefs ? { filter_refs: filterRefs } : {}),
    },
  };
}
