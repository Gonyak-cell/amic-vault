import { z } from 'zod';

export const conflictCheckStatuses = ['in_review', 'cleared', 'blocked'] as const;
export const conflictCheckStatusSchema = z.enum(conflictCheckStatuses);

export const conflictCandidateSourceTypes = ['client', 'party', 'matter'] as const;
export const conflictCandidateSourceTypeSchema = z.enum(conflictCandidateSourceTypes);

export const resolveConflictCheckSchema = z
  .object({
    status: z.enum(['cleared', 'blocked']),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

export interface ConflictCheckCandidateDto {
  sourceType: (typeof conflictCandidateSourceTypes)[number];
  sourceId: string;
  sourceName: string;
  sourceMatterId: string | null;
  sourceMatterName: string | null;
  targetName: string;
  similarity: number;
}

export interface ConflictCheckDto {
  conflictCheckId: string;
  matterId: string;
  status: ConflictCheckStatus;
  targetNames: string[];
  candidates: ConflictCheckCandidateDto[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionRationale: string | null;
}

export interface ConflictCheckListDto {
  items: ConflictCheckDto[];
}

export type ConflictCheckStatus = (typeof conflictCheckStatuses)[number];
export type ResolveConflictCheckDto = z.infer<typeof resolveConflictCheckSchema>;
