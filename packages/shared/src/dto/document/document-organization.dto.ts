import { z } from 'zod';

export const documentFolderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => value !== '.' && value !== '..' && !/[\\/]/.test(value));

export const updateDocumentFolderSchema = z
  .object({
    name: documentFolderNameSchema.optional(),
    parentFolderId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.parentFolderId !== undefined);

export const updateDocumentTagsSchema = z
  .object({
    tags: z.array(z.string().trim().min(1).max(80)).max(50),
  })
  .strict();

export interface DocumentFolderDto {
  folderId: string;
  matterId: string;
  parentFolderId: string | null;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTagListDto {
  tags: string[];
}

export type UpdateDocumentFolderDto = z.infer<typeof updateDocumentFolderSchema>;
export type UpdateDocumentTagsDto = z.infer<typeof updateDocumentTagsSchema>;
