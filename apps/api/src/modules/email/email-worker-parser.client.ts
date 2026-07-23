import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  decodeEmlRawContent,
  EmlParseError,
  emailFailureReasonCodes,
  emailParserKinds,
  emailParseStatuses,
  normalizeEmailMetadata,
  type EmailFailureReasonCode,
  type EmailMetadataWarningCode,
  type EmailParserKind,
  type EmailParseStatus,
} from '@amic-vault/shared';
import { emailWorkerParserVersion } from './email-parser-version';
import { normalizeDomainRef } from './participant-classifier';
import { fetchIngestionWorker } from '../document/extraction/private-gateway.transport';

export type EmailWorkerParticipantRole = 'from' | 'to' | 'cc';

export interface EmailWorkerParticipant {
  role: EmailWorkerParticipantRole;
  normalizedAddress: string;
  domainRef: string;
  displayName: string | null;
}

export interface EmailWorkerAttachment {
  attachmentIndex: number;
  normalizedFilename: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  body: Buffer;
}

export interface EmailWorkerParseResult {
  parser: EmailParserKind;
  parserVersion: string;
  parseStatus: EmailParseStatus;
  failureReasonCode: EmailFailureReasonCode | null;
  normalizedMessageId: string | null;
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  metadataWarningCode: EmailMetadataWarningCode | null;
  references: readonly string[];
  participants: readonly EmailWorkerParticipant[];
  attachments: readonly EmailWorkerAttachment[];
}

export interface EmailWorkerParseInput {
  tenantId: string;
  filename: string;
  mimeType: string;
  body: Buffer;
}

function emailParserWorkerTimeoutMs(): number {
  const parsed = Number(
    process.env.EMAIL_PARSER_WORKER_TIMEOUT_MS ??
      process.env.EMAIL_REPARSE_WORKER_TIMEOUT_MS ??
      '60000',
  );
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 60_000;
}

function boundedString(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, limit);
  return normalized || null;
}

function isParser(value: unknown): value is EmailParserKind {
  return typeof value === 'string' && (emailParserKinds as readonly string[]).includes(value);
}

function isParseStatus(value: unknown): value is EmailParseStatus {
  return typeof value === 'string' && (emailParseStatuses as readonly string[]).includes(value);
}

function normalizeFailureReason(value: unknown): EmailFailureReasonCode {
  return typeof value === 'string' &&
    (emailFailureReasonCodes as readonly string[]).includes(value)
    ? (value as EmailFailureReasonCode)
    : 'MALFORMED_HEADERS';
}

function normalizeWarningCode(value: unknown): EmailMetadataWarningCode | null {
  return value === 'MALFORMED_DATE' ? value : null;
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeReferences(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => boundedString(entry, 256)?.toLowerCase() ?? null)
    .filter((entry): entry is string => entry !== null)
    .slice(0, 50);
}

