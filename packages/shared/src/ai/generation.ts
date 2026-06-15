import { z } from 'zod';

export const aiGroundedClaimKindSchema = z.enum([
  'summary',
  'key_fact',
  'risk',
  'issue',
  'timeline',
  'question',
  'clause',
  'answer',
]);

export const aiGroundedSourceRefSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^(chunk|graph|rule|clause):[A-Za-z0-9:_-]+$/);

export const aiGroundedClaimSchema = z
  .object({
    claim_id: z.string().min(1).max(120),
    kind: aiGroundedClaimKindSchema,
    text: z.string().min(1).max(1600),
    source_refs: z.array(aiGroundedSourceRefSchema).min(1).max(20),
    is_legal_conclusion: z.boolean().optional(),
  })
  .strict();

export const aiGroundedSectionSchema = z
  .object({
    section_id: z.string().min(1).max(120),
    heading: z.string().min(1).max(160),
    text: z.string().min(1).max(2400),
    source_refs: z.array(aiGroundedSourceRefSchema).min(1).max(20),
  })
  .strict();

export const aiGroundedGenerationOutputSchema = z
  .object({
    answer: z.string().min(1).max(6000),
    sections: z.array(aiGroundedSectionSchema).min(1).max(12),
    claims: z.array(aiGroundedClaimSchema).min(1).max(100),
    warnings: z.array(z.string().min(1).max(120)).max(20).optional(),
  })
  .strict();

export type AiGroundedClaimKind = z.infer<typeof aiGroundedClaimKindSchema>;
export type AiGroundedClaimDto = z.infer<typeof aiGroundedClaimSchema>;
export type AiGroundedSectionDto = z.infer<typeof aiGroundedSectionSchema>;
export type AiGroundedGenerationOutputDto = z.infer<
  typeof aiGroundedGenerationOutputSchema
>;
