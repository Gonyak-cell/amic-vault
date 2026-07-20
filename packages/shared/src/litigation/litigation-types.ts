import { z } from 'zod';

const uuidSchema = z.string().uuid();
const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/);
const safeLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe label token',
  });
const safeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe text token',
  });
const safeAiSuggestionLabelSchema = safeLabelSchema.refine(
  (value) => !/(body|content|snippet|raw|prompt|response)/iu.test(value),
  {
    message: 'unsafe AI suggestion label',
  },
);
const citationRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^(document|version|evidence|fact|issue|pleading):[a-z0-9:_-]+$/u)
  .refine((value) => !/(body|content|snippet|raw|password|secret|token|title)/iu.test(value), {
    message: 'unsafe citation ref',
  });

export const litigationEvidenceTypes = [
  'document',
  'email',
  'testimony',
  'exhibit',
  'expert',
  'other',
] as const;
export const litigationEvidenceDirections = ['gap', 'eul'] as const;
export const litigationCustodyStatuses = [
  'collected',
  'reviewed',
  'challenged',
  'excluded',
] as const;
export const litigationAdmittedStatuses = [
  'unknown',
  'offered',
  'admitted',
  'excluded',
  'reserved',
] as const;
export const litigationFactStatuses = ['draft', 'verified', 'disputed', 'withdrawn'] as const;
export const litigationFactCitationRequiredReason = 'FACT_CITATION_REQUIRED';
export const litigationMaterialities = ['low', 'medium', 'high', 'critical'] as const;
export const litigationIssueTypes = ['claim', 'defense', 'element', 'argument', 'risk'] as const;
export const litigationIssueStatuses = [
  'open',
  'developing',
  'supported',
  'weak',
  'closed',
] as const;
export const litigationAiSuggestionKinds = [
  'evidence_classification',
  'issue_evidence_mapping',
] as const;
export const litigationAiSuggestionStatuses = ['pending', 'approved', 'rejected'] as const;
export const litigationPleadingTypes = [
  'complaint',
  'answer',
  'motion',
  'brief',
  'declaration',
  'exhibit_list',
  'other',
] as const;
export const litigationPleadingStatuses = [
  'internal_draft',
  'review_ready',
  'approved_internal',
  'filed_recorded',
  'served_recorded',
  'withdrawn',
] as const;
export const litigationHearingTypes = [
  'hearing',
  'deadline',
  'trial',
  'mediation',
  'conference',
  'other',
] as const;
export const litigationHearingStatuses = ['scheduled', 'completed', 'cancelled'] as const;

export const litigationEvidenceTypeSchema = z.enum(litigationEvidenceTypes);
export const litigationEvidenceDirectionSchema = z.enum(litigationEvidenceDirections);
export const litigationCustodyStatusSchema = z.enum(litigationCustodyStatuses);
export const litigationAdmittedStatusSchema = z.enum(litigationAdmittedStatuses);
export const litigationFactStatusSchema = z.enum(litigationFactStatuses);
export const litigationMaterialitySchema = z.enum(litigationMaterialities);
export const litigationIssueTypeSchema = z.enum(litigationIssueTypes);
export const litigationIssueStatusSchema = z.enum(litigationIssueStatuses);
export const litigationAiSuggestionKindSchema = z.enum(litigationAiSuggestionKinds);
export const litigationAiSuggestionStatusSchema = z.enum(litigationAiSuggestionStatuses);
export const litigationPleadingTypeSchema = z.enum(litigationPleadingTypes);
export const litigationPleadingStatusSchema = z.enum(litigationPleadingStatuses);
export const litigationHearingTypeSchema = z.enum(litigationHearingTypes);
export const litigationHearingStatusSchema = z.enum(litigationHearingStatuses);

function hasRequiredFactCitations(value: {
  status: (typeof litigationFactStatuses)[number];
  citationRefs: readonly string[];
}): boolean {
  return value.status !== 'verified' || value.citationRefs.length > 0;
}

export const createLitigationEvidenceRequestSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    versionId: uuidSchema.optional(),
    evidenceCode: codeSchema,
    evidenceDirection: litigationEvidenceDirectionSchema.default('gap'),
    evidenceSequence: z.coerce.number().int().min(1).max(999_999).optional(),
    evidenceType: litigationEvidenceTypeSchema.default('document'),
    exhibitLabel: safeLabelSchema.nullish(),
    custodyStatus: litigationCustodyStatusSchema.default('collected'),
    admittedStatus: litigationAdmittedStatusSchema.default('unknown'),
    sourceHash: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/iu)
      .nullish(),
  })
  .strict()
  .refine((value) => value.versionId === undefined || value.documentId !== undefined, {
    message: 'versionId requires documentId',
    path: ['versionId'],
  });

