import { z } from 'zod';

export const documentComparisonStatuses = ['pending', 'completed', 'failed'] as const;
export const documentComparisonStatusSchema = z.enum(documentComparisonStatuses);

export const documentComparisonChangeTypes = ['added', 'deleted', 'modified', 'unchanged'] as const;
export const documentComparisonChangeTypeSchema = z.enum(documentComparisonChangeTypes);

export const documentComparisonDiffOps = ['equal', 'insert', 'delete'] as const;
export const documentComparisonDiffOpSchema = z.enum(documentComparisonDiffOps);

export const createDocumentComparisonRequestSchema = z
  .object({
    baseVersionId: z.string().uuid(),
    targetVersionId: z.string().uuid(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.baseVersionId === input.targetVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'baseVersionId and targetVersionId must be different',
        path: ['targetVersionId'],
      });
    }
  });

export interface DocumentComparisonDiffHunkDto {
  op: (typeof documentComparisonDiffOps)[number];
  text: string;
}

export interface DocumentComparisonClauseChangeDto {
  changeId: string;
  sequenceNo: number;
  changeType: (typeof documentComparisonChangeTypes)[number];
  clauseNumber: string;
  headingText: string;
  baseText: string;
  targetText: string;
  diffHunks: DocumentComparisonDiffHunkDto[];
}

export interface DocumentComparisonSummaryDto {
  addedCount: number;
  deletedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  totalCount: number;
  durationMs: number;
}

export interface DocumentComparisonDto {
  comparisonId: string;
  documentId: string;
  matterId: string;
  baseVersionId: string;
  targetVersionId: string;
  status: (typeof documentComparisonStatuses)[number];
  summary: DocumentComparisonSummaryDto;
  changes: DocumentComparisonClauseChangeDto[];
  createdAt: string;
  completedAt: string | null;
  failureReasonCode: string | null;
}

export type CreateDocumentComparisonRequestDto = z.infer<
  typeof createDocumentComparisonRequestSchema
>;
export type DocumentComparisonStatus = (typeof documentComparisonStatuses)[number];
export type DocumentComparisonChangeType = (typeof documentComparisonChangeTypes)[number];
export type DocumentComparisonDiffOp = (typeof documentComparisonDiffOps)[number];
