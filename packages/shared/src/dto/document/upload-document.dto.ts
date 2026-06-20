import { z } from 'zod';
import {
  documentConfidentialityLevelSchema,
  documentPrivilegeStatusSchema,
  documentTypeSchema,
  type DocumentConfidentialityLevel,
  type DocumentPrivilegeStatus,
  type DocumentType,
} from '../../types/document';

export const uploadDocumentFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(1000).optional(),
    documentType: documentTypeSchema.optional(),
    subtype: z.string().trim().min(1).max(128).optional(),
    confidentialityLevel: documentConfidentialityLevelSchema.optional(),
    privilegeStatus: documentPrivilegeStatusSchema.optional(),
    aiAllowed: z
      .preprocess((value) => {
        if (value === true || value === false || value === undefined) return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
      }, z.boolean())
      .optional(),
    uploadPreflightRef: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export interface DocumentMetadataSuggestionDto {
  documentType?: DocumentType;
  versionLabel?: string;
  date?: string;
}

export interface UploadDocumentResponseDto {
  documentId: string;
  matterId: string;
  fileObjectId: string;
  status: 'draft';
  title: string;
  documentType: DocumentType;
  subtype: string | null;
  confidentialityLevel: DocumentConfidentialityLevel;
  privilegeStatus: DocumentPrivilegeStatus;
  aiAllowed: boolean;
  metadataSuggestion: DocumentMetadataSuggestionDto;
  duplicates: Array<{
    documentId: string;
    fileObjectId: string;
    sha256: string;
  }>;
}

export type UploadDocumentFieldsDto = z.infer<typeof uploadDocumentFieldsSchema>;
