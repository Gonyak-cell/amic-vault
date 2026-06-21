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
  input: VersionedDocumentEventInput & { reasonCode?: string },
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
