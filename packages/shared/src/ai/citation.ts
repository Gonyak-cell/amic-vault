import { z } from 'zod';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const citationRefSchema = z.string().min(1).max(120);

export const aiCitationSchema = z
  .object({
    citationRef: citationRefSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema,
    chunkId: uuidSchema,
    quoteHash: hashSchema,
    sourceTextHash: hashSchema,
  })
  .strict()
  .refine((value) => value.citationRef === `chunk:${value.chunkId}`, {
    message: 'citationRef must reference the chunk id',
    path: ['citationRef'],
  });

export const aiCitationSourceRequestSchema = z
  .object({
    matterId: uuidSchema,
    citations: z.array(aiCitationSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.citations.forEach((citation, index) => {
      if (citation.matterId !== value.matterId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'citation matter mismatch',
          path: ['citations', index, 'matterId'],
        });
      }
    });
  });

export const aiCitationSourceSchema = z
  .object({
    citationRef: citationRefSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema,
    chunkId: uuidSchema,
    title: z.string().min(1).max(1000),
    documentType: z.string().min(1).max(80),
    documentStatus: z.string().min(1).max(80),
    versionStatus: z.string().min(1).max(80),
    quoteHash: hashSchema,
    sourceTextHash: hashSchema,
    citationAllowed: z.literal(true),
    included: z.literal(true),
  })
  .strict();

export const aiCitationSourceResponseSchema = z
  .object({
    sources: z.array(aiCitationSourceSchema).max(50),
  })
  .strict();

export const aiCitationClaimSchema = z
  .object({
    claimId: z.string().min(1).max(120),
    claimHash: hashSchema,
    citationRefs: z.array(citationRefSchema).max(20),
    isLegalConclusion: z.boolean().optional(),
  })
  .strict();

export const aiCitationWarningCodeSchema = z.enum([
  'UNCITED_CLAIM',
  'UNKNOWN_CITATION',
  'LEGAL_CONCLUSION_REQUIRES_REVIEW',
]);

export const aiCitationVerificationRequestSchema = z
  .object({
    citations: z.array(aiCitationSchema).max(50),
    claims: z.array(aiCitationClaimSchema).max(100),
  })
  .strict();

export const aiCitationVerificationWarningSchema = z
  .object({
    code: aiCitationWarningCodeSchema,
    claimId: z.string().min(1).max(120),
    citationRef: citationRefSchema.optional(),
    escalationRequired: z.boolean(),
  })
  .strict();

export const aiCitationVerificationResponseSchema = z
  .object({
    warnings: z.array(aiCitationVerificationWarningSchema).max(200),
    legalConclusionAutoApproval: z.literal(false),
  })
  .strict();

export type AiCitationDto = z.infer<typeof aiCitationSchema>;
export type AiCitationSourceRequestDto = z.infer<typeof aiCitationSourceRequestSchema>;
export type AiCitationSourceDto = z.infer<typeof aiCitationSourceSchema>;
export type AiCitationSourceResponseDto = z.infer<typeof aiCitationSourceResponseSchema>;
export type AiCitationClaimDto = z.infer<typeof aiCitationClaimSchema>;
export type AiCitationWarningCode = z.infer<typeof aiCitationWarningCodeSchema>;
export type AiCitationVerificationRequestDto = z.infer<
  typeof aiCitationVerificationRequestSchema
>;
export type AiCitationVerificationWarningDto = z.infer<
  typeof aiCitationVerificationWarningSchema
>;
export type AiCitationVerificationResponseDto = z.infer<
  typeof aiCitationVerificationResponseSchema
>;
