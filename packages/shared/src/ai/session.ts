import { z } from 'zod';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const aiSessionStatusSchema = z.enum([
  'submitted',
  'retrieved',
  'responded',
  'blocked',
  'failed',
]);

export const aiSessionModelRouteSchema = z.literal('local_gemma');

export const aiSessionChunkReasonCodeSchema = z.enum([
  'included',
  'permission_denied',
  'ethical_wall_blocked',
  'ai_policy_blocked',
  'dlp_redacted',
  'window_omitted',
  'missing_source',
  'unsupported_scope',
]);

export const aiSessionBlockedReasonSchema = z.enum([
  'ai_policy_blocked',
  'permission_denied',
  'ethical_wall_blocked',
  'dlp_blocked',
  'unsupported_scope',
  'validation_failed',
]);

export const aiSessionResponseStatusSchema = z.enum(['responded', 'blocked', 'failed']);
export const aiSessionGenerationResultSchema = z.enum(['generated', 'fallback', 'template']);

export const aiSessionCreateSchema = z
  .object({
    matterId: uuidSchema,
    modelRoute: aiSessionModelRouteSchema,
    promptHash: hashSchema,
    promptLength: z.number().int().min(0).max(20000),
    escalationRequired: z.boolean().optional(),
    blockedReason: aiSessionBlockedReasonSchema.optional(),
  })
  .strict();

export const aiSessionResponseLogSchema = z
  .object({
    responseHash: hashSchema,
    responseLength: z.number().int().min(0).max(20000),
    responseTokenCount: z.number().int().min(0).max(20000).optional(),
    latencyMs: z.number().int().min(0).max(600000).optional(),
    status: aiSessionResponseStatusSchema.optional(),
    escalationRequired: z.boolean().optional(),
    blockedReason: aiSessionBlockedReasonSchema.optional(),
    requestKind: z.string().min(1).max(80).optional(),
    generationResult: aiSessionGenerationResultSchema.optional(),
    fallbackReasonCode: z.string().min(1).max(80).optional(),
  })
  .strict();

const aiSessionChunkLogBaseSchema = z
  .object({
    documentId: uuidSchema,
    versionId: uuidSchema,
    chunkId: uuidSchema,
    included: z.boolean(),
    reasonCode: aiSessionChunkReasonCodeSchema,
    rankIndex: z.number().int().min(0).nullable().optional(),
    score: z.number().finite().min(0).nullable().optional(),
    quoteHash: hashSchema,
    sourceTextHash: hashSchema,
  })
  .strict();

export const aiSessionChunkLogSchema = aiSessionChunkLogBaseSchema
  .refine((value) => value.included === (value.reasonCode === 'included'), {
    message: 'included chunks must use included reason code',
    path: ['reasonCode'],
  });

export const aiSessionChunkDetailSchema = aiSessionChunkLogBaseSchema.extend({
  rankIndex: z.number().int().min(0).nullable(),
  score: z.number().finite().min(0).nullable(),
});

export const aiSessionDetailSchema = z
  .object({
    sessionId: uuidSchema,
    matterId: uuidSchema,
    ownerUserId: uuidSchema,
    authSessionId: uuidSchema.nullable(),
    modelRoute: aiSessionModelRouteSchema,
    status: aiSessionStatusSchema,
    promptHash: hashSchema,
    promptLength: z.number().int().min(0).max(20000),
    responseHash: hashSchema.nullable(),
    responseLength: z.number().int().min(0).max(20000).nullable(),
    responseTokenCount: z.number().int().min(0).max(20000).nullable(),
    latencyMs: z.number().int().min(0).max(600000).nullable(),
    escalationRequired: z.boolean(),
    blockedReason: z.string().min(1).max(80).nullable(),
    chunks: z.array(aiSessionChunkDetailSchema).max(50),
    hiddenSourceCount: z.number().int().min(0).max(10000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const aiSessionPayloadSchema = z
  .object({
    sessionId: uuidSchema,
    matterId: uuidSchema,
    ownerUserId: uuidSchema,
    promptText: z.string().max(20000),
    responseText: z.string().max(20000),
    promptHash: hashSchema,
    responseHash: hashSchema,
    promptLength: z.number().int().min(0).max(20000),
    responseLength: z.number().int().min(0).max(20000),
    riskFlag: z.boolean(),
    dlpFindingCount: z.number().int().min(0).max(10000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const listAiSessionsQuerySchema = z
  .object({
    matterId: uuidSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export const aiSessionListItemSchema = z
  .object({
    sessionId: uuidSchema,
    matterId: uuidSchema,
    ownerUserId: uuidSchema,
    modelRoute: aiSessionModelRouteSchema,
    status: aiSessionStatusSchema,
    responseTokenCount: z.number().int().min(0).max(20000).nullable(),
    latencyMs: z.number().int().min(0).max(600000).nullable(),
    escalationRequired: z.boolean(),
    blockedReason: aiSessionBlockedReasonSchema.nullable(),
    policySummary: z.string().min(1).max(80),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const aiSessionListSchema = z
  .object({
    items: z.array(aiSessionListItemSchema).max(50),
    totalCount: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();

export type AiSessionStatus = z.infer<typeof aiSessionStatusSchema>;
export type AiSessionModelRoute = z.infer<typeof aiSessionModelRouteSchema>;
export type AiSessionChunkReasonCode = z.infer<typeof aiSessionChunkReasonCodeSchema>;
export type AiSessionCreateDto = z.infer<typeof aiSessionCreateSchema>;
export type AiSessionResponseLogDto = z.infer<typeof aiSessionResponseLogSchema>;
export type AiSessionChunkLogDto = z.infer<typeof aiSessionChunkLogSchema>;
export type AiSessionChunkDetailDto = z.infer<typeof aiSessionChunkDetailSchema>;
export type AiSessionDetailDto = z.infer<typeof aiSessionDetailSchema>;
export type AiSessionPayloadDto = z.infer<typeof aiSessionPayloadSchema>;
export type ListAiSessionsQueryDto = z.infer<typeof listAiSessionsQuerySchema>;
export type AiSessionListItemDto = z.infer<typeof aiSessionListItemSchema>;
export type AiSessionListDto = z.infer<typeof aiSessionListSchema>;
