import { z } from 'zod';
import {
  documentConfidentialityLevelSchema,
  documentSourceSchema,
  documentTypeSchema,
} from '../../types/document';

export const updateDocumentMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(1000).optional(),
    documentType: documentTypeSchema.optional(),
    subtype: z.string().trim().min(1).max(128).nullable().optional(),
    confidentialityLevel: documentConfidentialityLevelSchema.optional(),
    source: documentSourceSchema.optional(),
    folderId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type UpdateDocumentMetadataDto = z.infer<typeof updateDocumentMetadataSchema>;
