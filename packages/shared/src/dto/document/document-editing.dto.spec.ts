import { describe, expect, it } from 'vitest';
import {
  assignDocumentSubversionReviewerSchema,
  cancelDocumentEditSessionSchema,
  createDocumentEditSessionSchema,
  documentEditPackageModeSchema,
  documentEditingFailureReasonSchema,
  forceReleaseDocumentEditSessionSchema,
  promoteDocumentSubversionSchema,
  saveDocumentSubversionFieldsSchema,
  saveNativeDocumentEditDraftSchema,
  submitDocumentSubversionReviewSchema,
} from './document-editing.dto';

const lockToken = 'a'.repeat(64);

describe('document editing DTO schemas', () => {
  it('parses checkout requests with bounded reason codes and safe idempotency', () => {
    expect(
      createDocumentEditSessionSchema.parse({
        baseVersionId: '11111111-1111-4111-8111-111111111111',
        checkoutReasonCode: 'CLIENT_REVISION',
        requestedTtlSeconds: 900,
        idempotencyKey: 'checkout-2026:0001',
      }),
    ).toMatchObject({
      clientKind: 'web_upload',
      checkoutReasonCode: 'CLIENT_REVISION',
    });

    expect(() =>
      createDocumentEditSessionSchema.parse({
        checkoutReasonCode: 'client asked us to rewrite the indemnity clause',
        idempotencyKey: 'checkout-2026:0001',
      }),
    ).toThrow();
    expect(() =>
      createDocumentEditSessionSchema.parse({
        idempotencyKey: 'checkout-2026:0001',
        rawToken: 'not allowed',
      }),
    ).toThrow();
  });

  it('parses internal subversion save fields without free-text notes', () => {
    expect(saveDocumentSubversionFieldsSchema.parse({ lockToken })).toEqual({
      lockToken,
      visibilityScope: 'session_owner',
    });
    expect(
      saveDocumentSubversionFieldsSchema.parse({
        editPackageMode: 'binary_roundtrip',
        expectedBaseSha256: 'A'.repeat(64),
        lockToken,
        visibilityScope: 'reviewers',
        saveReasonCode: 'INTERNAL_REVIEW',
        clientSaveId: 'save-2026:0001',
      }),
    ).toMatchObject({
      editPackageMode: 'binary_roundtrip',
      expectedBaseSha256: 'a'.repeat(64),
      lockToken,
      visibilityScope: 'reviewers',
      saveReasonCode: 'INTERNAL_REVIEW',
    });
    expect(() =>
      saveDocumentSubversionFieldsSchema.parse({
        expectedBaseSha256: 'not-a-sha',
      }),
    ).toThrow();
    expect(() =>
      saveDocumentSubversionFieldsSchema.parse({
        saveNote: 'contains possible negotiation strategy',
      }),
    ).toThrow();
    expect(() => saveDocumentSubversionFieldsSchema.parse({})).toThrow();
  });

  it('parses native draft saves as bounded internal subversion payloads', () => {
    expect(
      saveNativeDocumentEditDraftSchema.parse({
        clientSaveId: 'native-save-2026:0001',
        content: 'client-approved clause draft',
        lockToken,
        saveReasonCode: 'NATIVE_SAVE',
        visibilityScope: 'matter_editors',
      }),
    ).toMatchObject({
      content: 'client-approved clause draft',
      lockToken,
      saveReasonCode: 'NATIVE_SAVE',
      visibilityScope: 'matter_editors',
    });
    expect(() =>
      saveNativeDocumentEditDraftSchema.parse({
        content: 'x'.repeat(1_000_001),
      }),
    ).toThrow();
    expect(() =>
      saveNativeDocumentEditDraftSchema.parse({
        content: 'draft',
        rawComment: 'negotiation strategy',
      }),
    ).toThrow();
    expect(() =>
      saveNativeDocumentEditDraftSchema.parse({
        content: 'draft',
      }),
    ).toThrow();
  });

  it('keeps edit package modes explicit so UI cannot imply live Office editing', () => {
    expect(documentEditPackageModeSchema.parse('vault_text')).toBe('vault_text');
    expect(documentEditPackageModeSchema.parse('binary_roundtrip')).toBe('binary_roundtrip');
    expect(() => documentEditPackageModeSchema.parse('office_live')).toThrow();
  });

  it('parses bounded reviewer ACL assignments for internal subversions', () => {
    expect(
      assignDocumentSubversionReviewerSchema.parse({
        reviewerUserId: '11111111-1111-4111-8111-111111111222',
      }),
    ).toEqual({ reviewerUserId: '11111111-1111-4111-8111-111111111222' });
    expect(() =>
      assignDocumentSubversionReviewerSchema.parse({
        reviewerUserId: 'not-a-user-id',
      }),
    ).toThrow();
    expect(() =>
      assignDocumentSubversionReviewerSchema.parse({
        reviewerUserId: '11111111-1111-4111-8111-111111111222',
        comment: 'review this negotiation draft',
      }),
    ).toThrow();
  });

  it('parses structured subversion review decisions without free-text comments', () => {
    expect(
      submitDocumentSubversionReviewSchema.parse({
        decision: 'approved',
      }),
    ).toEqual({ decision: 'approved' });
    expect(
      submitDocumentSubversionReviewSchema.parse({
        decision: 'changes_requested',
      }),
    ).toEqual({ decision: 'changes_requested' });
    expect(() =>
      submitDocumentSubversionReviewSchema.parse({
        decision: 'approve after client call',
      }),
    ).toThrow();
    expect(() =>
      submitDocumentSubversionReviewSchema.parse({
        decision: 'approved',
        comment: 'contains negotiation strategy',
      }),
    ).toThrow();
  });

  it('separates cancel and promote contracts from standard error codes', () => {
    expect(
      cancelDocumentEditSessionSchema.parse({
        cancelledReasonCode: 'USER_CANCELLED',
        lockToken,
      }),
    ).toEqual({
      cancelledReasonCode: 'USER_CANCELLED',
      lockToken,
    });
    expect(() =>
      cancelDocumentEditSessionSchema.parse({
        cancelledReasonCode: 'USER_CANCELLED',
      }),
    ).toThrow();
    expect(
      forceReleaseDocumentEditSessionSchema.parse({
        forceReleaseReasonCode: 'OWNER_FORCE_RELEASE',
      }),
    ).toEqual({
      forceReleaseReasonCode: 'OWNER_FORCE_RELEASE',
    });
    expect(() => forceReleaseDocumentEditSessionSchema.parse({})).toThrow();
    expect(() =>
      forceReleaseDocumentEditSessionSchema.parse({
        forceReleaseReasonCode: 'owner asked in chat',
      }),
    ).toThrow();
    expect(
      promoteDocumentSubversionSchema.parse({
        expectedBaseVersionId: '11111111-1111-4111-8111-111111111111',
        publishReasonCode: 'APPROVED_FINAL',
        idempotencyKey: 'promote-2026:0001',
      }),
    ).toMatchObject({
      publishReasonCode: 'APPROVED_FINAL',
    });
    expect(documentEditingFailureReasonSchema.parse('base_version_stale')).toBe('base_version_stale');
    expect(documentEditingFailureReasonSchema.parse('native_edit_unsupported')).toBe(
      'native_edit_unsupported',
    );
    expect(documentEditingFailureReasonSchema.parse('review_required')).toBe('review_required');
    expect(documentEditingFailureReasonSchema.parse('review_changes_requested')).toBe(
      'review_changes_requested',
    );
  });
});
