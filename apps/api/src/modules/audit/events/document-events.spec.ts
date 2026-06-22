import { describe, expect, it } from 'vitest';
import {
  documentDeletedAudit,
  documentDownloadedAudit,
  documentCheckedInAudit,
  documentCheckedOutAudit,
  documentEditConflictAudit,
  documentLockExpiredAudit,
  documentSubversionReviewSubmittedAudit,
  documentSubversionReviewerAssignedAudit,
  documentSubversionReviewerRevokedAudit,
  documentSubversionSavedAudit,
  documentVersionPromotedAudit,
  documentVersionAddedAudit,
  documentUploadedAudit,
  documentViewedAudit,
} from './document-events';

const base = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorId: '11111111-1111-4111-8111-111111111101',
  documentId: '11111111-1111-4111-8111-1111111111dd',
  matterId: '11111111-1111-4111-8111-1111111111aa',
};

describe('document audit event builders', () => {
  it('builds upload metadata with reference identifiers and hash only', () => {
    const event = documentUploadedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v1',
      hash: 'a'.repeat(64),
    });

    expect(event).toMatchObject({
      action: 'DOCUMENT_UPLOADED',
      targetType: 'document',
      targetId: base.documentId,
      metadata: {
        document_id: base.documentId,
        matter_id: base.matterId,
        version_id: '11111111-1111-4111-8111-1111111111v1',
        hash: 'a'.repeat(64),
      },
    });
  });

  it('requires a view channel', () => {
    expect(() =>
      documentViewedAudit({
        ...base,
        versionId: '11111111-1111-4111-8111-1111111111v1',
        channel: undefined as never,
      }),
    ).toThrow('channel');

    expect(
      documentViewedAudit({
        ...base,
        versionId: '11111111-1111-4111-8111-1111111111v1',
        channel: 'preview',
      }).metadata,
    ).toMatchObject({ channel: 'preview' });
  });

  it('stores download reason code without reason text', () => {
    const event = documentDownloadedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v1',
      hash: 'b'.repeat(64),
      reasonCode: 'client_request',
    });

    expect(event.metadata).toMatchObject({ reason_code: 'client_request' });
    expect(JSON.stringify(event.metadata)).not.toContain('requested copy');
  });

  it('records internal subversion file opens without document content', () => {
    const event = documentDownloadedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111b1',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
      hash: 'b'.repeat(64),
      reasonCode: 'SUBVERSION_REVIEW_FILE',
    });

    expect(event.metadata).toMatchObject({
      reason_code: 'SUBVERSION_REVIEW_FILE',
      subversion_id: '11111111-1111-4111-8111-1111111111s1',
      version_id: '11111111-1111-4111-8111-1111111111b1',
    });
    expect(JSON.stringify(event.metadata)).not.toContain('Draft Review');
  });

  it('records duplicate upload decisions as bounded audit codes', () => {
    const uploadEvent = documentUploadedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v1',
      duplicateDecision: { decision: 'new_document', candidateCount: 2 },
    });
    const versionEvent = documentVersionAddedAudit({
      ...base,
      versionId: '11111111-1111-4111-8111-1111111111v2',
      duplicateDecision: { decision: 'new_version', candidateCount: 1 },
    });

    expect(uploadEvent.metadata).toMatchObject({
      reason_code: 'duplicate_new_document',
      result_count: 2,
    });
    expect(versionEvent.metadata).toMatchObject({
      reason_code: 'duplicate_new_version',
      result_count: 1,
    });
    expect(JSON.stringify([uploadEvent.metadata, versionEvent.metadata])).not.toContain(
      'Investment memo',
    );
  });

  it('records delete status references only', () => {
    expect(
      documentDeletedAudit({
        ...base,
        beforeRef: 'document_status:draft',
        afterRef: 'document_status:deleted',
      }).metadata,
    ).toEqual({
      document_id: base.documentId,
      matter_id: base.matterId,
      before_ref: 'document_status:draft',
      after_ref: 'document_status:deleted',
    });
  });

  it('records edit lifecycle metadata as references and bounded codes only', () => {
    const checkedOut = documentCheckedOutAudit({
      ...base,
      editSessionId: '11111111-1111-4111-8111-1111111111e1',
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      baseVersionNo: 3,
      clientKind: 'outlook',
      expiresAt: '2026-06-22T00:15:00.000Z',
      reasonCode: 'EMAIL_DRAFT',
    });
    const saved = documentSubversionSavedAudit({
      ...base,
      editSessionId: '11111111-1111-4111-8111-1111111111e1',
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
      baseVersionNo: 3,
      subversionNo: 2,
      fileObjectId: '11111111-1111-4111-8111-1111111111f1',
      hash: 'c'.repeat(64),
      visibilityScope: 'matter_editors',
      reasonCode: 'AUTOSAVE',
    });
    const checkedIn = documentCheckedInAudit({
      ...base,
      editSessionId: '11111111-1111-4111-8111-1111111111e1',
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
    });
    const promoted = documentVersionPromotedAudit({
      ...base,
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
      promotedVersionId: '11111111-1111-4111-8111-1111111111v4',
      versionNo: 4,
      reasonCode: 'CLIENT_READY',
    });

    expect(checkedOut.metadata).toMatchObject({
      edit_session_id: '11111111-1111-4111-8111-1111111111e1',
      base_version_id: '11111111-1111-4111-8111-1111111111b1',
      version_no: 3,
      client_kind: 'outlook',
      reason_code: 'EMAIL_DRAFT',
    });
    expect(saved.metadata).toMatchObject({
      subversion_id: '11111111-1111-4111-8111-1111111111s1',
      subversion_no: 2,
      file_object_id: '11111111-1111-4111-8111-1111111111f1',
      visibility_scope: 'matter_editors',
      hash: 'c'.repeat(64),
    });
    expect(checkedIn.metadata).toMatchObject({
      edit_session_id: '11111111-1111-4111-8111-1111111111e1',
      subversion_id: '11111111-1111-4111-8111-1111111111s1',
    });
    expect(promoted.metadata).toMatchObject({
      promoted_version_id: '11111111-1111-4111-8111-1111111111v4',
      version_id: '11111111-1111-4111-8111-1111111111v4',
      version_no: 4,
    });
    expect(JSON.stringify([checkedOut.metadata, saved.metadata, promoted.metadata])).not.toContain(
      'draft clause',
    );
  });

  it('records conflict and lock expiry as failure events without document text', () => {
    const conflict = documentEditConflictAudit({
      ...base,
      editSessionId: '11111111-1111-4111-8111-1111111111e1',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      currentVersionId: '11111111-1111-4111-8111-1111111111v4',
      reasonCode: 'BASE_VERSION_STALE',
    });
    const expired = documentLockExpiredAudit({
      ...base,
      editSessionId: '11111111-1111-4111-8111-1111111111e1',
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
    });

    expect(conflict.result).toBe('failure');
    expect(conflict.metadata).toMatchObject({
      reason_code: 'BASE_VERSION_STALE',
      version_id: '11111111-1111-4111-8111-1111111111v4',
    });
    expect(expired.result).toBe('failure');
    expect(expired.metadata).toMatchObject({ reason_code: 'EDIT_SESSION_EXPIRED' });
    expect(JSON.stringify([conflict.metadata, expired.metadata])).not.toContain('negotiation');
  });

  it('records subversion reviewer ACL changes as reference-only metadata', () => {
    const assigned = documentSubversionReviewerAssignedAudit({
      ...base,
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
      subversionReviewerId: '11111111-1111-4111-8111-1111111111r1',
      reviewerUserId: '11111111-1111-4111-8111-1111111111u2',
    });
    const revoked = documentSubversionReviewerRevokedAudit({
      ...base,
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
      subversionReviewerId: '11111111-1111-4111-8111-1111111111r1',
      reviewerUserId: '11111111-1111-4111-8111-1111111111u2',
    });

    expect(assigned.action).toBe('DOCUMENT_SUBVERSION_REVIEWER_ASSIGNED');
    expect(revoked.action).toBe('DOCUMENT_SUBVERSION_REVIEWER_REVOKED');
    expect(assigned.metadata).toMatchObject({
      subversion_id: '11111111-1111-4111-8111-1111111111s1',
      subversion_reviewer_id: '11111111-1111-4111-8111-1111111111r1',
      target_user_id: '11111111-1111-4111-8111-1111111111u2',
    });
    expect(JSON.stringify([assigned.metadata, revoked.metadata])).not.toContain('review note');
  });

  it('records subversion review decisions as reference-only metadata', () => {
    const event = documentSubversionReviewSubmittedAudit({
      ...base,
      baseVersionId: '11111111-1111-4111-8111-1111111111b1',
      decision: 'approved',
      reviewerUserId: '11111111-1111-4111-8111-1111111111u2',
      subversionId: '11111111-1111-4111-8111-1111111111s1',
      subversionReviewId: '11111111-1111-4111-8111-1111111111d1',
      subversionReviewerId: '11111111-1111-4111-8111-1111111111r1',
    });

    expect(event.action).toBe('DOCUMENT_SUBVERSION_REVIEW_SUBMITTED');
    expect(event.metadata).toMatchObject({
      review_decision: 'approved',
      subversion_id: '11111111-1111-4111-8111-1111111111s1',
      subversion_review_id: '11111111-1111-4111-8111-1111111111d1',
      subversion_reviewer_id: '11111111-1111-4111-8111-1111111111r1',
      target_user_id: '11111111-1111-4111-8111-1111111111u2',
    });
    expect(JSON.stringify(event.metadata)).not.toContain('redline comment');
  });
});