function normalizeParticipants(value: unknown): EmailWorkerParticipant[] {
  if (!Array.isArray(value)) return [];
  const participants: EmailWorkerParticipant[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    const role = candidate.role;
    const normalizedAddress = boundedString(candidate.normalized_address, 320);
    const domainRef = normalizeDomainRef(String(candidate.domain_ref ?? ''));
    if (role !== 'from' && role !== 'to' && role !== 'cc') continue;
    if (!normalizedAddress || !normalizedAddress.includes('@') || !domainRef) continue;
    const key = `${role}:${normalizedAddress.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    participants.push({
      role,
      normalizedAddress: normalizedAddress.toLowerCase(),
      domainRef,
      displayName: boundedString(candidate.display_name, 256),
    });
  }
  return participants;
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeFilename(value: unknown, index: number): string {
  const raw = boundedString(value, 255) ?? `attachment-${index}`;
  const normalized = raw
    .split('\\')
    .pop()
    ?.split('/')
    .pop()
    ?.replace(/[\0\r\n\t]/g, ' ')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized && normalized !== '.' && normalized !== '..'
    ? normalized.slice(0, 255)
    : `attachment-${index}`;
}

function normalizeMediaType(value: unknown): string {
  const mediaType = boundedString(value, 120)?.toLowerCase() ?? '';
  return mediaType.includes('/') ? mediaType : 'application/octet-stream';
}

function normalizeAttachmentBody(value: unknown): Buffer | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)) return null;
  return Buffer.from(normalized, 'base64');
}

function normalizeAttachments(value: unknown): EmailWorkerAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: EmailWorkerAttachment[] = [];
  const seen = new Set<number>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    const attachmentIndex = Number(candidate.attachment_index);
    if (!Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0 || seen.has(attachmentIndex)) {
      continue;
    }
    const body = normalizeAttachmentBody(candidate.body_base64);
    const sizeBytes = Number(candidate.size_bytes);
    const sha256 = boundedString(candidate.sha256, 64)?.toLowerCase() ?? '';
    if (
      !body ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes !== body.length ||
      !/^[0-9a-f]{64}$/u.test(sha256) ||
      sha256Hex(body) !== sha256
    ) {
      continue;
    }
    seen.add(attachmentIndex);
    attachments.push({
      attachmentIndex,
      normalizedFilename: safeFilename(candidate.normalized_filename, attachmentIndex),
      mediaType: normalizeMediaType(candidate.media_type),
      sizeBytes,
      sha256,
      body,
    });
  }
  return attachments.sort((left, right) => left.attachmentIndex - right.attachmentIndex).slice(0, 200);
}

export function parseEmailWorkerResponse(payload: unknown): EmailWorkerParseResult {
  const source =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const parser = isParser(source.parser) ? source.parser : 'eml';
  const parseStatus = isParseStatus(source.parse_status) ? source.parse_status : 'failed';
  const failureReasonCode =
    parseStatus === 'parsed' ? null : normalizeFailureReason(source.failure_reason_code);
  const normalizedMessageId = boundedString(source.normalized_message_id, 256)?.toLowerCase() ?? null;
  return {
    parser,
    parserVersion: boundedString(source.parser_version, 80) ?? emailWorkerParserVersion,
    parseStatus: parseStatus === 'parsed' && !normalizedMessageId ? 'failed' : parseStatus,
    failureReasonCode:
      parseStatus === 'parsed' && !normalizedMessageId ? 'MISSING_MESSAGE_ID' : failureReasonCode,
    normalizedMessageId,
    subject: boundedString(source.subject, 500),
    sentAt: normalizeIso(source.sent_at),
    receivedAt: normalizeIso(source.received_at),
    metadataWarningCode: normalizeWarningCode(source.metadata_warning_code),
    references: normalizeReferences(source.references),
    participants: normalizeParticipants(source.participants),
    attachments: normalizeAttachments(source.attachments),
  };
}

function localParseForTest(input: EmailWorkerParseInput): EmailWorkerParseResult {
  if (input.filename.toLowerCase().endsWith('.msg')) {
    return {
      parser: 'msg',
      parserVersion: emailWorkerParserVersion,
      parseStatus: 'pending_unsupported',
      failureReasonCode: 'UNSUPPORTED_MSG',
      normalizedMessageId: null,
      subject: null,
      sentAt: null,
      receivedAt: null,
      metadataWarningCode: null,
      references: [],
      participants: [],
      attachments: [],
    };
  }

  try {
    const metadata = normalizeEmailMetadata(decodeEmlRawContent(input.body));
    return {
      parser: 'eml',
      parserVersion: emailWorkerParserVersion,
      parseStatus: 'parsed',
      failureReasonCode: null,
      normalizedMessageId: metadata.normalizedMessageId,
      subject: metadata.subject,
      sentAt: metadata.sentAt,
      receivedAt: metadata.receivedAt,
      metadataWarningCode: metadata.warningCode,
      references: metadata.normalizedReferenceIds,
      participants: metadata.participants.map((participant) => ({
        role: participant.role,
        normalizedAddress: participant.normalizedAddress,
        domainRef: participant.domainRef,
        displayName: participant.displayName,
      })),
      attachments: [],
    };
  } catch (error) {
    return {
      parser: 'eml',
      parserVersion: emailWorkerParserVersion,
      parseStatus: 'failed',
      failureReasonCode: error instanceof EmlParseError ? error.reasonCode : 'MALFORMED_HEADERS',
      normalizedMessageId: null,
      subject: null,
      sentAt: null,
      receivedAt: null,
      metadataWarningCode: null,
      references: [],
      participants: [],
      attachments: [],
    };
  }
}

@Injectable()
export class EmailWorkerParserClient {
  async parseRawEmail(input: EmailWorkerParseInput): Promise<EmailWorkerParseResult> {
    const form = new FormData();
    form.append('tenant_id', input.tenantId);
    form.append(
      'file',
      new Blob([new Uint8Array(input.body)], { type: input.mimeType || 'message/rfc822' }),
      input.filename,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), emailParserWorkerTimeoutMs());
    let response: Response;
    try {
      response = await fetchIngestionWorker('/email/parse', {
        method: 'POST',
        headers: { 'x-amic-tenant-id': input.tenantId },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'test') return localParseForTest(input);
      if (controller.signal.aborted) throw new Error('transient email parse worker failure: timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      throw new Error(`transient email parse worker failure: ${response.status}`);
    }
    if (!response.ok) {
      return {
        parser: input.filename.toLowerCase().endsWith('.msg') ? 'msg' : 'eml',
        parserVersion: emailWorkerParserVersion,
        parseStatus: 'failed',
        failureReasonCode: 'MALFORMED_HEADERS',
        normalizedMessageId: null,
        subject: null,
        sentAt: null,
        receivedAt: null,
        metadataWarningCode: null,
        references: [],
        participants: [],
        attachments: [],
      };
    }
    return parseEmailWorkerResponse(await response.json());
  }
}
