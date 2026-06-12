import { z } from 'zod';
import { contractRuleFindingSchema } from '../contract/contract-types';

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const evidencePackTaskTypes = [
  'retrieval',
  'summary',
  'review',
  'comparison',
  'research',
] as const;
export const evidencePackTaskTypeSchema = z.enum(evidencePackTaskTypes);

export const evidencePackSourceTypeSchema = z.enum([
  'document_chunk',
  'authority',
  'playbook',
]);

export const evidencePackChunkSchema = z
  .object({
    citationRef: z.string().min(1).max(120),
    documentId: z.string().uuid(),
    versionId: z.string().uuid(),
    matterId: z.string().uuid(),
    chunkId: z.string().uuid(),
    parentChunkId: z.string().uuid().nullable(),
    chunkOrdinal: z.number().int().min(0),
    tokenCount: z.number().int().min(1).max(1200),
    score: z.number().finite(),
    redactedText: z.string().min(1).max(4000),
    textHash: hashSchema,
    sourceTextHash: hashSchema,
  })
  .strict();

export const evidencePackGraphFactSchema = z
  .object({
    edgeId: z.string().uuid(),
    edgeType: z.enum([
      'HAS_MATTER',
      'HAS_DOCUMENT',
      'HAS_VERSION',
      'HAS_CLAUSE',
      'HAS_ISSUE',
      'HAS_RISK',
      'RELATED_TO',
    ]),
    matterId: z.string().uuid(),
    documentId: z.string().uuid().nullable(),
    sourceNodeId: z.string().uuid(),
    sourceNodeType: z.enum([
      'client',
      'matter',
      'document',
      'version',
      'clause',
      'issue',
      'risk',
    ]),
    targetNodeId: z.string().uuid(),
    targetNodeType: z.enum([
      'client',
      'matter',
      'document',
      'version',
      'clause',
      'issue',
      'risk',
    ]),
    sourceHash: hashSchema,
  })
  .strict();

export const evidencePackRuleFindingSchema = contractRuleFindingSchema;

export const evidencePackSchema = z
  .object({
    packId: z.string().uuid(),
    userQuestion: z.string().min(1).max(2000),
    rewrittenQueries: z.array(z.string().min(1).max(500)).min(1).max(8),
    taskType: evidencePackTaskTypeSchema,
    matterContext: z
      .object({
        matterId: z.string().uuid(),
      })
      .strict(),
    retrievalScope: z
      .object({
        tenantId: z.string().uuid(),
        matterId: z.string().uuid(),
        mode: z.literal('hybrid'),
        modelRoute: z.literal('local_gemma'),
        appliedRules: z.array(z.string().min(1).max(120)).max(80),
      })
      .strict(),
    relevantDocuments: z
      .array(
        z
          .object({
            documentId: z.string().uuid(),
            versionIds: z.array(z.string().uuid()).min(1).max(20),
            chunkCount: z.number().int().min(1).max(200),
            sourceTextHashes: z.array(hashSchema).min(1).max(20),
          })
          .strict(),
      )
      .max(50),
    authoritativeSources: z
      .array(
        z
          .object({
            sourceType: evidencePackSourceTypeSchema,
            sourceId: z.string().min(1).max(120),
            reason: z.string().min(1).max(240),
          })
          .strict(),
      )
      .max(20),
    retrievedChunks: z.array(evidencePackChunkSchema).max(12),
    omittedChunkIds: z.array(z.string().uuid()).max(200),
    window: z
      .object({
        tokenBudget: z.number().int().min(1).max(4000),
        tokenCount: z.number().int().min(0).max(4000),
      })
      .strict(),
    graphFacts: z.array(evidencePackGraphFactSchema).max(20),
    ruleFindings: z.array(evidencePackRuleFindingSchema).max(20),
    conflicts: z.array(z.string().min(1).max(300)).max(10),
    uncertainty: z.array(z.string().min(1).max(300)).max(10),
    prohibitedAssumptions: z.array(z.string().min(1).max(300)).min(1).max(10),
    citationRequirements: z
      .object({
        required: z.literal(true),
        style: z.literal('chunk_ref'),
        sourceRefs: z.array(z.string().min(1).max(120)).max(50),
      })
      .strict(),
    outputFormat: z
      .object({
        kind: evidencePackTaskTypeSchema,
        locale: z.enum(['ko-KR', 'en-US']),
      })
      .strict(),
    escalationFlags: z.array(z.string().min(1).max(120)).max(10),
  })
  .strict()
  .refine((value) => value.window.tokenCount <= value.window.tokenBudget, {
    message: 'window token count exceeds budget',
    path: ['window', 'tokenCount'],
  });

export type EvidencePackTaskType = (typeof evidencePackTaskTypes)[number];
export type EvidencePackChunkDto = z.infer<typeof evidencePackChunkSchema>;
export type EvidencePackGraphFactDto = z.infer<typeof evidencePackGraphFactSchema>;
export type EvidencePackRuleFindingDto = z.infer<typeof evidencePackRuleFindingSchema>;
export type EvidencePackDto = z.infer<typeof evidencePackSchema>;
