import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
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
import {
  EmlParseError,
  type EmailMatterWarningCode,
  type EmailMatterFilingDto,
  type EmailMatterSuggestionListDto,
  type EmailMatterSuggestionQueryDto,
  type EmailPrivilegeTagSuggestionDto,
  type EmailThreadSummaryDto,
  normalizeEmailMetadata,
  type EmailMetadataWarningCode,
  type EmailFailureReasonCode,
  type EmailMessageDto,
  type EmailParserKind,
  type EmailParseStatus,
  type EmailTimelineDto,
  type FileEmailToMatterDto,
  type UploadEmailToMatterFieldsDto,
  type UploadEmailToMatterResponseDto,
  type NormalizedEmailMetadata,
  type UploadDocumentFieldsDto,
  type UploadDocumentResponseDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { DocumentUploadService, type UploadedDiskFile } from '../document/document-upload.service';
import { DlpService } from '../dlp/dlp.service';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { PermissionService } from '../permission/permission.service';
import {
  emailDuplicateBlockedAudit,
  emailFiledAudit,
  emailImportedAudit,
  emailMetadataUpdatedAudit,
} from '../audit/events/email-events';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { extractEmlAttachments, type ParsedEmailAttachment } from './email-attachment.parser';

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
  reason_codes: readonly ('subject' | 'participant_domain')[];
  score: string;
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

interface PreparedEmailEnvelope {
  parser: EmailParserKind;
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
  constructor() {
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

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function extensionFromFilename(filename: string): string {
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
    rootMessageHash: references[0] ?? row.message_id_hash,
    directReferenceCount: references.length,
    relatedEmailCount: Number(row.thread_related_count),
    referenceHashes: references.slice(0, 10),
  };
}

function mapEmailRow(row: EmailMessageRow): EmailMessageDto {
  return {
    emailId: row.email_id,
    tenantId: row.tenant_id,
    rawFileObjectId: row.raw_file_object_id,
    parser: row.parser,
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
    privilegeTagSuggestion: privilegeTagSuggestion(row.subject),
    thread: threadSummary(row),
    documentIds: [...(row.document_ids ?? [])],
    filedBy: row.created_by,
    filedAt: row.created_at.toISOString(),
  };
}

function mapEmailMatterSuggestionRow(row: EmailMatterSuggestionRow) {
  return {
    matterId: row.matter_id,
    matterCode: row.matter_code,
    matterName: row.matter_name,
    clientId: row.client_id,
    reasonCodes: row.reason_codes,
    score: Number(row.score),
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
  ) {}

  async uploadRawEmailToMatter(
    actorUserId: string,
    matterId: string,
    fields: UploadEmailToMatterFieldsDto,
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
        tenantDomains: fields.tenantDomains ?? [],
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
    const prepared = this.prepareEnvelope({
      originalFilename,
      mimeType: input.mimeType,
      body,
      rawSha256,
      tenantDomains: input.tenantDomains ?? [],
    });

    const existing = await this.recordDuplicateIfExisting({
      tenantId,
      actorUserId: input.actorUserId ?? null,
      messageIdHash: prepared.messageIdHash,
    });
    if (existing) throw new EmailDuplicateMessageError();

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
        throw new EmailDuplicateMessageError();
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
        await this.recordDuplicateIfExisting({
          tenantId,
          actorUserId: input.actorUserId ?? null,
          messageIdHash: prepared.messageIdHash,
        });
        throw new EmailDuplicateMessageError();
      }
      throw error;
    }
  }

  private prepareEnvelope(input: {
    originalFilename: string;
    mimeType: string | null | undefined;
    body: Buffer;
    rawSha256: string;
    tenantDomains: readonly string[];
  }): PreparedEmailEnvelope {
    const { originalFilename, mimeType, body, rawSha256, tenantDomains } = input;
    const extension = extensionFromFilename(originalFilename);
    if (extension === 'msg') {
      return {
        parser: 'msg',
        parseStatus: 'pending_unsupported',
        failureReasonCode: 'UNSUPPORTED_MSG',
        messageIdHash: namespacedHash('email-raw-sha256', rawSha256),
        contentType: mimeType?.trim() || 'application/vnd.ms-outlook',
        metadata: null,
        attachments: [],
      };
    }

    try {
      const raw = body.toString('utf8');
      const parsed = normalizeEmailMetadata(raw, { tenantDomains });
      return {
        parser: 'eml',
        parseStatus: 'parsed',
        failureReasonCode: null,
        messageIdHash: namespacedHash('email-message-id', parsed.normalizedMessageId),
        contentType: mimeType?.trim() || 'message/rfc822',
        metadata: this.prepareMetadata(parsed),
        attachments: extractEmlAttachments(raw),
      };
    } catch (error) {
      const reasonCode = error instanceof EmlParseError ? error.reasonCode : 'MALFORMED_HEADERS';
      return {
        parser: 'eml',
        parseStatus: 'failed',
        failureReasonCode: reasonCode,
        messageIdHash: namespacedHash('email-raw-sha256', rawSha256),
        contentType: mimeType?.trim() || 'message/rfc822',
        metadata: null,
        attachments: [],
      };
    }
  }

  private prepareMetadata(metadata: NormalizedEmailMetadata): PreparedEmailMetadata {
    return {
      subject: metadata.subject,
      sentAt: metadata.sentAt,
      receivedAt: metadata.receivedAt,
      warningCode: metadata.warningCode,
      references: metadata.normalizedReferenceIds.map((reference) =>
        namespacedHash('email-reference-message-id', reference),
      ),
      participants: metadata.participants.map((participant) => ({
        role: participant.role,
        addressHash: namespacedHash('email-address', participant.normalizedAddress),
        domainRef: participant.domainRef,
        displayName: participant.displayName,
        isOutside: participant.isOutside,
      })),
      hasOutsideParticipants: metadata.hasOutsideParticipants,
    };
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
          parse_status, failure_reason_code, subject, sent_at, received_at,
          metadata_warning_code, references_json, has_outside_participants,
          raw_sha256, raw_size_bytes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16)
        RETURNING email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
          parse_status, failure_reason_code, subject, sent_at, received_at,
          metadata_warning_code, references_json, has_outside_participants,
          raw_sha256, raw_size_bytes::text, created_by, created_at
      `,
      [
        emailId,
        tenantId,
        rawFileObjectId,
        prepared.messageIdHash,
        prepared.parser,
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
            tenant_id, email_id, role, address_hash, domain_ref, display_name, is_outside
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
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
    await this.assertCanUploadToMatter(tenantId, actorUserId, input.matterId);

    return this.auditService.transaction(tenantId, async (tx) => {
      const emailExists = await this.emailExists(tx, tenantId, emailId);
      if (!emailExists) throw new NotFoundException({ code: 'PERMISSION_DENIED' });

      await tx.query(
        `
          INSERT INTO email_matter_filings (tenant_id, email_id, matter_id, created_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (tenant_id, email_id, matter_id) DO NOTHING
        `,
        [tenantId, emailId, input.matterId, actorUserId],
      );
      const row = await this.findFilingRow(tx, tenantId, emailId, input.matterId);
      if (!row) throw new Error('email matter filing returned no row');
      const documentIds = [...(row.document_ids ?? [])];
      await this.auditService.log(
        emailFiledAudit({
          tenantId,
          actorId: actorUserId,
          emailId,
          matterId: input.matterId,
          documentIds,
        }),
        tx,
      );
      return mapEmailMatterFilingRow(row);
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

    return this.auditService.transaction(tenantId, async (tx) => {
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
      const limitParam = params.push(query.limit);
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
              ) AS domain_match
            FROM matters m
            JOIN clients c
              ON c.tenant_id = m.tenant_id
             AND c.client_id = m.client_id
            WHERE m.tenant_id = $1
              AND ${permission.sql}
          )
          SELECT matter_id, matter_code, matter_name, client_id,
            array_remove(ARRAY[
              CASE WHEN subject_match THEN 'subject' END,
              CASE WHEN domain_match THEN 'participant_domain' END
            ], NULL) AS reason_codes,
            ((CASE WHEN subject_match THEN 70 ELSE 0 END)
              + (CASE WHEN domain_match THEN 30 ELSE 0 END))::text AS score
          FROM candidates
          WHERE subject_match OR domain_match
          ORDER BY ((CASE WHEN subject_match THEN 70 ELSE 0 END)
              + (CASE WHEN domain_match THEN 30 ELSE 0 END)) DESC,
            matter_code ASC,
            matter_id ASC
          LIMIT $${limitParam}
        `,
        params,
      );
      return {
        items: (result.rows as EmailMatterSuggestionRow[]).map(mapEmailMatterSuggestionRow),
      };
    });
  }

  async listMatterEmailTimeline(actorUserId: string, matterId: string): Promise<EmailTimelineDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const user = await this.userService?.findByTenantAndId(tenantId, actorUserId);
    const permissionQueryBuilder = this.permissionQueryBuilder;
    if (!user || user.status !== 'active' || !permissionQueryBuilder) return { items: [] };

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
          WHERE f.tenant_id = $1
            AND f.matter_id = $2
            AND ${permission.sql}
          GROUP BY f.filing_id, f.tenant_id, f.email_id, f.matter_id,
            e.tenant_id, e.email_id, e.subject, e.sent_at, e.has_outside_participants, e.message_id_hash,
            e.references_json, m.matter_code, m.matter_name, m.metadata_json,
            c.metadata_json, f.created_by, f.created_at
          ORDER BY f.created_at DESC, f.filing_id ASC
        `,
        params,
      );
      return { items: (result.rows as EmailMatterFilingRow[]).map(mapEmailMatterFilingRow) };
    });
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
          m.matter_code, m.matter_name,
          nullif(m.metadata_json->>'domain', '') AS matter_domain,
          nullif(c.metadata_json->>'domain', '') AS client_domain,
          coalesce(
            array_agg(DISTINCT ep.domain_ref)
              FILTER (WHERE ep.domain_ref IS NOT NULL),
            ARRAY[]::text[]
          ) AS participant_domains,
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
          e.tenant_id, e.email_id, e.subject, e.sent_at, e.has_outside_participants, e.message_id_hash,
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
  ): Promise<{ subject: string | null; domains: string[] } | null> {
    const email = await client.query(
      `
        SELECT subject
        FROM email_messages
        WHERE tenant_id = $1
          AND email_id = $2
        LIMIT 1
      `,
      [tenantId, emailId],
    );
    const row = email.rows[0] as { subject: string | null } | undefined;
    if (!row) return null;
    const participants = await client.query(
      `
        SELECT DISTINCT domain_ref
        FROM email_participants
        WHERE tenant_id = $1
          AND email_id = $2
        ORDER BY domain_ref
        LIMIT 20
      `,
      [tenantId, emailId],
    );
    const participantRows = participants.rows as { domain_ref: string }[];
    return {
      subject: row.subject,
      domains: participantRows.map((participant) => participant.domain_ref.toLowerCase()),
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
        text: input.attachment.body.toString('utf8'),
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
