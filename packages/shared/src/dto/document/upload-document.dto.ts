import { z } from 'zod';

export const uploadDocumentFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export interface UploadDocumentResponseDto {
  documentId: string;
  matterId: string;
  fileObjectId: string;
  status: 'draft';
  title: string;
  duplicates: Array<{
    documentId: string;
    fileObjectId: string;
    sha256: string;
  }>;
}

export type UploadDocumentFieldsDto = z.infer<typeof uploadDocumentFieldsSchema>;
