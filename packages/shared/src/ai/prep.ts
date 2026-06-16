import { z } from 'zod';
import {
  aiGroundedClaimSchema,
  aiGroundedGenerationOutputSchema,
  type AiGroundedClaimKind,
} from './generation';

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

export type AiPrepArtifactKind = z.infer<typeof aiPrepArtifactKindSchema>;

export const aiPrepClaimKinds = [
  'summary',
  'key_fact',
  'timeline',
  'question',
  'answer',
] as const satisfies readonly AiGroundedClaimKind[];

export const aiPrepClaimKindSchema = z.enum(aiPrepClaimKinds);

export type AiPrepClaimKind = z.infer<typeof aiPrepClaimKindSchema>;

export const aiPrepArtifactClaimKindAllowlist = {
  document_profile: ['summary', 'key_fact'],
  key_fields: ['key_fact'],
  date_facts: ['timeline', 'key_fact'],
  people_organizations: ['key_fact'],
  keyword_tags: ['key_fact'],
  filing_suggestions: ['answer', 'key_fact'],
  source_outline: ['summary', 'key_fact'],
  retrieval_hints: ['question', 'answer', 'key_fact'],
} as const satisfies Record<AiPrepArtifactKind, readonly AiPrepClaimKind[]>;

export const aiPrepStatuses = [
  'pending',
  'completed',
  'blocked',
  'failed',
  'rejected',
  'stale',
] as const;

export const aiPrepStatusSchema = z.enum(aiPrepStatuses);

export const aiPrepStaleReasons = [
  'new_version',
  'document_metadata_changed',
  'document_ai_disabled',
  'document_ai_enabled',
  'matter_ai_policy_changed',
  'ai_policy_parse_failed',
  'permission_changed',
  'ethical_wall_changed',
  'source_chunks_changed',
  'source_hash_changed',
  'operator_retry',
  'operator_rebuild',
  'operator_reprocess_fallback',
  'operator_reprocess_rejected',
] as const;

export const aiPrepStaleReasonSchema = z.enum(aiPrepStaleReasons);

export const aiPrepPayloadBannedTopLevelKeys = [
  'body',
  'content',
  'text',
  'snippet',
  'raw',
  'prompt',
  'response',
] as const;

const aiPrepGroundedClaimSchema = aiGroundedClaimSchema.extend({
  kind: aiPrepClaimKindSchema,
  is_legal_conclusion: z.literal(false).optional(),
});

export const aiPrepGroundedGenerationOutputSchema = aiGroundedGenerationOutputSchema.extend({
  claims: z.array(aiPrepGroundedClaimSchema).min(1).max(100),
});

const aiPrepPayloadBaseSchema = aiPrepGroundedGenerationOutputSchema.extend({
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
    const topLevelRefs = new Set(value.source_refs);
    value.sections.forEach((section, sectionIndex) => {
      section.source_refs.forEach((ref, refIndex) => {
        if (!topLevelRefs.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'section source_ref must be included in payload source_refs',
            path: ['sections', sectionIndex, 'source_refs', refIndex],
          });
        }
      });
    });
    value.claims.forEach((claim, claimIndex) => {
      claim.source_refs.forEach((ref, refIndex) => {
        if (!topLevelRefs.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'claim source_ref must be included in payload source_refs',
            path: ['claims', claimIndex, 'source_refs', refIndex],
          });
        }
      });
    });
  },
);

export function aiPrepArtifactAllowedClaimKinds(
  artifactKind: AiPrepArtifactKind,
): readonly AiPrepClaimKind[] {
  return aiPrepArtifactClaimKindAllowlist[artifactKind];
}

export function aiPrepArtifactPayloadForKindSchema(artifactKind: AiPrepArtifactKind) {
  const allowedKinds = new Set(aiPrepArtifactAllowedClaimKinds(artifactKind));
  return aiPrepArtifactPayloadSchema.superRefine((value, ctx) => {
    value.claims.forEach((claim, claimIndex) => {
      if (!allowedKinds.has(claim.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `claim kind ${claim.kind} is not allowed for ${artifactKind}`,
          path: ['claims', claimIndex, 'kind'],
        });
      }
    });
  });
}

export function parseAiPrepArtifactPayload(
  input: unknown,
  artifactKind: AiPrepArtifactKind,
): AiPrepArtifactPayloadDto {
  return aiPrepArtifactPayloadForKindSchema(artifactKind).parse(input);
}

export const aiPrepDocumentReadinessStatuses = [
  'not_ready',
  'pending',
  'ready',
  'partial',
  'blocked',
  'failed',
  'rejected',
  'stale',
] as const;

export const aiPrepDocumentReadinessStatusSchema = z.enum(aiPrepDocumentReadinessStatuses);

export const aiPrepArtifactSummarySchema = z
  .object({
    artifactId: z.string().uuid(),
    artifactKind: aiPrepArtifactKindSchema,
    status: aiPrepStatusSchema,
    isStale: z.boolean(),
    staleReason: aiPrepStaleReasonSchema.nullable(),
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
  'missing_source_ref',
  'stale_artifact',
  'rejected_output',
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
    rejectedArtifactCount: z.number().int().min(0).max(20),
    staleArtifactCount: z.number().int().min(0).max(20),
    fallbackArtifactCount: z.number().int().min(0).max(20),
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
    rejectedDocumentCount: z.number().int().min(0),
    staleDocumentCount: z.number().int().min(0),
    notReadyDocumentCount: z.number().int().min(0),
    pendingJobCount: z.number().int().min(0),
    staleArtifactCount: z.number().int().min(0),
    blockedArtifactCount: z.number().int().min(0),
    rejectedArtifactCount: z.number().int().min(0),
    fallbackArtifactCount: z.number().int().min(0),
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

export type AiPrepStatus = z.infer<typeof aiPrepStatusSchema>;
export type AiPrepStaleReason = z.infer<typeof aiPrepStaleReasonSchema>;
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
