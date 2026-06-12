import { z } from 'zod';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().trim().regex(/^[a-f0-9]{64}$/iu);
const codeSchema = z.string().trim().min(2).max(64).regex(/^[A-Z0-9][A-Z0-9._-]*$/);
const safeRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9 ._-]+$/u)
  .refine((value) => !/(@|password|secret|token|body|snippet|content)/iu.test(value), {
    message: 'unsafe external ref',
  });

export const externalWorkspaceStatuses = ['active', 'suspended', 'closed'] as const;
export const externalUserStatuses = ['invited', 'active', 'revoked'] as const;
export const externalLinkStatuses = ['active', 'revoked', 'expired'] as const;
export const externalAccessStatuses = ['nda_required', 'ready'] as const;

export const externalWorkspaceStatusSchema = z.enum(externalWorkspaceStatuses);
export const externalUserStatusSchema = z.enum(externalUserStatuses);
export const externalLinkStatusSchema = z.enum(externalLinkStatuses);
export const externalAccessStatusSchema = z.enum(externalAccessStatuses);

export const createExternalWorkspaceRequestSchema = z
  .object({
    matterId: uuidSchema,
    workspaceCode: codeSchema,
    displayRef: safeRefSchema,
    expiresAt: z.string().datetime(),
  })
  .strict();

export const createExternalUserRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    emailHash: hashSchema,
    displayRef: safeRefSchema.optional(),
  })
  .strict();

export const createExternalLinkRequestSchema = z
  .object({
    workspaceId: uuidSchema,
    externalUserId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema.optional(),
    expiresAt: z.string().datetime(),
    ndaVersion: codeSchema.default('NDA-R11-V1'),
    watermarkRequired: z.boolean().default(true),
  })
  .strict();

export const acceptExternalNdaRequestSchema = z
  .object({
    accepted: z.literal(true),
    ndaVersion: codeSchema.default('NDA-R11-V1'),
  })
  .strict();

export const externalWorkspaceSchema = z
  .object({
    workspaceId: uuidSchema,
    matterId: uuidSchema,
    workspaceCode: codeSchema,
    displayRef: safeRefSchema,
    status: externalWorkspaceStatusSchema,
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const externalUserSchema = z
  .object({
    externalUserId: uuidSchema,
    emailHash: hashSchema,
    displayRef: safeRefSchema.nullable(),
    status: externalUserStatusSchema,
    workspaceId: uuidSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const externalLinkSchema = z
  .object({
    linkId: uuidSchema,
    workspaceId: uuidSchema,
    externalUserId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema.nullable(),
    status: externalLinkStatusSchema,
    expiresAt: z.string().datetime(),
    ndaRequired: z.boolean(),
    watermarkRequired: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const externalLinkCreatedResponseSchema = z
  .object({
    link: externalLinkSchema,
    linkToken: z.string().min(32).max(256),
  })
  .strict();

export const externalAccessStatusResponseSchema = z
  .object({
    status: externalAccessStatusSchema,
    ndaRequired: z.boolean(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const externalAccessManifestSchema = z
  .object({
    status: z.literal('ready'),
    workspaceId: uuidSchema,
    externalUserId: uuidSchema,
    documentId: uuidSchema,
    versionId: uuidSchema.nullable(),
    expiresAt: z.string().datetime(),
    watermarkApplied: z.literal(true),
    watermarkRef: z.string().min(16).max(160).regex(/^watermark:[a-f0-9:-]+$/iu),
  })
  .strict();

export const externalNdaAcceptanceSchema = z
  .object({
    accepted: z.literal(true),
    ndaVersion: codeSchema,
    acceptedAt: z.string().datetime(),
  })
  .strict();

export type ExternalWorkspaceStatus = (typeof externalWorkspaceStatuses)[number];
export type ExternalUserStatus = (typeof externalUserStatuses)[number];
export type ExternalLinkStatus = (typeof externalLinkStatuses)[number];
export type ExternalAccessStatus = (typeof externalAccessStatuses)[number];
export type CreateExternalWorkspaceRequestDto = z.infer<typeof createExternalWorkspaceRequestSchema>;
export type CreateExternalUserRequestDto = z.infer<typeof createExternalUserRequestSchema>;
export type CreateExternalLinkRequestDto = z.infer<typeof createExternalLinkRequestSchema>;
export type AcceptExternalNdaRequestDto = z.infer<typeof acceptExternalNdaRequestSchema>;
export type ExternalWorkspaceDto = z.infer<typeof externalWorkspaceSchema>;
export type ExternalUserDto = z.infer<typeof externalUserSchema>;
export type ExternalLinkDto = z.infer<typeof externalLinkSchema>;
export type ExternalLinkCreatedResponseDto = z.infer<typeof externalLinkCreatedResponseSchema>;
export type ExternalAccessStatusResponseDto = z.infer<typeof externalAccessStatusResponseSchema>;
export type ExternalAccessManifestDto = z.infer<typeof externalAccessManifestSchema>;
export type ExternalNdaAcceptanceDto = z.infer<typeof externalNdaAcceptanceSchema>;
