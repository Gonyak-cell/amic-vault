import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  EmlParseError,
  parseEmlEnvelope,
  type EmailFailureReasonCode,
  type EmailMessageDto,
  type EmailParserKind,
  type EmailParseStatus,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  emailDuplicateBlockedAudit,
  emailImportedAudit,
} from '../audit/events/email-events';
import { FileObjectService } from '../storage/file-object.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from '../tenant/tenant-context';

export interface ImportRawEmailInput {
  tenantId?: string;
  actorUserId?: string | null;
  originalFilename: string;
  mimeType?: string | null;
  body: Buffer;
}

interface EmailMessageRow {
  email_id: string;
  tenant_id: string;
  raw_file_object_id: string;
  message_id_hash: string;
  parser: EmailParserKind;
  parse_status: EmailParseStatus;
  failure_reason_code: EmailFailureReasonCode | null;
  raw_sha256: string;
  raw_size_bytes: string;
  created_by: string | null;
  created_at: Date;
}

interface ExistingEmailRow {
  email_id: string;
}

interface PreparedEmailEnvelope {
  parser: EmailParserKind;
  parseStatus: EmailParseStatus;
  failureReasonCode: EmailFailureReasonCode | null;
  messageIdHash: string;
  contentType: string;
}

type ImportTransactionResult =
  | { kind: 'imported'; email: EmailMessageDto }
  | { kind: 'duplicate'; emailId: string };

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
    messageIdHash: row.message_id_hash,
    rawSha256: row.raw_sha256,
    rawSizeBytes: Number(row.raw_size_bytes),
    createdBy: row.created_by,
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
  ) {}

  async importRawEmail(input: ImportRawEmailInput): Promise<EmailMessageDto> {
    const tenantId = input.tenantId ?? this.tenantContext.require().tenantId;
    const body = Buffer.from(input.body);
    const rawSha256 = sha256Hex(body);
    const originalFilename = normalizeFilename(input.originalFilename, 'message.eml');
    const prepared = this.prepareEnvelope(originalFilename, input.mimeType, body, rawSha256);

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
          return { kind: 'imported', email };
        },
      );

      if (result.kind === 'duplicate') {
        await this.compensateStorageObject(tenantId, storage.storageUri);
        storageCompensated = true;
        throw new EmailDuplicateMessageError();
      }
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

  private prepareEnvelope(
    originalFilename: string,
    mimeType: string | null | undefined,
    body: Buffer,
    rawSha256: string,
  ): PreparedEmailEnvelope {
    const extension = extensionFromFilename(originalFilename);
    if (extension === 'msg') {
      return {
        parser: 'msg',
        parseStatus: 'pending_unsupported',
        failureReasonCode: 'UNSUPPORTED_MSG',
        messageIdHash: namespacedHash('email-raw-sha256', rawSha256),
        contentType: mimeType?.trim() || 'application/vnd.ms-outlook',
      };
    }

    try {
      const parsed = parseEmlEnvelope(body.toString('utf8'));
      return {
        parser: 'eml',
        parseStatus: 'parsed',
        failureReasonCode: null,
        messageIdHash: namespacedHash('email-message-id', parsed.normalizedMessageId),
        contentType: mimeType?.trim() || 'message/rfc822',
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
      };
    }
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
          parse_status, failure_reason_code, raw_sha256, raw_size_bytes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING email_id, tenant_id, raw_file_object_id, message_id_hash, parser,
          parse_status, failure_reason_code, raw_sha256, raw_size_bytes::text, created_by, created_at
      `,
      [
        emailId,
        tenantId,
        rawFileObjectId,
        prepared.messageIdHash,
        prepared.parser,
        prepared.parseStatus,
        prepared.failureReasonCode,
        rawSha256,
        rawSizeBytes,
        actorUserId,
      ],
    );
    const row = result.rows[0] as EmailMessageRow | undefined;
    if (!row) throw new Error('email message insert returned no row');
    return mapEmailRow(row);
  }

  private async compensateStorageObject(tenantId: string, storageUri: string): Promise<void> {
    try {
      await this.storageService.deleteByStorageUri(tenantId, storageUri);
    } catch {
      this.logger.warn({ code: 'EMAIL_STORAGE_COMPENSATION_FAILED', storageUri });
    }
  }
}
