import { z } from 'zod';
import type { ErrorCode } from '../../index';
import { uploadDocumentFieldsSchema, type UploadDocumentResponseDto } from './upload-document.dto';

export const bulkUploadQueueName = 'document.bulk-upload';

export const bulkUploadFileSchema = z
  .object({
    path: z.string().min(1),
    originalname: z.string().min(1).max(1000),
    mimetype: z.string().min(1).max(255),
    size: z.number().int().positive(),
  })
  .strict();

export const bulkUploadJobItemSchema = z
  .object({
    itemId: z.string().min(1).max(128),
    tenantId: z.string().uuid(),
    tenantSlug: z.string().min(1).max(200),
    actorUserId: z.string().uuid(),
    matterId: z.string().uuid(),
    fields: uploadDocumentFieldsSchema.default({}),
    file: bulkUploadFileSchema,
  })
  .strict();

export const bulkUploadJobSchema = z
  .object({
    items: z.array(bulkUploadJobItemSchema).min(1).max(100),
  })
  .strict();

export type BulkUploadJobItemDto = z.infer<typeof bulkUploadJobItemSchema>;
export type BulkUploadJobDto = z.infer<typeof bulkUploadJobSchema>;

export interface BulkUploadSuccessItemDto {
  itemId: string;
  status: 'success';
  document: UploadDocumentResponseDto;
}

export interface BulkUploadFailedItemDto {
  itemId: string;
  status: 'failed';
  code: ErrorCode;
}

export type BulkUploadItemResultDto = BulkUploadSuccessItemDto | BulkUploadFailedItemDto;

export interface BulkUploadReportDto {
  queueName: typeof bulkUploadQueueName;
  total: number;
  succeeded: number;
  failed: number;
  items: BulkUploadItemResultDto[];
}
