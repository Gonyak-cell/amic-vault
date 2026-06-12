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

export type ContractType = (typeof contractTypes)[number];
export type ContractClauseKind = (typeof contractClauseKinds)[number];
export type RedlineChangeType = (typeof redlineChangeTypes)[number];
export type PlaybookRuleType = (typeof playbookRuleTypes)[number];
export type ContractProcessRequestDto = z.infer<typeof contractProcessRequestSchema>;
export type ContractClassificationDto = z.infer<typeof contractClassificationSchema>;
export type ContractProcessResponseDto = z.infer<typeof contractProcessResponseSchema>;
export type CreatePlaybookRuleRequestDto = z.infer<typeof createPlaybookRuleRequestSchema>;
export type PlaybookRuleResponseDto = z.infer<typeof playbookRuleResponseSchema>;
