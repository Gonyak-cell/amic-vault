import { z } from 'zod';
import { searchFiltersSchema } from '../search/search-query.dto';
import {
  aiCitationClaimSchema,
  aiCitationSchema,
  aiCitationVerificationWarningSchema,
} from './citation';

const uuidSchema = z.string().uuid();

export const aiSummaryTaskSchema = z.enum([
  'document_summary',
  'matter_summary',
  'email_thread_summary',
  'clause_analysis',
  'risk_extraction',
  'matter_qa',
]);

export const aiSummaryStatusSchema = z.enum(['completed', 'escalated']);

export const aiSummaryWarningCodeSchema = z.enum([
  'EVIDENCE_ONLY_DEGRADED',
  'GRAPH_FACTS_UNAVAILABLE_BEFORE_R7',
  'RULE_FINDINGS_UNAVAILABLE_BEFORE_R8',
  'HUMAN_REVIEW_REQUIRED',
  'NO_DENIED_SOURCES_INCLUDED',
]);

export const aiSummaryRequestSchema = z
  .object({
    matterId: uuidSchema,
    task: aiSummaryTaskSchema,
    query: z.string().trim().min(1).max(2000),
    filters: searchFiltersSchema.optional(),
    targetDocumentId: uuidSchema.optional(),
    maxChunks: z.number().int().min(1).max(12).optional(),
    locale: z.enum(['ko-KR', 'en-US']).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.filters?.matterId && value.filters.matterId !== value.matterId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'filters.matterId must match matterId',
        path: ['filters', 'matterId'],
      });
    }
  });

export const aiSummarySectionSchema = z
  .object({
    sectionId: z.string().min(1).max(120),
    heading: z.string().min(1).max(160),
    text: z.string().min(1).max(1600),
    citationRefs: z.array(z.string().min(1).max(120)).min(1).max(20),
    escalationRequired: z.boolean().optional(),
  })
  .strict();

export const aiSummaryResponseSchema = z
  .object({
    sessionId: uuidSchema,
    matterId: uuidSchema,
    task: aiSummaryTaskSchema,
    status: aiSummaryStatusSchema,
    modelRoute: z.literal('local_gemma'),
    evidencePackId: uuidSchema,
    citations: z.array(aiCitationSchema).min(1).max(50),
    claims: z.array(aiCitationClaimSchema).min(1).max(100),
    sections: z.array(aiSummarySectionSchema).min(1).max(12),
    warnings: z.array(aiSummaryWarningCodeSchema).max(20),
    citationWarnings: z.array(aiCitationVerificationWarningSchema).max(200),
    escalationRequired: z.boolean(),
    legalConclusionAutoApproval: z.literal(false),
  })
  .strict();

export type AiSummaryTask = z.infer<typeof aiSummaryTaskSchema>;
export type AiSummaryStatus = z.infer<typeof aiSummaryStatusSchema>;
export type AiSummaryWarningCode = z.infer<typeof aiSummaryWarningCodeSchema>;
export type AiSummaryRequestDto = z.infer<typeof aiSummaryRequestSchema>;
export type AiSummarySectionDto = z.infer<typeof aiSummarySectionSchema>;
export type AiSummaryResponseDto = z.infer<typeof aiSummaryResponseSchema>;
