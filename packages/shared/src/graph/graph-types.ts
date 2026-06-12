import { z } from 'zod';

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const graphNodeTypes = [
  'client',
  'matter',
  'document',
  'version',
  'clause',
  'issue',
  'risk',
] as const;

export const graphEdgeTypes = [
  'HAS_MATTER',
  'HAS_DOCUMENT',
  'HAS_VERSION',
  'HAS_CLAUSE',
  'HAS_ISSUE',
  'HAS_RISK',
  'RELATED_TO',
] as const;

export const graphNodeTypeSchema = z.enum(graphNodeTypes);
export const graphEdgeTypeSchema = z.enum(graphEdgeTypes);

export const graphNodeRefSchema = z
  .object({
    nodeId: z.string().uuid(),
    nodeType: graphNodeTypeSchema,
    sourceId: z.string().uuid(),
    matterId: z.string().uuid().nullable(),
    documentId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
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

export const graphSyncRequestSchema = z
  .object({
    matterId: z.string().uuid(),
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

export const graphConsistencyDriftSchema = z
  .object({
    kind: z.enum([
      'missing_document_node',
      'missing_version_node',
      'stale_document_node',
      'edge_points_to_stale_node',
    ]),
    matterId: z.string().uuid(),
    documentId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
    nodeId: z.string().uuid().nullable(),
    edgeId: z.string().uuid().nullable(),
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

export type GraphNodeType = (typeof graphNodeTypes)[number];
export type GraphEdgeType = (typeof graphEdgeTypes)[number];
export type GraphFactDto = z.infer<typeof graphFactSchema>;
export type GraphFactsQueryDto = z.infer<typeof graphFactsQuerySchema>;
export type GraphFactsResponseDto = z.infer<typeof graphFactsResponseSchema>;
export type GraphSyncRequestDto = z.infer<typeof graphSyncRequestSchema>;
export type GraphSyncResponseDto = z.infer<typeof graphSyncResponseSchema>;
export type GraphConsistencyDriftDto = z.infer<typeof graphConsistencyDriftSchema>;
export type GraphConsistencyResponseDto = z.infer<typeof graphConsistencyResponseSchema>;
