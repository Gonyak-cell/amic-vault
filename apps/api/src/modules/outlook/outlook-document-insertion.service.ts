import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type {
  CreateOutlookDocumentInsertionDto,
  OutlookDocumentInsertionDeniedReasonCode,
  OutlookDocumentInsertionDto,
  OutlookDocumentInsertionMode,
  OutlookDocumentInsertionStatus,
  PermissionDecision,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { DocumentPermissionService } from '../permission/document-permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import {
  outlookDocumentInsertDeniedAudit,
  outlookDocumentInsertRequestedAudit,
} from './outlook-audit.events';
import { OutlookOperationalGateService } from './outlook-operational-gate';

interface NormalizedDocumentInsertionInput {
  insertionId: string;
  mailboxFingerprintHash: string;
  outlookItemIdHash: string;
  canonicalMessageSha256: string;
  clientRequestIdHash: string;
  idempotencyKeyHash: string;
}

interface DocumentInsertionTargetRow {
  document_id: string;
  version_id: string;
  matter_id: string;
  document_status: string;
  matter_status: string;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
  active_legal_hold: boolean;
  active_disposal_request: boolean;
}

interface OutlookDocumentInsertionRow {
  insertion_id: string;
  tenant_id: string;
  user_id: string;
  document_id: string;
  version_id: string;
  mailbox_fingerprint_hash: string;
  canonical_message_sha256: string;
  insertion_mode: OutlookDocumentInsertionMode;
  status: OutlookDocumentInsertionStatus;
  denied_reason_code: OutlookDocumentInsertionDeniedReasonCode | null;
  source_client: 'outlook-web-addin';
  client_request_id_hash: string;
  idempotency_key_hash: string;
  created_at: Date;
  updated_at: Date;
  duplicate?: boolean;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function documentLocked(): BadRequestException {
  return new BadRequestException({ code: 'DOCUMENT_LOCKED' });
}

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function normalizeInput(input: CreateOutlookDocumentInsertionDto): NormalizedDocumentInsertionInput {
  return {
    insertionId: randomUUID(),
    mailboxFingerprintHash: input.targetMessage.mailboxFingerprint,
    outlookItemIdHash: input.targetMessage.outlookItemIdHash,
    canonicalMessageSha256: input.targetMessage.canonicalMessageSha256,
    clientRequestIdHash: namespacedHash('outlook-document-insert-client-request', input.clientRequestId),
    idempotencyKeyHash: namespacedHash('outlook-document-insert-idempotency', input.idempotencyKey),
  };
}

function internalReferenceValue(documentId: string, versionId: string): string {
  return `amic-vault://documents/${documentId}/versions/${versionId}`;
}

function toDto(row: OutlookDocumentInsertionRow): OutlookDocumentInsertionDto {
  return {
    insertionId: row.insertion_id,
    status: row.status,
    documentId: row.document_id,
    versionId: row.version_id,
    insertionMode: row.insertion_mode,
    sourceClient: row.source_client,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.status === 'ready'
      ? { internalReference: internalReferenceValue(row.document_id, row.version_id) }
      : {}),
    ...(row.denied_reason_code ? { deniedReasonCode: row.denied_reason_code } : {}),
  };
}

