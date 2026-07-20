import { z } from 'zod';
import {
  documentConfidentialityLevelSchema,
  documentPrivilegeStatusSchema,
  documentSourceSchema,
  documentTypeSchema,
  documentVersionRenditionTypeSchema,
  documentVersionSignificanceSchema,
  type DocumentConfidentialityLevel,
  type DocumentPrivilegeStatus,
  type DocumentSource,
  type DocumentType,
  type DocumentVersionRenditionType,
  type DocumentVersionSignificance,
} from '../../types/document';
import { uploadDuplicateDecisionSchema } from './upload-preflight.dto';

function parseStringArrayTransport(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return trimmed.split(',').map((part) => part.trim());
}

export const uploadDocumentTagsSchema = z.preprocess(
  parseStringArrayTransport,
  z.array(z.string().trim().min(1).max(80)).max(50).optional(),
);

export const uploadDocumentFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(1000).optional(),
    documentType: documentTypeSchema.optional(),
    subtype: z.string().trim().min(1).max(128).optional(),
    confidentialityLevel: documentConfidentialityLevelSchema.optional(),
    privilegeStatus: documentPrivilegeStatusSchema.optional(),
    source: documentSourceSchema.optional(),
    versionLabel: z.string().trim().min(1).max(80).optional(),
    versionSignificance: documentVersionSignificanceSchema.optional(),
    renditionType: documentVersionRenditionTypeSchema.optional(),
    aiAllowed: z
      .preprocess((value) => {
        if (value === true || value === false || value === undefined) return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
      }, z.boolean())
      .optional(),
    uploadPreflightRef: z.string().trim().min(1).max(160).optional(),
    duplicateDecision: uploadDuplicateDecisionSchema.optional(),
    duplicateTargetDocumentId: z.string().uuid().optional(),
    sourceRelativePath: z.string().trim().min(1).max(1000).optional(),
    folderId: z.string().uuid().optional(),
    tags: uploadDocumentTagsSchema,
  })
  .strict();

export interface DocumentMetadataSuggestionDto {
  documentType?: DocumentType;
  versionLabel?: string;
  versionSignificance?: DocumentVersionSignificance;
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
  source: DocumentSource;
  aiAllowed: boolean;
  folderId?: string | null;
  folderPath?: string | null;
  tags?: string[];
  versionLabel: string | null;
  versionSignificance: DocumentVersionSignificance;
  renditionType: DocumentVersionRenditionType;
  metadataSuggestion: DocumentMetadataSuggestionDto;
  duplicates: Array<{
    documentId: string;
    fileObjectId: string;
    sha256: string;
  }>;
}

export type UploadDocumentFieldsDto = z.infer<typeof uploadDocumentFieldsSchema>;
