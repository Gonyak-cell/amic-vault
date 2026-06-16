import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CreateOutlookSendFileRequestDto,
  EvaluateOutlookSendPolicyDto,
  MatterSuggestionQueryDto,
  OutlookAttachmentRefDto,
  OutlookDeniedReasonCode,
  OutlookFilingRequestStatus,
  OutlookSendFileRequestStatusDto,
  OutlookSendPolicyDecision,
  OutlookSendPolicyDecisionDto,
  OutlookSendWarningReasonCode,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { SearchService } from '../search/search.service';
import { TenantContextService } from '../tenant/tenant-context';
import {
  outlookSendFileDeniedAudit,
  outlookSendFileRequestedAudit,
  outlookSendPolicyEvaluatedAudit,
} from './outlook-audit.events';
import { OutlookOperationalGateService } from './outlook-operational-gate';

interface OutlookSendFilingRequestRow {
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
  request_kind: 'send_and_file';
  send_policy_decision: Exclude<OutlookSendPolicyDecision, 'block'>;
  send_warning_codes: OutlookSendWarningReasonCode[] | string | null;
  created_at: Date;
  updated_at: Date;
  duplicate?: boolean;
}

interface NormalizedSendPolicyInput {
  decisionId: string;
  mailboxFingerprintHash: string;
  canonicalMessageSha256: string;
  clientRequestIdHash: string;
  selectedAttachmentCount: number;
}

interface NormalizedSendFileInput extends NormalizedSendPolicyInput {
  requestId: string;
  outlookItemIdHash: string;
  internetMessageIdHash: string | null;
  conversationIdHash: string | null;
  attachmentSetHash: string;
  participantDomainHashCount: number;
  sentAt: string | null;
  receivedAt: string | null;
  idempotencyKeyHash: string;
}

interface SendPolicyEvaluation {
  normalized: NormalizedSendPolicyInput;
  decision: OutlookSendPolicyDecision;
  warningCodes: OutlookSendWarningReasonCode[];
  deniedReasonCode?: OutlookDeniedReasonCode;
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

function normalizePolicyInput(input: EvaluateOutlookSendPolicyDto): NormalizedSendPolicyInput {
  return {
    decisionId: randomUUID(),
    mailboxFingerprintHash: input.message.mailboxFingerprint,
    canonicalMessageSha256: input.message.canonicalMessageSha256,
    clientRequestIdHash: namespacedHash('outlook-send-policy-client-request', input.clientRequestId),
    selectedAttachmentCount: input.attachments.filter((attachment) => attachment.selectedForFiling)
      .length,
  };
}

function normalizeSendInput(input: CreateOutlookSendFileRequestDto): NormalizedSendFileInput {
  const policy = normalizePolicyInput(input);
  return {
    ...policy,
    requestId: randomUUID(),
    outlookItemIdHash: input.message.outlookItemIdHash,
    internetMessageIdHash: input.message.internetMessageIdHash ?? null,
    conversationIdHash: input.message.conversationIdHash ?? null,
    attachmentSetHash: attachmentSetHash(input.attachments),
    participantDomainHashCount: input.message.participantDomainHashes.length,
    sentAt: input.message.sentAt ?? null,
    receivedAt: input.message.receivedAt ?? null,
    idempotencyKeyHash: namespacedHash('outlook-send-file-idempotency', input.idempotencyKey),
  };
}

function warningCodesFromRow(
  value: OutlookSendFilingRequestRow['send_warning_codes'],
): OutlookSendWarningReasonCode[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      entry === 'no_matter' || entry === 'wrong_matter' || entry === 'external_recipient'
        ? [entry]
        : [],
    );
  }
  if (typeof value !== 'string') return [];
  return value
    .replace(/[{}"]/g, '')
    .split(',')
    .flatMap((entry) => {
      const trimmed = entry.trim();
      return trimmed === 'no_matter' ||
        trimmed === 'wrong_matter' ||
        trimmed === 'external_recipient'
        ? [trimmed]
        : [];
    });
}

function toSendStatusDto(row: OutlookSendFilingRequestRow): OutlookSendFileRequestStatusDto {
  return {
    id: row.request_id,
    status: row.status,
    matterId: row.matter_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.email_record_id ? { emailRecordId: row.email_record_id } : {}),
    filedAttachmentCount: Number(row.filed_attachment_count),
    ...(row.denied_reason_code ? { deniedReasonCode: row.denied_reason_code } : {}),
    requestKind: 'send_and_file',
    sendPolicyDecision: row.send_policy_decision,
    warningReasonCodes: warningCodesFromRow(row.send_warning_codes),
  };
}

