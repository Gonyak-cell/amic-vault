import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CreateOutlookFolderMappingDto,
  OutlookAutofileDeniedReasonCode,
  OutlookAutofileJobDto,
  OutlookAutofileJobStatus,
  OutlookFolderMappingApprovalStatus,
  OutlookFolderMappingDeniedReasonCode,
  OutlookFolderMappingDto,
  OutlookFolderMappingMode,
  OutlookItemRefDto,
  UpdateOutlookFolderMappingDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import {
  outlookAutofileJobRecordedAudit,
  outlookFolderMappingChangedAudit,
  outlookFolderMappingDeniedAudit,
} from './outlook-audit.events';
import { OutlookOperationalGateService } from './outlook-operational-gate';

interface OutlookFolderMappingRow {
  mapping_id: string;
  tenant_id: string;
  user_id: string;
  matter_id: string;
  mailbox_fingerprint_hash: string;
  folder_ref_hash: string;
  folder_path_hash: string | null;
  mapping_mode: OutlookFolderMappingMode;
  approval_status: OutlookFolderMappingApprovalStatus;
  requested_auto_file: boolean;
  auto_file_enabled: boolean;
  denied_reason_code: OutlookFolderMappingDeniedReasonCode | null;
  source_client: 'outlook-web-addin';
  client_request_id_hash: string;
  idempotency_key_hash: string;
  approval_actor_id: string | null;
  approved_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
  duplicate?: boolean;
}

interface OutlookAutofileJobRow {
  job_id: string;
  tenant_id: string;
  mapping_id: string;
  user_id: string;
  matter_id: string;
  mailbox_fingerprint_hash: string;
  folder_ref_hash: string;
  canonical_message_sha256: string;
  dedupe_hash: string;
  expected_matter_id: string | null;
  status: OutlookAutofileJobStatus;
  denied_reason_code: OutlookAutofileDeniedReasonCode | null;
  retry_count: number | string;
  next_retry_at: Date | null;
  client_request_id_hash: string;
  idempotency_key_hash: string;
  created_at: Date;
  updated_at: Date;
  duplicate?: boolean;
}

interface NormalizedFolderMappingInput {
  mappingId: string;
  clientRequestIdHash: string;
  idempotencyKeyHash: string;
  approvalStatus: OutlookFolderMappingApprovalStatus;
}

interface NormalizedAutofileJobInput {
  jobId: string;
  clientRequestIdHash: string;
  idempotencyKeyHash: string;
  dedupeHash: string;
  status: OutlookAutofileJobStatus;
  deniedReasonCode: OutlookAutofileDeniedReasonCode | null;
  retryCount: number;
}

export interface RecordOutlookAutofileJobInput {
  mappingId: string;
  message: OutlookItemRefDto;
  expectedMatterId?: string;
  retryCount?: number;
  clientRequestId: string;
  idempotencyKey: string;
}

type ActorApprovalScope = 'user' | 'admin';

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function initialApprovalStatus(
  input: CreateOutlookFolderMappingDto,
): OutlookFolderMappingApprovalStatus {
  return input.autoFileRequested || input.mappingMode === 'auto_file'
    ? 'pending_admin'
    : 'pending_user';
}

function isAdminRole(role: string | null): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

function toMappingDto(row: OutlookFolderMappingRow): OutlookFolderMappingDto {
  return {
    mappingId: row.mapping_id,
    matterId: row.matter_id,
    mailboxFingerprint: row.mailbox_fingerprint_hash,
    folderRefHash: row.folder_ref_hash,
    ...(row.folder_path_hash ? { folderPathHash: row.folder_path_hash } : {}),
    mappingMode: row.mapping_mode,
    approvalStatus: row.approval_status,
    autoFileEnabled: row.auto_file_enabled,
    sourceClient: row.source_client,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.approved_at ? { approvedAt: row.approved_at.toISOString() } : {}),
    ...(row.denied_reason_code ? { deniedReasonCode: row.denied_reason_code } : {}),
  };
}

function toAutofileDto(row: OutlookAutofileJobRow): OutlookAutofileJobDto {
  return {
    jobId: row.job_id,
    mappingId: row.mapping_id,
    matterId: row.matter_id,
    status: row.status,
    retryCount: Number(row.retry_count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.denied_reason_code ? { deniedReasonCode: row.denied_reason_code } : {}),
  };
}

