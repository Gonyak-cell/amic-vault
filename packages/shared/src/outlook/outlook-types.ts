import { z } from 'zod';
import { dlpFindingTypes, dlpRuleIds, type DlpFindingType } from '../dlp/dlp-types';
import type { EmailMatterSuggestionConfidenceBand } from '../email/email-types';

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

export const outlookSendPolicyDecisions = ['allow', 'warn', 'block'] as const;
export type OutlookSendPolicyDecision = (typeof outlookSendPolicyDecisions)[number];

export const outlookSendWarningReasonCodes = [
  'no_matter',
  'wrong_matter',
  'external_recipient',
  'dlp_finding',
  'dlp_scan_failed',
] as const;
export type OutlookSendWarningReasonCode = (typeof outlookSendWarningReasonCodes)[number];

export const outlookFilingRequestKinds = ['manual_file', 'send_and_file'] as const;
export type OutlookFilingRequestKind = (typeof outlookFilingRequestKinds)[number];

export const outlookDocumentInsertionModes = ['attach-copy', 'internal-reference'] as const;
export type OutlookDocumentInsertionMode = (typeof outlookDocumentInsertionModes)[number];

export const outlookDocumentInsertionStatuses = ['ready', 'denied'] as const;
export type OutlookDocumentInsertionStatus = (typeof outlookDocumentInsertionStatuses)[number];

export const outlookDocumentInsertionDeniedReasonCodes = [
  'permission_denied',
  'policy_denied',
  'integration_gate_closed',
  'document_locked',
] as const;
export type OutlookDocumentInsertionDeniedReasonCode =
  (typeof outlookDocumentInsertionDeniedReasonCodes)[number];

export const outlookFolderMappingModes = ['manual', 'auto_file'] as const;
export type OutlookFolderMappingMode = (typeof outlookFolderMappingModes)[number];

export const outlookFolderMappingApprovalStatuses = [
  'pending_user',
  'pending_admin',
  'active',
  'disabled',
  'revoked',
  'denied',
] as const;
export type OutlookFolderMappingApprovalStatus =
  (typeof outlookFolderMappingApprovalStatuses)[number];

export const outlookFolderMappingApprovalDecisions = ['approve', 'disable', 'revoke'] as const;
export type OutlookFolderMappingApprovalDecision =
  (typeof outlookFolderMappingApprovalDecisions)[number];

export const outlookFolderMappingDeniedReasonCodes = [
  'permission_denied',
  'policy_denied',
  'integration_gate_closed',
  'approval_required',
] as const;
export type OutlookFolderMappingDeniedReasonCode =
  (typeof outlookFolderMappingDeniedReasonCodes)[number];

export const outlookAutofileJobStatuses = [
  'disabled',
  'queued',
  'processing',
  'completed',
  'denied',
  'failed',
  'retrying',
] as const;
export type OutlookAutofileJobStatus = (typeof outlookAutofileJobStatuses)[number];

export const outlookAutofileDeniedReasonCodes = [
  'permission_denied',
  'policy_denied',
  'stale_mailbox',
  'duplicate',
  'integration_gate_closed',
  'wrong_matter',
] as const;
export type OutlookAutofileDeniedReasonCode = (typeof outlookAutofileDeniedReasonCodes)[number];

export const outlookHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const outlookDlpScanStatuses = ['clean', 'finding', 'scan_failed'] as const;
export type OutlookDlpScanStatus = (typeof outlookDlpScanStatuses)[number];

export const outlookDlpScanFailureCodes = [
  'body_unavailable',
  'attachment_unavailable',
  'hash_unavailable',
  'unexpected_error',
] as const;
export type OutlookDlpScanFailureCode = (typeof outlookDlpScanFailureCodes)[number];

