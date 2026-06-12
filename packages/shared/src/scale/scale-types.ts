import { z } from 'zod';

const uuidSchema = z.string().uuid();
const codeSchema = z.string().trim().min(2).max(80).regex(/^[A-Z0-9][A-Z0-9._-]*$/);
const refSchema = z.string().trim().min(2).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
const hash64Schema = z.string().trim().regex(/^[a-f0-9]{64}$/iu).transform((value) => value.toLowerCase());

export const scaleScenarios = ['api_readiness', 'search_query', 'ai_gate', 'db_integration', 'web_console'] as const;
export const scaleCostScopes = ['compute', 'storage', 'database', 'ai', 'total'] as const;
export const scaleEvalSuites = ['search_korean', 'ai_gate', 'contract_gate', 'graph_consistency', 'full_regression'] as const;
export const scaleMigrationScopes = ['full_roundtrip', 'latest_down_up', 'schema_hash'] as const;
export const scaleLearningCategories = ['validation_failure', 'optimization', 'release_boundary', 'drift', 'gate'] as const;
export const scaleAiGateDecisions = ['external_blocked', 'deferred', 'local_only'] as const;
export const scaleRunStatuses = ['pass', 'fail'] as const;

export const scaleScenarioSchema = z.enum(scaleScenarios);
export const scaleCostScopeSchema = z.enum(scaleCostScopes);
export const scaleEvalSuiteSchema = z.enum(scaleEvalSuites);
export const scaleMigrationScopeSchema = z.enum(scaleMigrationScopes);
export const scaleLearningCategorySchema = z.enum(scaleLearningCategories);
export const scaleAiGateDecisionSchema = z.enum(scaleAiGateDecisions);
export const scaleRunStatusSchema = z.enum(scaleRunStatuses);

const scalePerformanceRunBaseSchema = z
  .object({
    scenario: scaleScenarioSchema,
    sampleCount: z.coerce.number().int().min(1).max(100000),
    p50Ms: z.coerce.number().int().min(0).max(600000),
    p95Ms: z.coerce.number().int().min(0).max(600000),
    p99Ms: z.coerce.number().int().min(0).max(600000),
    targetP95Ms: z.coerce.number().int().min(1).max(600000),
    measurementHash: hash64Schema,
    evidenceRef: refSchema,
  })
  .strict();

export const createScalePerformanceRunRequestSchema = scalePerformanceRunBaseSchema
  .refine((value) => value.p50Ms <= value.p95Ms && value.p95Ms <= value.p99Ms, {
    message: 'latency percentiles must be monotonic',
    path: ['p95Ms'],
  });

export const scalePerformanceRunSchema = scalePerformanceRunBaseSchema
  .extend({
    performanceRunId: uuidSchema,
    status: scaleRunStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine((value) => value.p50Ms <= value.p95Ms && value.p95Ms <= value.p99Ms, {
    message: 'latency percentiles must be monotonic',
    path: ['p95Ms'],
  });

export const scalePerformanceRunListResponseSchema = z
  .object({ runs: z.array(scalePerformanceRunSchema).max(50) })
  .strict();

const scaleCostSnapshotBaseSchema = z
  .object({
    scope: scaleCostScopeSchema,
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    unitCount: z.coerce.number().int().min(0).max(1000000000),
    estimatedCostCents: z.coerce.number().int().min(0).max(100000000000),
    currency: z.enum(['KRW', 'USD']),
    costModelHash: hash64Schema,
    evidenceRef: refSchema,
  })
  .strict();

export const createScaleCostSnapshotRequestSchema = scaleCostSnapshotBaseSchema
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: 'periodStart must be <= periodEnd',
    path: ['periodStart'],
  });

export const scaleCostSnapshotSchema = scaleCostSnapshotBaseSchema
  .extend({
    costSnapshotId: uuidSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: 'periodStart must be <= periodEnd',
    path: ['periodStart'],
  });

export const scaleCostSnapshotListResponseSchema = z
  .object({ snapshots: z.array(scaleCostSnapshotSchema).max(50) })
  .strict();

const scaleEvalRunBaseSchema = z
  .object({
    suite: scaleEvalSuiteSchema,
    caseCount: z.coerce.number().int().min(0).max(1000000),
    passCount: z.coerce.number().int().min(0).max(1000000),
    failCount: z.coerce.number().int().min(0).max(1000000),
    metricHash: hash64Schema,
    evidenceRef: refSchema,
  })
  .strict();

export const createScaleEvalRunRequestSchema = scaleEvalRunBaseSchema
  .refine((value) => value.passCount + value.failCount === value.caseCount, {
    message: 'passCount + failCount must equal caseCount',
    path: ['caseCount'],
  });

