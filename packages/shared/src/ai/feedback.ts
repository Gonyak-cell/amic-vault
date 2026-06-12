import { z } from 'zod';

export const aiFeedbackErrorTypes = [
  'incorrect_citation',
  'missing_source',
  'hallucination',
  'permission_concern',
  'not_useful',
  'other',
] as const;

export const aiFeedbackCorrectionTypes = [
  'none',
  'minor_edit',
  'major_edit',
  'unsupported_claim_removed',
  'citation_fixed',
] as const;

export const aiFeedbackRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    helpful: z.boolean().optional(),
    correctionType: z.enum(aiFeedbackCorrectionTypes).default('none'),
    errorTypes: z.array(z.enum(aiFeedbackErrorTypes)).max(8).default([]),
    editDistance: z.number().int().min(0).max(20000).default(0),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.correctionType === 'none' && value.editDistance !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['editDistance'],
        message: 'editDistance must be 0 when correctionType is none',
      });
    }
  });

export const aiFeedbackResponseSchema = z
  .object({
    feedbackId: z.string().uuid(),
    sessionId: z.string().uuid(),
    matterId: z.string().uuid(),
    recordedByUserId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    helpful: z.boolean().nullable(),
    correctionType: z.enum(aiFeedbackCorrectionTypes),
    errorTypes: z.array(z.enum(aiFeedbackErrorTypes)),
    editDistance: z.number().int().min(0).max(20000),
    createdAt: z.string().datetime(),
  })
  .strict();

export const aiFeedbackMetricsSchema = z
  .object({
    tenantId: z.string().uuid(),
    matterId: z.string().uuid().nullable(),
    feedbackCount: z.number().int().min(0),
    averageRating: z.number().min(0).max(5).nullable(),
    helpfulRate: z.number().min(0).max(1).nullable(),
    correctionRate: z.number().min(0).max(1),
    hallucinationReportRate: z.number().min(0).max(1),
    permissionConcernCount: z.number().int().min(0),
    stopCriteria: z.array(
      z
        .object({
          code: z.string(),
          observed: z.number(),
          target: z.number(),
          pass: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export type AiFeedbackErrorType = (typeof aiFeedbackErrorTypes)[number];
export type AiFeedbackCorrectionType = (typeof aiFeedbackCorrectionTypes)[number];
export type AiFeedbackRequestDto = z.infer<typeof aiFeedbackRequestSchema>;
export type AiFeedbackResponseDto = z.infer<typeof aiFeedbackResponseSchema>;
export type AiFeedbackMetricsDto = z.infer<typeof aiFeedbackMetricsSchema>;
