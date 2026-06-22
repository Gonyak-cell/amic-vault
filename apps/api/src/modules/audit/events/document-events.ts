import type { AuditLogInput } from '../audit.service';

type DocumentViewChannel = 'detail' | 'preview';

interface BaseDocumentEventInput {
  tenantId: string;
  actorId: string;
  documentId: string;
  matterId: string;
}

interface VersionedDocumentEventInput extends BaseDocumentEventInput {
  versionId: string;
  hash?: string;
  duplicateDecision?: DuplicateDecisionAudit;
  matterSourceDecision?: MatterSourceAuditDecision;
}

interface DuplicateDecisionAudit {
  decision: 'new_document' | 'new_version';
  candidateCount: number;
}

interface MatterSourceAuditDecision {
  decisionRef: string;
  preflightRef?: string;
  sourceMode: string;
}

interface EditSessionDocumentEventInput extends BaseDocumentEventInput {
  editSessionId: string;
  baseVersionId: string;
}

function matterSourceMetadata(decision: MatterSourceAuditDecision | undefined) {
  if (!decision) return {};
  return {
    decision_ref: decision.decisionRef,
    scope_id: decision.sourceMode,
    scope_type: 'matter_app_source',
    ...(decision.preflightRef ? { request_id: decision.preflightRef } : {}),
  };
}

function duplicateDecisionMetadata(decision: DuplicateDecisionAudit | undefined) {
  if (!decision) return {};
  return {
    reason_code: `duplicate_${decision.decision}`,
    result_count: decision.candidateCount,
  };
}

export function documentUploadedAudit(input: VersionedDocumentEventInput): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_UPLOADED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      version_id: input.versionId,
      ...(input.hash ? { hash: input.hash } : {}),
      ...matterSourceMetadata(input.matterSourceDecision),
      ...duplicateDecisionMetadata(input.duplicateDecision),
    },
  };
}

export function documentVersionAddedAudit(input: VersionedDocumentEventInput): AuditLogInput {
  return {
    ...documentUploadedAudit(input),
    action: 'DOCUMENT_VERSION_ADDED',
  };
}

export function documentCheckedOutAudit(
  input: EditSessionDocumentEventInput & {
    baseVersionNo: number;
    clientKind: string;
    expiresAt: string;
    reasonCode?: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_CHECKED_OUT',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      edit_session_id: input.editSessionId,
      base_version_id: input.baseVersionId,
      version_no: input.baseVersionNo,
      client_kind: input.clientKind,
      expires_at: input.expiresAt,
      ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
    },
  };
}

export function documentSubversionSavedAudit(
  input: EditSessionDocumentEventInput & {
    subversionId: string;
    baseVersionNo: number;
    subversionNo: number;
    fileObjectId: string;
    hash: string;
    visibilityScope: string;
    reasonCode?: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_SUBVERSION_SAVED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      edit_session_id: input.editSessionId,
      subversion_id: input.subversionId,
      base_version_id: input.baseVersionId,
      version_no: input.baseVersionNo,
      subversion_no: input.subversionNo,
      file_object_id: input.fileObjectId,
      hash: input.hash,
      visibility_scope: input.visibilityScope,
      ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
    },
  };
}

export function documentCheckinCancelledAudit(
  input: EditSessionDocumentEventInput & { reasonCode?: string },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_CHECKIN_CANCELLED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      edit_session_id: input.editSessionId,
      base_version_id: input.baseVersionId,
      ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
    },
  };
}

export function documentCheckedInAudit(
  input: EditSessionDocumentEventInput & { subversionId: string },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_CHECKED_IN',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      edit_session_id: input.editSessionId,
      subversion_id: input.subversionId,
      base_version_id: input.baseVersionId,
    },
  };
}

export function documentVersionPromotedAudit(
  input: BaseDocumentEventInput & {
    subversionId: string;
    baseVersionId: string;
    promotedVersionId: string;
    versionNo: number;
    reasonCode?: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_VERSION_PROMOTED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      subversion_id: input.subversionId,
      base_version_id: input.baseVersionId,
      promoted_version_id: input.promotedVersionId,
      version_id: input.promotedVersionId,
      version_no: input.versionNo,
      ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
    },
  };
}