function normalizeMappingInput(
  input: CreateOutlookFolderMappingDto,
): NormalizedFolderMappingInput {
  return {
    mappingId: randomUUID(),
    clientRequestIdHash: namespacedHash('outlook-folder-mapping-client-request', input.clientRequestId),
    idempotencyKeyHash: namespacedHash('outlook-folder-mapping-idempotency', input.idempotencyKey),
    approvalStatus: initialApprovalStatus(input),
  };
}

function normalizeAutofileJobInput(
  input: RecordOutlookAutofileJobInput,
  mapping: OutlookFolderMappingRow,
  autoFileGateOpen: boolean,
): NormalizedAutofileJobInput {
  const retryCount = Math.max(0, Math.min(10, Math.trunc(input.retryCount ?? 0)));
  const dedupeHash = sha256Hex(
    JSON.stringify({
      mappingId: mapping.mapping_id,
      messageHash: input.message.canonicalMessageSha256,
      mailboxFingerprintHash: mapping.mailbox_fingerprint_hash,
      folderRefHash: mapping.folder_ref_hash,
    }),
  );
  const wrongMatter =
    input.expectedMatterId !== undefined && input.expectedMatterId !== mapping.matter_id;
  const closedGate = !autoFileGateOpen;
  const inactiveMapping = mapping.approval_status !== 'active' || !mapping.auto_file_enabled;
  const deniedReasonCode: OutlookAutofileDeniedReasonCode | null = closedGate
    ? 'integration_gate_closed'
    : inactiveMapping
      ? 'policy_denied'
      : wrongMatter
        ? 'wrong_matter'
        : null;
  const status: OutlookAutofileJobStatus =
    deniedReasonCode === 'integration_gate_closed' || deniedReasonCode === 'policy_denied'
      ? 'disabled'
      : deniedReasonCode
        ? 'denied'
        : retryCount > 0
          ? 'retrying'
          : 'queued';
  return {
    jobId: randomUUID(),
    clientRequestIdHash: namespacedHash('outlook-autofile-client-request', input.clientRequestId),
    idempotencyKeyHash: namespacedHash('outlook-autofile-idempotency', input.idempotencyKey),
    dedupeHash,
    status,
    deniedReasonCode,
    retryCount,
  };
}

