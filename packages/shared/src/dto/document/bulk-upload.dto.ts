import { z } from 'zod';
import type { ErrorCode } from '../../index';
import { uploadDocumentFieldsSchema, type UploadDocumentResponseDto } from './upload-document.dto';

export const bulkUploadQueueName = 'document.bulk-upload';
export const bulkUploadDeadLetterQueueName = 'document.bulk-upload.dead';

export const bulkUploadBatchItemStatuses = [
  'pending',
  'uploaded',
  'failed',
  'duplicate',
  'done',
] as const;
export const bulkUploadBatchItemStatusSchema = z.enum(bulkUploadBatchItemStatuses);

export const bulkUploadBatchStatuses = ['pending', 'processing', 'done', 'failed'] as const;
export const bulkUploadBatchStatusSchema = z.enum(bulkUploadBatchStatuses);

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
    batchId: z.string().uuid().optional(),
    chunkIndex: z.number().int().min(0).max(10_000).optional(),
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

export interface BulkUploadDuplicateItemDto {
  itemId: string;
  status: 'duplicate';
  code: 'VALIDATION_FAILED';
  reason: 'DUPLICATE_DECISION_REQUIRED';
}

export type BulkUploadItemResultDto =
  | BulkUploadSuccessItemDto
  | BulkUploadFailedItemDto
  | BulkUploadDuplicateItemDto;

export interface BulkUploadReportDto {
  queueName: typeof bulkUploadQueueName;
  total: number;
  succeeded: number;
  failed: number;
  items: BulkUploadItemResultDto[];
}

export const registerBulkUploadBatchItemSchema = z
  .object({
    itemId: z.string().min(1).max(128),
    fields: uploadDocumentFieldsSchema.default({}),
    file: bulkUploadFileSchema,
  })
  .strict();

export const registerBulkUploadBatchSchema = z
  .object({
    items: z.array(registerBulkUploadBatchItemSchema).min(1).max(5000),
  })
  .strict();

export const retryBulkUploadBatchItemSchema = z
  .object({
    fields: uploadDocumentFieldsSchema.optional(),
  })
  .strict();

export type BulkUploadBatchItemStatus = z.infer<typeof bulkUploadBatchItemStatusSchema>;
export type BulkUploadBatchStatus = z.infer<typeof bulkUploadBatchStatusSchema>;
export type RegisterBulkUploadBatchItemDto = z.infer<typeof registerBulkUploadBatchItemSchema>;
export type RegisterBulkUploadBatchDto = z.infer<typeof registerBulkUploadBatchSchema>;
export type RetryBulkUploadBatchItemDto = z.infer<typeof retryBulkUploadBatchItemSchema>;

export interface BulkUploadBatchItemDto {
  batchItemId: string;
  itemId: string;
  status: BulkUploadBatchItemStatus;
  originalFilename: string;
  sizeBytes: number;
  documentId: string | null;
  fileObjectId: string | null;
  errorCode: ErrorCode | null;
  errorReason: string | null;
  retryCount: number;
  updatedAt: string;
}

export interface BulkUploadBatchDto {
  batchId: string;
  matterId: string;
  status: BulkUploadBatchStatus;
  totalItems: number;
  pendingItems: number;
  uploadedItems: number;
  failedItems: number;
  duplicateItems: number;
  doneItems: number;
  createdAt: string;
  updatedAt: string;
  items: BulkUploadBatchItemDto[];
}
