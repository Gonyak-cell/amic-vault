import { z } from 'zod';

const uuidSchema = z.string().uuid();
const codeSchema = z.string().trim().min(2).max(64).regex(/^[A-Z0-9][A-Z0-9._-]*$/);
const safeTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe title token',
  });
const safeTextSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe text token',
  });
const safeLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe label token',
  });
const safeMitigationSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => !/(password|secret|token)/iu.test(value), {
    message: 'unsafe mitigation token',
  });
const citationRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^(document|version|clause|rfi|issue|risk):[a-z0-9:_-]+$/u)
  .refine((value) => !/(body|content|snippet|raw|password|secret|token)/iu.test(value), {
    message: 'unsafe citation ref',
  });

export const ddRfiCategories = [
  'corporate',
  'finance',
  'tax',
  'employment',
  'ip',
  'litigation',
  'compliance',
  'general',
] as const;
export const ddRfiStatuses = [
  'requested',
  'submitted',
  'reviewing',
  'supplement_requested',
  'complete',
  'reported',
] as const;
export const ddPriorities = ['low', 'medium', 'high', 'critical'] as const;
export const ddMappingStatuses = ['mapped', 'missing', 'supplement_requested'] as const;
export const ddIssueSeverities = ['info', 'low', 'medium', 'high', 'critical'] as const;
export const ddIssueStatuses = ['open', 'triaged', 'mitigated', 'accepted', 'closed'] as const;
export const ddRiskCategories = [
  'legal',
  'financial',
  'operational',
  'compliance',
  'tax',
  'other',
] as const;
export const ddRiskLikelihoods = ['low', 'medium', 'high'] as const;
export const ddRiskStatuses = ['open', 'monitoring', 'mitigated', 'accepted', 'closed'] as const;

export const ddRfiCategorySchema = z.enum(ddRfiCategories);
export const ddRfiStatusSchema = z.enum(ddRfiStatuses);
export const ddPrioritySchema = z.enum(ddPriorities);
export const ddMappingStatusSchema = z.enum(ddMappingStatuses);
export const ddIssueSeveritySchema = z.enum(ddIssueSeverities);
export const ddIssueStatusSchema = z.enum(ddIssueStatuses);
export const ddRiskCategorySchema = z.enum(ddRiskCategories);
export const ddRiskLikelihoodSchema = z.enum(ddRiskLikelihoods);
export const ddRiskStatusSchema = z.enum(ddRiskStatuses);

export const createDdRfiRequestSchema = z
  .object({
    matterId: uuidSchema,
    rfiCode: codeSchema,
    category: ddRfiCategorySchema.default('general'),
    title: safeTitleSchema,
    description: safeTextSchema.optional(),
    status: ddRfiStatusSchema.default('requested'),
    priority: ddPrioritySchema.default('medium'),
    ownerUserId: uuidSchema.nullish(),
    dueDate: z.string().date().nullish(),
  })
  .strict();

