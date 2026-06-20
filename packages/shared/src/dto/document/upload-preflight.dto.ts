import { z } from 'zod';
import { matterAppSourceModeSchema } from '../matter-app/matter-app.dto';

export const uploadDuplicateDecisionSchema = z.enum(['new_document', 'new_version', 'cancel']);

export const uploadPreflightPurposeSchema = z.enum([
  'document_upload',
  'document_version',
  'document_metadata',
]);

export const uploadDuplicateCandidateSchema = z
  .object({
    documentReference: z.string().uuid(),
    matterCode: z.string().trim().min(1).max(120).nullable(),
    matterName: z.string().trim().min(1).max(1000).nullable(),
    title: z.string().trim().min(1).max(1000),
    versionLabel: z.string().trim().min(1).max(80),
  })
  .strict();

export const createUploadPreflightRequestSchema = z
  .object({
    sha256: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{64}$/i)
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .strict();

export const uploadPreflightResponseSchema = z
  .object({
    matterReference: z.string().uuid(),
    preflightRef: z.string().trim().min(1).max(160),
    expiresAt: z.string().datetime(),
    sourceMode: matterAppSourceModeSchema,
    sourceUpdatedAt: z.string().datetime().nullable(),
    sourceRevision: z.string().trim().min(1).nullable(),
    permissionDecisionRef: z.string().trim().min(1).max(160),
    uploadEligible: z.literal(true),
    blockedReason: z.null(),
    duplicateDecisionRequired: z.boolean(),
    duplicateCandidates: z.array(uploadDuplicateCandidateSchema).max(10),
  })
  .strict();

export type UploadDuplicateDecision = z.infer<typeof uploadDuplicateDecisionSchema>;
export type UploadDuplicateCandidateDto = z.infer<typeof uploadDuplicateCandidateSchema>;
export type UploadPreflightPurpose = z.infer<typeof uploadPreflightPurposeSchema>;
export type CreateUploadPreflightRequestDto = z.infer<typeof createUploadPreflightRequestSchema>;
export type UploadPreflightResponseDto = z.infer<typeof uploadPreflightResponseSchema>;
