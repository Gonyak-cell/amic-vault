import { z } from 'zod';

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const graphNodeTypes = [
  'client',
  'matter',
  'document',
  'version',
  'text_chunk',
  'clause',
  'defined_term',
  'fact',
  'evidence',
  'issue',
  'risk',
  'rfi',
  'party',
  'negotiation_position',
] as const;

export const graphEdgeTypes = [
  'HAS_MATTER',
  'HAS_DOCUMENT',
  'HAS_VERSION',
  'HAS_CLAUSE',
  'HAS_FACT',
  'EVIDENCED_BY',
  'REQUIRES_ACTION',
  'HAS_PARTY',
  'HAS_POSITION',
  'HAS_ISSUE',
  'HAS_RISK',
  'HAS_SUB_ISSUE',
  'SUPERSEDES',
  'AMENDS',
  'CITES',
  'DEFINES',
  'CONTAINS_CLAUSE',
  'ALIGNED_WITH',
  'RELATED_TO',
] as const;

export const graphNodeTypeSchema = z.enum(graphNodeTypes);
export const graphEdgeTypeSchema = z.enum(graphEdgeTypes);
export const graphNodeProvenanceValues = ['derived', 'ai_proposed', 'human_confirmed'] as const;
export const graphNodeReviewStatusValues = ['proposed', 'confirmed'] as const;
export const graphNodeCreatedByKindValues = ['system', 'ai', 'human'] as const;
export const graphNodeProvenanceSchema = z.enum(graphNodeProvenanceValues);
export const graphNodeReviewStatusSchema = z.enum(graphNodeReviewStatusValues);
export const graphNodeCreatedByKindSchema = z.enum(graphNodeCreatedByKindValues);

export const graphNodeRefSchema = z
  .object({
    nodeId: z.string().uuid(),
    nodeType: graphNodeTypeSchema,
    sourceId: z.string().uuid(),
    matterId: z.string().uuid().nullable(),
    documentId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
    provenance: graphNodeProvenanceSchema,
    reviewStatus: graphNodeReviewStatusSchema.nullable(),
    createdByKind: graphNodeCreatedByKindSchema,
  })
  .strict();

export const graphFactSchema = z
  .object({
    edgeId: z.string().uuid(),
    edgeType: graphEdgeTypeSchema,
    matterId: z.string().uuid(),
    documentId: z.string().uuid().nullable(),
    source: graphNodeRefSchema,
    target: graphNodeRefSchema,
    sourceHash: hashSchema,
  })
  .strict();

export const graphFactsQuerySchema = z
  .object({
    matterId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

function normalizeEdgeTypes(value: unknown): unknown {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((candidate) => (typeof candidate === 'string' ? candidate.split(',') : []))
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

export const graphNeighborhoodQuerySchema = z
  .object({
    nodeId: z.string().uuid(),
    depth: z.coerce.number().int().min(1).max(3).default(1),
    edgeTypes: z.preprocess(normalizeEdgeTypes, z.array(graphEdgeTypeSchema).max(16).optional()),
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(200),
  })
  .strict();

export const graphSyncRequestSchema = z
  .object({
    matterId: z.string().uuid(),
  })
  .strict();

export const graphNodeReviewActionSchema = z.enum(['confirm', 'reject']);

export const graphNodeReviewRequestSchema = z
  .object({
    action: graphNodeReviewActionSchema,
  })
  .strict();

export const graphSyncResponseSchema = z
  .object({
    syncRunId: z.string().uuid(),
    matterId: z.string().uuid(),
    status: z.literal('success'),
    nodeCount: z.number().int().min(0),
    edgeCount: z.number().int().min(0),
    staleNodeCount: z.number().int().min(0),
    staleEdgeCount: z.number().int().min(0),
  })
  .strict();

export const graphFactsResponseSchema = z
  .object({
    matterId: z.string().uuid(),
    facts: z.array(graphFactSchema).max(50),
  })
  .strict();

export const graphNeighborhoodPathSchema = z
  .object({
    depth: z.number().int().min(1).max(3),
    nodeIds: z.array(z.string().uuid()).min(2).max(4),
    edgeIds: z.array(z.string().uuid()).min(1).max(3),
  })
  .strict();

export const graphNeighborhoodResponseSchema = z
  .object({
    matterId: z.string().uuid(),
    rootNodeId: z.string().uuid(),
    depth: z.number().int().min(1).max(3),
    nodes: z.array(graphNodeRefSchema).max(400),
    edges: z.array(graphFactSchema).max(200),
    paths: z.array(graphNeighborhoodPathSchema).max(200),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const graphConsistencyDriftSchema = z
  .object({
    kind: z.enum([
      'missing_document_node',
      'missing_version_node',
      'stale_document_node',
      'edge_points_to_stale_node',
      'version_lineage_conflict',
      'defined_term_mismatch',
      'evidence_gap',
    ]),
    matterId: z.string().uuid(),
    documentId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
    nodeId: z.string().uuid().nullable(),
    edgeId: z.string().uuid().nullable(),
    termKey: z.string().min(1).max(120).nullable().default(null),
    sourceVersionId: z.string().uuid().nullable().default(null),
    targetVersionId: z.string().uuid().nullable().default(null),
    factId: z.string().uuid().nullable().default(null),
  })
  .strict();

export const graphConsistencyResponseSchema = z
  .object({
    matterId: z.string().uuid(),
    status: z.enum(['consistent', 'drift_detected']),
    driftCount: z.number().int().min(0),
    drifts: z.array(graphConsistencyDriftSchema).max(200),
  })
  .strict();

export const graphNodeReviewResponseSchema = z
  .object({
    nodeId: z.string().uuid(),
    matterId: z.string().uuid(),
    action: graphNodeReviewActionSchema,
    provenance: graphNodeProvenanceSchema,
    reviewStatus: graphNodeReviewStatusSchema.nullable(),
    stale: z.boolean(),
  })
  .strict();

export type GraphNodeType = (typeof graphNodeTypes)[number];
export type GraphEdgeType = (typeof graphEdgeTypes)[number];
export type GraphNodeProvenance = z.infer<typeof graphNodeProvenanceSchema>;
export type GraphNodeReviewStatus = z.infer<typeof graphNodeReviewStatusSchema>;
export type GraphNodeCreatedByKind = z.infer<typeof graphNodeCreatedByKindSchema>;
export type GraphFactDto = z.infer<typeof graphFactSchema>;
export type GraphFactsQueryDto = z.infer<typeof graphFactsQuerySchema>;
export type GraphFactsResponseDto = z.infer<typeof graphFactsResponseSchema>;
export type GraphNeighborhoodQueryDto = z.infer<typeof graphNeighborhoodQuerySchema>;
export type GraphNeighborhoodPathDto = z.infer<typeof graphNeighborhoodPathSchema>;
export type GraphNeighborhoodResponseDto = z.infer<typeof graphNeighborhoodResponseSchema>;
export type GraphSyncRequestDto = z.infer<typeof graphSyncRequestSchema>;
export type GraphSyncResponseDto = z.infer<typeof graphSyncResponseSchema>;
export type GraphConsistencyDriftDto = z.infer<typeof graphConsistencyDriftSchema>;
export type GraphConsistencyResponseDto = z.infer<typeof graphConsistencyResponseSchema>;
export type GraphNodeReviewAction = z.infer<typeof graphNodeReviewActionSchema>;
export type GraphNodeReviewRequestDto = z.infer<typeof graphNodeReviewRequestSchema>;
export type GraphNodeReviewResponseDto = z.infer<typeof graphNodeReviewResponseSchema>;
