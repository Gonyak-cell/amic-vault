import { z } from 'zod';
import type { ErrorCode } from '../../index';
import { documentStatusSchema, type DocumentStatus } from '../../types/document';

export const documentBulkActionQueueName = 'document.bulk-action';
export const documentBulkActionDeadLetterQueueName = 'document.bulk-action.dead';

export const documentBulkActionKinds = [
  'move_folder',
  'add_tag',
  'remove_tag',
  'transition_status',
] as const;
export const documentBulkActionKindSchema = z.enum(documentBulkActionKinds);
export type DocumentBulkActionKind = z.infer<typeof documentBulkActionKindSchema>;

export const documentBulkActionBatchStatuses = [
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
] as const;
export const documentBulkActionBatchStatusSchema = z.enum(documentBulkActionBatchStatuses);
export type DocumentBulkActionBatchStatus = z.infer<typeof documentBulkActionBatchStatusSchema>;

export const documentBulkActionItemStatuses = ['queued', 'running', 'succeeded', 'failed'] as const;
export const documentBulkActionItemStatusSchema = z.enum(documentBulkActionItemStatuses);
export type DocumentBulkActionItemStatus = z.infer<typeof documentBulkActionItemStatusSchema>;

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) =>
      ![...value].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code < 32 || code === 127;
      }),
  );

export const documentBulkActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move_folder'), folderId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('add_tag'), tag: tagSchema }).strict(),
  z.object({ kind: z.literal('remove_tag'), tag: tagSchema }).strict(),
  z
    .object({
      kind: z.literal('transition_status'),
      status: documentStatusSchema.exclude(['deleted', 'disposal_locked']),
    })
    .strict(),
]);
export type DocumentBulkActionDto = z.infer<typeof documentBulkActionSchema>;

export const createDocumentBulkActionBatchSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    documentIds: z.array(z.string().uuid()).min(1).max(100),
    action: documentBulkActionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.documentIds).size !== value.documentIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentIds'],
        message: 'document IDs must be unique',
      });
    }
  });
export type CreateDocumentBulkActionBatchDto = z.infer<typeof createDocumentBulkActionBatchSchema>;

export const retryDocumentBulkActionBatchSchema = z
  .object({
    itemIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.itemIds && new Set(value.itemIds).size !== value.itemIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['itemIds'],
        message: 'item IDs must be unique',
      });
    }
  });
export type RetryDocumentBulkActionBatchDto = z.infer<typeof retryDocumentBulkActionBatchSchema>;

export const documentBulkActionJobSchema = z
  .object({
    batchId: z.string().uuid(),
    tenantId: z.string().uuid(),
    tenantSlug: z.string().min(1).max(200),
    actorUserId: z.string().uuid(),
  })
  .strict();
export type DocumentBulkActionJobDto = z.infer<typeof documentBulkActionJobSchema>;

export interface DocumentBulkActionBatchItemDto {
  itemId: string;
  documentId: string;
  position: number;
  status: DocumentBulkActionItemStatus;
  errorCode: ErrorCode | null;
  reasonCode: string | null;
  retryCount: number;
  updatedAt: string;
}

export interface DocumentBulkActionBatchDto {
  batchId: string;
  receiptRef: string;
  action: DocumentBulkActionDto;
  status: DocumentBulkActionBatchStatus;
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  receiptExpiresAt: string;
  items: DocumentBulkActionBatchItemDto[];
}

export interface DocumentBulkStatusAction {
  kind: 'transition_status';
  status: DocumentStatus;
}
