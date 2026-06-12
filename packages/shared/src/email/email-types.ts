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

export const fileEmailToMatterSchema = z
  .object({
    matterId: z.string().uuid(),
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

export type FileEmailToMatterDto = z.infer<typeof fileEmailToMatterSchema>;
export type EmailMatterSuggestionQueryDto = z.infer<typeof emailMatterSuggestionQuerySchema>;
