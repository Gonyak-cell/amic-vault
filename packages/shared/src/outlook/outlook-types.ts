import { z } from 'zod';

export const outlookSourceClients = ['outlook-web-addin'] as const;
export type OutlookSourceClient = (typeof outlookSourceClients)[number];

export const outlookFilingRequestStatuses = [
  'queued',
  'processing',
  'completed',
  'denied',
  'failed',
  'cancelled',
] as const;
export type OutlookFilingRequestStatus = (typeof outlookFilingRequestStatuses)[number];

export const outlookDeniedReasonCodes = [
  'permission_denied',
  'policy_denied',
  'stale_mailbox',
  'duplicate',
  'integration_gate_closed',
  'cancelled',
] as const;
export type OutlookDeniedReasonCode = (typeof outlookDeniedReasonCodes)[number];

export const outlookHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const outlookItemRefSchema = z
  .object({
    mailboxFingerprint: outlookHashSchema,
    outlookItemIdHash: outlookHashSchema,
    internetMessageIdHash: outlookHashSchema.optional(),
    conversationIdHash: outlookHashSchema.optional(),
    canonicalMessageSha256: outlookHashSchema,
    sentAt: z.string().datetime({ offset: true }).optional(),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    hasExternalParticipants: z.boolean(),
    participantDomainHashes: z.array(outlookHashSchema).max(50),
  })
  .strict();

export const outlookAttachmentRefSchema = z
  .object({
    attachmentIdHash: outlookHashSchema,
    contentIdHash: outlookHashSchema.optional(),
    ordinal: z.number().int().min(0).max(500),
    sizeBytes: z.number().int().min(0).max(2_147_483_647),
    sha256: outlookHashSchema.optional(),
    mimeType: z.string().min(1).max(255).optional(),
    selectedForFiling: z.boolean(),
  })
  .strict();

const boundedClientTokenSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const createOutlookEmailFilingRequestSchema = z
  .object({
    matterId: z.string().uuid(),
    message: outlookItemRefSchema,
    attachments: z.array(outlookAttachmentRefSchema).max(200),
    sourceClient: z.enum(outlookSourceClients),
    clientRequestId: boundedClientTokenSchema,
    idempotencyKey: boundedClientTokenSchema,
  })
  .strict();

export const cancelOutlookFilingRequestSchema = z
  .object({
    reasonCode: z.enum(['cancelled']).default('cancelled'),
  })
  .strict();

export interface OutlookFilingRequestStatusDto {
  id: string;
  status: OutlookFilingRequestStatus;
  matterId: string;
  createdAt: string;
  updatedAt: string;
  emailRecordId?: string;
  filedAttachmentCount?: number;
  deniedReasonCode?: OutlookDeniedReasonCode;
}

export type OutlookItemRefDto = z.infer<typeof outlookItemRefSchema>;
export type OutlookAttachmentRefDto = z.infer<typeof outlookAttachmentRefSchema>;
export type CreateOutlookEmailFilingRequestDto = z.infer<
  typeof createOutlookEmailFilingRequestSchema
>;
export type CancelOutlookFilingRequestDto = z.infer<typeof cancelOutlookFilingRequestSchema>;