@Injectable()
export class OutlookDocumentInsertionService {
  private readonly logger = new Logger(OutlookDocumentInsertionService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentPermissionService)
    private readonly documentPermissionService: Pick<DocumentPermissionService, 'canReadDocument'>,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Optional()
    @Inject(OutlookOperationalGateService)
    private readonly operationalGate?: OutlookOperationalGateService,
  ) {}

  private readonly fallbackOperationalGate = new OutlookOperationalGateService();

  async createDocumentInsertion(
    actorUserId: string,
    input: CreateOutlookDocumentInsertionDto,
  ): Promise<OutlookDocumentInsertionDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const normalized = normalizeInput(input);

    if (!this.isOutlookFeatureAllowed()) {
      await this.recordDenied(tenantId, actorUserId, input, normalized, 'integration_gate_closed');
      throw permissionDenied();
    }

    const target = await this.findInsertionTarget(tenantId, input.documentId, input.versionId);
    if (!target) {
      await this.recordDenied(tenantId, actorUserId, input, normalized, 'permission_denied');
      throw permissionDenied();
    }

    if (!(await this.canReadDocument(tenantId, actorUserId, input.documentId))) {
      await this.recordDenied(tenantId, actorUserId, input, normalized, 'permission_denied', target);
      throw permissionDenied();
    }

    if (this.isRecordsLocked(target)) {
      await this.recordDenied(tenantId, actorUserId, input, normalized, 'document_locked', target);
      throw documentLocked();
    }

    if (input.hasExternalRecipients || input.targetMessage.hasExternalParticipants) {
      await this.recordDenied(tenantId, actorUserId, input, normalized, 'policy_denied', target);
      throw permissionDenied();
    }

    if (input.insertionMode !== 'internal-reference') {
      await this.recordDenied(tenantId, actorUserId, input, normalized, 'policy_denied', target);
      throw permissionDenied();
    }

    const row = await this.auditService.transaction(tenantId, async (tx) => {
      const inserted = await this.insertOrFindInsertion(
        tx,
        tenantId,
        actorUserId,
        input,
        normalized,
        target,
      );
      await this.auditService.log(
        outlookDocumentInsertRequestedAudit({
          tenantId,
          actorId: actorUserId,
          insertionId: inserted.insertion_id,
          matterId: target.matter_id,
          documentId: inserted.document_id,
          versionId: inserted.version_id,
          mailboxFingerprintHash: inserted.mailbox_fingerprint_hash,
          messageHash: inserted.canonical_message_sha256,
          idempotencyHash: inserted.idempotency_key_hash,
          clientRequestHash: inserted.client_request_id_hash,
          insertionMode: inserted.insertion_mode,
          status: 'ready',
          duplicate: Boolean(inserted.duplicate),
        }),
        tx,
      );
      return inserted;
    });

    return toDto(row);
  }

  private isOutlookFeatureAllowed(): boolean {
    return (this.operationalGate ?? this.fallbackOperationalGate).isFeatureAllowed(
      'DOCUMENT_INSERTION',
    );
  }

  private isRecordsLocked(target: DocumentInsertionTargetRow): boolean {
    return (
      target.document_status === 'deleted' ||
      target.document_status === 'disposal_locked' ||
      target.matter_status === 'disposal_review' ||
      target.document_legal_hold ||
      target.matter_legal_hold ||
      target.active_legal_hold ||
      target.active_disposal_request
    );
  }

  private async canReadDocument(
    tenantId: string,
    actorUserId: string,
    documentId: string,
  ): Promise<boolean> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.documentPermissionService.canReadDocument(
        { tenantId, userId: actorUserId },
        documentId,
      );
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId });
    }
    return decision?.effect === 'ALLOW';
  }

  private async recordDenied(
    tenantId: string,
    actorUserId: string,
    input: CreateOutlookDocumentInsertionDto,
    normalized: NormalizedDocumentInsertionInput,
    reasonCode: OutlookDocumentInsertionDeniedReasonCode,
    target?: DocumentInsertionTargetRow,
  ): Promise<void> {
    const versionId = target?.version_id ?? input.versionId;

    await this.auditService.log(
      outlookDocumentInsertDeniedAudit({
        tenantId,
        actorId: actorUserId,
        insertionId: normalized.insertionId,
        matterId: target?.matter_id ?? null,
        documentId: input.documentId,
        ...(versionId ? { versionId } : {}),
        mailboxFingerprintHash: normalized.mailboxFingerprintHash,
        messageHash: normalized.canonicalMessageSha256,
        idempotencyHash: normalized.idempotencyKeyHash,
        clientRequestHash: normalized.clientRequestIdHash,
        insertionMode: input.insertionMode,
        reasonCode,
      }),
    );
  }

  private async findInsertionTarget(
    tenantId: string,
    documentId: string,
    versionId?: string,
  ): Promise<DocumentInsertionTargetRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT
            d.document_id,
            dv.version_id,
            d.matter_id,
            d.status AS document_status,
            m.status AS matter_status,
            d.legal_hold AS document_legal_hold,
            m.legal_hold AS matter_legal_hold,
            EXISTS (
              SELECT 1
              FROM legal_holds lh
              WHERE lh.tenant_id = d.tenant_id
                AND lh.status = 'active'
                AND (
                  lh.document_id = d.document_id
                  OR (lh.document_id IS NULL AND lh.matter_id = d.matter_id)
                )
            ) AS active_legal_hold,
            EXISTS (
              SELECT 1
              FROM disposal_requests dr
              WHERE dr.tenant_id = d.tenant_id
                AND dr.document_id = d.document_id
                AND dr.status IN ('requested', 'approved')
            ) AS active_disposal_request
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND (
             ($3::uuid IS NULL AND dv.version_status = 'current')
             OR ($3::uuid IS NOT NULL AND dv.version_id = $3::uuid)
           )
          WHERE d.tenant_id = $1
            AND d.document_id = $2
          LIMIT 1
        `,
        [tenantId, documentId, versionId ?? null],
      );
      return (result.rows[0] as DocumentInsertionTargetRow | undefined) ?? null;
    });
  }

  private async insertOrFindInsertion(
    tx: QueryClient,
    tenantId: string,
    actorUserId: string,
    input: CreateOutlookDocumentInsertionDto,
    normalized: NormalizedDocumentInsertionInput,
    target: DocumentInsertionTargetRow,
  ): Promise<OutlookDocumentInsertionRow> {
    const result = await tx.query(
      `
        WITH inserted AS (
          INSERT INTO outlook_document_insertions (
            insertion_id, tenant_id, user_id, document_id, version_id,
            mailbox_fingerprint_hash, outlook_item_id_hash, canonical_message_sha256,
            has_external_recipients, insertion_mode, status, source_client,
            client_request_id_hash, idempotency_key_hash
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ready', $11, $12, $13
          )
          ON CONFLICT DO NOTHING
          RETURNING *, false AS duplicate
        ),
        existing AS (
          SELECT *, true AS duplicate
          FROM outlook_document_insertions
          WHERE tenant_id = $2
            AND user_id = $3
            AND (
              idempotency_key_hash = $13
              OR client_request_id_hash = $12
              OR (
                document_id = $4
                AND version_id = $5
                AND canonical_message_sha256 = $8
                AND insertion_mode = $10
              )
            )
          ORDER BY created_at ASC, insertion_id ASC
          LIMIT 1
        )
        SELECT * FROM inserted
        UNION ALL
        SELECT * FROM existing
        WHERE NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1
      `,
      [
        normalized.insertionId,
        tenantId,
        actorUserId,
        input.documentId,
        target.version_id,
        normalized.mailboxFingerprintHash,
        normalized.outlookItemIdHash,
        normalized.canonicalMessageSha256,
        input.hasExternalRecipients,
        input.insertionMode,
        input.sourceClient,
        normalized.clientRequestIdHash,
        normalized.idempotencyKeyHash,
      ],
    );
    const row = result.rows[0] as OutlookDocumentInsertionRow | undefined;
    if (!row) throw new Error('outlook document insertion insert returned no row');
    return row;
  }
}
