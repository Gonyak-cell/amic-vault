import { z } from 'zod';
import { aiGroundedGenerationOutputSchema } from './generation';

export const aiPrepArtifactKinds = [
  'document_brief',
  'key_terms',
  'issue_candidates',
  'risk_candidates',
  'timeline_candidates',
  'clause_pointers',
  'suggested_questions',
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

export type AiPrepArtifactKind = z.infer<typeof aiPrepArtifactKindSchema>;
export type AiPrepStatus = z.infer<typeof aiPrepStatusSchema>;
export type AiPrepArtifactPayloadDto = z.infer<typeof aiPrepArtifactPayloadSchema>;