export const outlookDlpFindingRefSchema = z
  .object({
    ruleId: z.enum(dlpRuleIds),
    findingType: z.enum(dlpFindingTypes),
    valueHash: outlookHashSchema,
    evidenceHash: outlookHashSchema,
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const outlookDlpScanReportSchema = z
  .object({
    status: z.enum(outlookDlpScanStatuses),
    findingCount: z.number().int().min(0).max(200).default(0),
    restrictedFindingCount: z.number().int().min(0).max(200).default(0),
    findingRefs: z.array(outlookDlpFindingRefSchema).max(20).default([]),
    failureCode: z.enum(outlookDlpScanFailureCodes).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.restrictedFindingCount > value.findingCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'restrictedFindingCount cannot exceed findingCount',
        path: ['restrictedFindingCount'],
      });
    }

    if (value.status === 'clean') {
      if (value.findingCount !== 0 || value.restrictedFindingCount !== 0 || value.findingRefs.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'clean DLP reports must not include findings',
        });
      }
      if (value.failureCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'clean DLP reports must not include a failure code',
          path: ['failureCode'],
        });
      }
    }

    if (value.status === 'finding') {
      if (value.findingCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'finding DLP reports must include at least one finding',
          path: ['findingCount'],
        });
      }
      if (value.findingRefs.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'finding DLP reports must include hash-only finding refs',
          path: ['findingRefs'],
        });
      }
      if (value.failureCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'finding DLP reports must not include a failure code',
          path: ['failureCode'],
        });
      }
    }

    if (value.status === 'scan_failed') {
      if (value.findingCount !== 0 || value.restrictedFindingCount !== 0 || value.findingRefs.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'failed DLP scans must not include findings',
        });
      }
      if (!value.failureCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'failed DLP scans require a bounded failure code',
          path: ['failureCode'],
        });
      }
    }
  });

export const matterSuggestionReasonCodes = [
  'subject_hash',
  'participant_domain_hash',
  'conversation_hash',
] as const;
export type MatterSuggestionReasonCode = (typeof matterSuggestionReasonCodes)[number];

export const outlookAddinSessionStatuses = ['active', 'denied', 'expired', 'revoked'] as const;
export type OutlookAddinSessionStatus = (typeof outlookAddinSessionStatuses)[number];

export const outlookMailboxBindingStatuses = ['active', 'stale', 'revoked'] as const;
export type OutlookMailboxBindingStatus = (typeof outlookMailboxBindingStatuses)[number];

export const outlookGraphAttachmentAcquisitionStatuses = [
  'queued',
  'acquired',
  'denied',
  'failed',
] as const;
export type OutlookGraphAttachmentAcquisitionStatus =
  (typeof outlookGraphAttachmentAcquisitionStatuses)[number];

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

const identityAssertionSchema = z
  .string()
  .min(16)
  .max(8192)
  .regex(/^[A-Za-z0-9._~+/=-]+$/);

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

const outlookSendPolicyBaseSchema = z
  .object({
    sourceClient: z.literal('outlook-web-addin'),
    message: outlookItemRefSchema,
    attachments: z.array(outlookAttachmentRefSchema).max(200).default([]),
    subjectHash: outlookHashSchema.optional(),
    dlpReport: outlookDlpScanReportSchema.optional(),
    clientRequestId: boundedClientTokenSchema,
  })
  .strict();

export const evaluateOutlookSendPolicySchema = outlookSendPolicyBaseSchema
  .extend({
    matterId: z.string().uuid().optional(),
  })
  .strict();

export const createOutlookSendFileRequestSchema = outlookSendPolicyBaseSchema
  .extend({
    matterId: z.string().uuid(),
    idempotencyKey: boundedClientTokenSchema,
    acknowledgedWarningCodes: z.array(z.enum(outlookSendWarningReasonCodes)).max(8).default([]),
  })
  .strict();

export const cancelOutlookFilingRequestSchema = z
  .object({
    reasonCode: z.enum(['cancelled']).default('cancelled'),
  })
  .strict();

