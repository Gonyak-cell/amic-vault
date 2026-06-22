import { z } from 'zod';

export const documentVersionStatuses = ['current', 'superseded'] as const;
export const documentVersionStatusSchema = z.enum(documentVersionStatuses);

export const listDocumentVersionsQuerySchema = z
  .object({
    status: documentVersionStatusSchema.optional(),
  })
  .strict();

export interface DocumentVersionDto {
  versionId: string;
  documentId: string;
  versionNo: number;
  versionStatus: (typeof documentVersionStatuses)[number];
  fileObjectId: string;
  fileHash: string;
  createdBy: string;
  createdAt: string;
  supersedesVersionId: string | null;
  promotedFromSubversionId: string | null;
}

export interface DocumentVersionListDto {
  items: DocumentVersionDto[];
}

export type DocumentVersionStatus = (typeof documentVersionStatuses)[number];
export type ListDocumentVersionsQueryDto = z.infer<typeof listDocumentVersionsQuerySchema>;
