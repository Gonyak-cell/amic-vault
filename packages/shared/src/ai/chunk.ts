import { z } from 'zod';

export const aiChunkKinds = ['parent', 'child'] as const;
export const aiChunkKindSchema = z.enum(aiChunkKinds);
export const aiEmbeddingModelRoutes = ['local_gemma', 'bge_m3'] as const;
export const aiEmbeddingModelRouteSchema = z.enum(aiEmbeddingModelRoutes);
export const aiEmbeddingDimensions = {
  local_gemma: 1024,
  bge_m3: 1024,
} as const;
export const aiEmbeddingDimension = aiEmbeddingDimensions.bge_m3;

export const documentChunkProvenanceSchema = z
  .object({
    chunkId: z.string().uuid(),
    documentId: z.string().uuid(),
    versionId: z.string().uuid(),
    parentChunkId: z.string().uuid().nullable(),
    chunkKind: aiChunkKindSchema,
    chunkOrdinal: z.number().int().min(0),
    charStart: z.number().int().min(0),
    charEnd: z.number().int().positive(),
    tokenCount: z.number().int().min(1).max(1200),
    textHash: z.string().regex(/^[0-9a-f]{64}$/),
    sourceTextHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
  .refine((value) => value.charEnd > value.charStart, {
    message: 'charEnd must be greater than charStart',
    path: ['charEnd'],
  });

export type AiChunkKind = (typeof aiChunkKinds)[number];
export type AiEmbeddingModelRoute = (typeof aiEmbeddingModelRoutes)[number];
export type DocumentChunkProvenanceDto = z.infer<typeof documentChunkProvenanceSchema>;
