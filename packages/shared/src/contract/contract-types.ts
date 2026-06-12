import { z } from 'zod';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const contractTypes = [
  'nda',
  'msa',
  'share_purchase',
  'employment',
  'lease',
  'loan',
  'unknown',
] as const;

export const contractTypeSchema = z.enum(contractTypes);
export const contractClauseKinds = ['article', 'section', 'paragraph', 'definition'] as const;
export const contractClauseKindSchema = z.enum(contractClauseKinds);
export const redlineChangeTypes = ['added', 'deleted'] as const;
export const redlineChangeTypeSchema = z.enum(redlineChangeTypes);
export const playbookRuleTypes = ['required_clause', 'prohibited_term', 'threshold'] as const;
export const playbookRuleTypeSchema = z.enum(playbookRuleTypes);
export const playbookRuleSeveritySchema = z.enum(['info', 'warning', 'critical']);
export const contractRuleFindingStatusSchema = z.enum(['pass', 'fail', 'unsupported']);

export const contractProcessRequestSchema = z
  .object({
    documentId: uuidSchema,
    versionId: uuidSchema.optional(),
  })
  .strict();

export const contractClassificationSchema = z
  .object({
    documentId: uuidSchema,
    versionId: uuidSchema,
    matterId: uuidSchema,
    contractType: contractTypeSchema,
    confidence: z.number().min(0).max(1),
    classifierVersion: z.string().min(1).max(40),
    unsupported: z.boolean(),
    signalRefs: z.array(z.string().min(1).max(80)).max(12),
  })
  .strict();

export const contractProcessResponseSchema = z
  .object({
    documentId: uuidSchema,
    versionId: uuidSchema,
    matterId: uuidSchema,
    classification: contractClassificationSchema,
    clauseCount: z.number().int().min(0),
    definedTermCount: z.number().int().min(0),
    redlineChangeCount: z.number().int().min(0),
    parserStatus: z.enum(['success', 'partial', 'failed']),
    warnings: z.array(z.string().min(1).max(120)).max(20),
  })
  .strict();

export const createPlaybookRuleRequestSchema = z
  .object({
    ruleKey: z.string().trim().min(3).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/),
    ruleType: playbookRuleTypeSchema,
    severity: playbookRuleSeveritySchema,
    expression: z.record(z.unknown()).default({}),
    matterId: uuidSchema.nullish(),
  })
  .strict();

export const playbookRuleResponseSchema = z
  .object({
    ruleId: uuidSchema,
    ruleKey: z.string().min(3).max(80),
    ruleType: playbookRuleTypeSchema,
    severity: playbookRuleSeveritySchema,
    status: z.literal('active'),
    versionNumber: z.number().int().min(1),
    matterId: uuidSchema.nullable(),
    expressionHash: hashSchema,
  })
  .strict();

export const contractClauseBankQuerySchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const contractClauseBankItemSchema = z
  .object({
    clauseId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema,
    clauseKind: contractClauseKindSchema,
    clauseNumber: z.string().min(1).max(80),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(1),
    headingHash: hashSchema,
    textHash: hashSchema,
    definedTermCount: z.number().int().min(0),
    conflictCount: z.number().int().min(0),
    redlineChangeCount: z.number().int().min(0),
    citationRef: z.string().min(1).max(120),
  })
  .strict()
  .refine((value) => value.endOffset > value.startOffset, {
    message: 'endOffset must be greater than startOffset',
    path: ['endOffset'],
  });

export const contractClauseBankResponseSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    clauses: z.array(contractClauseBankItemSchema).max(100),
  })
  .strict();

export const contractRuleFindingsQuerySchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const contractRuleFindingSchema = z
  .object({
    findingId: hashSchema,
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    versionId: uuidSchema.nullable(),
    clauseId: uuidSchema.nullable(),
    ruleId: uuidSchema,
    ruleKey: z.string().min(3).max(80),
    ruleVersion: z.number().int().min(1),
    severity: playbookRuleSeveritySchema,
    status: contractRuleFindingStatusSchema,
    findingCode: z.string().min(1).max(120).regex(/^[a-z0-9._:-]+$/),
    findingHash: hashSchema,
    evidenceRefs: z.array(z.string().min(1).max(120)).max(20),
  })
  .strict();

export const contractRuleFindingsResponseSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    findings: z.array(contractRuleFindingSchema).max(50),
    unsupportedRuleCount: z.number().int().min(0),
  })
  .strict();

export type ContractType = (typeof contractTypes)[number];
export type ContractClauseKind = (typeof contractClauseKinds)[number];
export type RedlineChangeType = (typeof redlineChangeTypes)[number];
export type PlaybookRuleType = (typeof playbookRuleTypes)[number];
export type PlaybookRuleSeverity = z.infer<typeof playbookRuleSeveritySchema>;
export type ContractRuleFindingStatus = z.infer<typeof contractRuleFindingStatusSchema>;
export type ContractProcessRequestDto = z.infer<typeof contractProcessRequestSchema>;
export type ContractClassificationDto = z.infer<typeof contractClassificationSchema>;
export type ContractProcessResponseDto = z.infer<typeof contractProcessResponseSchema>;
export type CreatePlaybookRuleRequestDto = z.infer<typeof createPlaybookRuleRequestSchema>;
export type PlaybookRuleResponseDto = z.infer<typeof playbookRuleResponseSchema>;
export type ContractClauseBankQueryDto = z.infer<typeof contractClauseBankQuerySchema>;
export type ContractClauseBankItemDto = z.infer<typeof contractClauseBankItemSchema>;
export type ContractClauseBankResponseDto = z.infer<typeof contractClauseBankResponseSchema>;
export type ContractRuleFindingsQueryDto = z.infer<typeof contractRuleFindingsQuerySchema>;
export type ContractRuleFindingDto = z.infer<typeof contractRuleFindingSchema>;
export type ContractRuleFindingsResponseDto = z.infer<typeof contractRuleFindingsResponseSchema>;
