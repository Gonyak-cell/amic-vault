import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  CreateOutlookEmailFilingRequestDto,
  OutlookAttachmentRefDto,
  OutlookDeniedReasonCode,
  OutlookFilingRequestStatus,
  OutlookFilingRequestStatusDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import {
  outlookEmailFileCancelledAudit,
  outlookEmailFileDeniedAudit,
  outlookEmailFileRequestedAudit,
} from './outlook-audit.events';

interface OutlookFilingRequestRow {
  request_id: string;
  tenant_id: string;
  user_id: string;
  matter_id: string;
  mailbox_fingerprint_hash: string;
  canonical_message_sha256: string;
  attachment_set_hash: string;
  client_request_id_hash: string;
  idempotency_key_hash: string;
  selected_attachment_count: number | string;
  status: OutlookFilingRequestStatus;
  denied_reason_code: OutlookDeniedReasonCode | null;
  email_record_id: string | null;
  filed_attachment_count: number | string;
  created_at: Date;
  updated_at: Date;
  duplicate?: boolean;
}

interface NormalizedOutlookFilingInput {
  requestId: string;
  mailboxFingerprintHash: string;
  outlookItemIdHash: string;
  internetMessageIdHash: string | null;
  conversationIdHash: string | null;
  canonicalMessageSha256: string;
  attachmentSetHash: string;
  participantDomainHashCount: number;
  sentAt: string | null;
  receivedAt: string | null;
  clientRequestIdHash: string;
  idempotencyKeyHash: string;
  selectedAttachmentCount: number;
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function isOutlookAddinEnabled(): boolean {
  return process.env.OUTLOOK_ADDIN_ENABLED === 'true';
}

function attachmentSetHash(attachments: readonly OutlookAttachmentRefDto[]): string {
  const selected = attachments
    .filter((attachment) => attachment.selectedForFiling)
    .map((attachment) => ({
      attachmentIdHash: attachment.attachmentIdHash,
      contentIdHash: attachment.contentIdHash ?? null,
      ordinal: attachment.ordinal,
      sha256: attachment.sha256 ?? null,
      sizeBytes: attachment.sizeBytes,
    }))
    .sort((left, right) => left.ordinal - right.ordinal);
  return sha256Hex(JSON.stringify(selected));
}

function normalizeInput(input: CreateOutlookEmailFilingRequestDto): NormalizedOutlookFilingInput {
  return {
    requestId: randomUUID(),
    mailboxFingerprintHash: input.message.mailboxFingerprint,
    outlookItemIdHash: input.message.outlookItemIdHash,
    internetMessageIdHash: input.message.internetMessageIdHash ?? null,
    conversationIdHash: input.message.conversationIdHash ?? null,
    canonicalMessageSha256: input.message.canonicalMessageSha256,
    attachmentSetHash: attachmentSetHash(input.attachments),
    participantDomainHashCount: input.message.participantDomainHashes.length,
    sentAt: input.message.sentAt ?? null,
    receivedAt: input.message.receivedAt ?? null,
    clientRequestIdHash: namespacedHash('outlook-client-request', input.clientRequestId),
    idempotencyKeyHash: namespacedHash('outlook-idempotency', input.idempotencyKey),
    selectedAttachmentCount: input.attachments.filter((attachment) => attachment.selectedForFiling)
      .length,
  };
}

function toStatusDto(row: OutlookFilingRequestRow): OutlookFilingRequestStatusDto {
  return {
    id: row.request_id,
    status: row.status,
    matterId: row.matter_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.email_record_id ? { emailRecordId: row.email_record_id } : {}),
    filedAttachmentCount: Number(row.filed_attachment_count),
    ...(row.denied_reason_code ? { deniedReasonCode: row.denied_reason_code } : {}),
  };
}