@Injectable()
export class OutlookSendFileService {
  private readonly fallbackOperationalGate = new OutlookOperationalGateService();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(SearchService) private readonly searchService: SearchService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Optional()
    @Inject(OutlookOperationalGateService)
    private readonly operationalGate?: OutlookOperationalGateService,
  ) {}

  async evaluateSendPolicy(
    actorUserId: string,
    input: EvaluateOutlookSendPolicyDto,
  ): Promise<OutlookSendPolicyDecisionDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const normalized = normalizePolicyInput(input);

    if (!this.isOutlookFeatureAllowed('SMART_ALERTS')) {
      await this.recordPolicyEvaluation(tenantId, actorUserId, input.matterId ?? null, {
        normalized,
        decision: 'block',
        warningCodes: [],
        deniedReasonCode: 'integration_gate_closed',
      });
      throw permissionDenied();
    }

    const evaluation = await this.evaluatePolicyInternal(tenantId, actorUserId, input, normalized);
    await this.recordPolicyEvaluation(tenantId, actorUserId, input.matterId ?? null, evaluation);

    return {
      decisionId: normalized.decisionId,
      decision: evaluation.decision,
      sourceClient: input.sourceClient,
      ...(input.matterId ? { matterId: input.matterId } : {}),
      warningReasonCodes: evaluation.warningCodes,
      ...(evaluation.deniedReasonCode ? { deniedReasonCode: evaluation.deniedReasonCode } : {}),
      selectedAttachmentCount: normalized.selectedAttachmentCount,
    };
  }

  async createSendFileRequest(
    actorUserId: string,
    input: CreateOutlookSendFileRequestDto,
  ): Promise<OutlookSendFileRequestStatusDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const normalized = normalizeSendInput(input);

    if (!this.isOutlookFeatureAllowed('SEND_FILE')) {
      await this.recordSendDenied(
        tenantId,
        actorUserId,
        input.matterId,
        normalized,
        'integration_gate_closed',
      );
      throw permissionDenied();
    }
    if (!this.isOutlookFeatureAllowed('SMART_ALERTS')) {
      await this.recordSendDenied(
        tenantId,
        actorUserId,
        input.matterId,
        normalized,
        'integration_gate_closed',
      );
      throw permissionDenied();
    }

    const evaluation = await this.evaluateSendPolicy(actorUserId, input);
    if (evaluation.decision === 'block') {
      await this.recordSendDenied(
        tenantId,
        actorUserId,
        input.matterId,
        normalized,
        evaluation.deniedReasonCode ?? 'policy_denied',
        evaluation.decision,
        evaluation.warningReasonCodes,
      );
      throw permissionDenied();
    }
    const acceptedDecision: Exclude<OutlookSendPolicyDecision, 'block'> =
      evaluation.decision === 'allow' ? 'allow' : 'warn';

    const unacknowledged = evaluation.warningReasonCodes.filter(
      (code) => !input.acknowledgedWarningCodes.includes(code),
    );
    if (unacknowledged.length > 0) {
      await this.recordSendDenied(
        tenantId,
        actorUserId,
        input.matterId,
        normalized,
        'policy_denied',
        evaluation.decision,
        evaluation.warningReasonCodes,
      );
      throw permissionDenied();
    }

    if (!(await this.canUploadToMatter(tenantId, actorUserId, input.matterId))) {
      await this.recordSendDenied(
        tenantId,
        actorUserId,
        input.matterId,
        normalized,
        'permission_denied',
        evaluation.decision,
        evaluation.warningReasonCodes,
      );
      throw permissionDenied();
    }

    const row = await this.auditService.transaction(tenantId, async (tx) => {
      const inserted = await this.insertOrFindSendRequest(
        tx,
        tenantId,
        actorUserId,
        input,
        normalized,
        acceptedDecision,
        evaluation.warningReasonCodes,
      );
      if (!inserted.duplicate) {
        await this.insertAttachments(tx, tenantId, inserted.request_id, input.attachments);
      }
      await this.auditService.log(
        outlookSendFileRequestedAudit({
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
          policyDecision: acceptedDecision,
          warningCodes: evaluation.warningReasonCodes,
        }),
        tx,
      );
      return inserted;
    });

    return toSendStatusDto(row);
  }

  private isOutlookFeatureAllowed(feature: 'SMART_ALERTS' | 'SEND_FILE'): boolean {
    return (this.operationalGate ?? this.fallbackOperationalGate).isFeatureAllowed(feature);
  }

  private async evaluatePolicyInternal(
    tenantId: string,
    actorUserId: string,
    input: EvaluateOutlookSendPolicyDto,
    normalized: NormalizedSendPolicyInput,
  ): Promise<SendPolicyEvaluation> {
    const warningCodes = new Set<OutlookSendWarningReasonCode>();
    let deniedReasonCode: OutlookDeniedReasonCode | undefined;

    if (!input.matterId) {
      warningCodes.add('no_matter');
    } else if (!(await this.canUploadToMatter(tenantId, actorUserId, input.matterId))) {
      deniedReasonCode = 'permission_denied';
    }

    if (input.message.hasExternalParticipants) {
      warningCodes.add('external_recipient');
    }

    if (input.matterId && !deniedReasonCode) {
      const wrongMatter = await this.isProbablyWrongMatter(
        tenantId,
        actorUserId,
        input.matterId,
        input,
      );
      if (wrongMatter) warningCodes.add('wrong_matter');
    }

    return {
      normalized,
      decision: deniedReasonCode ? 'block' : warningCodes.size > 0 ? 'warn' : 'allow',
      warningCodes: [...warningCodes],
      ...(deniedReasonCode ? { deniedReasonCode } : {}),
    };
  }

  private async isProbablyWrongMatter(
    tenantId: string,
    actorUserId: string,
    matterId: string,
    input: EvaluateOutlookSendPolicyDto,
  ): Promise<boolean> {
    if (!input.subjectHash && input.message.participantDomainHashes.length === 0) return false;
    const query: MatterSuggestionQueryDto = {
      sourceClient: input.sourceClient,
      mailboxFingerprint: input.message.mailboxFingerprint,
      participantDomainHashes: input.message.participantDomainHashes,
      ...(input.subjectHash ? { subjectHash: input.subjectHash } : {}),
      ...(input.message.conversationIdHash
        ? { conversationIdHash: input.message.conversationIdHash }
        : {}),
      limit: 3,
    };
    const suggestions = await this.searchService.suggestMatters({ tenantId, userId: actorUserId }, query);
    if (suggestions.items.length === 0) return false;
    return !suggestions.items.some((suggestion) => suggestion.matterId === matterId);
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

  private async recordPolicyEvaluation(
    tenantId: string,
    actorUserId: string,
    matterId: string | null,
    evaluation: SendPolicyEvaluation,
  ): Promise<void> {
    await this.auditService.log(
      outlookSendPolicyEvaluatedAudit({
        tenantId,
        actorId: actorUserId,
        decisionId: evaluation.normalized.decisionId,
        matterId,
        mailboxFingerprintHash: evaluation.normalized.mailboxFingerprintHash,
        messageHash: evaluation.normalized.canonicalMessageSha256,
        attachmentCount: evaluation.normalized.selectedAttachmentCount,
        clientRequestHash: evaluation.normalized.clientRequestIdHash,
        decision: evaluation.decision,
        warningCodes: evaluation.warningCodes,
        ...(evaluation.deniedReasonCode
          ? { deniedReasonCode: evaluation.deniedReasonCode }
          : {}),
      }),
    );
  }

  private async recordSendDenied(
    tenantId: string,
    actorUserId: string,
    matterId: string,
    normalized: NormalizedSendFileInput,
    reasonCode: OutlookDeniedReasonCode,
    policyDecision?: OutlookSendPolicyDecision,
    warningCodes: readonly OutlookSendWarningReasonCode[] = [],
  ): Promise<void> {
    await this.auditService.log(
      outlookSendFileDeniedAudit({
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
        ...(policyDecision ? { policyDecision } : {}),
        warningCodes,
      }),
    );
  }

  private async insertOrFindSendRequest(
    tx: QueryClient,
    tenantId: string,
    actorUserId: string,
    input: CreateOutlookSendFileRequestDto,
    normalized: NormalizedSendFileInput,
    policyDecision: Exclude<OutlookSendPolicyDecision, 'block'>,
    warningCodes: readonly OutlookSendWarningReasonCode[],
  ): Promise<OutlookSendFilingRequestRow> {
    const result = await tx.query(
      `
        WITH inserted AS (
          INSERT INTO outlook_filing_requests (
            request_id, tenant_id, user_id, matter_id, mailbox_fingerprint_hash,
            outlook_item_id_hash, internet_message_id_hash, conversation_id_hash,
            canonical_message_sha256, attachment_set_hash, has_external_participants,
            participant_domain_hash_count, sent_at, received_at, source_client,
            client_request_id_hash, idempotency_key_hash, selected_attachment_count,
            request_kind, send_policy_decision, send_warning_codes
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, 'send_and_file', $19, $20::text[]
          )
          ON CONFLICT DO NOTHING
          RETURNING *, false AS duplicate
        ),
        existing AS (
          SELECT *, true AS duplicate
          FROM outlook_filing_requests
          WHERE tenant_id = $2
            AND user_id = $3
            AND request_kind = 'send_and_file'
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
        policyDecision,
        warningCodes,
      ],
    );
    const row = result.rows[0] as OutlookSendFilingRequestRow | undefined;
    if (!row) throw new Error('outlook send-and-file request insert returned no row');
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
}
