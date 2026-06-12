import { z } from 'zod';

export const emailParserKinds = ['eml', 'msg'] as const;
export type EmailParserKind = (typeof emailParserKinds)[number];

export const emailParseStatuses = ['parsed', 'pending_unsupported', 'failed'] as const;
export type EmailParseStatus = (typeof emailParseStatuses)[number];

export const emailFailureReasonCodes = [
  'MISSING_MESSAGE_ID',
  'MALFORMED_MESSAGE_ID',
  'MALFORMED_HEADERS',
  'UNSUPPORTED_MSG',
] as const;
export type EmailFailureReasonCode = (typeof emailFailureReasonCodes)[number];

export interface EmailMessageDto {
  emailId: string;
  tenantId: string;
  rawFileObjectId: string;
  parser: EmailParserKind;
  parseStatus: EmailParseStatus;
  failureReasonCode: EmailFailureReasonCode | null;
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  metadataWarningCode: string | null;
  hasOutsideParticipants: boolean;
  messageIdHash: string;
  references: readonly string[];
  rawSha256: string;
  rawSizeBytes: number;
  createdBy: string | null;
  createdAt: string;
}

export const emailMatterWarningCodes = ['outside_participant', 'matter_metadata_mismatch'] as const;
export type EmailMatterWarningCode = (typeof emailMatterWarningCodes)[number];

export const emailPrivilegeTagSuggestions = ['attorney_client_privilege', 'confidential'] as const;
export type EmailPrivilegeTagSuggestion = (typeof emailPrivilegeTagSuggestions)[number];

export const emailPrivilegeSuggestionReasonCodes = ['subject_keyword'] as const;
export type EmailPrivilegeSuggestionReasonCode =
  (typeof emailPrivilegeSuggestionReasonCodes)[number];

export interface EmailPrivilegeTagSuggestionDto {
  tag: EmailPrivilegeTagSuggestion;
  reasonCodes: readonly EmailPrivilegeSuggestionReasonCode[];
  requiresUserConfirmation: true;
}

export interface EmailThreadSummaryDto {
  rootMessageHash: string;
  directReferenceCount: number;
  relatedEmailCount: number;
  referenceHashes: readonly string[];
}

export const fileEmailToMatterSchema = z
  .object({
    matterId: z.string().uuid(),
  })
  .strict();

function parseTenantDomains(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const entries = Array.isArray(value) ? value : String(value).split(',');
  return entries
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export const uploadEmailToMatterFieldsSchema = z
  .object({
    tenantDomains: z.preprocess(
      parseTenantDomains,
      z.array(z.string().min(1).max(255)).max(20).optional(),
    ),
  })
  .strict();

export const emailMatterSuggestionQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(10).default(5),
  })
  .strict();

export interface EmailMatterFilingDto {
  filingId: string;
  tenantId: string;
  emailId: string;
  matterId: string;
  subject: string | null;
  sentAt: string | null;
  hasOutsideParticipants: boolean;
  warningCodes: readonly EmailMatterWarningCode[];
  privilegeTagSuggestion: EmailPrivilegeTagSuggestionDto | null;
  thread: EmailThreadSummaryDto;
  documentIds: readonly string[];
  filedBy: string;
  filedAt: string;
}

export interface EmailMatterSuggestionDto {
  matterId: string;
  matterCode: string;
  matterName: string;
  clientId: string;
  reasonCodes: readonly ('subject' | 'participant_domain')[];
  score: number;
}

export interface EmailMatterSuggestionListDto {
  items: readonly EmailMatterSuggestionDto[];
}

export interface EmailTimelineDto {
  items: readonly EmailMatterFilingDto[];
}

export interface UploadEmailToMatterResponseDto {
  email: EmailMessageDto;
  filing: EmailMatterFilingDto;
}

export type FileEmailToMatterDto = z.infer<typeof fileEmailToMatterSchema>;
export type UploadEmailToMatterFieldsDto = z.infer<typeof uploadEmailToMatterFieldsSchema>;
export type EmailMatterSuggestionQueryDto = z.infer<typeof emailMatterSuggestionQuerySchema>;