export const matterSuggestionQuerySchema = z
  .object({
    sourceClient: z.enum(outlookSourceClients),
    mailboxFingerprint: outlookHashSchema,
    participantDomainHashes: z.array(outlookHashSchema).max(50).default([]),
    subjectHash: outlookHashSchema.optional(),
    conversationIdHash: outlookHashSchema.optional(),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .strict();

export const outlookAddinSessionExchangeSchema = z
  .object({
    sourceClient: z.enum(outlookSourceClients),
    mailboxFingerprint: outlookHashSchema,
    identityAssertion: identityAssertionSchema,
    clientRequestId: boundedClientTokenSchema,
  })
  .strict();

export const acquireOutlookGraphAttachmentSchema = z
  .object({
    sourceClient: z.enum(outlookSourceClients),
    addinSessionId: z.string().uuid(),
    filingRequestId: z.string().uuid(),
    message: outlookItemRefSchema,
    attachment: outlookAttachmentRefSchema,
    clientRequestId: boundedClientTokenSchema,
  })
  .strict();

export const createOutlookDocumentInsertionSchema = z
  .object({
    documentId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
    targetMessage: outlookItemRefSchema,
    insertionMode: z.enum(outlookDocumentInsertionModes),
    hasExternalRecipients: z.boolean(),
    sourceClient: z.enum(outlookSourceClients),
    clientRequestId: boundedClientTokenSchema,
    idempotencyKey: boundedClientTokenSchema,
  })
  .strict();

export const createOutlookFolderMappingSchema = z
  .object({
    matterId: z.string().uuid(),
    mailboxFingerprint: outlookHashSchema,
    folderRefHash: outlookHashSchema,
    folderPathHash: outlookHashSchema.optional(),
    mappingMode: z.enum(outlookFolderMappingModes).default('manual'),
    autoFileRequested: z.boolean().default(false),
    sourceClient: z.enum(outlookSourceClients),
    clientRequestId: boundedClientTokenSchema,
    idempotencyKey: boundedClientTokenSchema,
  })
  .strict();

export const updateOutlookFolderMappingSchema = z
  .object({
    approvalDecision: z.enum(outlookFolderMappingApprovalDecisions),
    autoFileEnabled: z.boolean().default(false),
    clientRequestId: boundedClientTokenSchema,
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

export interface OutlookSendPolicyDecisionDto {
  decisionId: string;
  decision: OutlookSendPolicyDecision;
  sourceClient: OutlookSourceClient;
  matterId?: string;
  warningReasonCodes: OutlookSendWarningReasonCode[];
  deniedReasonCode?: OutlookDeniedReasonCode;
  selectedAttachmentCount: number;
}

export interface OutlookSendFileRequestStatusDto extends OutlookFilingRequestStatusDto {
  requestKind: Extract<OutlookFilingRequestKind, 'send_and_file'>;
  sendPolicyDecision: Exclude<OutlookSendPolicyDecision, 'block'>;
  warningReasonCodes: OutlookSendWarningReasonCode[];
}

export type OutlookDlpFindingRefDto = z.infer<typeof outlookDlpFindingRefSchema>;
export type OutlookDlpScanReportDto = z.infer<typeof outlookDlpScanReportSchema>;
export type OutlookRestrictedDlpFindingType = Extract<
  DlpFindingType,
  | 'korean_resident_id'
  | 'korean_alien_registration_number'
  | 'payment_card_number'
  | 'passport_number'
>;

export interface MatterSuggestionDto {
  matterId: string;
  matterCode: string;
  matterName: string;
  clientId: string;
  reasonCodes: MatterSuggestionReasonCode[];
  score: number;
  confidence: number;
  confidenceBand: EmailMatterSuggestionConfidenceBand;
}

export interface MatterSuggestionListDto {
  items: MatterSuggestionDto[];
}

export interface OutlookAddinSessionDto {
  addinSessionId: string;
  status: Extract<OutlookAddinSessionStatus, 'active'>;
  mailboxBindingStatus: Extract<OutlookMailboxBindingStatus, 'active'>;
  sourceClient: OutlookSourceClient;
  expiresAt: string;
}

export interface OutlookGraphAttachmentAcquisitionDto {
  acquisitionId: string;
  status: OutlookGraphAttachmentAcquisitionStatus;
  filingRequestId: string;
  attachmentIdHash: string;
  createdAt: string;
  contentSha256?: string;
  sizeBytes?: number;
  deniedReasonCode?: OutlookDeniedReasonCode;
}

export interface OutlookDocumentInsertionDto {
  insertionId: string;
  status: OutlookDocumentInsertionStatus;
  documentId: string;
  versionId?: string;
  insertionMode: OutlookDocumentInsertionMode;
  sourceClient: OutlookSourceClient;
  createdAt: string;
  updatedAt: string;
  internalReference?: string;
  editReference?: string;
  editPath?: string;
  deniedReasonCode?: OutlookDocumentInsertionDeniedReasonCode;
}

export interface OutlookFolderMappingDto {
  mappingId: string;
  matterId: string;
  mailboxFingerprint: string;
  folderRefHash: string;
  folderPathHash?: string;
  mappingMode: OutlookFolderMappingMode;
  approvalStatus: OutlookFolderMappingApprovalStatus;
  autoFileEnabled: boolean;
  sourceClient: OutlookSourceClient;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  deniedReasonCode?: OutlookFolderMappingDeniedReasonCode;
}

export interface OutlookAutofileJobDto {
  jobId: string;
  mappingId: string;
  matterId: string;
  status: OutlookAutofileJobStatus;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  deniedReasonCode?: OutlookAutofileDeniedReasonCode;
}

export type OutlookIntegrationAdminFeature =
  | 'ADDIN_BOOTSTRAP'
  | 'AUTH_EXCHANGE'
  | 'GRAPH_ATTACHMENT_ACQUISITION'
  | 'SMART_ALERTS'
  | 'SEND_FILE'
  | 'DOCUMENT_INSERTION'
  | 'FOLDER_MAPPING'
  | 'AUTOFILE';

export type OutlookIntegrationAdminRing =
  | 'R0_ADMIN_ONLY'
  | 'R1_PILOT_PRACTICE'
  | 'R2_BROADER_PILOT'
  | 'R3_PRODUCTION';

export type OutlookIntegrationAdminEvidenceKind =
  | 'EV-OUTLOOK-002'
  | 'EV-OUTLOOK-003'
  | 'OPERATOR-APPROVAL'
  | 'DISABLE-REMOVE-REHEARSAL';

export interface OutlookIntegrationAdminFeatureStatusDto {
  feature: OutlookIntegrationAdminFeature;
  configured: boolean;
  allowed: boolean;
  reasonCode?: string;
}

export interface OutlookIntegrationAdminEvidenceStatusDto {
  kind: OutlookIntegrationAdminEvidenceKind;
  present: boolean;
  validFormat: boolean;
}

export interface OutlookIntegrationAdminStatusDto {
  provider: 'outlook';
  operationalGateEnforced: boolean;
  rolloutRing: OutlookIntegrationAdminRing | null;
  auditAvailable: boolean;
  features: OutlookIntegrationAdminFeatureStatusDto[];
  evidence: OutlookIntegrationAdminEvidenceStatusDto[];
  generatedAt: string;
}

export type OutlookItemRefDto = z.infer<typeof outlookItemRefSchema>;
export type OutlookAttachmentRefDto = z.infer<typeof outlookAttachmentRefSchema>;
export type CreateOutlookEmailFilingRequestDto = z.infer<
  typeof createOutlookEmailFilingRequestSchema
>;
export type EvaluateOutlookSendPolicyDto = z.infer<typeof evaluateOutlookSendPolicySchema>;
export type CreateOutlookSendFileRequestDto = z.infer<typeof createOutlookSendFileRequestSchema>;
export type CancelOutlookFilingRequestDto = z.infer<typeof cancelOutlookFilingRequestSchema>;
export type MatterSuggestionQueryDto = z.infer<typeof matterSuggestionQuerySchema>;
export type OutlookAddinSessionExchangeDto = z.infer<typeof outlookAddinSessionExchangeSchema>;
export type AcquireOutlookGraphAttachmentDto = z.infer<
  typeof acquireOutlookGraphAttachmentSchema
>;
export type CreateOutlookDocumentInsertionDto = z.infer<
  typeof createOutlookDocumentInsertionSchema
>;
export type CreateOutlookFolderMappingDto = z.infer<typeof createOutlookFolderMappingSchema>;
export type UpdateOutlookFolderMappingDto = z.infer<typeof updateOutlookFolderMappingSchema>;