export function documentSubversionReviewerAssignedAudit(
  input: BaseDocumentEventInput & {
    subversionId: string;
    baseVersionId: string;
    subversionReviewerId: string;
    reviewerUserId: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_SUBVERSION_REVIEWER_ASSIGNED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      subversion_id: input.subversionId,
      base_version_id: input.baseVersionId,
      subversion_reviewer_id: input.subversionReviewerId,
      target_user_id: input.reviewerUserId,
    },
  };
}

export function documentSubversionReviewerRevokedAudit(
  input: BaseDocumentEventInput & {
    subversionId: string;
    baseVersionId: string;
    subversionReviewerId: string;
    reviewerUserId: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_SUBVERSION_REVIEWER_REVOKED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      subversion_id: input.subversionId,
      base_version_id: input.baseVersionId,
      subversion_reviewer_id: input.subversionReviewerId,
      target_user_id: input.reviewerUserId,
    },
  };
}

export function documentSubversionReviewSubmittedAudit(
  input: BaseDocumentEventInput & {
    subversionId: string;
    baseVersionId: string;
    subversionReviewId: string;
    subversionReviewerId: string;
    reviewerUserId: string;
    decision: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_SUBVERSION_REVIEW_SUBMITTED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      subversion_id: input.subversionId,
      base_version_id: input.baseVersionId,
      subversion_review_id: input.subversionReviewId,
      subversion_reviewer_id: input.subversionReviewerId,
      target_user_id: input.reviewerUserId,
      review_decision: input.decision,
    },
  };
}

export function documentEditConflictAudit(
  input: BaseDocumentEventInput & {
    editSessionId?: string;
    subversionId?: string;
    baseVersionId: string;
    currentVersionId?: string;
    reasonCode: string;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_EDIT_CONFLICT',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    result: 'failure',
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      base_version_id: input.baseVersionId,
      ...(input.editSessionId ? { edit_session_id: input.editSessionId } : {}),
      ...(input.subversionId ? { subversion_id: input.subversionId } : {}),
      ...(input.currentVersionId ? { version_id: input.currentVersionId } : {}),
      reason_code: input.reasonCode,
    },
  };
}

export function documentLockExpiredAudit(input: EditSessionDocumentEventInput): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_LOCK_EXPIRED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    result: 'failure',
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      edit_session_id: input.editSessionId,
      base_version_id: input.baseVersionId,
      reason_code: 'EDIT_SESSION_EXPIRED',
    },
  };
}

export function documentViewedAudit(
  input: VersionedDocumentEventInput & { channel: DocumentViewChannel },
): AuditLogInput {
  if (!input.channel) {
    throw new Error('document view audit channel is required');
  }
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_VIEWED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      version_id: input.versionId,
      channel: input.channel,
    },
  };
}

export function documentDownloadedAudit(
  input: VersionedDocumentEventInput & { reasonCode?: string; subversionId?: string },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_DOWNLOADED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      version_id: input.versionId,
      ...(input.subversionId ? { subversion_id: input.subversionId } : {}),
      ...(input.hash ? { hash: input.hash } : {}),
      ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
    },
  };
}

export function documentMetadataChangedAudit(
  input: BaseDocumentEventInput & {
    diffKeys: readonly string[];
    beforeRef: string;
    afterRef: string;
    matterSourceDecision?: MatterSourceAuditDecision;
  },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_METADATA_CHANGED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      diff_keys: input.diffKeys,
      before_ref: input.beforeRef,
      after_ref: input.afterRef,
      ...matterSourceMetadata(input.matterSourceDecision),
    },
  };
}

export function documentDeletedAudit(
  input: BaseDocumentEventInput & { beforeRef: string; afterRef: string },
): AuditLogInput {
  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'DOCUMENT_DELETED',
    targetType: 'document',
    targetId: input.documentId,
    matterId: input.matterId,
    metadata: {
      document_id: input.documentId,
      matter_id: input.matterId,
      before_ref: input.beforeRef,
      after_ref: input.afterRef,
    },
  };
}

export function documentRestoredAudit(
  input: BaseDocumentEventInput & { beforeRef: string; afterRef: string },
): AuditLogInput {
  return {
    ...documentDeletedAudit(input),
    action: 'DOCUMENT_RESTORED',
  };
}
