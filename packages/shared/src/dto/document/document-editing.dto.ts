import { z } from 'zod';
import type { DisplayFieldsDto } from '../../display/display-fields.dto';

const boundedClientTokenSchema = z
  .string()
  .trim()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);

const boundedReasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Z0-9_]+$/);

const sha256Schema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/)
  .transform((value) => value.toLowerCase());

export const documentEditSessionStatuses = [
  'active',
  'checked_in',
  'cancelled',
  'expired',
  'conflicted',
] as const;

export const documentEditSessionStatusSchema = z.enum(documentEditSessionStatuses);

export const documentEditClientKinds = ['web_upload', 'office_web', 'office_desktop', 'outlook'] as const;

export const documentEditClientKindSchema = z.enum(documentEditClientKinds);

export const documentSubversionStatuses = ['saved', 'submitted', 'abandoned', 'promoted'] as const;

export const documentSubversionStatusSchema = z.enum(documentSubversionStatuses);

export const documentSubversionVisibilityScopes = [
  'session_owner',
  'reviewers',
  'matter_owners',
  'matter_editors',
] as const;

export const documentSubversionVisibilityScopeSchema = z.enum(documentSubversionVisibilityScopes);

export const documentEditPackageModes = ['vault_text', 'binary_roundtrip'] as const;

export const documentEditPackageModeSchema = z.enum(documentEditPackageModes);

export const documentSubversionReviewDecisions = ['approved', 'changes_requested'] as const;

export const documentSubversionReviewDecisionSchema = z.enum(documentSubversionReviewDecisions);

export const documentSubversionReviewGateStatuses = [
  'not_required',
  'pending',
  'changes_requested',
  'approved',
] as const;

export const documentSubversionReviewGateStatusSchema = z.enum(
  documentSubversionReviewGateStatuses,
);

export const documentEditingFailureReasons = [
  'document_already_checked_out',
  'edit_session_not_found',
  'edit_session_expired',
  'edit_session_conflict',
  'base_version_stale',
  'subversion_required',
  'subversion_not_found',
  'subversion_not_promotable',
  'promotion_conflict',
  'native_edit_unsupported',
  'native_edit_too_large',
  'review_not_allowed',
  'review_required',
  'review_changes_requested',
] as const;

export const documentEditingFailureReasonSchema = z.enum(documentEditingFailureReasons);

export const createDocumentEditSessionSchema = z
  .object({
    baseVersionId: z.string().uuid().optional(),
    clientKind: documentEditClientKindSchema.default('web_upload'),
    checkoutReasonCode: boundedReasonCodeSchema.optional(),
    requestedTtlSeconds: z.number().int().min(300).max(7200).optional(),
    idempotencyKey: boundedClientTokenSchema,
  })
  .strict();

export const heartbeatDocumentEditSessionSchema = z
  .object({
    requestedTtlSeconds: z.number().int().min(300).max(7200).optional(),
  })
  .strict();

export const cancelDocumentEditSessionSchema = z
  .object({
    cancelledReasonCode: boundedReasonCodeSchema.optional(),
  })
  .strict();

export const saveDocumentSubversionFieldsSchema = z
  .object({
    visibilityScope: documentSubversionVisibilityScopeSchema.default('session_owner'),
    saveReasonCode: boundedReasonCodeSchema.optional(),
    clientSaveId: boundedClientTokenSchema.optional(),
    expectedBaseSha256: sha256Schema.optional(),
    editPackageMode: documentEditPackageModeSchema.optional(),
  })
  .strict();

export const saveNativeDocumentEditDraftSchema = saveDocumentSubversionFieldsSchema
  .extend({
    content: z.string().max(1_000_000),
  })
  .strict();

export const checkInDocumentEditSessionSchema = z
  .object({
    expectedLastSubversionId: z.string().uuid().optional(),
  })
  .strict();

export const promoteDocumentSubversionSchema = z
  .object({
    expectedBaseVersionId: z.string().uuid(),
    publishReasonCode: boundedReasonCodeSchema.optional(),
    idempotencyKey: boundedClientTokenSchema,
  })
  .strict();

export const assignDocumentSubversionReviewerSchema = z
  .object({
    reviewerUserId: z.string().uuid(),
  })
  .strict();

export const submitDocumentSubversionReviewSchema = z
  .object({
    decision: documentSubversionReviewDecisionSchema,
  })
  .strict();

export interface DocumentEditSessionDto {
  editSessionId: string;
  documentId: string;
  baseVersionId: string;
  baseVersionNo: number;
  status: DocumentEditSessionStatus;
  clientKind: DocumentEditClientKind;
  lockOwnerUserId: string;
  checkedOutAt: string;
  heartbeatAt: string;
  expiresAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  conflictedAt: string | null;
}

