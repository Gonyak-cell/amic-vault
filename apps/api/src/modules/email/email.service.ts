import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { initialDocumentFamilyId } from '@amic-vault/domain';
import {
  decodeEmlRawContent,
  decodeMimeTextBytes,
  EmlParseError,
  type EmailMatterSuggestionConfidenceBand,
  type EmailMatterSuggestionReasonCode,
  type EmailMatterWarningCode,
  type EmailMatterFilingDto,
  type EmailMatterSuggestionListDto,
  type EmailMatterSuggestionQueryDto,
  type EmailPrivilegeTagSuggestionDto,
  type EmailThreadGroupDto,
  type EmailThreadSummaryDto,
  extractEmlTextBody,
  normalizeEmailMetadata,
  type TenantId,
  type EmailMetadataWarningCode,
  type EmailFailureReasonCode,
  type EmailMessageDto,
  type EmailParticipantClass,
  type EmailParticipantClassSummaryDto,
  type EmailParserKind,
  type EmailParseStatus,
  type EmailTimelineDto,
  type FileEmailToMatterDto,
  type UndoEmailAutofileDto,
  type UploadEmailToMatterFieldsDto,
  type UploadEmailToMatterResponseDto,
  type NormalizedEmailMetadata,
  type UploadDocumentFieldsDto,
  type UploadDocumentResponseDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { DocumentUploadService, type UploadedDiskFile } from '../document/document-upload.service';
import { QuarantineIntakeService } from '../file-security/quarantine-intake.service';
import { quarantineIngressEnabled } from '../file-security/file-security.types';
import { DlpService } from '../dlp/dlp.service';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { PermissionService } from '../permission/permission.service';
import {
  emailDuplicateBlockedAudit,
  emailFilingRevertedAudit,
  emailFiledAudit,
  emailImportedAudit,
  emailMetadataUpdatedAudit,
  emailRawDownloadedAudit,
  emailSuggestionAutofiledAudit,
  emailSuggestionFeedbackRecordedAudit,
} from '../audit/events/email-events';
import { documentUploadedAudit } from '../audit/events/document-events';
import { DocumentService } from '../document/document.service';
import { DocumentVersionService } from '../document/document-version.service';
import { SearchIndexRepository } from '../search/index/search-index.repository';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { extractEmlAttachments, type ParsedEmailAttachment } from './email-attachment.parser';
import { emailApiParserVersion } from './email-parser-version';
import {
  EmailWorkerParserClient,
  type EmailWorkerAttachment,
  type EmailWorkerParseResult,
} from './email-worker-parser.client';
import { EmailThreadService, type EmailThreadEnvelope } from './email-thread.service';
import {
  scoreMatterSuggestion,
  type MatterSuggestionSignalInput,
} from './matter-suggestion-scorer';
import {
  classifyEmailParticipant,
  extractDomainRefsFromText,
  isOutsideParticipantClass,
  normalizeDomainRef,
  type ParticipantClassificationContext,
} from './participant-classifier';

export interface ImportRawEmailInput {
  tenantId?: string;
  actorUserId?: string | null;
  originalFilename: string;
  mimeType?: string | null;
  body: Buffer;
  tenantDomains?: readonly string[];
  matterId?: string;
  attachmentDocumentFields?: UploadDocumentFieldsDto;
}

interface EmailMessageRow {
  email_id: string;
  tenant_id: string;
  raw_file_object_id: string;
  message_id_hash: string;
  parser: EmailParserKind;
  parser_version: string;
  parse_status: EmailParseStatus;
  failure_reason_code: EmailFailureReasonCode | null;
  subject: string | null;
  sent_at: Date | null;
  received_at: Date | null;
  metadata_warning_code: EmailMetadataWarningCode | null;
  references_json: readonly string[];
  has_outside_participants: boolean;
  raw_sha256: string;
  raw_size_bytes: string;
  created_by: string | null;
  created_at: Date;
}

interface ExistingEmailRow {
  email_id: string;
}

interface EmailBodySearchSourceRow {
  email_id: string;
  parser: EmailParserKind;
  parse_status: EmailParseStatus;
  subject: string | null;
  raw_storage_uri: string;
}

interface EmailBodySearchParticipantRow {
  role: 'from' | 'to' | 'cc';
  domain_ref: string;
  display_name: string | null;
}

interface EmailThreadCandidateRow {
  email_id: string;
  message_id_hash: string;
  references_json: readonly string[];
  thread_id: string | null;
  thread_created_at: Date | null;
}

interface EmailThreadInsertRow {
  thread_id: string;
}

interface EmailThreadEmailRow {
  email_id: string;
}

interface EmailDocumentLinkRow {
  link_id: string;
  tenant_id: string;
  email_id: string;
  document_id: string;
  file_object_id: string;
  attachment_index: number;
  attachment_filename: string;
  media_type: string;
  size_bytes: string;
  sha256: string;
  created_at: Date;
}

interface RawEmailDownloadTargetRow {
  email_id: string;
  raw_file_object_id: string;
  raw_sha256: string;
  raw_size_bytes: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
}

interface RawEmailLinkedDocumentRow {
  document_id: string;
  matter_id: string;
}

interface EmailMatterFilingRow {
  filing_id: string;
  tenant_id: string;
  email_id: string;
  matter_id: string;
  subject: string | null;
  sent_at: Date | null;
  has_outside_participants: boolean;
  matter_code: string;
  matter_name: string;
  matter_domain: string | null;
  client_domain: string | null;
  participant_domains: readonly string[] | null;
  participant_class_counts: unknown;
  thread_id: string | null;
  conversation_id_hash: string | null;
  root_message_id_hash: string | null;
  message_id_hash: string;
  references_json: readonly string[];
  thread_related_count: string;
  document_ids: readonly string[] | null;
  created_by: string;
  created_at: Date;
}

interface EmailMatterSuggestionRow {
  matter_id: string;
  matter_code: string;
  matter_name: string;
  client_id: string;
  subject_match: boolean;
  domain_match: boolean;
  thread_filed_count: string;
  sender_matter_filing_count: string;
  sender_total_filing_count: string;
  client_participant_match: boolean;
  opposing_domain_conflict: boolean;
}

interface ScoredEmailMatterSuggestionRow extends EmailMatterSuggestionRow {
  reason_codes: readonly EmailMatterSuggestionReasonCode[];
  score: number;
  confidence: number;
  confidence_band: EmailMatterSuggestionConfidenceBand;
}

export interface EmailDocumentLinkDto {
  linkId: string;
  tenantId: string;
  emailId: string;
  documentId: string;
  fileObjectId: string;
  attachmentIndex: number;
  attachmentFilename: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface RawEmailDownloadResult {
  body: Readable;
  contentType: string;
  contentLength: number;
  filename: string;
  sha256: string;
}

interface PreparedEmailEnvelope {
  parser: EmailParserKind;
  parserVersion: string;
  parseStatus: EmailParseStatus;
  failureReasonCode: EmailFailureReasonCode | null;
  messageIdHash: string;
  contentType: string;
  metadata: PreparedEmailMetadata | null;
  attachments: readonly ParsedEmailAttachment[];
}

type ImportTransactionResult =
  | { kind: 'imported'; email: EmailMessageDto }
  | { kind: 'duplicate'; emailId: string };

interface PreparedEmailParticipant {
  role: 'from' | 'to' | 'cc';
  addressHash: string;
  domainRef: string;
  displayName: string | null;
  isOutside: boolean;
  participantClass: EmailParticipantClass;
}

interface PreparedEmailMetadata {
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  warningCode: EmailMetadataWarningCode | null;
  references: readonly string[];
  participants: readonly PreparedEmailParticipant[];
  hasOutsideParticipants: boolean;
}

export class EmailDuplicateMessageError extends Error {
  constructor(readonly emailId?: string) {
    super('duplicate email message id');
    this.name = 'EmailDuplicateMessageError';
  }
}

function unsupportedFileType(): UnsupportedMediaTypeException {
  return new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_FILE_TYPE' });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function messageIdHash(value: string): string {
  return namespacedHash('email-message-id', value);
}

function extensionFromFilename(filename: string): 'eml' | 'msg' {
  const lower = filename.split('\\').pop()?.split('/').pop()?.toLowerCase() ?? '';
  const dot = lower.lastIndexOf('.');
  if (dot < 0) throw unsupportedFileType();
  const extension = lower.slice(dot + 1);
  if (extension !== 'eml' && extension !== 'msg') throw unsupportedFileType();
  return extension;
}

function normalizeFilename(filename: string, fallback: string): string {
  const base = filename.split('\\').pop()?.split('/').pop()?.trim() ?? '';
  return (base || fallback).slice(0, 1000);
}

function emailBodyFilename(emailId: string): string {
  return `email-body-${emailId}.txt`;
}

function emailBodyTitle(subject: string | null): string {
  const title = subject?.trim();
  return title ? `Email: ${title}`.slice(0, 1000) : 'Email body';
}

function emailSearchText(input: {
  bodyText: string;
  participants: readonly EmailBodySearchParticipantRow[];
  subject: string | null;
}): string {
  const lines = [
    input.subject ? `Subject: ${input.subject}` : null,
    ...input.participants.map((participant) =>
      [participant.role, participant.display_name?.trim() || null, participant.domain_ref]
        .filter(Boolean)
        .join(' '),
    ),
    input.bodyText,
  ].filter((line): line is string => Boolean(line && line.trim()));
  return lines.join('\n').replaceAll(String.fromCharCode(0), '').trim();
}

function isUploadedDiskFile(file: UploadedDiskFile | undefined): file is UploadedDiskFile {
  return (
    typeof file?.path === 'string' &&
    typeof file.originalname === 'string' &&
    typeof file.mimetype === 'string' &&
    Number.isSafeInteger(file.size)
  );
}

function emailUploadMaxBytes(): number {
  return 25 * 1024 * 1024;
}

function asStringArray(value: readonly string[] | null | undefined): string[] {
  return Array.isArray(value) ? [...value] : [];
}

function uniqueLower(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function participantClassSummaries(value: unknown): EmailParticipantClassSummaryDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const candidate = entry as { class?: unknown; count?: unknown };
      if (
        candidate.class !== 'internal' &&
        candidate.class !== 'client' &&
        candidate.class !== 'opposing' &&
        candidate.class !== 'other_external'
      ) {
        return null;
      }
      const count = Number(candidate.count);
      if (!Number.isSafeInteger(count) || count < 1) return null;
      return { class: candidate.class, count };
    })
    .filter((entry): entry is EmailParticipantClassSummaryDto => entry !== null);
}