@Injectable()
export class OutlookFolderMappingService {
  private readonly fallbackOperationalGate = new OutlookOperationalGateService();

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Optional()
    @Inject(OutlookOperationalGateService)
    private readonly operationalGate?: OutlookOperationalGateService,
  ) {}

  async createFolderMapping(
    actorUserId: string,
    input: CreateOutlookFolderMappingDto,
  ): Promise<OutlookFolderMappingDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const normalized = normalizeMappingInput(input);

    if (!this.isOutlookFeatureAllowed('FOLDER_MAPPING')) {
      await this.recordMappingDenied(
        tenantId,
        actorUserId,
        input,
        normalized,
        'integration_gate_closed',
      );
      throw permissionDenied();
    }

    if (!(await this.canUploadToMatter(tenantId, actorUserId, input.matterId))) {
      await this.recordMappingDenied(
        tenantId,
        actorUserId,
        input,
        normalized,
        'permission_denied',
      );
      throw permissionDenied();
    }

    const row = await this.auditService.transaction(tenantId, async (tx) => {
      const inserted = await this.insertOrFindMapping(tx, tenantId, actorUserId, input, normalized);
      await this.auditService.log(
        outlookFolderMappingChangedAudit({
          tenantId,
          actorId: actorUserId,
          mappingId: inserted.mapping_id,
          matterId: inserted.matter_id,
          mailboxFingerprintHash: inserted.mailbox_fingerprint_hash,
          folderRefHash: inserted.folder_ref_hash,
          folderPathHash: inserted.folder_path_hash,
          mappingMode: inserted.mapping_mode,
          clientRequestHash: inserted.client_request_id_hash,
          idempotencyHash: inserted.idempotency_key_hash,
          statusAfter: inserted.approval_status,
          autoFileEnabled: inserted.auto_file_enabled,
          approvalScope: inserted.approval_status === 'pending_admin' ? 'admin' : 'user',
          duplicate: Boolean(inserted.duplicate),
        }),
        tx,
      );
      return inserted;
    });

    return toMappingDto(row);
  }

  async updateFolderMapping(
    actorUserId: string,
    mappingId: string,
    input: UpdateOutlookFolderMappingDto,
  ): Promise<OutlookFolderMappingDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const mapping = await this.findMapping(tenantId, mappingId);
    if (!mapping) throw permissionDenied();

    const actorRole = await this.findActorRole(tenantId, actorUserId);
    const approvalScope = this.approvalScope(mapping, actorUserId, actorRole);
    if (!approvalScope) {
      await this.recordExistingMappingDenied(
        tenantId,
        actorUserId,
        mapping,
        input.clientRequestId,
        'approval_required',
      );
      throw permissionDenied();
    }
    if (!this.isOutlookFeatureAllowed('FOLDER_MAPPING') && input.approvalDecision !== 'revoke') {
      await this.recordExistingMappingDenied(
        tenantId,
        actorUserId,
        mapping,
        input.clientRequestId,
        'integration_gate_closed',
      );
      throw permissionDenied();
    }
    if (
      mapping.approval_status === 'pending_admin' &&
      input.approvalDecision === 'approve' &&
      approvalScope !== 'admin'
    ) {
      await this.recordExistingMappingDenied(
        tenantId,
        actorUserId,
        mapping,
        input.clientRequestId,
        'approval_required',
      );
      throw permissionDenied();
    }
    const nextStatus = this.nextStatus(mapping.approval_status, input.approvalDecision);
    if (!nextStatus) {
      await this.recordExistingMappingDenied(
        tenantId,
        actorUserId,
        mapping,
        input.clientRequestId,
        'policy_denied',
      );
      throw permissionDenied();
    }
    if (!(await this.canUploadToMatter(tenantId, actorUserId, mapping.matter_id))) {
      await this.recordExistingMappingDenied(
        tenantId,
        actorUserId,
        mapping,
        input.clientRequestId,
        'permission_denied',
      );
      throw permissionDenied();
    }
    const autoFileGateOpen = this.isOutlookFeatureAllowed('AUTOFILE');
    if (input.autoFileEnabled && (!autoFileGateOpen || !isAdminRole(actorRole))) {
      await this.recordExistingMappingDenied(
        tenantId,
        actorUserId,
        mapping,
        input.clientRequestId,
        autoFileGateOpen ? 'approval_required' : 'integration_gate_closed',
      );
      throw permissionDenied();
    }

    const clientRequestHash = namespacedHash(
      'outlook-folder-mapping-update-client-request',
      input.clientRequestId,
    );
    const updated = await this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          UPDATE outlook_folder_mappings
          SET approval_status = $3,
            auto_file_enabled = $4,
            denied_reason_code = NULL,
            approval_actor_id = $5,
            approved_at = CASE WHEN $3 = 'active' THEN now() ELSE approved_at END,
            revoked_at = CASE WHEN $3 = 'revoked' THEN now() ELSE revoked_at END,
            updated_at = now()
          WHERE tenant_id = $1
            AND mapping_id = $2
          RETURNING *
        `,
        [
          tenantId,
          mappingId,
          nextStatus,
          nextStatus === 'active' ? input.autoFileEnabled : false,
          actorUserId,
        ],
      );
      const updatedRow = result.rows[0] as OutlookFolderMappingRow | undefined;
      if (!updatedRow) throw permissionDenied();
      await this.auditService.log(
        outlookFolderMappingChangedAudit({
          tenantId,
          actorId: actorUserId,
          mappingId: updatedRow.mapping_id,
          matterId: updatedRow.matter_id,
          mailboxFingerprintHash: updatedRow.mailbox_fingerprint_hash,
          folderRefHash: updatedRow.folder_ref_hash,
          folderPathHash: updatedRow.folder_path_hash,
          mappingMode: updatedRow.mapping_mode,
          clientRequestHash,
          idempotencyHash: updatedRow.idempotency_key_hash,
          statusBefore: mapping.approval_status,
          statusAfter: updatedRow.approval_status,
          autoFileEnabled: updatedRow.auto_file_enabled,
          approvalScope,
        }),
        tx,
      );
      return updatedRow;
    });

    return toMappingDto(updated);
  }

  async recordAutofileJob(
    actorUserId: string,
    input: RecordOutlookAutofileJobInput,
  ): Promise<OutlookAutofileJobDto> {
    const tenantId = this.tenantContext.require().tenantId;
    const mapping = await this.findMapping(tenantId, input.mappingId);
    if (!mapping) throw permissionDenied();
    if (mapping.user_id !== actorUserId) throw permissionDenied();
    if (!(await this.canUploadToMatter(tenantId, actorUserId, mapping.matter_id))) {
      throw permissionDenied();
    }

    const normalized = normalizeAutofileJobInput(
      input,
      mapping,
      this.isOutlookFeatureAllowed('AUTOFILE'),
    );
    const row = await this.auditService.transaction(tenantId, async (tx) => {
      const inserted = await this.insertOrFindAutofileJob(tx, tenantId, mapping, input, normalized);
      await this.auditService.log(
        outlookAutofileJobRecordedAudit({
          tenantId,
          actorId: actorUserId,
          jobId: inserted.job_id,
          mappingId: inserted.mapping_id,
          matterId: inserted.matter_id,
          mailboxFingerprintHash: inserted.mailbox_fingerprint_hash,
          folderRefHash: inserted.folder_ref_hash,
          messageHash: inserted.canonical_message_sha256,
          dedupeHash: inserted.dedupe_hash,
          clientRequestHash: inserted.client_request_id_hash,
          idempotencyHash: inserted.idempotency_key_hash,
          retryCount: Number(inserted.retry_count),
          status: inserted.status,
          ...(inserted.denied_reason_code ? { reasonCode: inserted.denied_reason_code } : {}),
          duplicate: Boolean(inserted.duplicate),
        }),
        tx,
      );
      return inserted;
    });
    return toAutofileDto(row);
  }

  private isOutlookFeatureAllowed(feature: 'FOLDER_MAPPING' | 'AUTOFILE'): boolean {
    return (this.operationalGate ?? this.fallbackOperationalGate).isFeatureAllowed(feature);
  }

  private nextStatus(
    current: OutlookFolderMappingApprovalStatus,
    decision: UpdateOutlookFolderMappingDto['approvalDecision'],
  ): OutlookFolderMappingApprovalStatus | null {
    if (current === 'revoked') return decision === 'revoke' ? 'revoked' : null;
    if (current === 'denied') return decision === 'revoke' ? 'revoked' : null;
    if (decision === 'approve') return 'active';
    if (decision === 'disable') return 'disabled';
    return 'revoked';
  }

  private approvalScope(
    mapping: OutlookFolderMappingRow,
    actorUserId: string,
    actorRole: string | null,
  ): ActorApprovalScope | null {
    if (mapping.user_id === actorUserId) return 'user';
    if (isAdminRole(actorRole)) return 'admin';
    return null;
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

  private async recordMappingDenied(
    tenantId: string,
    actorUserId: string,
    input: CreateOutlookFolderMappingDto,
    normalized: NormalizedFolderMappingInput,
    reasonCode: OutlookFolderMappingDeniedReasonCode,
  ): Promise<void> {
    await this.auditService.log(
      outlookFolderMappingDeniedAudit({
        tenantId,
        actorId: actorUserId,
        mappingId: normalized.mappingId,
        matterId: input.matterId,
        mailboxFingerprintHash: input.mailboxFingerprint,
        folderRefHash: input.folderRefHash,
        folderPathHash: input.folderPathHash ?? null,
        mappingMode: input.mappingMode,
        clientRequestHash: normalized.clientRequestIdHash,
        idempotencyHash: normalized.idempotencyKeyHash,
        reasonCode,
      }),
    );
  }

  private async recordExistingMappingDenied(
    tenantId: string,
    actorUserId: string,
    mapping: OutlookFolderMappingRow,
    clientRequestId: string,
    reasonCode: OutlookFolderMappingDeniedReasonCode,
  ): Promise<void> {
    await this.auditService.log(
      outlookFolderMappingDeniedAudit({
        tenantId,
        actorId: actorUserId,
        mappingId: mapping.mapping_id,
        matterId: mapping.matter_id,
        mailboxFingerprintHash: mapping.mailbox_fingerprint_hash,
        folderRefHash: mapping.folder_ref_hash,
        folderPathHash: mapping.folder_path_hash,
        mappingMode: mapping.mapping_mode,
        clientRequestHash: namespacedHash('outlook-folder-mapping-update-client-request', clientRequestId),
        idempotencyHash: mapping.idempotency_key_hash,
        statusBefore: mapping.approval_status,
        reasonCode,
      }),
    );
  }

  private async insertOrFindMapping(
    tx: QueryClient,
    tenantId: string,
    actorUserId: string,
    input: CreateOutlookFolderMappingDto,
    normalized: NormalizedFolderMappingInput,
  ): Promise<OutlookFolderMappingRow> {
    const result = await tx.query(
      `
        WITH inserted AS (
          INSERT INTO outlook_folder_mappings (
            mapping_id, tenant_id, user_id, matter_id, mailbox_fingerprint_hash,
            folder_ref_hash, folder_path_hash, mapping_mode, approval_status,
            requested_auto_file, auto_file_enabled, source_client, client_request_id_hash,
            idempotency_key_hash
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11, $12, $13
          )
          ON CONFLICT DO NOTHING
          RETURNING *, false AS duplicate
        ),
        existing AS (
          SELECT *, true AS duplicate
          FROM outlook_folder_mappings
          WHERE tenant_id = $2
            AND user_id = $3
            AND (
              idempotency_key_hash = $13
              OR client_request_id_hash = $12
              OR (
                mailbox_fingerprint_hash = $5
                AND folder_ref_hash = $6
                AND matter_id = $4
                AND mapping_mode = $8
              )
            )
          ORDER BY created_at ASC, mapping_id ASC
          LIMIT 1
        )
        SELECT * FROM inserted
        UNION ALL
        SELECT * FROM existing
        WHERE NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1
      `,
      [
        normalized.mappingId,
        tenantId,
        actorUserId,
        input.matterId,
        input.mailboxFingerprint,
        input.folderRefHash,
        input.folderPathHash ?? null,
        input.mappingMode,
        normalized.approvalStatus,
        input.autoFileRequested,
        input.sourceClient,
        normalized.clientRequestIdHash,
        normalized.idempotencyKeyHash,
      ],
    );
    const row = result.rows[0] as OutlookFolderMappingRow | undefined;
    if (!row) throw new Error('outlook folder mapping insert returned no row');
    return row;
  }

  private async insertOrFindAutofileJob(
    tx: QueryClient,
    tenantId: string,
    mapping: OutlookFolderMappingRow,
    input: RecordOutlookAutofileJobInput,
    normalized: NormalizedAutofileJobInput,
  ): Promise<OutlookAutofileJobRow> {
    const result = await tx.query(
      `
        WITH inserted AS (
          INSERT INTO outlook_autofile_jobs (
            job_id, tenant_id, mapping_id, user_id, matter_id, mailbox_fingerprint_hash,
            folder_ref_hash, canonical_message_sha256, dedupe_hash, expected_matter_id,
            status, denied_reason_code, retry_count, client_request_id_hash, idempotency_key_hash
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
          ON CONFLICT DO NOTHING
          RETURNING *, false AS duplicate
        ),
        existing AS (
          SELECT *, true AS duplicate
          FROM outlook_autofile_jobs
          WHERE tenant_id = $2
            AND mapping_id = $3
            AND (
              idempotency_key_hash = $15
              OR dedupe_hash = $9
            )
          ORDER BY created_at ASC, job_id ASC
          LIMIT 1
        )
        SELECT * FROM inserted
        UNION ALL
        SELECT * FROM existing
        WHERE NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1
      `,
      [
        normalized.jobId,
        tenantId,
        mapping.mapping_id,
        mapping.user_id,
        mapping.matter_id,
        mapping.mailbox_fingerprint_hash,
        mapping.folder_ref_hash,
        input.message.canonicalMessageSha256,
        normalized.dedupeHash,
        input.expectedMatterId ?? null,
        normalized.status,
        normalized.deniedReasonCode,
        normalized.retryCount,
        normalized.clientRequestIdHash,
        normalized.idempotencyKeyHash,
      ],
    );
    const row = result.rows[0] as OutlookAutofileJobRow | undefined;
    if (!row) throw new Error('outlook autofile job insert returned no row');
    return row;
  }

  private async findMapping(
    tenantId: string,
    mappingId: string,
  ): Promise<OutlookFolderMappingRow | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT *
          FROM outlook_folder_mappings
          WHERE tenant_id = $1
            AND mapping_id = $2
          LIMIT 1
        `,
        [tenantId, mappingId],
      );
      return (result.rows[0] as OutlookFolderMappingRow | undefined) ?? null;
    });
  }

  private async findActorRole(tenantId: string, actorUserId: string): Promise<string | null> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT role
          FROM users
          WHERE tenant_id = $1
            AND user_id = $2
            AND status = 'active'
          LIMIT 1
        `,
        [tenantId, actorUserId],
      );
      const row = result.rows[0] as { role?: string } | undefined;
      return row?.role ?? null;
    });
  }
}
