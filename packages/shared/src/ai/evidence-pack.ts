import { z } from 'zod';
import { contractRuleFindingSchema } from '../contract/contract-types';

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const chunkSourceRefSchema = z.string().regex(/^chunk:[A-Za-z0-9:_-]+$/).max(120);

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

export const evidencePackV2PrepSourceRefEntrySchema = z
  .object({
    source_ref: chunkSourceRefSchema,
    citation_ref: chunkSourceRefSchema,
    document_id: z.string().uuid(),
    version_id: z.string().uuid(),
    matter_id: z.string().uuid(),
    chunk_id: z.string().uuid(),
    parent_chunk_id: z.string().uuid().nullable(),
    chunk_ordinal: z.number().int().min(0),
    text_hash: hashSchema,
    source_text_hash: hashSchema,
  })
  .strict();

export const evidencePackV2PrepAdapterSchema = z
  .object({
    schema_version: z.literal('evidence_pack.v2.prep_adapter'),
    compatible_with: z.tuple([z.literal('evidence_pack.v1')]),
    pack_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    matter_id: z.string().uuid(),
    model_route: z.literal('local_gemma'),
    applied_rules: z.array(z.string().min(1).max(120)).min(1).max(80),
    source_refs: z.array(chunkSourceRefSchema).min(1).max(50),
    source_ref_map: z.array(evidencePackV2PrepSourceRefEntrySchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.source_refs.forEach((sourceRef, index) => {
      if (seen.has(sourceRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'duplicate source_ref',
          path: ['source_refs', index],
        });
      }
      seen.add(sourceRef);
      const mapped = value.source_ref_map[index];
      if (!mapped || mapped.source_ref !== sourceRef || mapped.citation_ref !== sourceRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'source_ref_map must preserve source_refs order one-to-one',
          path: ['source_ref_map', index],
        });
      }
    });
    if (value.source_ref_map.length !== value.source_refs.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'source_ref_map length must equal source_refs length',
        path: ['source_ref_map'],
      });
    }
  });

export function adaptEvidencePackToPrepSourceRefs(
  input: EvidencePackDto,
): EvidencePackV2PrepAdapterDto {
  const pack = evidencePackSchema.parse(input);
  const declaredRefs = pack.citationRequirements.sourceRefs;
  const chunkRefs = pack.retrievedChunks.map((chunk) => chunk.citationRef);
  if (!pack.retrievalScope.appliedRules.includes('retrieval.hybrid:query_stage_scope')) {
    throw new Error('evidence pack is not query-stage permission scoped');
  }
  if (declaredRefs.length === 0 || pack.retrievedChunks.length === 0) {
    throw new Error('evidence pack prep adapter requires source refs');
  }
  if (declaredRefs.length !== chunkRefs.length) {
    throw new Error('evidence pack source ref count mismatch');
  }
  const seen = new Set<string>();
  for (let index = 0; index < declaredRefs.length; index += 1) {
    const ref = declaredRefs[index];
    const chunk = pack.retrievedChunks[index];
    if (!ref || !chunk) throw new Error('evidence pack source ref missing chunk');
    if (seen.has(ref)) throw new Error('evidence pack source refs must be unique');
    seen.add(ref);
    if (ref !== chunk.citationRef || ref !== `chunk:${chunk.chunkId}`) {
      throw new Error('evidence pack source refs must match chunk citations');
    }
  }
  return evidencePackV2PrepAdapterSchema.parse({
    schema_version: 'evidence_pack.v2.prep_adapter',
    compatible_with: ['evidence_pack.v1'],
    pack_id: pack.packId,
    tenant_id: pack.retrievalScope.tenantId,
    matter_id: pack.retrievalScope.matterId,
    model_route: pack.retrievalScope.modelRoute,
    applied_rules: pack.retrievalScope.appliedRules,
    source_refs: declaredRefs,
    source_ref_map: pack.retrievedChunks.map((chunk) => ({
      source_ref: chunk.citationRef,
      citation_ref: chunk.citationRef,
      document_id: chunk.documentId,
      version_id: chunk.versionId,
      matter_id: chunk.matterId,
      chunk_id: chunk.chunkId,
      parent_chunk_id: chunk.parentChunkId,
      chunk_ordinal: chunk.chunkOrdinal,
      text_hash: chunk.textHash,
      source_text_hash: chunk.sourceTextHash,
    })),
  });
}

export type EvidencePackTaskType = (typeof evidencePackTaskTypes)[number];
export type EvidencePackChunkDto = z.infer<typeof evidencePackChunkSchema>;
export type EvidencePackGraphFactDto = z.infer<typeof evidencePackGraphFactSchema>;
export type EvidencePackRuleFindingDto = z.infer<typeof evidencePackRuleFindingSchema>;
export type EvidencePackDto = z.infer<typeof evidencePackSchema>;
export type EvidencePackV2PrepSourceRefEntryDto = z.infer<
  typeof evidencePackV2PrepSourceRefEntrySchema
>;
export type EvidencePackV2PrepAdapterDto = z.infer<typeof evidencePackV2PrepAdapterSchema>;