function privilegeTagSuggestion(subject: string | null): EmailPrivilegeTagSuggestionDto | null {
  const lower = subject?.toLowerCase() ?? '';
  if (!lower) return null;
  if (/\b(attorney-client|attorney client|privileged|legal advice|work product)\b/.test(lower)) {
    return {
      tag: 'attorney_client_privilege',
      reasonCodes: ['subject_keyword'],
      requiresUserConfirmation: true,
    };
  }
  if (/\b(confidential|confidentiality)\b/.test(lower)) {
    return {
      tag: 'confidential',
      reasonCodes: ['subject_keyword'],
      requiresUserConfirmation: true,
    };
  }
  if (/(기밀|비밀|대외비|비공개)/.test(lower)) {
    return {
      tag: 'confidential',
      reasonCodes: ['subject_keyword'],
      requiresUserConfirmation: true,
    };
  }
  return null;
}

function subjectMatchesMatter(row: EmailMatterFilingRow): boolean {
  const subject = row.subject?.toLowerCase() ?? '';
  if (!subject) return false;
  return [row.matter_code, row.matter_name]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .some((value) => subject.includes(value));
}

function matterMetadataMismatch(row: EmailMatterFilingRow): boolean {
  const expectedDomains = [row.matter_domain, row.client_domain]
    .map((value) => value?.trim().toLowerCase() ?? '')
    .filter(Boolean);
  const participantDomains = asStringArray(row.participant_domains)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (expectedDomains.length === 0 && !row.subject) return false;
  const hasDomainMatch =
    expectedDomains.length > 0 &&
    participantDomains.some((domain) => expectedDomains.includes(domain));
  return participantDomains.length > 0 && !hasDomainMatch && !subjectMatchesMatter(row);
}

function warningCodes(row: EmailMatterFilingRow): EmailMatterWarningCode[] {
  const warnings: EmailMatterWarningCode[] = [];
  if (row.has_outside_participants) warnings.push('outside_participant');
  if (matterMetadataMismatch(row)) warnings.push('matter_metadata_mismatch');
  return warnings;
}

function threadSummary(row: EmailMatterFilingRow): EmailThreadSummaryDto {
  const references = asStringArray(row.references_json);
  return {
    threadId: row.thread_id,
    rootMessageHash: row.root_message_id_hash ?? references[0] ?? row.message_id_hash,
    conversationIdHash: row.conversation_id_hash,
    directReferenceCount: references.length,
    relatedEmailCount: Number(row.thread_related_count),
    referenceHashes: references.slice(0, 10),
  };
}

function emailThreadGroupKey(item: EmailMatterFilingDto): string {
  return item.thread.threadId ?? item.thread.rootMessageHash;
}

function buildEmailThreadGroups(items: readonly EmailMatterFilingDto[]): EmailThreadGroupDto[] {
  const groups = new Map<string, EmailMatterFilingDto[]>();
  for (const item of items) {
    const key = emailThreadGroupKey(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    if (!first) throw new Error('email thread group is empty');
    const documentIds = [...new Set(group.flatMap((item) => item.documentIds))];
    return {
      threadId: first.thread.threadId,
      rootMessageHash: first.thread.rootMessageHash,
      conversationIdHash: first.thread.conversationIdHash,
      relatedEmailCount: Math.max(
        group.length,
        ...group.map((item) => item.thread.relatedEmailCount + 1),
      ),
      filedEmailCount: group.length,
      documentIds,
      latestFiledAt:
        group.map((item) => item.filedAt).sort((left, right) => right.localeCompare(left))[0] ??
        first.filedAt,
      items: group,
    };
  });
}

