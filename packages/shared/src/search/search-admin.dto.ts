import { z } from 'zod';

export const searchAdminNoResultQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(40),
    count: z.number().int().min(0),
    lastSeenAt: z.string().datetime(),
    queryHash: z.string().trim().regex(/^[a-f0-9]{64}$/iu),
  })
  .strict();

export const searchAdminHealthSchema = z
  .object({
    currentVersionCount: z.number().int().min(0),
    indexedVersionCount: z.number().int().min(0),
    missingIndexCount: z.number().int().min(0),
    staleIndexCount: z.number().int().min(0),
    extractionReadyCount: z.number().int().min(0),
    extractionPendingCount: z.number().int().min(0),
    ocrPendingCount: z.number().int().min(0),
    extractionFailedCount: z.number().int().min(0),
    staleChunkCount: z.number().int().min(0),
    staleEmbeddingCount: z.number().int().min(0),
    queryAuditCount24h: z.number().int().min(0),
    noResultQueryCount24h: z.number().int().min(0),
    p95DurationMs24h: z.number().int().min(0).nullable(),
    noResultQueries: z.array(searchAdminNoResultQuerySchema).max(5),
  })
  .strict();

export type SearchAdminNoResultQueryDto = z.infer<typeof searchAdminNoResultQuerySchema>;
export type SearchAdminHealthDto = z.infer<typeof searchAdminHealthSchema>;
