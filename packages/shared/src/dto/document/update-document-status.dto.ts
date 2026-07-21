import { z } from 'zod';
import { documentStatusSchema } from '../../types/document';

export const updateDocumentStatusSchema = z
  .object({
    status: documentStatusSchema,
    note: z.string().trim().min(1).max(400).optional(),
  })
  .strict();

export type UpdateDocumentStatusDto = z.infer<typeof updateDocumentStatusSchema>;
