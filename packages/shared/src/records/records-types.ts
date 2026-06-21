import { z } from 'zod';

const uuidSchema = z.string().uuid();
const codeSchema = z.string().trim().min(2).max(64).regex(/^[A-Z0-9][A-Z0-9._-]*$/);
const safeLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/(password|secret|token|api[_ -]?key|body|snippet|raw)/iu.test(value), {
    message: 'unsafe label token',
  });

export const retentionPolicyStatuses = ['active', 'retired'] as const;
export const legalHoldScopes = ['matter', 'document'] as const;
export const legalHoldStatuses = ['active', 'released'] as const;
export const disposalRequestStatuses = ['requested', 'approved', 'executed', 'rejected'] as const;

export const retentionPolicyStatusSchema = z.enum(retentionPolicyStatuses);
export const legalHoldScopeSchema = z.enum(legalHoldScopes);
export const legalHoldStatusSchema = z.enum(legalHoldStatuses);
export const disposalRequestStatusSchema = z.enum(disposalRequestStatuses);

export const createRetentionPolicyRequestSchema = z
  .object({
    policyCode: codeSchema,
    label: safeLabelSchema,
    retentionDays: z.coerce.number().int().min(1).max(36500).nullable().default(null),
  })
  .strict();

export const retentionPolicySchema = z
  .object({
    retentionPolicyId: uuidSchema,
    policyCode: codeSchema,
    label: z.string().min(1).max(200),
    retentionDays: z.number().int().min(1).max(36500).nullable(),
    status: retentionPolicyStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const retentionPolicyListResponseSchema = z
  .object({
    policies: z.array(retentionPolicySchema).max(100),
  })
  .strict();

export const createLegalHoldRequestSchema = z
  .object({
    matterId: uuidSchema,
    documentId: uuidSchema.optional(),
    holdScope: legalHoldScopeSchema,
    reasonCode: codeSchema,
  })
  .strict()
  .refine((value) => (value.holdScope === 'document') === Boolean(value.documentId), {
    message: 'document holds require documentId; matter holds must omit documentId',
    path: ['documentId'],
  });

export const legalHoldSchema = z
  .object({
    legalHoldId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema.nullable(),
    holdScope: legalHoldScopeSchema,
    status: legalHoldStatusSchema,
    reasonCode: codeSchema,
    createdBy: uuidSchema,
    releasedBy: uuidSchema.nullable(),
    createdAt: z.string().datetime(),
    releasedAt: z.string().datetime().nullable(),
  })
  .strict();

export const legalHoldListResponseSchema = z
  .object({
    holds: z.array(legalHoldSchema).max(100),
  })
  .strict();

export const createArchiveRequestSchema = z
  .object({
    documentId: uuidSchema,
    reasonCode: codeSchema,
  })
  .strict();

export const recordsArchiveSchema = z
  .object({
    archiveId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    previousStatus: z.string().min(1).max(64),
    archiveStatus: z.literal('archived'),
    createdAt: z.string().datetime(),
  })
  .strict();

export const createDisposalRequestSchema = z
  .object({
    documentId: uuidSchema,
    reasonCode: codeSchema,
  })
  .strict();

export const disposalRequestSchema = z
  .object({
    disposalRequestId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    status: disposalRequestStatusSchema,
    reasonCode: codeSchema,
    assignedRole: z.literal('records_admin'),
    dueAt: z.string().datetime(),
    approvalCount: z.number().int().min(0).max(1),
    certificateId: uuidSchema.nullable(),
    createdAt: z.string().datetime(),
    approvedAt: z.string().datetime().nullable(),
    executedAt: z.string().datetime().nullable(),
  })
  .strict();

export const disposalCertificateSchema = z
  .object({
    certificateId: uuidSchema,
    disposalRequestId: uuidSchema,
    matterId: uuidSchema,
    documentId: uuidSchema,
    documentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
    certificateHash: z.string().regex(/^[a-f0-9]{64}$/iu),
    approvedBy: uuidSchema,
    executedBy: uuidSchema,
    executedAt: z.string().datetime(),
  })
  .strict();

export type CreateRetentionPolicyRequestDto = z.infer<typeof createRetentionPolicyRequestSchema>;
export type RetentionPolicyDto = z.infer<typeof retentionPolicySchema>;
export type RetentionPolicyListResponseDto = z.infer<typeof retentionPolicyListResponseSchema>;
export type CreateLegalHoldRequestDto = z.infer<typeof createLegalHoldRequestSchema>;
export type LegalHoldDto = z.infer<typeof legalHoldSchema>;
export type LegalHoldListResponseDto = z.infer<typeof legalHoldListResponseSchema>;
export type CreateArchiveRequestDto = z.infer<typeof createArchiveRequestSchema>;
export type RecordsArchiveDto = z.infer<typeof recordsArchiveSchema>;
export type CreateDisposalRequestDto = z.infer<typeof createDisposalRequestSchema>;
export type DisposalRequestDto = z.infer<typeof disposalRequestSchema>;
export type DisposalCertificateDto = z.infer<typeof disposalCertificateSchema>;
export type LegalHoldScope = (typeof legalHoldScopes)[number];
export type LegalHoldStatus = (typeof legalHoldStatuses)[number];
export type DisposalRequestStatus = (typeof disposalRequestStatuses)[number];
