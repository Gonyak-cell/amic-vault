import { z } from 'zod';
import {
  documentVersionRenditionTypeSchema,
  documentVersionSignificanceSchema,
  type DocumentVersionRenditionType,
  type DocumentVersionSignificance,
} from '../../types/document';
import type { DocumentMetadataSuggestionDto } from './upload-document.dto';
import { uploadDuplicateDecisionSchema } from './upload-preflight.dto';

export const addDocumentVersionFieldsSchema = z
  .object({
    uploadPreflightRef: z.string().trim().min(1).max(160).optional(),
    duplicateDecision: uploadDuplicateDecisionSchema.optional(),
    versionLabel: z.string().trim().min(1).max(80).optional(),
    versionSignificance: documentVersionSignificanceSchema.optional(),
    renditionType: documentVersionRenditionTypeSchema.optional(),
    baseCleanVersionId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.renditionType === 'markup' && !value.baseCleanVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'markup rendition requires baseCleanVersionId',
        path: ['baseCleanVersionId'],
      });
    }
    if ((value.renditionType ?? 'clean') === 'clean' && value.baseCleanVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'clean rendition must not include baseCleanVersionId',
        path: ['baseCleanVersionId'],
      });
    }
  });

export interface AddDocumentVersionResponseDto {
  documentId: string;
  matterId: string;
  versionId: string;
  versionNo: number;
  versionStatus: 'current';
  fileObjectId: string;
  sha256: string;
  versionLabel: string | null;
  versionSignificance: DocumentVersionSignificance;
  renditionType: DocumentVersionRenditionType;
  baseCleanVersionId: string | null;
  metadataSuggestion: DocumentMetadataSuggestionDto;
  duplicates: Array<{
    documentId: string;
    fileObjectId: string;
    sha256: string;
  }>;
}

export type AddDocumentVersionFieldsDto = z.infer<typeof addDocumentVersionFieldsSchema>;