@Injectable()
export class OutlookService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async createFilingRequest(
    actorUserId: string,
    input: CreateOutlookEmailFilingRequestDto,
  ): Promise<OutlookFilingRequestStatusDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const normalized = normalizeInput(input);

    if (!isOutlookAddinEnabled()) {
      await this.recordDenied(
        tenantId,
        actorUserId,
        input.matterId,
        normalized,
        'integration_gate_closed',
      );
      throw permissionDenied();
    }

    const allowed = await this.canUploadToMatter(tenantId, actorUserId, input.matterId);
    if (!allowed) {
      await this.recordDenied(
        tenantId,
        actorUserId,
        input.matterId,
        normalized,
        'permission_denied',
      );
      throw permissionDenied();
    }

    const row = await this.auditService.transaction(tenantId, async (tx) => {
      const inserted = await this.insertOrFindRequest(tx, tenantId, actorUserId, input, normalized);
      if (!inserted.duplicate) {
        await this.insertAttachments(tx, tenantId, inserted.request_id, input.attachments);
      }
      await this.auditService.log(
        outlookEmailFileRequestedAudit({
          tenantId,
          actorId: actorUserId,
          requestId: inserted.request_id,
          matterId: inserted.matter_id,
          mailboxFingerprintHash: inserted.mailbox_fingerprint_hash,
          messageHash: inserted.canonical_message_sha256,
          attachmentCount: normalized.selectedAttachmentCount,
          idempotencyHash: inserted.idempotency_key_hash,
          clientRequestHash: inserted.client_request_id_hash,
          status: inserted.status,
          duplicate: Boolean(inserted.duplicate),
        }),
        tx,
      );
      return inserted;
    });

    return toStatusDto(row);
  }

  async getFilingRequestStatus(
    actorUserId: string,
    requestId: string,
  ): Promise<OutlookFilingRequestStatusDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const row = await this.findAuthorizedRequest(tenantId, actorUserId, requestId);
    return toStatusDto(row);
  }

  async cancelFilingRequest(
    actorUserId: string,
    requestId: string,
  ): Promise<OutlookFilingRequestStatusDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const row = await this.findAuthorizedRequest(tenantId, actorUserId, requestId);
    if (row.status === 'cancelled') return toStatusDto(row);
    if (row.status !== 'queued' && row.status !== 'processing') throw validationFailed();

    const updated = await this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          UPDATE outlook_filing_requests
          SET status = 'cancelled',
            denied_reason_code = 'cancelled',
            updated_at = now()
          WHERE tenant_id = $1
            AND request_id = $2
            AND user_id = $3
            AND status IN ('queued', 'processing')
          RETURNING *
        `,
        [tenantId, requestId, actorUserId],
      );
      const updatedRow = result.rows[0] as OutlookFilingRequestRow | undefined;
      if (!updatedRow) throw permissionDenied();
      await this.auditService.log(
        outlookEmailFileCancelledAudit({
          tenantId,
          actorId: actorUserId,
          requestId: updatedRow.request_id,
          matterId: updatedRow.matter_id,
          mailboxFingerprintHash: updatedRow.mailbox_fingerprint_hash,
          messageHash: updatedRow.canonical_message_sha256,
          attachmentCount: Number(updatedRow.selected_attachment_count),
          idempotencyHash: updatedRow.idempotency_key_hash,
          clientRequestHash: updatedRow.client_request_id_hash,
          statusBefore: row.status,
        }),
        tx,
      );
      return updatedRow;
    });
    return toStatusDto(updated);
  }

  private async canUploadToMatter(
    tenantId: string,
    actorUserId: string,
    matterId: string,
  ): Promise<boolean> {
    try {
      const decision = await this.permissionService.canUploadToMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
      return decision.effect === 'ALLOW';
    } catch {
      return false;
    }
  }

  private async canReadMatter(
    tenantId: string,
    actorUserId: string,
    matterId: string,
  ): Promise<boolean> {
    try {
      const decision = await this.permissionService.canReadMatter(
        { tenantId, userId: actorUserId },
        matterId,
      );
      return decision.effect === 'ALLOW';
    } catch {
      return false;
    }
  }

  private async recordDenied(
    tenantId: string,
    actorUserId: string,
    matterId: string,
    normalized: NormalizedOutlookFilingInput,
    reasonCode: OutlookDeniedReasonCode,
  ): Promise<void> {
    await this.auditService.log(
      outlookEmailFileDeniedAudit({
        tenantId,
        actorId: actorUserId,
        requestId: normalized.requestId,
        matterId,
        mailboxFingerprintHash: normalized.mailboxFingerprintHash,
        messageHash: normalized.canonicalMessageSha256,
        attachmentCount: normalized.selectedAttachmentCount,
        idempotencyHash: normalized.idempotencyKeyHash,
        clientRequestHash: normalized.clientRequestIdHash,
        reasonCode,
      }),
    );
  }

  private async insertOrFindRequest(
    tx: QueryClient,
    tenantId: string,
    actorUserId: string,
    input: CreateOutlookEmailFilingRequestDto,
    normalized: NormalizedOutlookFilingInput,
  ): Promise<OutlookFilingRequestRow> {
    const result = await tx.query(
      `
        WITH inserted AS (
          INSERT INTO outlook_filing_requests (
            request_id, tenant_id, user_id, matter_id, mailbox_fingerprint_hash,
            outlook_item_id_hash, internet_message_id_hash, conversation_id_hash,
            canonical_message_sha256, attachment_set_hash, has_external_participants,
            participant_domain_hash_count, sent_at, received_at, source_client,
            client_request_id_hash, idempotency_key_hash, selected_attachment_count
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18
          )
          ON CONFLICT DO NOTHING
          RETURNING *, false AS duplicate
        ),
        existing AS (
          SELECT *, true AS duplicate
          FROM outlook_filing_requests
          WHERE tenant_id = $2
            AND user_id = $3
            AND request_kind = 'manual_file'
            AND (
              idempotency_key_hash = $17
              OR client_request_id_hash = $16
              OR (
                mailbox_fingerprint_hash = $5
                AND matter_id = $4
                AND canonical_message_sha256 = $9
                AND attachment_set_hash = $10
              )
            )
          ORDER BY created_at ASC, request_id ASC
          LIMIT 1
        )
        SELECT * FROM inserted
        UNION ALL
        SELECT * FROM existing
        WHERE NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1
      `,
      [
        normalized.requestId,
        tenantId,
        actorUserId,
        input.matterId,
        normalized.mailboxFingerprintHash,
        normalized.outlookItemIdHash,
        normalized.internetMessageIdHash,
        normalized.conversationIdHash,
        normalized.canonicalMessageSha256,
        normalized.attachmentSetHash,
        input.message.hasExternalParticipants,
        normalized.participantDomainHashCount,
        normalized.sentAt,
        normalized.receivedAt,
        input.sourceClient,
        normalized.clientRequestIdHash,
        normalized.idempotencyKeyHash,
        normalized.selectedAttachmentCount,
      ],
    );
    const row = result.rows[0] as OutlookFilingRequestRow | undefined;
    if (!row) throw new Error('outlook filing request insert returned no row');
    return row;
  }

  private async insertAttachments(
    tx: QueryClient,
    tenantId: string,
    requestId: string,
    attachments: readonly OutlookAttachmentRefDto[],
  ): Promise<void> {
    for (const attachment of attachments) {
      await tx.query(
        `
          INSERT INTO outlook_filing_request_attachments (
            tenant_id, request_id, attachment_id_hash, content_id_hash, ordinal,
            size_bytes, sha256, mime_type, selected_for_filing
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          tenantId,
          requestId,
          attachment.attachmentIdHash,
          attachment.contentIdHash ?? null,
          attachment.ordinal,
          attachment.sizeBytes,
          attachment.sha256 ?? null,
          attachment.mimeType ?? null,
          attachment.selectedForFiling,
        ],
      );
    }
  }

  private async findAuthorizedRequest(
    tenantId: string,
    actorUserId: string,
    requestId: string,
  ): Promise<OutlookFilingRequestRow> {
    const row = await this.findRequest(tenantId, requestId);
    if (!row || row.user_id !== actorUserId) throw permissionDenied();
    if (!(await this.canReadMatter(tenantId, actorUserId, row.matter_id))) throw permissionDenied();
    return row;
  }

  private async findRequest(
    tenantId: string,
    requestId: string,
  ): Promise<OutlookFilingRequestRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT *
          FROM outlook_filing_requests
          WHERE tenant_id = $1
            AND request_id = $2
          LIMIT 1
        `,
        [tenantId, requestId],
      );
      return (result.rows[0] as OutlookFilingRequestRow | undefined) ?? null;
    });
  }
}
