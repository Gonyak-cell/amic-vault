import { z } from 'zod';
import { aiGroundedGenerationOutputSchema } from './generation';

export const aiPrepArtifactKinds = [
  'document_profile',
  'key_fields',
  'date_facts',
  'people_organizations',
  'keyword_tags',
  'filing_suggestions',
  'source_outline',
  'retrieval_hints',
] as const;

export const aiPrepArtifactKindSchema = z.enum(aiPrepArtifactKinds);

export const aiPrepStatuses = [
  'pending',
  'completed',
  'blocked',
  'failed',
  'stale',
] as const;

export const aiPrepStatusSchema = z.enum(aiPrepStatuses);

export const aiPrepPayloadBannedTopLevelKeys = [
  'body',
  'content',
  'text',
  'snippet',
  'raw',
  'prompt',
  'response',
] as const;

const aiPrepPayloadBaseSchema = aiGroundedGenerationOutputSchema.extend({
  source_refs: z.array(z.string().min(1).max(120)).min(1).max(50),
});

export const aiPrepArtifactPayloadSchema = aiPrepPayloadBaseSchema.superRefine(
  (value, ctx) => {
    for (const key of aiPrepPayloadBannedTopLevelKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ai prep payload cannot contain raw top-level key: ${key}`,
          path: [key],
        });
      }
    }
  },
);

export const aiPrepDocumentReadinessStatuses = [
  'not_ready',
  'pending',
  'ready',
  'partial',
  'blocked',
  'failed',
  'stale',
] as const;

export const aiPrepDocumentReadinessStatusSchema = z.enum(aiPrepDocumentReadinessStatuses);

export const aiPrepArtifactSummarySchema = z
  .object({
    artifactId: z.string().uuid(),
    artifactKind: aiPrepArtifactKindSchema,
    status: aiPrepStatusSchema,
    isStale: z.boolean(),
    sourceChunkCount: z.number().int().min(0).max(50),
    generatedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
    payload: aiPrepArtifactPayloadSchema.nullable(),
  })
  .strict();

export const aiPrepDocumentStatusSchema = z
  .object({
    documentId: z.string().uuid(),
    versionId: z.string().uuid().nullable(),
    readinessStatus: aiPrepDocumentReadinessStatusSchema,
    artifacts: z.array(aiPrepArtifactSummarySchema).max(20),
  })
  .strict();

export const aiPrepFeedbackKinds = ['useful', 'incorrect', 'stale'] as const;

export const aiPrepFeedbackKindSchema = z.enum(aiPrepFeedbackKinds);

export const aiPrepFeedbackReasonCodes = [
  'useful',
  'incorrect_profile',
  'incorrect_fields',
  'incorrect_tags',
  'incorrect_filing_suggestion',
  'missing_citation',
  'stale_artifact',
  'permission_concern',
  'other_structured',
] as const;

export const aiPrepFeedbackReasonCodeSchema = z.enum(aiPrepFeedbackReasonCodes);

export const aiPrepFeedbackRequestSchema = z
  .object({
    artifactId: z.string().uuid(),
    feedbackKind: aiPrepFeedbackKindSchema,
    reasonCode: aiPrepFeedbackReasonCodeSchema,
  })
  .strict();

export const aiPrepFeedbackResponseSchema = z
  .object({
    feedbackId: z.string().uuid(),
    artifactId: z.string().uuid(),
    matterId: z.string().uuid(),
    documentId: z.string().uuid(),
    feedbackKind: aiPrepFeedbackKindSchema,
    reasonCode: aiPrepFeedbackReasonCodeSchema,
    recordedByUserId: z.string().uuid(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const aiPrepMatterDocumentReadinessSchema = z
  .object({
    documentId: z.string().uuid(),
    title: z.string().min(1).max(240),
    currentVersionId: z.string().uuid().nullable(),
    aiAllowed: z.boolean(),
    readinessStatus: aiPrepDocumentReadinessStatusSchema,
    totalArtifactCount: z.number().int().min(0).max(20),
    completedArtifactCount: z.number().int().min(0).max(20),
    pendingArtifactCount: z.number().int().min(0).max(20),
    blockedArtifactCount: z.number().int().min(0).max(20),
    failedArtifactCount: z.number().int().min(0).max(20),
    staleArtifactCount: z.number().int().min(0).max(20),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();

export const aiPrepMatterReadinessSchema = z
  .object({
    matterId: z.string().uuid(),
    documentCount: z.number().int().min(0),
    currentVersionCount: z.number().int().min(0),
    readyDocumentCount: z.number().int().min(0),
    pendingDocumentCount: z.number().int().min(0),
    partialDocumentCount: z.number().int().min(0),
    blockedDocumentCount: z.number().int().min(0),
    failedDocumentCount: z.number().int().min(0),
    staleDocumentCount: z.number().int().min(0),
    notReadyDocumentCount: z.number().int().min(0),
    pendingJobCount: z.number().int().min(0),
    staleArtifactCount: z.number().int().min(0),
    blockedArtifactCount: z.number().int().min(0),
    documents: z.array(aiPrepMatterDocumentReadinessSchema).max(100),
  })
  .strict();

export const aiPrepMatterRetryResponseSchema = z
  .object({
    matterId: z.string().uuid(),
    documentCount: z.number().int().min(0),
    enqueuedJobCount: z.number().int().min(0),
    requestedAt: z.string().datetime(),
  })
  .strict();

export type AiPrepArtifactKind = z.infer<typeof aiPrepArtifactKindSchema>;
export type AiPrepStatus = z.infer<typeof aiPrepStatusSchema>;
export type AiPrepArtifactPayloadDto = z.infer<typeof aiPrepArtifactPayloadSchema>;
export type AiPrepDocumentReadinessStatus = z.infer<
  typeof aiPrepDocumentReadinessStatusSchema
>;
export type AiPrepArtifactSummaryDto = z.infer<typeof aiPrepArtifactSummarySchema>;
export type AiPrepDocumentStatusDto = z.infer<typeof aiPrepDocumentStatusSchema>;
export type AiPrepFeedbackKind = z.infer<typeof aiPrepFeedbackKindSchema>;
export type AiPrepFeedbackReasonCode = z.infer<typeof aiPrepFeedbackReasonCodeSchema>;
export type AiPrepFeedbackRequestDto = z.infer<typeof aiPrepFeedbackRequestSchema>;
export type AiPrepFeedbackResponseDto = z.infer<typeof aiPrepFeedbackResponseSchema>;
export type AiPrepMatterDocumentReadinessDto = z.infer<
  typeof aiPrepMatterDocumentReadinessSchema
>;
export type AiPrepMatterReadinessDto = z.infer<typeof aiPrepMatterReadinessSchema>;
export type AiPrepMatterRetryResponseDto = z.infer<typeof aiPrepMatterRetryResponseSchema>;
