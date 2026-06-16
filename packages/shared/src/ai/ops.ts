import { z } from 'zod';

const localAiEvalArtifactKinds = [
  'document_profile',
  'key_fields',
  'date_facts',
  'people_organizations',
  'keyword_tags',
  'filing_suggestions',
  'source_outline',
  'retrieval_hints',
] as const;

const localAiEvalArtifactKindSchema = z.enum(localAiEvalArtifactKinds);

export const localAiRuntimeStatuses = ['ready', 'blocked', 'degraded'] as const;
export const localAiEndpointClasses = ['loopback', 'private_network', 'blocked'] as const;

export const localAiRuntimeStatusSchema = z.enum(localAiRuntimeStatuses);
export const localAiEndpointClassSchema = z.enum(localAiEndpointClasses);

export const localAiOpsHealthSchema = z
  .object({
    status: localAiRuntimeStatusSchema,
    modelRoute: z.literal('local_gemma'),
    modelName: z.string().min(1).max(120).nullable(),
    parameterSize: z.string().min(1).max(40).nullable(),
    endpointClass: localAiEndpointClassSchema,
    queueBacklogCount: z.number().int().min(0),
    p95LatencyMs: z.number().int().min(0).nullable(),
    blockedPrepCount: z.number().int().min(0),
    degradedMode: z.boolean(),
    reasonCode: z.string().min(1).max(80).nullable(),
  })
  .strict();

export const localAiOpsMetricsSchema = z
  .object({
    prepCompletedCount: z.number().int().min(0),
    prepBlockedCount: z.number().int().min(0),
    prepFailedCount: z.number().int().min(0),
    prepRejectedCount: z.number().int().min(0),
    prepStaleCount: z.number().int().min(0),
    prepFallbackCount: z.number().int().min(0),
    staleRebuildCount: z.number().int().min(0),
    generationCompletedCount: z.number().int().min(0),
    generationBlockedCount: z.number().int().min(0),
    invalidOutputCount: z.number().int().min(0),
    citationRejectedCount: z.number().int().min(0),
    p95PrepLatencyMs: z.number().int().min(0).nullable(),
    p95GenerationLatencyMs: z.number().int().min(0).nullable(),
  })
  .strict();

export const localAiEvalArtifactKindMetricSchema = z
  .object({
    artifactKind: localAiEvalArtifactKindSchema,
    minimumCompletedCount: z.number().int().min(0),
    completedCount: z.number().int().min(0),
    generatedOutputCount: z.number().int().min(0),
    fallbackArtifactCount: z.number().int().min(0),
    rejectedOutputCount: z.number().int().min(0),
    fallbackRate: z.number().min(0).max(1),
    rejectedRate: z.number().min(0).max(1),
    p95LatencyMs: z.number().int().min(0).nullable(),
    technicalPass: z.boolean(),
  })
  .strict();

export const localAiEvalReportSchema = z
  .object({
    tenantId: z.string().uuid(),
    caseCount: z.number().int().min(0),
    deidentifiedCaseCount: z.number().int().min(0),
    completedOutputCount: z.number().int().min(0),
    fallbackArtifactCount: z.number().int().min(0),
    rejectedOutputCount: z.number().int().min(0),
    generatedOutputCount: z.number().int().min(0),
    permissionLeakageCount: z.number().int().min(0),
    prepSchemaViolationCount: z.number().int().min(0),
    citationAccuracy: z.number().min(0).max(1),
    unsupportedClaimRate: z.number().min(0).max(1),
    fallbackRate: z.number().min(0).max(1),
    rejectedRate: z.number().min(0).max(1),
    koreanLegalLanguagePass: z.boolean(),
    p95LatencyMs: z.number().int().min(0).nullable(),
    pendingPrepCount: z.number().int().min(0),
    maxPendingAgeSeconds: z.number().int().min(0).nullable(),
    artifactKindMetrics: z.array(localAiEvalArtifactKindMetricSchema).max(8),
    technicalPass: z.boolean(),
    warnings: z.array(z.string().min(1).max(200)).max(20),
  })
  .strict();

export type LocalAiRuntimeStatus = z.infer<typeof localAiRuntimeStatusSchema>;
export type LocalAiEndpointClass = z.infer<typeof localAiEndpointClassSchema>;
export type LocalAiOpsHealthDto = z.infer<typeof localAiOpsHealthSchema>;
export type LocalAiOpsMetricsDto = z.infer<typeof localAiOpsMetricsSchema>;
export type LocalAiEvalArtifactKindMetricDto = z.infer<
  typeof localAiEvalArtifactKindMetricSchema
>;
export type LocalAiEvalReportDto = z.infer<typeof localAiEvalReportSchema>;
