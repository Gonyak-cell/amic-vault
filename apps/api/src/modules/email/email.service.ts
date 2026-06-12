import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  EmlParseError,
  normalizeEmailMetadata,
  type EmailMetadataWarningCode,
  type EmailFailureReasonCode,
  type EmailMessageDto,
  type EmailParserKind,
  type EmailParseStatus,
  type NormalizedEmailMetadata,
  type UploadDocumentFieldsDto,
  type UploadDocumentResponseDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { DocumentUploadService } from '../document/document-upload.service';
import { PermissionService } from '../permission/permission.service';
import {
  emailDuplicateBlockedAudit,
  emailImportedAudit,
  emailMetadataUpdatedAudit,
} from '../audit/events/email-events';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';
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

function unsupportedFileType(): BadRequestException {
  return new BadRequestException({ code: 'UNSUPPORTED_FILE_TYPE' });
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
  ) {}

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
      const reasonCode =
        error instanceof EmlParseError ? error.reasonCode : 'MALFORMED_HEADERS';
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
    for (const attachment of input.attachments) {
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
}
