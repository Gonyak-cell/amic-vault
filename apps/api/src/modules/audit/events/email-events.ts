import type { EmailMatterSuggestionConfidenceBand, EmailParseStatus } from '@amic-vault/shared';
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
    parserVersionBefore?: string | null;
    parserVersionAfter?: string | null;
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
      ...(input.parserVersionBefore ? { before_ref: `parser_version:${input.parserVersionBefore}` } : {}),
      ...(input.parserVersionAfter ? { after_ref: `parser_version:${input.parserVersionAfter}` } : {}),
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

export function emailFilingRevertedAudit(
  input: BaseEmailEventInput & {
    matterId: string;
    feedbackAction: 'undone' | 'changed' | 'rejected';
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_FILING_REVERTED',
    targetType: 'email',
    targetId: input.emailId,
    matterId: input.matterId,
    metadata: {
      scope_type: 'email_filing',
      scope_id: input.emailId,
      matter_id: input.matterId,
      feedback_action: input.feedbackAction,
    },
  };
}

export function emailSuggestionAutofiledAudit(
  input: BaseEmailEventInput & {
    matterId: string;
    confidence: number;
    confidenceBand: EmailMatterSuggestionConfidenceBand;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_SUGGESTION_AUTOFILED',
    targetType: 'email',
    targetId: input.emailId,
    matterId: input.matterId,
    metadata: {
      scope_type: 'email_filing_suggestion',
      scope_id: input.emailId,
      matter_id: input.matterId,
      selected_matter_id: input.matterId,
      confidence_band: input.confidenceBand,
      confidence_score: input.confidence,
    },
  };
}

export function emailSuggestionFeedbackRecordedAudit(
  input: BaseEmailEventInput & {
    suggestedMatterId: string | null;
    selectedMatterId: string | null;
    feedbackAction: 'accepted' | 'changed' | 'rejected' | 'undone';
    confidence?: number | null;
    confidenceBand?: EmailMatterSuggestionConfidenceBand | null;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_SUGGESTION_FEEDBACK_RECORDED',
    targetType: 'email',
    targetId: input.emailId,
    matterId: input.selectedMatterId ?? input.suggestedMatterId,
    metadata: {
      scope_type: 'email_filing_suggestion',
      scope_id: input.emailId,
      ...(input.suggestedMatterId ? { suggested_matter_id: input.suggestedMatterId } : {}),
      ...(input.selectedMatterId ? { selected_matter_id: input.selectedMatterId } : {}),
      feedback_action: input.feedbackAction,
      ...(input.confidenceBand ? { confidence_band: input.confidenceBand } : {}),
      ...(typeof input.confidence === 'number' ? { confidence_score: input.confidence } : {}),
    },
  };
}

export function emailRawDownloadedAudit(
  input: BaseEmailEventInput & {
    matterId: string;
    rawFileObjectId: string;
    rawSha256: string;
    reasonCode?: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: 'EMAIL_RAW_DOWNLOADED',
    targetType: 'email',
    targetId: input.emailId,
    matterId: input.matterId,
    metadata: {
      scope_type: 'email_raw',
      scope_id: input.emailId,
      matter_id: input.matterId,
      file_object_id: input.rawFileObjectId,
      hash: input.rawSha256,
      ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
    },
  };
}
