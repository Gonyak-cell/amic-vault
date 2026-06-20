import { z } from 'zod';
import { matterAppSourceModeSchema } from '../matter-app/matter-app.dto';

export const uploadPreflightPurposeSchema = z.enum([
  'document_upload',
  'document_version',
  'document_metadata',
]);

export const createUploadPreflightRequestSchema = z.object({}).strict();

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
  })
  .strict();

export type UploadPreflightPurpose = z.infer<typeof uploadPreflightPurposeSchema>;
export type CreateUploadPreflightRequestDto = z.infer<typeof createUploadPreflightRequestSchema>;
export type UploadPreflightResponseDto = z.infer<typeof uploadPreflightResponseSchema>;