export const litigationEvidenceQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: litigationCustodyStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const litigationEvidenceSchema = z
  .object({
    evidenceId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    versionId: uuidSchema.nullable(),
    evidenceCode: codeSchema,
    evidenceDirection: litigationEvidenceDirectionSchema,
    evidenceSequence: z.number().int().min(1).max(999_999),
    evidenceType: litigationEvidenceTypeSchema,
    exhibitLabel: z.string().min(1).max(200).nullable(),
    custodyStatus: litigationCustodyStatusSchema,
    admittedStatus: litigationAdmittedStatusSchema,
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/iu)
      .nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const litigationEvidenceListResponseSchema = z
  .object({
    matterId: uuidSchema,
    evidence: z.array(litigationEvidenceSchema).max(100),
  })
  .strict();

export const litigationEvidenceNextCodeQuerySchema = z
  .object({
    matterId: uuidSchema,
    direction: litigationEvidenceDirectionSchema,
  })
  .strict();

export const litigationEvidenceNextCodeResponseSchema = z
  .object({
    matterId: uuidSchema,
    direction: litigationEvidenceDirectionSchema,
    evidenceCode: codeSchema,
    exhibitLabel: safeLabelSchema,
    nextSequence: z.number().int().min(1).max(999_999),
  })
  .strict();

export const createLitigationFactRequestSchema = z
  .object({
    matterId: uuidSchema,
    evidenceId: uuidSchema.nullish(),
    factCode: codeSchema,
    factSummary: safeTextSchema,
    factDate: z.string().date().nullish(),
    status: litigationFactStatusSchema.default('draft'),
    materiality: litigationMaterialitySchema.default('medium'),
    citationRefs: z.array(citationRefSchema).max(20).default([]),
  })
  .strict()
  .refine(hasRequiredFactCitations, {
    message: litigationFactCitationRequiredReason,
    path: ['citationRefs'],
  });

export const updateLitigationFactRequestSchema = z
  .object({
    status: litigationFactStatusSchema.optional(),
    citationRefs: z.array(citationRefSchema).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  })
  .refine(
    (value) =>
      value.status !== 'verified' ||
      value.citationRefs === undefined ||
      value.citationRefs.length > 0,
    {
      message: litigationFactCitationRequiredReason,
      path: ['citationRefs'],
    },
  );

export const litigationFactQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: litigationFactStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const litigationFactSchema = z
  .object({
    factId: uuidSchema,
    matterId: uuidSchema,
    evidenceId: uuidSchema.nullable(),
    factCode: codeSchema,
    factSummary: z.string().min(1).max(2000),
    factDate: z.string().date().nullable(),
    status: litigationFactStatusSchema,
    materiality: litigationMaterialitySchema,
    citationRefs: z.array(citationRefSchema).max(20),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine(hasRequiredFactCitations, {
    message: litigationFactCitationRequiredReason,
    path: ['citationRefs'],
  });

export const litigationFactListResponseSchema = z
  .object({
    matterId: uuidSchema,
    facts: z.array(litigationFactSchema).max(100),
  })
  .strict();

export const createLitigationIssueRequestSchema = z
  .object({
    matterId: uuidSchema,
    parentIssueId: uuidSchema.nullish(),
    issueCode: codeSchema,
    label: safeLabelSchema,
    issueType: litigationIssueTypeSchema.default('argument'),
    status: litigationIssueStatusSchema.default('open'),
    position: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

export const litigationIssueQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: litigationIssueStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const litigationIssueSchema = z
  .object({
    issueId: uuidSchema,
    matterId: uuidSchema,
    parentIssueId: uuidSchema.nullable(),
    issueCode: codeSchema,
    label: z.string().min(1).max(200),
    issueType: litigationIssueTypeSchema,
    status: litigationIssueStatusSchema,
    position: z.number().int().min(0),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const litigationIssueListResponseSchema = z
  .object({
    matterId: uuidSchema,
    issues: z.array(litigationIssueSchema).max(100),
  })
  .strict();

export const createLitigationAiSuggestionRequestSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema.optional(),
    suggestionKind: litigationAiSuggestionKindSchema.default('evidence_classification'),
    suggestedEvidenceDirection: litigationEvidenceDirectionSchema.default('gap'),
    suggestedEvidenceType: litigationEvidenceTypeSchema.default('document'),
    suggestedIssueTitle: safeAiSuggestionLabelSchema.nullish(),
    confidence: z.coerce.number().min(0).max(1),
    sourceArtifactId: uuidSchema.nullish(),
    sourceHash: z.string().trim().regex(/^[a-f0-9]{64}$/iu),
  })
  .strict()
  .refine((value) => value.versionId === undefined || value.documentId !== undefined, {
    message: 'versionId requires documentId',
    path: ['versionId'],
  });

export const litigationAiSuggestionQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: litigationAiSuggestionStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const litigationAiSuggestionSchema = z
  .object({
    suggestionId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema.nullable(),
    suggestionKind: litigationAiSuggestionKindSchema,
    suggestedEvidenceDirection: litigationEvidenceDirectionSchema,
    suggestedEvidenceType: litigationEvidenceTypeSchema,
    suggestedIssueTitle: safeAiSuggestionLabelSchema.nullable(),
    confidence: z.number().min(0).max(1),
    sourceArtifactId: uuidSchema.nullable(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/iu),
    status: litigationAiSuggestionStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const litigationAiSuggestionListResponseSchema = z
  .object({
    matterId: uuidSchema,
    suggestions: z.array(litigationAiSuggestionSchema).max(100),
  })
  .strict();

export const createLitigationPleadingRequestSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    versionId: uuidSchema.optional(),
    pleadingCode: codeSchema,
    pleadingType: litigationPleadingTypeSchema.default('brief'),
    filingStatus: litigationPleadingStatusSchema.default('internal_draft'),
    internalDeadline: z.string().date().nullish(),
    citationRefs: z.array(citationRefSchema).max(20).default([]),
  })
  .strict()
  .refine((value) => value.versionId === undefined || value.documentId !== undefined, {
    message: 'versionId requires documentId',
    path: ['versionId'],
  });

export const litigationPleadingQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: litigationPleadingStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const litigationPleadingSchema = z
  .object({
    pleadingId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    versionId: uuidSchema.nullable(),
    pleadingCode: codeSchema,
    pleadingType: litigationPleadingTypeSchema,
    filingStatus: litigationPleadingStatusSchema,
    internalDeadline: z.string().date().nullable(),
    citationRefs: z.array(citationRefSchema).max(20),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const litigationPleadingListResponseSchema = z
  .object({
    matterId: uuidSchema,
    pleadings: z.array(litigationPleadingSchema).max(100),
  })
  .strict();

export const createLitigationHearingRequestSchema = z
  .object({
    matterId: uuidSchema,
    pleadingId: uuidSchema.nullish(),
    title: safeLabelSchema,
    hearingType: litigationHearingTypeSchema.default('hearing'),
    scheduledAt: z.string().datetime(),
    courtName: safeLabelSchema.nullish(),
    location: safeLabelSchema.nullish(),
    internalDeadline: z.string().date().nullish(),
  })
  .strict();

export const updateLitigationHearingRequestSchema = z
  .object({
    pleadingId: uuidSchema.nullish(),
    title: safeLabelSchema.optional(),
    hearingType: litigationHearingTypeSchema.optional(),
    scheduledAt: z.string().datetime().optional(),
    courtName: safeLabelSchema.nullish(),
    location: safeLabelSchema.nullish(),
    internalDeadline: z.string().date().nullish(),
    status: litigationHearingStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });

export const litigationHearingQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: litigationHearingStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const litigationHearingSchema = z
  .object({
    hearingId: uuidSchema,
    matterId: uuidSchema,
    pleadingId: uuidSchema.nullable(),
    title: z.string().min(1).max(200),
    hearingType: litigationHearingTypeSchema,
    scheduledAt: z.string().datetime(),
    courtName: z.string().min(1).max(200).nullable(),
    location: z.string().min(1).max(200).nullable(),
    internalDeadline: z.string().date().nullable(),
    status: litigationHearingStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const litigationHearingListResponseSchema = z
  .object({
    matterId: uuidSchema,
    hearings: z.array(litigationHearingSchema).max(100),
  })
  .strict();

export const litigationCaseMapQuerySchema = z
  .object({
    matterId: uuidSchema,
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

export const litigationCaseMapItemSchema = z
  .object({
    evidenceId: uuidSchema.nullable(),
    factId: uuidSchema.nullable(),
    issueId: uuidSchema.nullable(),
    pleadingId: uuidSchema.nullable(),
    documentId: uuidSchema.nullable(),
    statusRefs: z.array(z.string().min(1).max(80)).max(8),
    citationRefs: z.array(citationRefSchema).max(20),
  })
  .strict();

export const litigationCaseMapResponseSchema = z
  .object({
    matterId: uuidSchema,
    evidenceCount: z.number().int().min(0),
    factCount: z.number().int().min(0),
    issueCount: z.number().int().min(0),
    pleadingCount: z.number().int().min(0),
    caseMap: z.array(litigationCaseMapItemSchema).max(100),
  })
  .strict();

export type LitigationEvidenceType = (typeof litigationEvidenceTypes)[number];
export type LitigationEvidenceDirection = (typeof litigationEvidenceDirections)[number];
export type LitigationCustodyStatus = (typeof litigationCustodyStatuses)[number];
export type LitigationAdmittedStatus = (typeof litigationAdmittedStatuses)[number];
export type LitigationFactStatus = (typeof litigationFactStatuses)[number];
export type LitigationMateriality = (typeof litigationMaterialities)[number];
export type LitigationIssueType = (typeof litigationIssueTypes)[number];
export type LitigationIssueStatus = (typeof litigationIssueStatuses)[number];
export type LitigationAiSuggestionKind = (typeof litigationAiSuggestionKinds)[number];
export type LitigationAiSuggestionStatus = (typeof litigationAiSuggestionStatuses)[number];
export type LitigationPleadingType = (typeof litigationPleadingTypes)[number];
export type LitigationPleadingStatus = (typeof litigationPleadingStatuses)[number];
export type LitigationHearingType = (typeof litigationHearingTypes)[number];
export type LitigationHearingStatus = (typeof litigationHearingStatuses)[number];
export type CreateLitigationEvidenceRequestDto = z.infer<
  typeof createLitigationEvidenceRequestSchema
>;
export type LitigationEvidenceQueryDto = z.infer<typeof litigationEvidenceQuerySchema>;
export type LitigationEvidenceNextCodeQueryDto = z.infer<
  typeof litigationEvidenceNextCodeQuerySchema
>;
export type LitigationEvidenceNextCodeResponseDto = z.infer<
  typeof litigationEvidenceNextCodeResponseSchema
>;
export type LitigationEvidenceDto = z.infer<typeof litigationEvidenceSchema>;
export type LitigationEvidenceListResponseDto = z.infer<
  typeof litigationEvidenceListResponseSchema
>;
export type CreateLitigationFactRequestDto = z.infer<typeof createLitigationFactRequestSchema>;
export type UpdateLitigationFactRequestDto = z.infer<typeof updateLitigationFactRequestSchema>;
export type LitigationFactQueryDto = z.infer<typeof litigationFactQuerySchema>;
export type LitigationFactDto = z.infer<typeof litigationFactSchema>;
export type LitigationFactListResponseDto = z.infer<typeof litigationFactListResponseSchema>;
export type CreateLitigationIssueRequestDto = z.infer<typeof createLitigationIssueRequestSchema>;
export type LitigationIssueQueryDto = z.infer<typeof litigationIssueQuerySchema>;
export type LitigationIssueDto = z.infer<typeof litigationIssueSchema>;
export type LitigationIssueListResponseDto = z.infer<typeof litigationIssueListResponseSchema>;
export type CreateLitigationAiSuggestionRequestDto = z.infer<
  typeof createLitigationAiSuggestionRequestSchema
>;
export type LitigationAiSuggestionQueryDto = z.infer<typeof litigationAiSuggestionQuerySchema>;
export type LitigationAiSuggestionDto = z.infer<typeof litigationAiSuggestionSchema>;
export type LitigationAiSuggestionListResponseDto = z.infer<
  typeof litigationAiSuggestionListResponseSchema
>;
export type CreateLitigationPleadingRequestDto = z.infer<
  typeof createLitigationPleadingRequestSchema
>;
export type LitigationPleadingQueryDto = z.infer<typeof litigationPleadingQuerySchema>;
export type LitigationPleadingDto = z.infer<typeof litigationPleadingSchema>;
export type LitigationPleadingListResponseDto = z.infer<
  typeof litigationPleadingListResponseSchema
>;
export type CreateLitigationHearingRequestDto = z.infer<
  typeof createLitigationHearingRequestSchema
>;
export type UpdateLitigationHearingRequestDto = z.infer<
  typeof updateLitigationHearingRequestSchema
>;
export type LitigationHearingQueryDto = z.infer<typeof litigationHearingQuerySchema>;
export type LitigationHearingDto = z.infer<typeof litigationHearingSchema>;
export type LitigationHearingListResponseDto = z.infer<
  typeof litigationHearingListResponseSchema
>;
export type LitigationCaseMapQueryDto = z.infer<typeof litigationCaseMapQuerySchema>;
export type LitigationCaseMapItemDto = z.infer<typeof litigationCaseMapItemSchema>;
export type LitigationCaseMapResponseDto = z.infer<typeof litigationCaseMapResponseSchema>;
