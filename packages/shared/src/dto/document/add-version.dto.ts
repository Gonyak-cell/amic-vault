import { z } from 'zod';
import type { DocumentMetadataSuggestionDto } from './upload-document.dto';

export const addDocumentVersionFieldsSchema = z
  .object({
    uploadPreflightRef: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export interface AddDocumentVersionResponseDto {
  documentId: string;
  matterId: string;
  versionId: string;
  versionNo: number;
  versionStatus: 'current';
  fileObjectId: string;
  sha256: string;
  metadataSuggestion: DocumentMetadataSuggestionDto;
  duplicates: Array<{
    documentId: string;
    fileObjectId: string;
    sha256: string;
  }>;
}

export type AddDocumentVersionFieldsDto = z.infer<typeof addDocumentVersionFieldsSchema>;