export interface DocumentSubversionDto {
  subversionId: string;
  documentId: string;
  baseVersionId: string;
  baseVersionNo: number;
  subversionNo: number;
  displayVersion: string;
  editSessionId: string;
  status: DocumentSubversionStatus;
  visibilityScope: DocumentSubversionVisibilityScope;
  fileObjectId: string;
  fileHash: string;
  createdBy: string;
  createdAt: string;
  submittedAt: string | null;
  promotedVersionId: string | null;
  reviewGate: DocumentSubversionReviewGateDto;
}

export interface DocumentSubversionReviewGateDto {
  status: DocumentSubversionReviewGateStatus;
  activeReviewerCount: number;
  approvedReviewCount: number;
  changesRequestedCount: number;
}

export interface DocumentNativeEditDraftDto {
  documentId: string;
  editSessionId: string;
  baseVersionId: string;
  baseVersionNo: number;
  filename: string;
  mimeType: string;
  content: string;
  sizeBytes: number;
  sha256: string;
}

export interface DocumentEditPackageDto {
  documentId: string;
  editSessionId: string;
  baseVersionId: string;
  baseVersionNo: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  mode: DocumentEditPackageMode;
  canOpenInVaultEditor: boolean;
  baseFileUrl: string;
  saveSubversionUrl: string;
  checkInUrl: string;
  nativeDraftUrl: string | null;
  expiresAt: string;
}

export interface DocumentSubversionListDto {
  items: DocumentSubversionDto[];
}

export interface DocumentSubversionReviewerDto extends DisplayFieldsDto {
  subversionReviewerId: string;
  subversionId: string;
  documentId: string;
  reviewerUserId: string;
  assignedBy: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
}

export interface DocumentSubversionReviewerListDto {
  items: DocumentSubversionReviewerDto[];
}

export interface DocumentSubversionReviewDto extends DisplayFieldsDto {
  subversionReviewId: string;
  subversionReviewerId: string;
  subversionId: string;
  documentId: string;
  reviewerUserId: string;
  decision: DocumentSubversionReviewDecision;
  decidedAt: string;
}

export interface DocumentSubversionReviewListDto {
  items: DocumentSubversionReviewDto[];
}

export interface PromoteDocumentSubversionResponseDto {
  documentId: string;
  subversionId: string;
  promotedVersionId: string;
  versionNo: number;
  versionStatus: 'current';
  supersedesVersionId: string;
  promotedFromSubversionId: string;
  publishedAt: string;
}

export interface DocumentEditingFailureDto {
  code: 'DOCUMENT_LOCKED' | 'PERMISSION_DENIED' | 'VALIDATION_FAILED';
  reason: DocumentEditingFailureReason;
}

export type DocumentEditSessionStatus = (typeof documentEditSessionStatuses)[number];
export type DocumentEditClientKind = (typeof documentEditClientKinds)[number];
export type DocumentEditPackageMode = (typeof documentEditPackageModes)[number];
export type DocumentSubversionStatus = (typeof documentSubversionStatuses)[number];
export type DocumentSubversionVisibilityScope = (typeof documentSubversionVisibilityScopes)[number];
export type DocumentSubversionReviewDecision =
  (typeof documentSubversionReviewDecisions)[number];
export type DocumentSubversionReviewGateStatus =
  (typeof documentSubversionReviewGateStatuses)[number];
export type DocumentEditingFailureReason = (typeof documentEditingFailureReasons)[number];
export type CreateDocumentEditSessionDto = z.infer<typeof createDocumentEditSessionSchema>;
export type HeartbeatDocumentEditSessionDto = z.infer<typeof heartbeatDocumentEditSessionSchema>;
export type CancelDocumentEditSessionDto = z.infer<typeof cancelDocumentEditSessionSchema>;
export type SaveDocumentSubversionFieldsDto = z.infer<typeof saveDocumentSubversionFieldsSchema>;
export type SaveNativeDocumentEditDraftDto = z.infer<typeof saveNativeDocumentEditDraftSchema>;
export type CheckInDocumentEditSessionDto = z.infer<typeof checkInDocumentEditSessionSchema>;
export type PromoteDocumentSubversionDto = z.infer<typeof promoteDocumentSubversionSchema>;
export type AssignDocumentSubversionReviewerDto = z.infer<
  typeof assignDocumentSubversionReviewerSchema
>;
export type SubmitDocumentSubversionReviewDto = z.infer<
  typeof submitDocumentSubversionReviewSchema
>;