export const updateDdRfiRequestSchema = z
  .object({
    category: ddRfiCategorySchema.optional(),
    title: safeTitleSchema.optional(),
    description: safeTextSchema.nullish(),
    status: ddRfiStatusSchema.optional(),
    priority: ddPrioritySchema.optional(),
    ownerUserId: uuidSchema.nullish(),
    dueDate: z.string().date().nullish(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });

export const ddRfiQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: ddRfiStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const ddRfiSchema = z
  .object({
    rfiId: uuidSchema,
    matterId: uuidSchema,
    rfiCode: codeSchema,
    category: ddRfiCategorySchema,
    title: z.string().min(1).max(240),
    status: ddRfiStatusSchema,
    priority: ddPrioritySchema,
    ownerUserId: uuidSchema.nullable(),
    dueDate: z.string().date().nullable(),
    overdue: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ddRfiListResponseSchema = z
  .object({
    matterId: uuidSchema,
    rfis: z.array(ddRfiSchema).max(100),
  })
  .strict();

export const createDdDataRoomMappingRequestSchema = z
  .object({
    matterId: uuidSchema,
    rfiId: uuidSchema.nullish(),
    documentId: uuidSchema.optional(),
    versionId: uuidSchema.optional(),
    internalLabel: safeLabelSchema,
    sectionPath: safeLabelSchema,
    mappingStatus: ddMappingStatusSchema.default('missing'),
  })
  .strict()
  .refine(
    (value) =>
      value.mappingStatus === 'mapped'
        ? value.documentId !== undefined
        : value.documentId === undefined && value.versionId === undefined,
    {
      message: 'mapped entries require a document; missing entries cannot carry a document',
      path: ['documentId'],
    },
  );

export const ddDataRoomMappingQuerySchema = z
  .object({
    matterId: uuidSchema,
    rfiId: uuidSchema.optional(),
    status: ddMappingStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const ddDataRoomMappingSchema = z
  .object({
    mappingId: uuidSchema,
    matterId: uuidSchema,
    rfiId: uuidSchema.nullable(),
    documentId: uuidSchema.nullable(),
    versionId: uuidSchema.nullable(),
    internalLabel: z.string().min(1).max(160),
    sectionPath: z.string().min(1).max(160),
    mappingStatus: ddMappingStatusSchema,
    supplementRequestedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ddDataRoomMappingListResponseSchema = z
  .object({
    matterId: uuidSchema,
    mappings: z.array(ddDataRoomMappingSchema).max(100),
  })
  .strict();

export const createDdIssueRequestSchema = z
  .object({
    matterId: uuidSchema,
    rfiId: uuidSchema.nullish(),
    documentId: uuidSchema.optional(),
    issueCode: codeSchema,
    title: safeTitleSchema,
    severity: ddIssueSeveritySchema.default('medium'),
    status: ddIssueStatusSchema.default('open'),
    citationRefs: z.array(citationRefSchema).max(20).default([]),
    reportInclusion: z.boolean().default(false),
  })
  .strict();

export const ddIssueQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: ddIssueStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const ddIssueSchema = z
  .object({
    issueId: uuidSchema,
    matterId: uuidSchema,
    rfiId: uuidSchema.nullable(),
    documentId: uuidSchema.nullable(),
    issueCode: codeSchema,
    title: z.string().min(1).max(240),
    severity: ddIssueSeveritySchema,
    status: ddIssueStatusSchema,
    citationRefs: z.array(citationRefSchema).max(20),
    reportInclusion: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ddIssueListResponseSchema = z
  .object({
    matterId: uuidSchema,
    issues: z.array(ddIssueSchema).max(100),
  })
  .strict();

export const createDdRiskRequestSchema = z
  .object({
    matterId: uuidSchema,
    issueId: uuidSchema.nullish(),
    riskCode: codeSchema,
    category: ddRiskCategorySchema.default('legal'),
    severity: ddIssueSeveritySchema.default('medium'),
    likelihood: ddRiskLikelihoodSchema.default('medium'),
    status: ddRiskStatusSchema.default('open'),
    mitigationSummary: safeMitigationSchema.nullish(),
    citationRefs: z.array(citationRefSchema).max(20).default([]),
  })
  .strict();

export const ddRiskQuerySchema = z
  .object({
    matterId: uuidSchema,
    status: ddRiskStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const ddRiskSchema = z
  .object({
    riskId: uuidSchema,
    matterId: uuidSchema,
    issueId: uuidSchema.nullable(),
    riskCode: codeSchema,
    category: ddRiskCategorySchema,
    severity: ddIssueSeveritySchema,
    likelihood: ddRiskLikelihoodSchema,
    status: ddRiskStatusSchema,
    citationRefs: z.array(citationRefSchema).max(20),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ddRiskListResponseSchema = z
  .object({
    matterId: uuidSchema,
    risks: z.array(ddRiskSchema).max(100),
  })
  .strict();

export const ddTraceabilityQuerySchema = z
  .object({
    matterId: uuidSchema,
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

export const ddTraceabilityItemSchema = z
  .object({
    rfiId: uuidSchema.nullable(),
    mappingId: uuidSchema.nullable(),
    documentId: uuidSchema.nullable(),
    issueId: uuidSchema.nullable(),
    riskId: uuidSchema.nullable(),
    statusRefs: z.array(z.string().min(1).max(80)).max(8),
    citationRefs: z.array(citationRefSchema).max(20),
  })
  .strict();

export const ddTraceabilityResponseSchema = z
  .object({
    matterId: uuidSchema,
    rfiCount: z.number().int().min(0),
    mappingCount: z.number().int().min(0),
    issueCount: z.number().int().min(0),
    riskCount: z.number().int().min(0),
    traces: z.array(ddTraceabilityItemSchema).max(100),
  })
  .strict();

export type DdRfiCategory = (typeof ddRfiCategories)[number];
export type DdRfiStatus = (typeof ddRfiStatuses)[number];
export type DdPriority = (typeof ddPriorities)[number];
export type DdMappingStatus = (typeof ddMappingStatuses)[number];
export type DdIssueSeverity = (typeof ddIssueSeverities)[number];
export type DdIssueStatus = (typeof ddIssueStatuses)[number];
export type DdRiskCategory = (typeof ddRiskCategories)[number];
export type DdRiskLikelihood = (typeof ddRiskLikelihoods)[number];
export type DdRiskStatus = (typeof ddRiskStatuses)[number];
export type CreateDdRfiRequestDto = z.infer<typeof createDdRfiRequestSchema>;
export type UpdateDdRfiRequestDto = z.infer<typeof updateDdRfiRequestSchema>;
export type DdRfiQueryDto = z.infer<typeof ddRfiQuerySchema>;
export type DdRfiDto = z.infer<typeof ddRfiSchema>;
export type DdRfiListResponseDto = z.infer<typeof ddRfiListResponseSchema>;
export type CreateDdDataRoomMappingRequestDto = z.infer<
  typeof createDdDataRoomMappingRequestSchema
>;
export type DdDataRoomMappingQueryDto = z.infer<typeof ddDataRoomMappingQuerySchema>;
export type DdDataRoomMappingDto = z.infer<typeof ddDataRoomMappingSchema>;
export type DdDataRoomMappingListResponseDto = z.infer<
  typeof ddDataRoomMappingListResponseSchema
>;
export type CreateDdIssueRequestDto = z.infer<typeof createDdIssueRequestSchema>;
export type DdIssueQueryDto = z.infer<typeof ddIssueQuerySchema>;
export type DdIssueDto = z.infer<typeof ddIssueSchema>;
export type DdIssueListResponseDto = z.infer<typeof ddIssueListResponseSchema>;
export type CreateDdRiskRequestDto = z.infer<typeof createDdRiskRequestSchema>;
export type DdRiskQueryDto = z.infer<typeof ddRiskQuerySchema>;
export type DdRiskDto = z.infer<typeof ddRiskSchema>;
export type DdRiskListResponseDto = z.infer<typeof ddRiskListResponseSchema>;
export type DdTraceabilityQueryDto = z.infer<typeof ddTraceabilityQuerySchema>;
export type DdTraceabilityItemDto = z.infer<typeof ddTraceabilityItemSchema>;
export type DdTraceabilityResponseDto = z.infer<typeof ddTraceabilityResponseSchema>;
