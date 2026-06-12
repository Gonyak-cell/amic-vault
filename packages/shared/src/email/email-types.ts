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