export const scaleEvalRunSchema = scaleEvalRunBaseSchema
  .extend({
    evalRunId: uuidSchema,
    status: scaleRunStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine((value) => value.passCount + value.failCount === value.caseCount, {
    message: 'passCount + failCount must equal caseCount',
    path: ['caseCount'],
  });

export const scaleEvalRunListResponseSchema = z
  .object({ runs: z.array(scaleEvalRunSchema).max(50) })
  .strict();

export const createScaleMigrationDrillRequestSchema = z
  .object({
    scope: scaleMigrationScopeSchema,
    durationMs: z.coerce.number().int().min(0).max(86400000),
    schemaHashBefore: hash64Schema,
    schemaHashAfter: hash64Schema,
    evidenceRef: refSchema,
    status: scaleRunStatusSchema,
  })
  .strict();

export const scaleMigrationDrillSchema = createScaleMigrationDrillRequestSchema
  .extend({
    migrationDrillId: uuidSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const scaleMigrationDrillListResponseSchema = z
  .object({ drills: z.array(scaleMigrationDrillSchema).max(50) })
  .strict();

export const createScaleLearningEventRequestSchema = z
  .object({
    category: scaleLearningCategorySchema,
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    patternCode: codeSchema,
    evidenceRef: refSchema,
    resolutionRef: refSchema,
  })
  .strict();

export const scaleLearningEventSchema = createScaleLearningEventRequestSchema
  .extend({
    learningEventId: uuidSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const scaleLearningEventListResponseSchema = z
  .object({ events: z.array(scaleLearningEventSchema).max(50) })
  .strict();

const scaleAiGateReviewBaseSchema = z
  .object({
    candidateRoute: z.enum(['local_gemma', 'external_model']),
    decision: scaleAiGateDecisionSchema,
    externalModelAllowed: z.literal(false),
    controlHash: hash64Schema,
    evidenceRef: refSchema,
  })
  .strict();

export const createScaleAiGateReviewRequestSchema = scaleAiGateReviewBaseSchema
  .refine((value) => value.candidateRoute !== 'external_model' || value.decision !== 'local_only', {
    message: 'external_model cannot be marked local_only',
    path: ['decision'],
  });

export const scaleAiGateReviewSchema = scaleAiGateReviewBaseSchema
  .extend({
    aiGateReviewId: uuidSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine((value) => value.candidateRoute !== 'external_model' || value.decision !== 'local_only', {
    message: 'external_model cannot be marked local_only',
    path: ['decision'],
  });

export const scaleAiGateReviewListResponseSchema = z
  .object({ reviews: z.array(scaleAiGateReviewSchema).max(50) })
  .strict();

export const scaleReadinessSummarySchema = z
  .object({
    passingPerformanceRunCount: z.number().int().min(0),
    costSnapshotCount: z.number().int().min(0),
    passingEvalRunCount: z.number().int().min(0),
    passingMigrationDrillCount: z.number().int().min(0),
    learningEventCount: z.number().int().min(0),
    aiGateReviewCount: z.number().int().min(0),
    externalModelAllowedCount: z.number().int().min(0),
    technicalPass: z.boolean(),
  })
  .strict();

export type CreateScalePerformanceRunRequestDto = z.infer<typeof createScalePerformanceRunRequestSchema>;
export type ScalePerformanceRunDto = z.infer<typeof scalePerformanceRunSchema>;
export type ScalePerformanceRunListResponseDto = z.infer<typeof scalePerformanceRunListResponseSchema>;
export type CreateScaleCostSnapshotRequestDto = z.infer<typeof createScaleCostSnapshotRequestSchema>;
export type ScaleCostSnapshotDto = z.infer<typeof scaleCostSnapshotSchema>;
export type ScaleCostSnapshotListResponseDto = z.infer<typeof scaleCostSnapshotListResponseSchema>;
export type CreateScaleEvalRunRequestDto = z.infer<typeof createScaleEvalRunRequestSchema>;
export type ScaleEvalRunDto = z.infer<typeof scaleEvalRunSchema>;
export type ScaleEvalRunListResponseDto = z.infer<typeof scaleEvalRunListResponseSchema>;
export type CreateScaleMigrationDrillRequestDto = z.infer<typeof createScaleMigrationDrillRequestSchema>;
export type ScaleMigrationDrillDto = z.infer<typeof scaleMigrationDrillSchema>;
export type ScaleMigrationDrillListResponseDto = z.infer<typeof scaleMigrationDrillListResponseSchema>;
export type CreateScaleLearningEventRequestDto = z.infer<typeof createScaleLearningEventRequestSchema>;
export type ScaleLearningEventDto = z.infer<typeof scaleLearningEventSchema>;
export type ScaleLearningEventListResponseDto = z.infer<typeof scaleLearningEventListResponseSchema>;
export type CreateScaleAiGateReviewRequestDto = z.infer<typeof createScaleAiGateReviewRequestSchema>;
export type ScaleAiGateReviewDto = z.infer<typeof scaleAiGateReviewSchema>;
export type ScaleAiGateReviewListResponseDto = z.infer<typeof scaleAiGateReviewListResponseSchema>;
export type ScaleReadinessSummaryDto = z.infer<typeof scaleReadinessSummarySchema>;