function mapEmailRow(row: EmailMessageRow): EmailMessageDto {
  return {
    emailId: row.email_id,
    tenantId: row.tenant_id,
    rawFileObjectId: row.raw_file_object_id,
    parser: row.parser,
    parserVersion: row.parser_version,
    parseStatus: row.parse_status,
    failureReasonCode: row.failure_reason_code,
    subject: row.subject,
    sentAt: row.sent_at?.toISOString() ?? null,
    receivedAt: row.received_at?.toISOString() ?? null,
    metadataWarningCode: row.metadata_warning_code,
    hasOutsideParticipants: row.has_outside_participants,
    messageIdHash: row.message_id_hash,
    references: row.references_json,
    rawSha256: row.raw_sha256,
    rawSizeBytes: Number(row.raw_size_bytes),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

function mapEmailDocumentLinkRow(row: EmailDocumentLinkRow): EmailDocumentLinkDto {
  return {
    linkId: row.link_id,
    tenantId: row.tenant_id,
    emailId: row.email_id,
    documentId: row.document_id,
    fileObjectId: row.file_object_id,
    attachmentIndex: row.attachment_index,
    attachmentFilename: row.attachment_filename,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    createdAt: row.created_at.toISOString(),
  };
}

function mapEmailMatterFilingRow(row: EmailMatterFilingRow): EmailMatterFilingDto {
  return {
    filingId: row.filing_id,
    tenantId: row.tenant_id,
    emailId: row.email_id,
    matterId: row.matter_id,
    subject: row.subject,
    sentAt: row.sent_at?.toISOString() ?? null,
    hasOutsideParticipants: row.has_outside_participants,
    warningCodes: warningCodes(row),
    participantClasses: participantClassSummaries(row.participant_class_counts),
    privilegeTagSuggestion: privilegeTagSuggestion(row.subject),
    thread: threadSummary(row),
    documentIds: [...(row.document_ids ?? [])],
    filedBy: row.created_by,
    filedAt: row.created_at.toISOString(),
  };
}

function mapEmailMatterSuggestionRow(row: ScoredEmailMatterSuggestionRow) {
  return {
    matterId: row.matter_id,
    matterCode: row.matter_code,
    matterName: row.matter_name,
    clientId: row.client_id,
    reasonCodes: row.reason_codes,
    score: row.score,
    confidence: row.confidence,
    confidenceBand: row.confidence_band,
  };
}

function scoreEmailMatterSuggestionRow(row: EmailMatterSuggestionRow): ScoredEmailMatterSuggestionRow {
  const scored = scoreMatterSuggestion({
    subjectMatch: row.subject_match,
    domainMatch: row.domain_match,
    threadFiledCount: Number(row.thread_filed_count),
    senderMatterFilingCount: Number(row.sender_matter_filing_count),
    senderTotalFilingCount: Number(row.sender_total_filing_count),
    clientParticipantMatch: row.client_participant_match,
    opposingDomainConflict: row.opposing_domain_conflict,
  } satisfies MatterSuggestionSignalInput);
  return {
    ...row,
    reason_codes: scored.reasonCodes,
    score: scored.confidence,
    confidence: scored.confidence,
    confidence_band: scored.confidenceBand,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const pgError = error as { code?: unknown };
  return typeof error === 'object' && error !== null && pgError.code === '23505';
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(FileObjectService) private readonly fileObjectService: FileObjectService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Optional()
    @Inject(DocumentUploadService)
    private readonly documentUploadService?: DocumentUploadService,
    @Optional()
    @Inject(QuarantineIntakeService)
    private readonly quarantineIntake?: QuarantineIntakeService,
    @Optional()
    @Inject(PermissionService)
    private readonly permissionService?: PermissionService,
    @Optional()
    @Inject(PermissionQueryBuilder)
    private readonly permissionQueryBuilder?: PermissionQueryBuilder,
    @Optional()
    @Inject(UserService)
    private readonly userService?: UserService,
    @Optional()
    @Inject(DlpService)
    private readonly dlpService?: DlpService,
    @Optional()
    @Inject(DocumentService)
    private readonly documentService?: DocumentService,
    @Optional()
    @Inject(DocumentVersionService)
    private readonly documentVersionService?: DocumentVersionService,
    @Optional()
    @Inject(SearchIndexRepository)
    private readonly searchIndexRepository?: SearchIndexRepository,
    @Optional()
    @Inject(EmailWorkerParserClient)
    private readonly emailWorkerParser?: EmailWorkerParserClient,
    @Optional()
    @Inject(EmailThreadService)
    private readonly emailThreadService?: EmailThreadService,
  ) {}

  async uploadRawEmailToMatter(
    actorUserId: string,
    matterId: string,
    _fields: UploadEmailToMatterFieldsDto,
    file: UploadedDiskFile | undefined,
  ): Promise<UploadEmailToMatterResponseDto> {
    const tenantId = this.tenantContext.require().tenantId;
    if (!isUploadedDiskFile(file)) {
      await this.unlinkTempFile(file);
      throw validationFailed();
    }

    try {
      extensionFromFilename(file.originalname);
      if (file.size <= 0 || file.size > emailUploadMaxBytes()) throw validationFailed();
      await this.assertCanUploadToMatter(tenantId, actorUserId, matterId);
      const body = await readFile(file.path);
      const email = await this.importRawEmail({
        tenantId,
        actorUserId,
        matterId,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        body,
      });
      const filing = await this.fileEmailToMatter(actorUserId, email.emailId, { matterId });
      return { email, filing };
    } catch (error) {
      if (error instanceof EmailDuplicateMessageError) throw validationFailed();
      throw error;
    } finally {
      await this.unlinkTempFile(file);
    }
  }

  async importRawEmail(input: ImportRawEmailInput): Promise<EmailMessageDto> {
    const tenantId = input.tenantId ?? this.tenantContext.require().tenantId;
    const body = Buffer.from(input.body);
    const rawSha256 = sha256Hex(body);
    const originalFilename = normalizeFilename(input.originalFilename, 'message.eml');
    const classificationContext = await this.loadParticipantClassificationContext(
      tenantId,
      input.matterId,
    );
    const prepared = await this.prepareEnvelope({
      tenantId,
      originalFilename,
      mimeType: input.mimeType,
      body,
      rawSha256,
      classificationContext,
    });

    const existing = await this.recordDuplicateIfExisting({
      tenantId,
      actorUserId: input.actorUserId ?? null,
      messageIdHash: prepared.messageIdHash,
    });
    if (existing) throw new EmailDuplicateMessageError(existing.email_id);

    const emailId = randomUUID();
    const rawFileObjectId = randomUUID();
    const storage = await this.storageService.putEmailRawObject({
      tenantId,
      emailId,
      fileObjectId: rawFileObjectId,
      body,
      contentLength: body.length,
      contentType: prepared.contentType,
    });
    let storageCompensated = false;

    try {
      const result = await this.auditService.transaction<ImportTransactionResult>(
        tenantId,
        async (tx) => {
          const raceDuplicate = await this.findByMessageIdHash(
            tx,
            tenantId,
            prepared.messageIdHash,
          );
          if (raceDuplicate) {
            await this.auditService.log(
              emailDuplicateBlockedAudit({
                tenantId,
                actorId: input.actorUserId ?? null,
                emailId: raceDuplicate.email_id,
                messageIdHash: prepared.messageIdHash,
              }),
              tx,
            );
            return { kind: 'duplicate', emailId: raceDuplicate.email_id };
          }

          await this.fileObjectService.create(
            {
              fileObjectId: rawFileObjectId,
              tenantId,
              storageUri: storage.storageUri,
              originalFilename,
              normalizedFilename: originalFilename,
              mimeType: prepared.contentType,
              sizeBytes: body.length,
              sha256: rawSha256,
              encryptionKeyId: storage.encryptionKeyId,
              sourceSystem: 'email_ingest',
              createdBy: input.actorUserId ?? null,
            },
            tx,
          );
          const email = await this.insertEmailMessage(
            tx,
            tenantId,
            emailId,
            rawFileObjectId,
            prepared,
            rawSha256,
            body.length,
            input.actorUserId ?? null,
          );
          await this.assignThreadForEmail(tx, tenantId, emailId, prepared);
          await this.insertEmailParticipants(tx, tenantId, emailId, prepared.metadata);
          await this.auditService.log(
            emailImportedAudit({
              tenantId,
              actorId: input.actorUserId ?? null,
              emailId,
              rawFileObjectId,
              rawSha256,
              parseStatus: prepared.parseStatus,
              failureReasonCode: prepared.failureReasonCode,
            }),
            tx,
          );
          if (prepared.metadata) {
            await this.auditService.log(
              emailMetadataUpdatedAudit({
                tenantId,
                actorId: input.actorUserId ?? null,
                emailId,
                participantCount: prepared.metadata.participants.length,
                warningCode: prepared.metadata.warningCode,
                parserVersionAfter: prepared.parserVersion,
              }),
              tx,
            );
          }
          return { kind: 'imported', email };
        },
      );

      if (result.kind === 'duplicate') {
        await this.compensateStorageObject(tenantId, storage.storageUri);
        storageCompensated = true;
        throw new EmailDuplicateMessageError(result.emailId);
      }
      await this.importAttachments({
        tenantId,
        actorUserId: input.actorUserId ?? null,
        emailId: result.email.emailId,
        matterId: input.matterId,
        fields: input.attachmentDocumentFields ?? {},
        attachments: prepared.attachments,
      });
      return result.email;
    } catch (error) {
      if (!storageCompensated) {
        await this.compensateStorageObject(tenantId, storage.storageUri);
        storageCompensated = true;
      }
      if (error instanceof EmailDuplicateMessageError) throw error;
      if (isUniqueViolation(error)) {
        const duplicate = await this.recordDuplicateIfExisting({
          tenantId,
          actorUserId: input.actorUserId ?? null,
          messageIdHash: prepared.messageIdHash,
        });
        throw new EmailDuplicateMessageError(duplicate?.email_id);
      }
      throw error;
    }
  }

  private async prepareEnvelope(input: {
    tenantId: string;
    originalFilename: string;
    mimeType: string | null | undefined;
    body: Buffer;
    rawSha256: string;
    classificationContext: ParticipantClassificationContext;
  }): Promise<PreparedEmailEnvelope> {
    const { originalFilename, mimeType, body, rawSha256, classificationContext } = input;
    const extension = extensionFromFilename(originalFilename);
    const contentType =
      mimeType?.trim() || (extension === 'msg' ? 'application/vnd.ms-outlook' : 'message/rfc822');
    if (this.emailWorkerParser) {
      const parsed = await this.emailWorkerParser.parseRawEmail({
        tenantId: input.tenantId,
        filename: originalFilename,
        mimeType: contentType,
        body,
      });
      return this.prepareWorkerEnvelope({
        extension,
        contentType,
        body,
        rawSha256,
        classificationContext,
        parsed,
      });
    }
    return this.prepareLocalEnvelope({
      extension,
      contentType,
      body,
      rawSha256,
      classificationContext,
    });
  }

  private prepareWorkerEnvelope(input: {
    extension: 'eml' | 'msg';
    contentType: string;
    body: Buffer;
    rawSha256: string;
    classificationContext: ParticipantClassificationContext;
    parsed: EmailWorkerParseResult;
  }): PreparedEmailEnvelope {
    const { extension, contentType, body, rawSha256, classificationContext, parsed } = input;
    if (parsed.parseStatus !== 'parsed' || !parsed.normalizedMessageId) {
      return {
        parser: extension === 'msg' ? 'msg' : parsed.parser,
        parserVersion: parsed.parserVersion,
        parseStatus: parsed.parseStatus,
        failureReasonCode: parsed.failureReasonCode ?? 'MALFORMED_HEADERS',
        messageIdHash: namespacedHash('email-raw-sha256', rawSha256),
        contentType,
        metadata: null,
        attachments: [],
      };
    }
    return {
      parser: parsed.parser,
      parserVersion: parsed.parserVersion,
      parseStatus: 'parsed',
      failureReasonCode: null,
      messageIdHash: messageIdHash(parsed.normalizedMessageId),
      contentType,
      metadata: this.prepareWorkerMetadata(parsed, classificationContext),
      attachments:
        parsed.parser === 'eml'
          ? this.extractWorkerEmlAttachments(body)
          : this.extractWorkerMsgAttachments(parsed.attachments),
    };
  }

  private prepareLocalEnvelope(input: {
    extension: 'eml' | 'msg';
    contentType: string;
    body: Buffer;
    rawSha256: string;
    classificationContext: ParticipantClassificationContext;
  }): PreparedEmailEnvelope {
    const { extension, contentType, body, rawSha256, classificationContext } = input;
    if (extension === 'msg') {
      return {
        parser: 'msg',
        parserVersion: emailApiParserVersion,
        parseStatus: 'pending_unsupported',
        failureReasonCode: 'UNSUPPORTED_MSG',
        messageIdHash: namespacedHash('email-raw-sha256', rawSha256),
        contentType,
        metadata: null,
        attachments: [],
      };
    }

    try {
      const raw = decodeEmlRawContent(body);
      const parsed = normalizeEmailMetadata(raw, {
        tenantDomains: [...classificationContext.tenantDomains],
      });
      return {
        parser: 'eml',
        parserVersion: emailApiParserVersion,
        parseStatus: 'parsed',
        failureReasonCode: null,
        messageIdHash: messageIdHash(parsed.normalizedMessageId),
        contentType,
        metadata: this.prepareMetadata(parsed, classificationContext),
        attachments: extractEmlAttachments(raw),
      };
    } catch (error) {
      const reasonCode = error instanceof EmlParseError ? error.reasonCode : 'MALFORMED_HEADERS';
      return {
        parser: 'eml',
        parserVersion: emailApiParserVersion,
        parseStatus: 'failed',
        failureReasonCode: reasonCode,
        messageIdHash: namespacedHash('email-raw-sha256', rawSha256),
        contentType,
        metadata: null,
        attachments: [],
      };
    }
  }

  private extractWorkerEmlAttachments(body: Buffer): readonly ParsedEmailAttachment[] {
    try {
      return extractEmlAttachments(decodeEmlRawContent(body));
    } catch {
      return [];
    }
  }

  private extractWorkerMsgAttachments(
    attachments: readonly EmailWorkerAttachment[],
  ): readonly ParsedEmailAttachment[] {
    return attachments.map((attachment) => ({
      attachmentIndex: attachment.attachmentIndex,
      originalFilename: attachment.normalizedFilename,
      normalizedFilename: attachment.normalizedFilename,
      contentType: attachment.mediaType,
      charset: null,
      mediaHint: attachment.mediaType,
      sizeBytes: attachment.sizeBytes,
      sha256: attachment.sha256,
      body: attachment.body,
    }));
  }

  private prepareWorkerMetadata(
    parsed: EmailWorkerParseResult,
    classificationContext: ParticipantClassificationContext,
  ): PreparedEmailMetadata {
    const participants = parsed.participants.map((participant) => {
      const participantClass = classifyEmailParticipant(
        { domainRef: participant.domainRef },
        classificationContext,
      );
      return {
        role: participant.role,
        addressHash: namespacedHash('email-address', participant.normalizedAddress),
        domainRef: participant.domainRef,
        displayName: participant.displayName,
        isOutside: isOutsideParticipantClass(participantClass),
        participantClass,
      };
    });
    return {
      subject: parsed.subject,
      sentAt: parsed.sentAt,
      receivedAt: parsed.receivedAt,
      warningCode: parsed.metadataWarningCode,
      references: parsed.references.map((reference) => messageIdHash(reference)),
      participants,
      hasOutsideParticipants: participants.some((participant) => participant.isOutside),
    };
  }

  private prepareMetadata(
    metadata: NormalizedEmailMetadata,
    classificationContext: ParticipantClassificationContext,
  ): PreparedEmailMetadata {
    const participants = metadata.participants.map((participant) => {
      const participantClass = classifyEmailParticipant(
        { domainRef: participant.domainRef },
        classificationContext,
      );
      return {
        role: participant.role,
        addressHash: namespacedHash('email-address', participant.normalizedAddress),
        domainRef: participant.domainRef,
        displayName: participant.displayName,
        isOutside: isOutsideParticipantClass(participantClass),
        participantClass,
      };
    });
    return {
      subject: metadata.subject,
      sentAt: metadata.sentAt,
      receivedAt: metadata.receivedAt,
      warningCode: metadata.warningCode,
      references: metadata.normalizedReferenceIds.map((reference) => messageIdHash(reference)),
      participants,
      hasOutsideParticipants: participants.some((participant) => participant.isOutside),
    };
  }

  private async loadParticipantClassificationContext(
    tenantId: string,
    matterId?: string,
  ): Promise<ParticipantClassificationContext> {
    return this.auditService.transaction(tenantId, (tx) =>
      this.loadParticipantClassificationContextFromClient(tx, tenantId, matterId),
    );
  }

  private async loadParticipantClassificationContextFromClient(
    client: QueryClient,
    tenantId: string,
    matterId?: string,
  ): Promise<ParticipantClassificationContext> {
    const tenantDomainRows = await client.query(
      `
        SELECT domain_ref
        FROM tenant_email_domains
        WHERE tenant_id = $1
        ORDER BY domain_ref
      `,
      [tenantId],
    );
    const tenantDomainResultRows = tenantDomainRows.rows as { domain_ref: string }[];
    const tenantDomains = new Set(
      tenantDomainResultRows
        .map((row) => normalizeDomainRef(row.domain_ref))
        .filter((domain): domain is string => domain !== null),
    );
    const clientDomains = new Set<string>();
    const opposingDomains = new Set<string>();
    if (!matterId) return { tenantDomains, clientDomains, opposingDomains };

    const matterDomainRows = await client.query(
      `
        SELECT nullif(lower(c.metadata_json->>'domain'), '') AS client_domain,
          nullif(lower(m.metadata_json->>'domain'), '') AS matter_domain
        FROM matters m
        JOIN clients c
          ON c.tenant_id = m.tenant_id
         AND c.client_id = m.client_id
        WHERE m.tenant_id = $1
          AND m.matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    const matterDomainResultRows = matterDomainRows.rows as {
      client_domain: string | null;
      matter_domain: string | null;
    }[];
    for (const row of matterDomainResultRows) {
      for (const value of [row.client_domain, row.matter_domain]) {
        const domain = normalizeDomainRef(value);
        if (domain) clientDomains.add(domain);
      }
    }

    const partyRows = await client.query(
      `
        SELECT p.name, p.party_role,
          nullif(lower(c.metadata_json->>'domain'), '') AS related_client_domain
        FROM parties p
        LEFT JOIN clients c
          ON c.tenant_id = p.tenant_id
         AND c.client_id = p.related_client_id
        WHERE p.tenant_id = $1
          AND p.matter_id = $2
      `,
      [tenantId, matterId],
    );
    const partyResultRows = partyRows.rows as {
      name: string;
      party_role: string;
      related_client_domain: string | null;
    }[];
    for (const row of partyResultRows) {
      const relatedClientDomain = normalizeDomainRef(row.related_client_domain);
      const domains = [
        ...extractDomainRefsFromText(row.name),
        ...(relatedClientDomain ? [relatedClientDomain] : []),
      ];
      if (row.party_role === 'client') {
        for (const domain of domains) clientDomains.add(domain);
      }
      if (row.party_role === 'counterparty' || row.party_role === 'opposing_counsel') {
        for (const domain of domains) opposingDomains.add(domain);
      }
    }
    return { tenantDomains, clientDomains, opposingDomains };
  }

  private async reclassifyEmailParticipantsForMatter(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    matterId: string,
  ): Promise<void> {
    const context = await this.loadParticipantClassificationContextFromClient(
      client,
      tenantId,
      matterId,
    );
    const participants = await client.query(
      `
        SELECT participant_id, domain_ref
        FROM email_participants
        WHERE tenant_id = $1
          AND email_id = $2
        ORDER BY role ASC, participant_id ASC
      `,
      [tenantId, emailId],
    );
    const participantRows = participants.rows as {
      participant_id: string;
      domain_ref: string;
    }[];
    let hasOutsideParticipants = false;
    for (const participant of participantRows) {
      const participantClass = classifyEmailParticipant(
        { domainRef: participant.domain_ref },
        context,
      );
      const isOutside = isOutsideParticipantClass(participantClass);
      hasOutsideParticipants ||= isOutside;
      await client.query(
        `
          UPDATE email_participants
          SET participant_class = $3,
            is_outside = $4
          WHERE tenant_id = $1
            AND participant_id = $2
        `,
        [tenantId, participant.participant_id, participantClass, isOutside],
      );
    }
    await client.query(
      `
        UPDATE email_messages
        SET has_outside_participants = $3
        WHERE tenant_id = $1
          AND email_id = $2
      `,
      [tenantId, emailId, hasOutsideParticipants],
    );
  }

  private async recordDuplicateIfExisting(input: {
    tenantId: string;
    actorUserId: string | null;
    messageIdHash: string;
  }): Promise<ExistingEmailRow | null> {
    return this.auditService.transaction(input.tenantId, async (tx) => {
      const existing = await this.findByMessageIdHash(tx, input.tenantId, input.messageIdHash);
      if (!existing) return null;
      await this.auditService.log(
        emailDuplicateBlockedAudit({
          tenantId: input.tenantId,
          actorId: input.actorUserId,
          emailId: existing.email_id,
          messageIdHash: input.messageIdHash,
        }),
        tx,
      );
      return existing;
    });
  }

  private async findByMessageIdHash(
    client: QueryClient,
    tenantId: string,
    messageIdHash: string,
  ): Promise<ExistingEmailRow | null> {
    const result = await client.query(
      `
        SELECT email_id
        FROM email_messages
        WHERE tenant_id = $1
          AND message_id_hash = $2
        LIMIT 1
      `,
      [tenantId, messageIdHash],
    );
    return (result.rows[0] as ExistingEmailRow | undefined) ?? null;
  }

  private async insertEmailMessage(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    rawFileObjectId: string,
    prepared: PreparedEmailEnvelope,
    rawSha256: string,
    rawSizeBytes: number,
    actorUserId: string | null,
  ): Promise<EmailMessageDto> {
    const result = await client.query(
      `
        INSERT INTO email_messages (
          email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
          parser_version, parse_status, failure_reason_code, subject, sent_at, received_at,
          metadata_warning_code, references_json, has_outside_participants,
          raw_sha256, raw_size_bytes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)
        RETURNING email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
          parser_version, parse_status, failure_reason_code, subject, sent_at, received_at,
          metadata_warning_code, references_json, has_outside_participants,
          raw_sha256, raw_size_bytes::text, created_by, created_at
      `,
      [
        emailId,
        tenantId,
        rawFileObjectId,
        prepared.messageIdHash,
        prepared.parser,
        prepared.parserVersion,
        prepared.parseStatus,
        prepared.failureReasonCode,
        prepared.metadata?.subject ?? null,
        prepared.metadata?.sentAt ?? null,
        prepared.metadata?.receivedAt ?? null,
        prepared.metadata?.warningCode ?? null,
        JSON.stringify(prepared.metadata?.references ?? []),
        prepared.metadata?.hasOutsideParticipants ?? false,
        rawSha256,
        rawSizeBytes,
        actorUserId,
      ],
    );
    const row = result.rows[0] as EmailMessageRow | undefined;
    if (!row) throw new Error('email message insert returned no row');
    return mapEmailRow(row);
  }

  private async assignThreadForEmail(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    prepared: PreparedEmailEnvelope,
  ): Promise<void> {
    if (!this.emailThreadService || prepared.parseStatus !== 'parsed') return;
    const candidates = await this.loadThreadCandidates(client, tenantId, emailId, prepared);
    const assignments = this.emailThreadService.assignThreads(
      candidates.map((row): EmailThreadEnvelope => ({
        emailId: row.email_id,
        messageIdHash: row.message_id_hash,
        referenceHashes: asStringArray(row.references_json),
      })),
    );
    const target = assignments.find((assignment) => assignment.emailId === emailId);
    if (!target) return;
    const threadId = await this.persistThread(client, tenantId, target, candidates);
    await client.query(
      `
        UPDATE email_messages
        SET thread_id = $3,
          conversation_id_hash = $4
        WHERE tenant_id = $1
          AND email_id = ANY($2::uuid[])
      `,
      [tenantId, target.memberEmailIds, threadId, target.conversationIdHash],
    );
  }

  private async loadThreadCandidates(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    prepared: PreparedEmailEnvelope,
  ): Promise<EmailThreadCandidateRow[]> {
    const referenceHashes = prepared.metadata?.references ?? [];
    const result = await client.query(
      `
        SELECT e.email_id, e.message_id_hash, e.references_json, e.thread_id,
          t.created_at AS thread_created_at
        FROM email_messages e
        LEFT JOIN email_threads t
          ON t.tenant_id = e.tenant_id
         AND t.thread_id = e.thread_id
        WHERE e.tenant_id = $1
          AND (
            e.email_id = $2
            OR e.message_id_hash = $3
            OR e.message_id_hash = ANY($4::text[])
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(e.references_json) AS ref(value)
              WHERE ref.value = $3
                OR ref.value = ANY($4::text[])
            )
          )
        ORDER BY e.created_at ASC, e.email_id ASC
      `,
      [tenantId, emailId, prepared.messageIdHash, referenceHashes],
    );
    return result.rows as EmailThreadCandidateRow[];
  }

  private async persistThread(
    client: QueryClient,
    tenantId: string,
    assignment: { rootMessageHash: string; conversationIdHash: string | null; memberEmailIds: readonly string[] },
    candidates: readonly EmailThreadCandidateRow[],
  ): Promise<string> {
    const existing = candidates
      .filter((row) => assignment.memberEmailIds.includes(row.email_id) && row.thread_id)
      .sort((left, right) => {
        const leftTime = left.thread_created_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightTime = right.thread_created_at?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || left.thread_id!.localeCompare(right.thread_id!);
      })[0]?.thread_id;
    if (existing) {
      await client.query(
        `
          UPDATE email_threads
          SET root_message_id_hash = $3,
            conversation_id_hash = $4,
            updated_at = now()
          WHERE tenant_id = $1
            AND thread_id = $2
        `,
        [tenantId, existing, assignment.rootMessageHash, assignment.conversationIdHash],
      );
      return existing;
    }

    const result = await client.query(
      `
        INSERT INTO email_threads (tenant_id, root_message_id_hash, conversation_id_hash)
        VALUES ($1, $2, $3)
        RETURNING thread_id
      `,
      [tenantId, assignment.rootMessageHash, assignment.conversationIdHash],
    );
    const row = result.rows[0] as EmailThreadInsertRow | undefined;
    if (!row) throw new Error('email thread insert returned no row');
    return row.thread_id;
  }

  private async insertEmailParticipants(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    metadata: PreparedEmailMetadata | null,
  ): Promise<void> {
    if (!metadata) return;
    for (const participant of metadata.participants) {
      await client.query(
        `
          INSERT INTO email_participants (
            tenant_id, email_id, role, address_hash, domain_ref, display_name,
            is_outside, participant_class
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tenant_id, email_id, role, address_hash) DO NOTHING
        `,
        [
          tenantId,
          emailId,
          participant.role,
          participant.addressHash,
          participant.domainRef,
          participant.displayName,
          participant.isOutside,
          participant.participantClass,
        ],
      );
    }
  }

  async fileEmailToMatter(
    actorUserId: string,
    emailId: string,
    input: FileEmailToMatterDto,
  ): Promise<EmailMatterFilingDto> {
    const tenantId = this.tenantContext.require().tenantId;
    return this.fileEmailToMatterForTenant({
      tenantId,
      actorUserId,
      emailId,
      matterId: input.matterId,
    });
  }

  async fileEmailToMatterForTenant(input: {
    tenantId: TenantId;
    actorUserId: string;
    emailId: string;
    matterId: string;
  }): Promise<EmailMatterFilingDto> {
    const { tenantId, actorUserId, emailId, matterId } = input;
    await this.assertCanUploadToMatter(tenantId, actorUserId, input.matterId);

    const filing = await this.auditService.transaction(tenantId, async (tx) => {
      const emailExists = await this.emailExists(tx, tenantId, emailId);
      if (!emailExists) throw new NotFoundException({ code: 'PERMISSION_DENIED' });

      await tx.query(
        `
          INSERT INTO email_matter_filings (tenant_id, email_id, matter_id, created_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (tenant_id, email_id, matter_id) DO NOTHING
        `,
        [tenantId, emailId, matterId, actorUserId],
      );
      await this.reclassifyEmailParticipantsForMatter(tx, tenantId, emailId, matterId);
      const row = await this.findFilingRow(tx, tenantId, emailId, matterId);
      if (!row) throw new Error('email matter filing returned no row');
      const documentIds = [...(row.document_ids ?? [])];
      await this.auditService.log(
        emailFiledAudit({
          tenantId,
          actorId: actorUserId,
          emailId,
          matterId,
          documentIds,
        }),
        tx,
      );
      return mapEmailMatterFilingRow(row);
    });
    await this.ensureEmailBodySearchDocument({
      tenantId,
      actorUserId,
      emailId,
      matterId,
    });
    return filing;
  }

  async undoEmailAutofile(
    actorUserId: string,
    emailId: string,
    input: UndoEmailAutofileDto,
  ): Promise<EmailTimelineDto> {
    const tenantId = this.tenantContext.require().tenantId;
    await this.assertCanUploadToMatter(tenantId, actorUserId, input.matterId);
    await this.auditService.transaction(tenantId, async (tx) => {
      const removed = await tx.query(
        `
          DELETE FROM email_matter_filings
          WHERE tenant_id = $1
            AND email_id = $2
            AND matter_id = $3
          RETURNING filing_id
        `,
        [tenantId, emailId, input.matterId],
      );
      if ((removed.rowCount ?? 0) < 1) throw new NotFoundException({ code: 'PERMISSION_DENIED' });
      await this.insertSuggestionFeedback(tx, {
        tenantId,
        emailId,
        suggestedMatterId: input.matterId,
        selectedMatterId: null,
        actorUserId,
        action: 'undone',
        confidence: null,
        confidenceBand: null,
        reasonCodes: [],
      });
      await this.auditService.log(
        emailFilingRevertedAudit({
          tenantId,
          actorId: actorUserId,
          emailId,
          matterId: input.matterId,
          feedbackAction: 'undone',
        }),
        tx,
      );
      await this.auditService.log(
        emailSuggestionFeedbackRecordedAudit({
          tenantId,
          actorId: actorUserId,
          emailId,
          suggestedMatterId: input.matterId,
          selectedMatterId: null,
          feedbackAction: 'undone',
        }),
        tx,
      );
    });
    return this.listMatterEmailTimeline(actorUserId, input.matterId);
  }

  private async applyAutofileSuggestion(
    actorUserId: string,
    emailId: string,
    suggestion: ScoredEmailMatterSuggestionRow,
  ): Promise<void> {
    const tenantId = this.tenantContext.require().tenantId;
    const alreadyFiled = await this.auditService.transaction(tenantId, async (tx) =>
      this.emailFilingExists(tx, tenantId, emailId, suggestion.matter_id),
    );
    if (alreadyFiled) return;
    await this.fileEmailToMatterForTenant({
      tenantId,
      actorUserId,
      emailId,
      matterId: suggestion.matter_id,
    });
    await this.auditService.transaction(tenantId, async (tx) => {
      await this.insertSuggestionFeedback(tx, {
        tenantId,
        emailId,
        suggestedMatterId: suggestion.matter_id,
        selectedMatterId: suggestion.matter_id,
        actorUserId,
        action: 'accepted',
        confidence: suggestion.confidence,
        confidenceBand: suggestion.confidence_band,
        reasonCodes: suggestion.reason_codes,
      });
      const audit = await this.auditService.log(
        emailSuggestionAutofiledAudit({
          tenantId,
          actorId: actorUserId,
          emailId,
          matterId: suggestion.matter_id,
          confidence: suggestion.confidence,
          confidenceBand: suggestion.confidence_band,
        }),
        tx,
      );
      await this.auditService.log(
        emailSuggestionFeedbackRecordedAudit({
          tenantId,
          actorId: actorUserId,
          emailId,
          suggestedMatterId: suggestion.matter_id,
          selectedMatterId: suggestion.matter_id,
          feedbackAction: 'accepted',
          confidence: suggestion.confidence,
          confidenceBand: suggestion.confidence_band,
        }),
        tx,
      );
      await this.insertAutofileNotification(tx, {
        tenantId,
        actorUserId,
        emailId,
        matterId: suggestion.matter_id,
        auditEventId: audit.eventId,
      });
    });
  }

  async suggestMattersForEmail(
    actorUserId: string,
    emailId: string,
    query: EmailMatterSuggestionQueryDto,
  ): Promise<EmailMatterSuggestionListDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const user = await this.userService?.findByTenantAndId(tenantId, actorUserId);
    const permissionQueryBuilder = this.permissionQueryBuilder;
    if (!user || user.status !== 'active' || !permissionQueryBuilder) return { items: [] };

    const scoredRows = await this.auditService.transaction(tenantId, async (tx) => {
      const context = await this.emailSuggestionContext(tx, tenantId, emailId);
      if (!context) throw new NotFoundException({ code: 'PERMISSION_DENIED' });
      const params: unknown[] = [tenantId];
      const permission = permissionQueryBuilder.buildMatterFilter(
        { tenantId, userId: actorUserId, role: user.role },
        params.length + 1,
        'm',
      );
      params.push(...permission.params);
      const subjectParam = params.push(context.subject ?? '');
      const domainsParam = params.push(context.domains);
      const clientDomainsParam = params.push(context.clientDomains);
      const opposingDomainsParam = params.push(context.opposingDomains);
      const senderAddressHashesParam = params.push(context.senderAddressHashes);
      const threadParam = params.push(context.threadId);
      const limitParam = params.push(Math.max(query.limit * 5, 10));
      const result = await tx.query(
        `
          WITH candidates AS (
            SELECT
              m.matter_id,
              m.matter_code,
              m.matter_name,
              m.client_id,
              (
                lower($${subjectParam}::text) LIKE '%' || lower(m.matter_code) || '%'
                OR lower($${subjectParam}::text) LIKE '%' || lower(m.matter_name) || '%'
              ) AS subject_match,
              (
                lower(coalesce(m.metadata_json->>'domain', '')) = ANY($${domainsParam}::text[])
                OR lower(coalesce(c.metadata_json->>'domain', '')) = ANY($${domainsParam}::text[])
              ) AS domain_match,
              (
                cardinality($${clientDomainsParam}::text[]) > 0
                AND (
                  lower(coalesce(m.metadata_json->>'domain', '')) = ANY($${clientDomainsParam}::text[])
                  OR lower(coalesce(c.metadata_json->>'domain', '')) = ANY($${clientDomainsParam}::text[])
                )
              ) AS client_participant_match,
              (
                cardinality($${opposingDomainsParam}::text[]) > 0
                AND (
                  lower(coalesce(m.metadata_json->>'domain', '')) = ANY($${opposingDomainsParam}::text[])
                  OR lower(coalesce(c.metadata_json->>'domain', '')) = ANY($${opposingDomainsParam}::text[])
                )
              ) AS opposing_domain_conflict,
              (
                SELECT count(*)::text
                FROM email_matter_filings tf
                JOIN email_messages te
                  ON te.tenant_id = tf.tenant_id
                 AND te.email_id = tf.email_id
                WHERE tf.tenant_id = m.tenant_id
                  AND tf.matter_id = m.matter_id
                  AND $${threadParam}::uuid IS NOT NULL
                  AND te.thread_id = $${threadParam}::uuid
              ) AS thread_filed_count,
              (
                SELECT count(DISTINCT sf.email_id)::text
                FROM email_matter_filings sf
                JOIN email_participants sp
                  ON sp.tenant_id = sf.tenant_id
                 AND sp.email_id = sf.email_id
                WHERE sf.tenant_id = m.tenant_id
                  AND sf.matter_id = m.matter_id
                  AND cardinality($${senderAddressHashesParam}::text[]) > 0
                  AND sp.role = 'from'
                  AND sp.address_hash = ANY($${senderAddressHashesParam}::text[])
              ) AS sender_matter_filing_count,
              (
                SELECT count(DISTINCT sf.email_id)::text
                FROM email_matter_filings sf
                JOIN email_participants sp
                  ON sp.tenant_id = sf.tenant_id
                 AND sp.email_id = sf.email_id
                WHERE sf.tenant_id = m.tenant_id
                  AND cardinality($${senderAddressHashesParam}::text[]) > 0
                  AND sp.role = 'from'
                  AND sp.address_hash = ANY($${senderAddressHashesParam}::text[])
              ) AS sender_total_filing_count
            FROM matters m
            JOIN clients c
              ON c.tenant_id = m.tenant_id
             AND c.client_id = m.client_id
            WHERE m.tenant_id = $1
              AND ${permission.sql}
          )
          SELECT matter_id, matter_code, matter_name, client_id,
            subject_match, domain_match, client_participant_match, opposing_domain_conflict,
            thread_filed_count, sender_matter_filing_count, sender_total_filing_count
          FROM candidates
          WHERE subject_match OR domain_match OR client_participant_match
            OR thread_filed_count::int > 0 OR sender_matter_filing_count::int > 0
            OR opposing_domain_conflict
          ORDER BY thread_filed_count::int DESC,
            sender_matter_filing_count::int DESC,
            domain_match DESC,
            subject_match DESC,
            matter_code ASC,
            matter_id ASC
          LIMIT $${limitParam}
        `,
        params,
      );
      return (result.rows as EmailMatterSuggestionRow[])
        .map(scoreEmailMatterSuggestionRow)
        .filter((row) => row.reason_codes.length > 0)
        .sort((left, right) => {
          if (right.confidence !== left.confidence) return right.confidence - left.confidence;
          return left.matter_code.localeCompare(right.matter_code);
        })
        .slice(0, query.limit);
    });
    const response = { items: scoredRows.map(mapEmailMatterSuggestionRow) };
    const top = scoredRows[0];
    if (top?.confidence_band === 'auto_file') {
      await this.applyAutofileSuggestion(actorUserId, emailId, top);
    }
    return response;
  }

  async listMatterEmailTimeline(actorUserId: string, matterId: string): Promise<EmailTimelineDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const user = await this.userService?.findByTenantAndId(tenantId, actorUserId);
    const permissionQueryBuilder = this.permissionQueryBuilder;
    if (!user || user.status !== 'active' || !permissionQueryBuilder) {
      return { items: [], threads: [] };
    }

    return this.auditService.transaction(tenantId, async (tx) => {
      const params: unknown[] = [tenantId, matterId];
      const permission = permissionQueryBuilder.buildMatterFilter(
        { tenantId, userId: actorUserId, role: user.role },
        params.length + 1,
        'm',
      );
      params.push(...permission.params);
      const result = await tx.query(
        `
          SELECT f.filing_id, f.tenant_id, f.email_id, f.matter_id,
            e.subject, e.sent_at, e.has_outside_participants,
            m.matter_code, m.matter_name,
            nullif(m.metadata_json->>'domain', '') AS matter_domain,
            nullif(c.metadata_json->>'domain', '') AS client_domain,
            coalesce(
              array_agg(DISTINCT ep.domain_ref)
                FILTER (WHERE ep.domain_ref IS NOT NULL),
              ARRAY[]::text[]
            ) AS participant_domains,
            coalesce(
              (
                SELECT jsonb_agg(
                  jsonb_build_object('class', class_counts.participant_class, 'count', class_counts.count)
                  ORDER BY class_counts.participant_class
                )
                FROM (
                  SELECT class_ep.participant_class, count(*)::int AS count
                  FROM email_participants class_ep
                  WHERE class_ep.tenant_id = e.tenant_id
                    AND class_ep.email_id = e.email_id
                  GROUP BY class_ep.participant_class
                ) class_counts
              ),
              '[]'::jsonb
            ) AS participant_class_counts,
            e.thread_id, e.conversation_id_hash, et.root_message_id_hash,
            e.message_id_hash, e.references_json,
            (
              SELECT count(DISTINCT related.email_id)::text
              FROM email_messages related
              WHERE related.tenant_id = e.tenant_id
                AND related.email_id <> e.email_id
                AND (
                  (e.thread_id IS NOT NULL AND related.thread_id = e.thread_id)
                  OR
                  related.message_id_hash IN (
                    SELECT jsonb_array_elements_text(e.references_json)
                  )
                  OR e.message_id_hash IN (
                    SELECT jsonb_array_elements_text(related.references_json)
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(e.references_json) current_ref(ref)
                    JOIN jsonb_array_elements_text(related.references_json) related_ref(ref)
                      ON related_ref.ref = current_ref.ref
                  )
                )
            ) AS thread_related_count,
            f.created_by, f.created_at,
            coalesce(
              array_agg(DISTINCT edl.document_id::text)
                FILTER (WHERE edl.document_id IS NOT NULL),
              ARRAY[]::text[]
            ) AS document_ids
          FROM email_matter_filings f
          JOIN matters m
            ON m.tenant_id = f.tenant_id
           AND m.matter_id = f.matter_id
          JOIN clients c
            ON c.tenant_id = m.tenant_id
           AND c.client_id = m.client_id
          JOIN email_messages e
            ON e.tenant_id = f.tenant_id
           AND e.email_id = f.email_id
          LEFT JOIN email_participants ep
            ON ep.tenant_id = e.tenant_id
           AND ep.email_id = e.email_id
          LEFT JOIN email_document_links edl
            ON edl.tenant_id = f.tenant_id
           AND edl.email_id = f.email_id
          LEFT JOIN email_threads et
            ON et.tenant_id = e.tenant_id
           AND et.thread_id = e.thread_id
          WHERE f.tenant_id = $1
            AND f.matter_id = $2
            AND ${permission.sql}
          GROUP BY f.filing_id, f.tenant_id, f.email_id, f.matter_id,
            e.tenant_id, e.email_id, e.subject, e.sent_at, e.has_outside_participants, e.message_id_hash,
            e.references_json, e.thread_id, e.conversation_id_hash, et.root_message_id_hash,
            m.matter_code, m.matter_name, m.metadata_json,
            c.metadata_json, f.created_by, f.created_at
          ORDER BY f.created_at DESC, f.filing_id ASC
        `,
        params,
      );
      const items = (result.rows as EmailMatterFilingRow[]).map(mapEmailMatterFilingRow);
      return { items, threads: buildEmailThreadGroups(items) };
    });
  }

  async fileEmailThreadToMatter(
    actorUserId: string,
    threadId: string,
    input: FileEmailToMatterDto,
  ): Promise<EmailTimelineDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const result = await this.auditService.transaction(tenantId, async (tx) =>
      tx.query(
        `
          SELECT email_id
          FROM email_messages
          WHERE tenant_id = $1
            AND thread_id = $2
          ORDER BY sent_at ASC NULLS LAST, created_at ASC, email_id ASC
        `,
        [tenantId, threadId],
      ),
    );
    const rows = result.rows as EmailThreadEmailRow[];
    if (rows.length === 0) throw new NotFoundException({ code: 'PERMISSION_DENIED' });
    for (const row of rows) {
      await this.fileEmailToMatterForTenant({
        tenantId,
        actorUserId,
        emailId: row.email_id,
        matterId: input.matterId,
      });
    }
    return this.listMatterEmailTimeline(actorUserId, input.matterId);
  }

  async listDocumentLinksForEmail(
    actorUserId: string,
    emailId: string,
  ): Promise<EmailDocumentLinkDto[]> {
    const tenantId = this.tenantContext.require().tenantId;
    const rows = await this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT link_id, tenant_id, email_id, document_id, file_object_id,
            attachment_index, attachment_filename, media_type, size_bytes::text, sha256, created_at
          FROM email_document_links
          WHERE tenant_id = $1
            AND email_id = $2
          ORDER BY attachment_index ASC, created_at ASC
        `,
        [tenantId, emailId],
      );
      return result.rows as EmailDocumentLinkRow[];
    });
    const allowed: EmailDocumentLinkDto[] = [];
    for (const row of rows) {
      if (await this.canReadDocument(tenantId, actorUserId, row.document_id)) {
        allowed.push(mapEmailDocumentLinkRow(row));
      }
    }
    return allowed;
  }

  async listEmailLinksForDocument(
    actorUserId: string,
    documentId: string,
  ): Promise<EmailDocumentLinkDto[]> {
    const tenantId = this.tenantContext.require().tenantId;
    if (!(await this.canReadDocument(tenantId, actorUserId, documentId))) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT link_id, tenant_id, email_id, document_id, file_object_id,
            attachment_index, attachment_filename, media_type, size_bytes::text, sha256, created_at
          FROM email_document_links
          WHERE tenant_id = $1
            AND document_id = $2
          ORDER BY created_at ASC, attachment_index ASC
        `,
        [tenantId, documentId],
      );
      return (result.rows as EmailDocumentLinkRow[]).map(mapEmailDocumentLinkRow);
    });
  }

  async downloadRawEmail(
    actorUserId: string,
    emailId: string,
    reasonCode?: string,
  ): Promise<RawEmailDownloadResult> {
    const tenantId = this.tenantContext.require().tenantId;
    const target = await this.auditService.transaction(tenantId, async (tx) => {
      const row = await this.findRawEmailDownloadTarget(tx, tenantId, emailId);
      if (!row) throw new NotFoundException({ code: 'PERMISSION_DENIED' });
      const linkedDocuments = await this.findRawEmailLinkedDocuments(tx, tenantId, emailId);
      const matterId = await this.assertCanDownloadRawEmail(
        tenantId,
        actorUserId,
        linkedDocuments,
        reasonCode,
      );
      await this.auditService.log(
        emailRawDownloadedAudit({
          tenantId,
          actorId: actorUserId,
          emailId,
          matterId,
          rawFileObjectId: row.raw_file_object_id,
          rawSha256: row.raw_sha256,
          ...(reasonCode ? { reasonCode } : {}),
        }),
        tx,
      );
      return row;
    });

    const object = await this.storageService.getByStorageUri(tenantId, target.storage_uri);
    return {
      body: object.body,
      contentType: target.mime_type || 'message/rfc822',
      contentLength: Number(target.raw_size_bytes),
      filename: target.normalized_filename || 'message.eml',
      sha256: target.raw_sha256,
    };
  }

  private async ensureEmailBodySearchDocument(input: {
    tenantId: TenantId;
    actorUserId: string;
    emailId: string;
    matterId: string;
  }): Promise<void> {
    if (!this.documentService || !this.documentVersionService || !this.searchIndexRepository) {
      return;
    }
    try {
      if (!(await this.isEmailBodySearchEnabled(input.tenantId))) return;
      if (await this.hasEmailBodyDocument(input)) return;
      const source = await this.loadEmailBodySearchSource(input.tenantId, input.emailId);
      if (!source || source.parser !== 'eml' || source.parse_status !== 'parsed') return;
      const participants = await this.loadEmailBodySearchParticipants(
        input.tenantId,
        input.emailId,
      );
      const stored = await this.storageService.getByStorageUri(
        input.tenantId,
        source.raw_storage_uri,
      );
      const raw = decodeEmlRawContent(await streamToBuffer(stored.body));
      const bodyText = extractEmlTextBody(raw);
      const text = emailSearchText({
        bodyText,
        participants,
        subject: source.subject,
      });
      if (!text) return;

      await this.createEmailBodySearchDocument({
        ...input,
        participants,
        subject: source.subject,
        text,
      });
    } catch (error) {
      this.logger.warn({
        code: 'EMAIL_BODY_SEARCH_INDEX_FAILED',
        emailId: input.emailId,
        matterId: input.matterId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async isEmailBodySearchEnabled(tenantId: TenantId): Promise<boolean> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT settings_json->>'emailBodySearchEnabled' AS enabled
          FROM tenants
          WHERE tenant_id = $1
          LIMIT 1
        `,
        [tenantId],
      );
      const value = (result.rows[0] as { enabled?: string | null } | undefined)?.enabled;
      return value !== 'false';
    });
  }

  private async hasEmailBodyDocument(input: {
    tenantId: TenantId;
    emailId: string;
    matterId: string;
  }): Promise<boolean> {
    return this.auditService.transaction(input.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT 1
          FROM email_matter_filings
          WHERE tenant_id = $1
            AND email_id = $2
            AND matter_id = $3
            AND body_document_id IS NOT NULL
          LIMIT 1
        `,
        [input.tenantId, input.emailId, input.matterId],
      );
      return result.rowCount !== null && result.rowCount > 0;
    });
  }

  private async loadEmailBodySearchSource(
    tenantId: TenantId,
    emailId: string,
  ): Promise<EmailBodySearchSourceRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT e.email_id, e.parser, e.parse_status, e.subject,
            fo.storage_uri AS raw_storage_uri
          FROM email_messages e
          JOIN file_objects fo
            ON fo.tenant_id = e.tenant_id
            AND fo.file_object_id = e.raw_file_object_id
          WHERE e.tenant_id = $1
            AND e.email_id = $2
          LIMIT 1
        `,
        [tenantId, emailId],
      );
      return (result.rows[0] as EmailBodySearchSourceRow | undefined) ?? null;
    });
  }

  private async loadEmailBodySearchParticipants(
    tenantId: TenantId,
    emailId: string,
  ): Promise<EmailBodySearchParticipantRow[]> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT role, domain_ref, display_name
          FROM email_participants
          WHERE tenant_id = $1
            AND email_id = $2
          ORDER BY role ASC, domain_ref ASC
        `,
        [tenantId, emailId],
      );
      return result.rows as EmailBodySearchParticipantRow[];
    });
  }

  private async createEmailBodySearchDocument(input: {
    tenantId: TenantId;
    actorUserId: string;
    emailId: string;
    matterId: string;
    participants: readonly EmailBodySearchParticipantRow[];
    subject: string | null;
    text: string;
  }): Promise<void> {
    const documentService = this.documentService;
    const documentVersionService = this.documentVersionService;
    const searchIndexRepository = this.searchIndexRepository;
    if (!documentService || !documentVersionService || !searchIndexRepository) {
      return;
    }
    const documentId = randomUUID();
    const fileObjectId = randomUUID();
    const filename = emailBodyFilename(input.emailId);
    const body = Buffer.from(input.text, 'utf8');
    const sha256 = sha256Hex(body);
    const storage = await this.storageService.putTenantObject({
      tenantId: input.tenantId,
      matterId: input.matterId,
      documentId,
      fileObjectId,
      body,
      contentLength: body.length,
      contentType: 'text/plain',
    });
    try {
      await this.auditService.transaction(input.tenantId, async (tx) => {
        const alreadyLinked = await tx.query(
          `
            SELECT 1
            FROM email_matter_filings
            WHERE tenant_id = $1
              AND email_id = $2
              AND matter_id = $3
              AND body_document_id IS NOT NULL
            LIMIT 1
          `,
          [input.tenantId, input.emailId, input.matterId],
        );
        if (alreadyLinked.rowCount !== null && alreadyLinked.rowCount > 0) return;

        await documentService.createDraft(
          {
            documentId,
            tenantId: input.tenantId,
            matterId: input.matterId,
            documentFamilyId: initialDocumentFamilyId({ documentId }),
            title: emailBodyTitle(input.subject),
            documentType: 'email',
            subtype: 'email_body',
            confidentialityLevel: 'standard',
            privilegeStatus: 'none',
            aiAllowed: false,
            createdBy: input.actorUserId,
          },
          tx,
        );
        await this.fileObjectService.create(
          {
            fileObjectId,
            tenantId: input.tenantId,
            storageUri: storage.storageUri,
            originalFilename: filename,
            normalizedFilename: filename,
            mimeType: 'text/plain',
            sizeBytes: body.length,
            sha256,
            encryptionKeyId: storage.encryptionKeyId,
            sourceSystem: 'email_ingest',
            createdBy: input.actorUserId,
          },
          tx,
        );
        const version = await documentVersionService.createInitialVersion(
          {
            tenantId: input.tenantId,
            documentId,
            fileObjectId,
            fileHash: sha256,
            createdBy: input.actorUserId,
          },
          tx,
        );
        await this.auditService.log(
          documentUploadedAudit({
            tenantId: input.tenantId,
            actorId: input.actorUserId,
            documentId,
            matterId: input.matterId,
            versionId: version.versionId,
            hash: sha256,
          }),
          tx,
        );
        await tx.query(
          `
            INSERT INTO canonical_documents (
              tenant_id, version_id, body_text, extraction_status, extraction_method,
              confidence, failure_reason_code, extracted_at, updated_at
            )
            VALUES ($1, $2, $3, 'ready', 'email', 1, NULL, now(), now())
            ON CONFLICT (tenant_id, version_id)
            DO UPDATE SET
              body_text = EXCLUDED.body_text,
              extraction_status = 'ready',
              extraction_method = 'email',
              confidence = 1,
              failure_reason_code = NULL,
              extracted_at = now(),
              updated_at = now()
          `,
          [input.tenantId, version.versionId, input.text],
        );
        await this.auditService.log(
          {
            tenantId: input.tenantId,
            actorType: 'system',
            actorId: null,
            action: 'DOCUMENT_TEXT_EXTRACTED',
            targetType: 'document',
            targetId: documentId,
            matterId: input.matterId,
            metadata: {
              document_id: documentId,
              matter_id: input.matterId,
              version_id: version.versionId,
              extraction_status: 'ready',
              extraction_method: 'email',
              confidence: 1,
            },
          },
          tx,
        );
        await searchIndexRepository.upsertVersion(tx, {
          tenantId: input.tenantId,
          documentId,
          versionId: version.versionId,
        });
        await tx.query(
          `
            UPDATE email_matter_filings
            SET body_document_id = $4
            WHERE tenant_id = $1
              AND email_id = $2
              AND matter_id = $3
              AND body_document_id IS NULL
          `,
          [input.tenantId, input.emailId, input.matterId, documentId],
        );
      });
    } catch (error) {
      await this.compensateStorageObject(input.tenantId, storage.storageUri);
      throw error;
    }
  }

  private async assertCanUploadToMatter(
    tenantId: string,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    if (!this.permissionService) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    const decision = await this.permissionService.canUploadToMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect === 'ALLOW') return;
    if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') {
      throw new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
    }
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }

  private async emailExists(
    client: QueryClient,
    tenantId: string,
    emailId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM email_messages
        WHERE tenant_id = $1
          AND email_id = $2
        LIMIT 1
      `,
      [tenantId, emailId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async emailFilingExists(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    matterId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        SELECT 1
        FROM email_matter_filings
        WHERE tenant_id = $1
          AND email_id = $2
          AND matter_id = $3
        LIMIT 1
      `,
      [tenantId, emailId, matterId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async insertSuggestionFeedback(
    client: QueryClient,
    input: {
      tenantId: string;
      emailId: string;
      suggestedMatterId: string | null;
      selectedMatterId: string | null;
      actorUserId: string;
      action: 'accepted' | 'changed' | 'rejected' | 'undone';
      confidence: number | null;
      confidenceBand: EmailMatterSuggestionConfidenceBand | null;
      reasonCodes: readonly EmailMatterSuggestionReasonCode[];
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO email_suggestion_feedback (
          tenant_id, email_id, suggested_matter_id, selected_matter_id,
          action, confidence_band, confidence_score, reason_codes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9)
      `,
      [
        input.tenantId,
        input.emailId,
        input.suggestedMatterId,
        input.selectedMatterId,
        input.action,
        input.confidenceBand,
        input.confidence,
        [...input.reasonCodes],
        input.actorUserId,
      ],
    );
  }

  private async insertAutofileNotification(
    client: QueryClient,
    input: {
      tenantId: string;
      actorUserId: string;
      emailId: string;
      matterId: string;
      auditEventId: string;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id,
          recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        VALUES (
          $1, 'operational_data', 'email_autofile_completed', 'email', $2, $3,
          'user', $4::uuid, 'user:' || $4::uuid::text, 'unread', now(), $5, $5
        )
        ON CONFLICT (tenant_id, source, kind, target_type, target_id, recipient_key)
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          status = 'unread',
          read_by = NULL,
          read_at = NULL,
          dismissed_by = NULL,
          dismissed_at = NULL,
          updated_at = now()
      `,
      [input.tenantId, input.emailId, input.matterId, input.actorUserId, input.auditEventId],
    );
  }

  private async findRawEmailDownloadTarget(
    client: QueryClient,
    tenantId: string,
    emailId: string,
  ): Promise<RawEmailDownloadTargetRow | null> {
    const result = await client.query(
      `
        SELECT e.email_id, e.raw_file_object_id, e.raw_sha256, e.raw_size_bytes::text,
          fo.storage_uri, fo.normalized_filename, fo.mime_type
        FROM email_messages e
        JOIN file_objects fo
          ON fo.tenant_id = e.tenant_id
         AND fo.file_object_id = e.raw_file_object_id
        WHERE e.tenant_id = $1
          AND e.email_id = $2
        LIMIT 1
      `,
      [tenantId, emailId],
    );
    return (result.rows[0] as RawEmailDownloadTargetRow | undefined) ?? null;
  }

  private async findRawEmailLinkedDocuments(
    client: QueryClient,
    tenantId: string,
    emailId: string,
  ): Promise<RawEmailLinkedDocumentRow[]> {
    const result = await client.query(
      `
        SELECT edl.document_id, d.matter_id
        FROM email_document_links edl
        JOIN documents d
          ON d.tenant_id = edl.tenant_id
         AND d.document_id = edl.document_id
        WHERE edl.tenant_id = $1
          AND edl.email_id = $2
        ORDER BY edl.created_at ASC, edl.attachment_index ASC, edl.document_id ASC
      `,
      [tenantId, emailId],
    );
    return result.rows as RawEmailLinkedDocumentRow[];
  }

  private async assertCanDownloadRawEmail(
    tenantId: string,
    actorUserId: string,
    linkedDocuments: readonly RawEmailLinkedDocumentRow[],
    reasonCode?: string,
  ): Promise<string> {
    if (!this.permissionService) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    let ethicalWallBlocked = false;
    let documentLocked = false;
    let reasonRequired = false;
    for (const document of linkedDocuments) {
      try {
        const decision = await this.permissionService.canDownloadDocument(
          { tenantId, userId: actorUserId },
          document.document_id,
          reasonCode,
        );
        if (decision.effect === 'ALLOW') return document.matter_id;
        if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') ethicalWallBlocked = true;
        if (decision.reasonCode === 'DOCUMENT_LOCKED') documentLocked = true;
        if (decision.reasonCode === 'VALIDATION_FAILED') reasonRequired = true;
      } catch {
        this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId: document.document_id });
      }
    }
    if (documentLocked) {
      throw new BadRequestException({ code: 'DOCUMENT_LOCKED' });
    }
    if (reasonRequired) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        reason: 'DOWNLOAD_REASON_REQUIRED',
      });
    }
    if (ethicalWallBlocked) {
      throw new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
    }
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }

  private async findFilingRow(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    matterId: string,
  ): Promise<EmailMatterFilingRow | null> {
    const result = await client.query(
      `
        SELECT f.filing_id, f.tenant_id, f.email_id, f.matter_id,
          e.subject, e.sent_at, e.has_outside_participants,
          e.thread_id, e.conversation_id_hash, et.root_message_id_hash,
          m.matter_code, m.matter_name,
          nullif(m.metadata_json->>'domain', '') AS matter_domain,
          nullif(c.metadata_json->>'domain', '') AS client_domain,
          coalesce(
            array_agg(DISTINCT ep.domain_ref)
              FILTER (WHERE ep.domain_ref IS NOT NULL),
            ARRAY[]::text[]
          ) AS participant_domains,
          coalesce(
            (
              SELECT jsonb_agg(
                jsonb_build_object('class', class_counts.participant_class, 'count', class_counts.count)
                ORDER BY class_counts.participant_class
              )
              FROM (
                SELECT class_ep.participant_class, count(*)::int AS count
                FROM email_participants class_ep
                WHERE class_ep.tenant_id = e.tenant_id
                  AND class_ep.email_id = e.email_id
                GROUP BY class_ep.participant_class
              ) class_counts
            ),
            '[]'::jsonb
          ) AS participant_class_counts,
          e.message_id_hash, e.references_json,
          (
            SELECT count(DISTINCT related.email_id)::text
            FROM email_messages related
            WHERE related.tenant_id = e.tenant_id
              AND related.email_id <> e.email_id
              AND (
                related.message_id_hash IN (
                  SELECT jsonb_array_elements_text(e.references_json)
                )
                OR e.message_id_hash IN (
                  SELECT jsonb_array_elements_text(related.references_json)
                )
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(e.references_json) current_ref(ref)
                  JOIN jsonb_array_elements_text(related.references_json) related_ref(ref)
                    ON related_ref.ref = current_ref.ref
                )
                OR (
                  e.thread_id IS NOT NULL
                  AND related.thread_id = e.thread_id
                )
              )
          ) AS thread_related_count,
          f.created_by, f.created_at,
          coalesce(
            array_agg(DISTINCT edl.document_id::text)
              FILTER (WHERE edl.document_id IS NOT NULL),
            ARRAY[]::text[]
          ) AS document_ids
        FROM email_matter_filings f
        JOIN email_messages e
          ON e.tenant_id = f.tenant_id
         AND e.email_id = f.email_id
        JOIN matters m
          ON m.tenant_id = f.tenant_id
         AND m.matter_id = f.matter_id
        JOIN clients c
          ON c.tenant_id = m.tenant_id
         AND c.client_id = m.client_id
        LEFT JOIN email_threads et
          ON et.tenant_id = e.tenant_id
         AND et.thread_id = e.thread_id
        LEFT JOIN email_participants ep
          ON ep.tenant_id = e.tenant_id
         AND ep.email_id = e.email_id
        LEFT JOIN email_document_links edl
          ON edl.tenant_id = f.tenant_id
         AND edl.email_id = f.email_id
        WHERE f.tenant_id = $1
          AND f.email_id = $2
          AND f.matter_id = $3
        GROUP BY f.filing_id, f.tenant_id, f.email_id, f.matter_id,
          e.tenant_id, e.email_id, e.subject, e.sent_at, e.has_outside_participants,
          e.thread_id, e.conversation_id_hash, et.root_message_id_hash, e.message_id_hash,
          e.references_json, m.matter_code, m.matter_name, m.metadata_json,
          c.metadata_json, f.created_by, f.created_at
        LIMIT 1
      `,
      [tenantId, emailId, matterId],
    );
    return (result.rows[0] as EmailMatterFilingRow | undefined) ?? null;
  }

  private async emailSuggestionContext(
    client: QueryClient,
    tenantId: string,
    emailId: string,
  ): Promise<{
    subject: string | null;
    threadId: string | null;
    domains: string[];
    clientDomains: string[];
    opposingDomains: string[];
    senderAddressHashes: string[];
  } | null> {
    const email = await client.query(
      `
        SELECT subject, thread_id
        FROM email_messages
        WHERE tenant_id = $1
          AND email_id = $2
        LIMIT 1
      `,
      [tenantId, emailId],
    );
    const row = email.rows[0] as { subject: string | null; thread_id: string | null } | undefined;
    if (!row) return null;
    const participants = await client.query(
      `
        SELECT DISTINCT role, address_hash, domain_ref, participant_class
        FROM email_participants
        WHERE tenant_id = $1
          AND email_id = $2
        ORDER BY role, domain_ref, address_hash
        LIMIT 20
      `,
      [tenantId, emailId],
    );
    const participantRows = participants.rows as {
      role: 'from' | 'to' | 'cc';
      address_hash: string;
      domain_ref: string;
      participant_class: EmailParticipantClass;
    }[];
    return {
      subject: row.subject,
      threadId: row.thread_id,
      domains: uniqueLower(participantRows.map((participant) => participant.domain_ref)),
      clientDomains: uniqueLower(
        participantRows
          .filter((participant) => participant.participant_class === 'client')
          .map((participant) => participant.domain_ref),
      ),
      opposingDomains: uniqueLower(
        participantRows
          .filter((participant) => participant.participant_class === 'opposing')
          .map((participant) => participant.domain_ref),
      ),
      senderAddressHashes: [
        ...new Set(
          participantRows
            .filter((participant) => participant.role === 'from')
            .map((participant) => participant.address_hash),
        ),
      ],
    };
  }

  private async importAttachments(input: {
    tenantId: string;
    actorUserId: string | null;
    emailId: string;
    matterId: string | undefined;
    fields: UploadDocumentFieldsDto;
    attachments: readonly ParsedEmailAttachment[];
  }): Promise<void> {
    if (!input.matterId || input.attachments.length === 0) return;
    if (!input.actorUserId || !this.documentUploadService) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED' });
    }
    await this.assertCanUploadToMatter(input.tenantId, input.actorUserId, input.matterId);
    for (const attachment of input.attachments) {
      await this.scanAttachmentBeforeUpload({
        tenantId: input.tenantId,
        matterId: input.matterId,
        attachment,
      });
      if (quarantineIngressEnabled()) {
        if (!this.quarantineIntake) throw new BadRequestException({ code: 'VALIDATION_FAILED' });
        await this.quarantineIntake.intakeBuffer({
          actorUserId: input.actorUserId,
          matterId: input.matterId,
          fields: {
            title: input.fields.title ?? attachment.normalizedFilename,
            documentType: input.fields.documentType ?? 'correspondence',
            subtype: input.fields.subtype,
            confidentialityLevel: input.fields.confidentialityLevel,
            privilegeStatus: input.fields.privilegeStatus,
          },
          originalFilename: attachment.normalizedFilename,
          mimeType: attachment.contentType,
          body: attachment.body,
          sourceSystem: 'email_ingest',
        });
        continue;
      }
      const document = await this.documentUploadService.uploadBuffer({
        actorUserId: input.actorUserId,
        matterId: input.matterId,
        fields: {
          title: input.fields.title ?? attachment.normalizedFilename,
          documentType: input.fields.documentType ?? 'correspondence',
          subtype: input.fields.subtype,
          confidentialityLevel: input.fields.confidentialityLevel,
          privilegeStatus: input.fields.privilegeStatus,
        },
        originalFilename: attachment.normalizedFilename,
        mimeType: attachment.contentType,
        body: attachment.body,
        sourceSystem: 'email_ingest',
      });
      await this.insertEmailDocumentLink(input.tenantId, input.emailId, attachment, document);
    }
  }

  private async insertEmailDocumentLink(
    tenantId: string,
    emailId: string,
    attachment: ParsedEmailAttachment,
    document: UploadDocumentResponseDto,
  ): Promise<void> {
    await this.auditService.transaction(tenantId, async (tx) => {
      await tx.query(
        `
          INSERT INTO email_document_links (
            tenant_id, email_id, document_id, file_object_id, attachment_index,
            attachment_filename, media_type, size_bytes, sha256
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (tenant_id, email_id, attachment_index) DO NOTHING
        `,
        [
          tenantId,
          emailId,
          document.documentId,
          document.fileObjectId,
          attachment.attachmentIndex,
          attachment.normalizedFilename,
          attachment.mediaHint,
          attachment.sizeBytes,
          attachment.sha256,
        ],
      );
    });
  }

  private async scanAttachmentBeforeUpload(input: {
    tenantId: string;
    matterId: string;
    attachment: ParsedEmailAttachment;
  }): Promise<void> {
    const dlpService = this.dlpService;
    if (!dlpService) throw validationFailed();
    const sourceId = randomUUID();
    await this.auditService.transaction(input.tenantId, async (tx) => {
      await dlpService.scanAndRecord(tx, {
        tenantId: input.tenantId,
        sourceType: 'attachment',
        sourceId,
        matterId: input.matterId,
        text: decodeMimeTextBytes(input.attachment.body, input.attachment.charset),
      });
    });
  }

  private async canReadDocument(
    tenantId: string,
    actorUserId: string,
    documentId: string,
  ): Promise<boolean> {
    if (!this.permissionService) return false;
    try {
      const decision = await this.permissionService.canReadDocument(
        { tenantId, userId: actorUserId },
        documentId,
      );
      return decision.effect === 'ALLOW';
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId });
      return false;
    }
  }

  private async compensateStorageObject(tenantId: string, storageUri: string): Promise<void> {
    try {
      await this.storageService.deleteByStorageUri(tenantId, storageUri);
    } catch {
      this.logger.warn({ code: 'EMAIL_STORAGE_COMPENSATION_FAILED', storageUri });
    }
  }

  private async unlinkTempFile(file: UploadedDiskFile | undefined): Promise<void> {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch {
      this.logger.warn({ code: 'EMAIL_UPLOAD_TEMP_UNLINK_FAILED' });
    }
  }
}
