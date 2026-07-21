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
export const negotiationClauseKinds = [
  'indemnity',
  'liability_cap',
  'confidentiality',
  'termination',
  'governing_law',
  'payment',
  'non_compete',
  'assignment',
  'dispute_resolution',
  'other',
] as const;
export const negotiationClauseKindSchema = z.enum(negotiationClauseKinds);
export const negotiationIssueStatuses = ['open', 'agreed', 'dropped'] as const;
export const negotiationIssueStatusSchema = z.enum(negotiationIssueStatuses);
export const contractAiReviewTasks = ['clause_analysis', 'risk_extraction'] as const;
export const contractAiReviewTaskSchema = z.enum(contractAiReviewTasks);
export const contractAiReviewStatuses = ['pending', 'accepted'] as const;
export const contractAiReviewStatusSchema = z.enum(contractAiReviewStatuses);

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
    clientId: uuidSchema.nullish(),
  })
  .strict()
  .refine((value) => !(value.matterId && value.clientId), {
    message: 'matterId and clientId are mutually exclusive',
    path: ['clientId'],
  });

export const playbookRuleResponseSchema = z
  .object({
    ruleId: uuidSchema,
    ruleKey: z.string().min(3).max(80),
    ruleType: playbookRuleTypeSchema,
    severity: playbookRuleSeveritySchema,
    status: z.literal('active'),
    versionNumber: z.number().int().min(1),
    matterId: uuidSchema.nullable(),
    clientId: uuidSchema.nullable(),
    expressionHash: hashSchema,
  })
  .strict();

export const createNegotiationPositionRequestSchema = z
  .object({
    matterId: uuidSchema,
    partyId: uuidSchema,
    issueLabel: z.string().trim().min(1).max(120),
    clauseKind: negotiationClauseKindSchema,
    positionSummary: z.string().trim().min(1).max(2000),
    sourceDocumentId: uuidSchema,
    sourceVersionId: uuidSchema,
    sourceClauseId: uuidSchema.nullish(),
    roundNo: z.number().int().min(1).max(100),
  })
  .strict();

export const updateNegotiationPositionRequestSchema = createNegotiationPositionRequestSchema
  .omit({ matterId: true, partyId: true })
  .partial()
  .strict();

