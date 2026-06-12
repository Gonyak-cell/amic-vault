import { z } from 'zod';

const uuidSchema = z.string().uuid();
const codeSchema = z.string().trim().min(2).max(64).regex(/^[A-Z0-9][A-Z0-9._-]*$/);
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
export const litigationMaterialities = ['low', 'medium', 'high', 'critical'] as const;
export const litigationIssueTypes = ['claim', 'defense', 'element', 'argument', 'risk'] as const;
export const litigationIssueStatuses = ['open', 'developing', 'supported', 'weak', 'closed'] as const;
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

export const litigationEvidenceTypeSchema = z.enum(litigationEvidenceTypes);
export const litigationCustodyStatusSchema = z.enum(litigationCustodyStatuses);
export const litigationAdmittedStatusSchema = z.enum(litigationAdmittedStatuses);
export const litigationFactStatusSchema = z.enum(litigationFactStatuses);
export const litigationMaterialitySchema = z.enum(litigationMaterialities);
export const litigationIssueTypeSchema = z.enum(litigationIssueTypes);
export const litigationIssueStatusSchema = z.enum(litigationIssueStatuses);
export const litigationPleadingTypeSchema = z.enum(litigationPleadingTypes);
export const litigationPleadingStatusSchema = z.enum(litigationPleadingStatuses);

export const createLitigationEvidenceRequestSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    versionId: uuidSchema.optional(),
    evidenceCode: codeSchema,
    evidenceType: litigationEvidenceTypeSchema.default('document'),
    exhibitLabel: safeLabelSchema.nullish(),
    custodyStatus: litigationCustodyStatusSchema.default('collected'),
    admittedStatus: litigationAdmittedStatusSchema.default('unknown'),
    sourceHash: z.string().trim().regex(/^[a-f0-9]{64}$/iu).nullish(),
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
    evidenceType: litigationEvidenceTypeSchema,
    exhibitLabel: z.string().min(1).max(200).nullable(),
    custodyStatus: litigationCustodyStatusSchema,
    admittedStatus: litigationAdmittedStatusSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/iu).nullable(),
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
  .strict();

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
  .strict();

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
export type LitigationCustodyStatus = (typeof litigationCustodyStatuses)[number];
export type LitigationAdmittedStatus = (typeof litigationAdmittedStatuses)[number];
export type LitigationFactStatus = (typeof litigationFactStatuses)[number];
export type LitigationMateriality = (typeof litigationMaterialities)[number];
export type LitigationIssueType = (typeof litigationIssueTypes)[number];
export type LitigationIssueStatus = (typeof litigationIssueStatuses)[number];
export type LitigationPleadingType = (typeof litigationPleadingTypes)[number];
export type LitigationPleadingStatus = (typeof litigationPleadingStatuses)[number];
export type CreateLitigationEvidenceRequestDto = z.infer<
  typeof createLitigationEvidenceRequestSchema
>;
export type LitigationEvidenceQueryDto = z.infer<typeof litigationEvidenceQuerySchema>;
export type LitigationEvidenceDto = z.infer<typeof litigationEvidenceSchema>;
export type LitigationEvidenceListResponseDto = z.infer<
  typeof litigationEvidenceListResponseSchema
>;
export type CreateLitigationFactRequestDto = z.infer<typeof createLitigationFactRequestSchema>;
export type LitigationFactQueryDto = z.infer<typeof litigationFactQuerySchema>;
export type LitigationFactDto = z.infer<typeof litigationFactSchema>;
export type LitigationFactListResponseDto = z.infer<typeof litigationFactListResponseSchema>;
export type CreateLitigationIssueRequestDto = z.infer<typeof createLitigationIssueRequestSchema>;
export type LitigationIssueQueryDto = z.infer<typeof litigationIssueQuerySchema>;
export type LitigationIssueDto = z.infer<typeof litigationIssueSchema>;
export type LitigationIssueListResponseDto = z.infer<typeof litigationIssueListResponseSchema>;
export type CreateLitigationPleadingRequestDto = z.infer<
  typeof createLitigationPleadingRequestSchema
>;
export type LitigationPleadingQueryDto = z.infer<typeof litigationPleadingQuerySchema>;
export type LitigationPleadingDto = z.infer<typeof litigationPleadingSchema>;
export type LitigationPleadingListResponseDto = z.infer<
  typeof litigationPleadingListResponseSchema
>;
export type LitigationCaseMapQueryDto = z.infer<typeof litigationCaseMapQuerySchema>;
export type LitigationCaseMapItemDto = z.infer<typeof litigationCaseMapItemSchema>;
export type LitigationCaseMapResponseDto = z.infer<typeof litigationCaseMapResponseSchema>;