export const negotiationPositionQuerySchema = z
  .object({
    matterId: uuidSchema,
    partyId: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const negotiationPositionSchema = z
  .object({
    positionId: uuidSchema,
    matterId: uuidSchema,
    partyId: uuidSchema,
    issueLabel: z.string().min(1).max(120),
    clauseKind: negotiationClauseKindSchema,
    positionSummary: z.string().min(1).max(2000),
    sourceDocumentId: uuidSchema,
    sourceVersionId: uuidSchema,
    sourceClauseId: uuidSchema.nullable(),
    roundNo: z.number().int().min(1),
    createdBy: uuidSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const negotiationPositionListResponseSchema = z
  .object({
    positions: z.array(negotiationPositionSchema).max(100),
  })
  .strict();

export const negotiationIssueQuerySchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    status: negotiationIssueStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const updateNegotiationIssueStatusRequestSchema = z
  .object({
    status: negotiationIssueStatusSchema,
  })
  .strict();

export const negotiationIssueSchema = z
  .object({
    issueId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema,
    clauseId: uuidSchema.nullable(),
    redlineChangeId: uuidSchema,
    changeType: redlineChangeTypeSchema,
    redlineTextHash: hashSchema,
    ruleId: uuidSchema,
    ruleKey: z.string().min(3).max(80),
    ruleVersion: z.number().int().min(1),
    severity: playbookRuleSeveritySchema,
    findingStatus: contractRuleFindingStatusSchema,
    findingCode: z.string().min(1).max(120).regex(/^[a-z0-9._:-]+$/),
    findingHash: hashSchema,
    status: negotiationIssueStatusSchema,
    citationRefs: z.array(z.string().min(1).max(120)).max(20),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const negotiationIssueListResponseSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    issues: z.array(negotiationIssueSchema).max(100),
  })
  .strict();

export const counterpartyPatternsQuerySchema = z
  .object({
    partyId: uuidSchema,
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const counterpartyPatternSchema = z
  .object({
    partyId: uuidSchema,
    clauseKind: negotiationClauseKindSchema,
    requestCount: z.number().int().min(0),
    matterCount: z.number().int().min(0),
    latestRoundNo: z.number().int().min(1),
    latestPositionId: uuidSchema,
  })
  .strict();

export const counterpartyPatternsResponseSchema = z
  .object({
    partyId: uuidSchema,
    patterns: z.array(counterpartyPatternSchema).max(50),
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

export const clauseBankEntryStatuses = ['draft', 'approved', 'deprecated'] as const;
export const clauseBankEntryStatusSchema = z.enum(clauseBankEntryStatuses);
const clauseBankTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9가-힣_.-]+$/u);

export const createClauseBankEntryRequestSchema = z
  .object({
    clauseId: uuidSchema,
    tags: z.array(clauseBankTagSchema).max(12).default([]),
  })
  .strict();

export const updateClauseBankEntryRequestSchema = z
  .object({
    status: z.enum(['approved', 'deprecated']),
    tags: z.array(clauseBankTagSchema).max(12).optional(),
  })
  .strict();

export const clauseBankEntryQuerySchema = z
  .object({
    status: clauseBankEntryStatusSchema.optional(),
    tag: clauseBankTagSchema.optional(),
    clauseKind: contractClauseKindSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const clauseBankEntrySchema = z
  .object({
    entryId: uuidSchema,
    status: clauseBankEntryStatusSchema,
    sourceClauseId: uuidSchema,
    matterId: uuidSchema.nullable(),
    documentId: uuidSchema.nullable(),
    versionId: uuidSchema.nullable(),
    clauseKind: contractClauseKindSchema,
    clauseNumber: z.string().min(1).max(80),
    headingHash: hashSchema,
    textHash: hashSchema,
    tags: z.array(clauseBankTagSchema).max(12),
    usageCount: z.number().int().min(0),
    proposedBy: uuidSchema.nullable(),
    approvedBy: uuidSchema.nullable(),
    sourceAccessible: z.boolean(),
    citationRef: z.string().min(1).max(120),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const clauseBankEntryListResponseSchema = z
  .object({
    entries: z.array(clauseBankEntrySchema).max(100),
  })
  .strict();

export const clauseSearchRequestSchema = z
  .object({
    query: z.string().trim().min(2).max(300),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export const clauseSearchResultSchema = z
  .object({
    clauseId: uuidSchema,
    clauseBankEntryId: uuidSchema.nullable(),
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema,
    clauseKind: contractClauseKindSchema,
    clauseNumber: z.string().min(1).max(80),
    headingHash: hashSchema,
    textHash: hashSchema,
    tags: z.array(clauseBankTagSchema).max(12),
    approved: z.boolean(),
    score: z.number().min(0).max(2),
    semanticScore: z.number().min(-1).max(1),
    citationRef: z.string().min(1).max(120),
  })
  .strict();

export const clauseSearchResponseSchema = z
  .object({
    queryHash: hashSchema,
    modelRoute: z.literal('bge_m3'),
    results: z.array(clauseSearchResultSchema).max(50),
  })
  .strict();

export const wordClauseInsertionRequestSchema = z
  .object({
    clauseId: uuidSchema,
    clauseBankEntryId: uuidSchema.nullable().optional(),
    insertionFormat: z.enum(['ooxml', 'text']).default('ooxml'),
    documentContextHash: hashSchema.optional(),
    selectionContextHash: hashSchema.optional(),
    sourceClient: z.literal('word-web-addin').default('word-web-addin'),
  })
  .strict();

export const wordClauseInsertionResponseSchema = z
  .object({
    status: z.literal('ready'),
    clauseId: uuidSchema,
    clauseBankEntryId: uuidSchema.nullable(),
    insertionFormat: z.enum(['ooxml', 'text']),
    citationRef: z.string().min(1).max(120),
    textHash: hashSchema,
    insertText: z.string().trim().min(1).max(20_000),
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

export const contractAiReviewFindingQuerySchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    task: contractAiReviewTaskSchema.optional(),
    status: contractAiReviewStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const contractAiReviewFindingSchema = z
  .object({
    findingId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema,
    clauseId: uuidSchema.nullable(),
    aiSessionId: uuidSchema,
    aiClaimId: uuidSchema,
    aiSource: z.literal('local_gemma'),
    task: contractAiReviewTaskSchema,
    severity: playbookRuleSeveritySchema,
    findingCode: z.string().min(1).max(120).regex(/^[a-z0-9._:-]+$/),
    findingHash: hashSchema,
    findingText: z.string().trim().min(1).max(1600),
    citationRefs: z.array(z.string().min(1).max(120)).min(1).max(20),
    status: contractAiReviewStatusSchema,
    acceptedBy: uuidSchema.nullable(),
    acceptedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (value) =>
      (value.status === 'pending' && value.acceptedBy === null && value.acceptedAt === null) ||
      (value.status === 'accepted' && value.acceptedBy !== null && value.acceptedAt !== null),
    {
      message: 'accepted review findings require acceptedBy and acceptedAt',
      path: ['status'],
    },
  );

export const contractAiReviewFindingListResponseSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    findings: z.array(contractAiReviewFindingSchema).max(100),
  })
  .strict();

export type ContractType = (typeof contractTypes)[number];
export type ContractClauseKind = (typeof contractClauseKinds)[number];
export type RedlineChangeType = (typeof redlineChangeTypes)[number];
export type PlaybookRuleType = (typeof playbookRuleTypes)[number];
export type PlaybookRuleSeverity = z.infer<typeof playbookRuleSeveritySchema>;
export type NegotiationClauseKind = z.infer<typeof negotiationClauseKindSchema>;
export type NegotiationIssueStatus = z.infer<typeof negotiationIssueStatusSchema>;
export type ContractRuleFindingStatus = z.infer<typeof contractRuleFindingStatusSchema>;
export type ContractAiReviewTask = z.infer<typeof contractAiReviewTaskSchema>;
export type ContractAiReviewStatus = z.infer<typeof contractAiReviewStatusSchema>;
export type ContractProcessRequestDto = z.infer<typeof contractProcessRequestSchema>;
export type ContractClassificationDto = z.infer<typeof contractClassificationSchema>;
export type ContractProcessResponseDto = z.infer<typeof contractProcessResponseSchema>;
export type CreatePlaybookRuleRequestDto = z.infer<typeof createPlaybookRuleRequestSchema>;
export type PlaybookRuleResponseDto = z.infer<typeof playbookRuleResponseSchema>;
export type CreateNegotiationPositionRequestDto = z.infer<
  typeof createNegotiationPositionRequestSchema
>;
export type UpdateNegotiationPositionRequestDto = z.infer<
  typeof updateNegotiationPositionRequestSchema
>;
export type NegotiationPositionQueryDto = z.infer<typeof negotiationPositionQuerySchema>;
export type NegotiationPositionDto = z.infer<typeof negotiationPositionSchema>;
export type NegotiationPositionListResponseDto = z.infer<
  typeof negotiationPositionListResponseSchema
>;
export type NegotiationIssueQueryDto = z.infer<typeof negotiationIssueQuerySchema>;
export type UpdateNegotiationIssueStatusRequestDto = z.infer<
  typeof updateNegotiationIssueStatusRequestSchema
>;
export type NegotiationIssueDto = z.infer<typeof negotiationIssueSchema>;
export type NegotiationIssueListResponseDto = z.infer<
  typeof negotiationIssueListResponseSchema
>;
export type CounterpartyPatternsQueryDto = z.infer<typeof counterpartyPatternsQuerySchema>;
export type CounterpartyPatternDto = z.infer<typeof counterpartyPatternSchema>;
export type CounterpartyPatternsResponseDto = z.infer<
  typeof counterpartyPatternsResponseSchema
>;
export type ContractClauseBankQueryDto = z.infer<typeof contractClauseBankQuerySchema>;
export type ContractClauseBankItemDto = z.infer<typeof contractClauseBankItemSchema>;
export type ContractClauseBankResponseDto = z.infer<typeof contractClauseBankResponseSchema>;
export type ClauseBankEntryStatus = z.infer<typeof clauseBankEntryStatusSchema>;
export type CreateClauseBankEntryRequestDto = z.infer<typeof createClauseBankEntryRequestSchema>;
export type UpdateClauseBankEntryRequestDto = z.infer<typeof updateClauseBankEntryRequestSchema>;
export type ClauseBankEntryQueryDto = z.infer<typeof clauseBankEntryQuerySchema>;
export type ClauseBankEntryDto = z.infer<typeof clauseBankEntrySchema>;
export type ClauseBankEntryListResponseDto = z.infer<typeof clauseBankEntryListResponseSchema>;
export type ClauseSearchRequestDto = z.infer<typeof clauseSearchRequestSchema>;
export type ClauseSearchResultDto = z.infer<typeof clauseSearchResultSchema>;
export type ClauseSearchResponseDto = z.infer<typeof clauseSearchResponseSchema>;
export type WordClauseInsertionRequestDto = z.infer<typeof wordClauseInsertionRequestSchema>;
export type WordClauseInsertionResponseDto = z.infer<typeof wordClauseInsertionResponseSchema>;
export type ContractRuleFindingsQueryDto = z.infer<typeof contractRuleFindingsQuerySchema>;
export type ContractRuleFindingDto = z.infer<typeof contractRuleFindingSchema>;
export type ContractRuleFindingsResponseDto = z.infer<typeof contractRuleFindingsResponseSchema>;
export type ContractAiReviewFindingQueryDto = z.infer<
  typeof contractAiReviewFindingQuerySchema
>;
export type ContractAiReviewFindingDto = z.infer<typeof contractAiReviewFindingSchema>;
export type ContractAiReviewFindingListResponseDto = z.infer<
  typeof contractAiReviewFindingListResponseSchema
>;
