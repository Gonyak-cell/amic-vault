import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  createArchiveRequestSchema,
  createDisposalRequestSchema,
  createLegalHoldRequestSchema,
  createRetentionPolicyRequestSchema,
  disposalCertificateSchema,
  disposalReviewListResponseSchema,
  disposalReviewItemSchema,
  disposalRequestSchema,
  legalHoldListResponseSchema,
  legalHoldSchema,
  recordsArchiveSchema,
  retryDisposalRequestSchema,
  retentionPolicyListResponseSchema,
  retentionPolicySchema,
  type CreateArchiveRequestDto,
  type CreateDisposalRequestDto,
  type CreateLegalHoldRequestDto,
  type CreateRetentionPolicyRequestDto,
  type DisposalCertificateDto,
  type DisposalReviewItemDto,
  type DisposalReviewListResponseDto,
  type DisposalRequestDto,
  type LegalHoldDto,
  type LegalHoldListResponseDto,
  type PermissionContext,
  type PermissionDecision,
  type RecordsArchiveDto,
  type RetentionPolicyDto,
  type RetentionPolicyListResponseDto,
  type RetryDisposalRequestDto,
  type TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { StorageService } from '../storage/storage.service';
import { UserService } from '../user/user.service';
import { WorkService } from '../work/work.service';
import {
  sealedDisposalInventoryHash,
  type DisposalInventoryObjectKind,
  type DisposalReceiptOutcome,
  type SealedDisposalInventoryEntry,
} from './disposal-receipt.types';

const mutableRecordStatuses = new Set([
  'draft',
  'internal_review',
  'client_sent',
  'counterparty_sent',
  'markup_received',
  'negotiation',
  'final',
  'executed',
]);

const businessReferenceChecks = [
  {
    table: 'external_secure_links',
    sql: `
      SELECT count(*)::text AS count
      FROM external_secure_links
      WHERE tenant_id = $1
        AND document_id = $2
        AND status <> 'revoked'
    `,
  },
  {
    table: 'email_document_links',
    sql: `
      SELECT count(*)::text AS count
      FROM email_document_links
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'dd_data_room_mappings',
    sql: `
      SELECT count(*)::text AS count
      FROM dd_data_room_mappings
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'dd_issues',
    sql: `
      SELECT count(*)::text AS count
      FROM dd_issues
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'litigation_evidence_items',
    sql: `
      SELECT count(*)::text AS count
      FROM litigation_evidence_items
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'litigation_pleadings',
    sql: `
      SELECT count(*)::text AS count
      FROM litigation_pleadings
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'ai_session_chunks',
    sql: `
      SELECT count(*)::text AS count
      FROM ai_session_chunks
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'contract_classifications',
    sql: `
      SELECT count(*)::text AS count
      FROM contract_classifications
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'contract_clauses',
    sql: `
      SELECT count(*)::text AS count
      FROM contract_clauses
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'contract_clause_chunks',
    sql: `
      SELECT count(*)::text AS count
      FROM contract_clause_chunks
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'contract_defined_terms',
    sql: `
      SELECT count(*)::text AS count
      FROM contract_defined_terms
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'contract_redline_changes',
    sql: `
      SELECT count(*)::text AS count
      FROM contract_redline_changes
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'graph_nodes',
    sql: `
      SELECT count(*)::text AS count
      FROM graph_nodes
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
  {
    table: 'graph_edges',
    sql: `
      SELECT count(*)::text AS count
      FROM graph_edges
      WHERE tenant_id = $1
        AND document_id = $2
    `,
  },
] as const;

interface RetentionPolicyRow {
  retention_policy_id: string;
  policy_code: string;
  label: string;
  retention_days: number | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface LegalHoldRow {
  legal_hold_id: string;
  matter_id: string;
  document_id: string | null;
  hold_scope: string;
  status: string;
  reason_code: string;
  created_by: string;
  released_by: string | null;
  created_at: Date;
  released_at: Date | null;
}

interface RecordsArchiveRow {
  archive_id: string;
  matter_id: string;
  document_id: string;
  previous_status: string;
  archive_status: string;
  closing_binder_id?: string | null;
  created_at: Date;
}

interface DisposalRequestRow {
  disposal_request_id: string;
  matter_id: string;
  document_id: string;
  status: string;
  reason_code: string;
  requested_by: string;
  approved_by: string | null;
  executed_by: string | null;
  assigned_to_user_id: string | null;
  assigned_role: string;
  due_at: Date;
  workflow_item_id: string | null;
  workflow_audit_event_id: string | null;
  created_at: Date;
  approved_at: Date | null;
  executed_at: Date | null;
  certificate_id: string | null;
  pending_execution_ref: string | null;
}

interface DisposalReviewRow extends DisposalRequestRow {
  matter_code: string;
  matter_name: string;
  document_title: string;
}

interface DisposalCertificateRow {
  certificate_id: string;
  disposal_request_id: string;
  matter_id: string;
  document_id: string;
  document_hash: string;
  certificate_hash: string;
  approved_by: string;
  executed_by: string;
  executed_at: Date;
}

interface MatterTargetRow {
  matter_id: string;
  status: string;
  legal_hold: boolean;
}

interface DocumentTargetRow {
  document_id: string;
  matter_id: string;
  status: string;
  matter_status: string;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
}

interface CountRow {
  count: string;
}

interface FileObjectRefRow {
  file_object_id: string;
  storage_uri: string;
  sha256: string;
}

interface VersionFileRow extends FileObjectRefRow {
  version_id: string;
  file_hash: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function documentLocked(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'DOCUMENT_LOCKED',
    ...(reason ? { reason } : {}),
  });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function iso(value: Date): string {
  return value.toISOString();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rowCount(result: { rowCount: number | null }): number {
  return result.rowCount ?? 0;
}

function parseCreateRetentionPolicy(input: unknown): CreateRetentionPolicyRequestDto {
  try {
    return createRetentionPolicyRequestSchema.parse(input ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseCreateLegalHold(input: unknown): CreateLegalHoldRequestDto {
  try {
    return createLegalHoldRequestSchema.parse(input ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseCreateArchive(input: unknown): CreateArchiveRequestDto {
  try {
    return createArchiveRequestSchema.parse(input ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseCreateDisposal(input: unknown): CreateDisposalRequestDto {
  try {
    return createDisposalRequestSchema.parse(input ?? {});
  } catch {
    throw validationFailed();
  }
}

function parseRetryDisposal(input: unknown): RetryDisposalRequestDto {
  try {
    return retryDisposalRequestSchema.parse(input ?? {});
  } catch {
    throw validationFailed();
  }
}

function mapRetentionPolicy(row: RetentionPolicyRow): RetentionPolicyDto {
  return retentionPolicySchema.parse({
    retentionPolicyId: row.retention_policy_id,
    policyCode: row.policy_code,
    label: row.label,
    retentionDays: row.retention_days,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function mapLegalHold(row: LegalHoldRow): LegalHoldDto {
  return legalHoldSchema.parse({
    legalHoldId: row.legal_hold_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    holdScope: row.hold_scope,
    status: row.status,
    reasonCode: row.reason_code,
    createdBy: row.created_by,
    releasedBy: row.released_by,
    createdAt: iso(row.created_at),
    releasedAt: row.released_at ? iso(row.released_at) : null,
  });
}

function mapArchive(row: RecordsArchiveRow): RecordsArchiveDto {
  return recordsArchiveSchema.parse({
    archiveId: row.archive_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    previousStatus: row.previous_status,
    archiveStatus: row.archive_status,
    createdAt: iso(row.created_at),
  });
}

function mapDisposalRequest(row: DisposalRequestRow): DisposalRequestDto {
  return disposalRequestSchema.parse({
    disposalRequestId: row.disposal_request_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    status: row.status,
    reasonCode: row.reason_code,
    assignedRole: row.assigned_role,
    dueAt: iso(row.due_at),
    approvalCount: row.approved_by ? 1 : 0,
    certificateId: row.certificate_id,
    pendingExecutionRef: row.pending_execution_ref ?? null,
    createdAt: iso(row.created_at),
    approvedAt: row.approved_at ? iso(row.approved_at) : null,
    executedAt: row.executed_at ? iso(row.executed_at) : null,
  });
}

function mapDisposalReviewItem(row: DisposalReviewRow): DisposalReviewItemDto {
  return disposalReviewItemSchema.parse({
    ...mapDisposalRequest(row),
    matterCode: row.matter_code,
    matterName: row.matter_name,
    documentTitle: row.document_title,
    reviewSource:
      row.reason_code === 'RETENTION_EXPIRED' ? 'retention_scheduler' : 'manual_request',
  });
}

function mapCertificate(row: DisposalCertificateRow): DisposalCertificateDto {
  return disposalCertificateSchema.parse({
    certificateId: row.certificate_id,
    disposalRequestId: row.disposal_request_id,
    matterId: row.matter_id,
    documentId: row.document_id,
    documentHash: row.document_hash,
    certificateHash: row.certificate_hash,
    approvedBy: row.approved_by,
    executedBy: row.executed_by,
    executedAt: iso(row.executed_at),
  });
}

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(WorkService) private readonly workService: WorkService,
  ) {}

  async createRetentionPolicy(ctx: PermissionContext, body: unknown): Promise<RetentionPolicyDto> {
    const input = parseCreateRetentionPolicy(body);
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);

    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const result = await tx.query(
        `
          INSERT INTO retention_policies (
            tenant_id, policy_code, label, retention_days, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $5)
          RETURNING retention_policy_id, policy_code, label, retention_days, status,
            created_at, updated_at
        `,
        [ctx.tenantId, input.policyCode, input.label, input.retentionDays, ctx.userId],
      );
      const row = result.rows[0] as RetentionPolicyRow | undefined;
      if (!row) throw validationFailed('RETENTION_POLICY_CREATE_FAILED');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: this.sessionId(ctx),
          action: 'RETENTION_POLICY_CHANGED',
          targetType: 'retention_policy',
          targetId: row.retention_policy_id,
          metadata: {
            retention_policy_id: row.retention_policy_id,
            retention_days: row.retention_days,
            reason_code: 'RETENTION_POLICY_CREATED',
          },
        },
        tx,
      );
      return mapRetentionPolicy(row);
    });
  }

  async listRetentionPolicies(ctx: PermissionContext): Promise<RetentionPolicyListResponseDto> {
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT retention_policy_id, policy_code, label, retention_days, status,
            created_at, updated_at
          FROM retention_policies
          WHERE tenant_id = $1
          ORDER BY status ASC, policy_code ASC
          LIMIT 100
        `,
        [ctx.tenantId],
      );
      return retentionPolicyListResponseSchema.parse({
        policies: (result.rows as RetentionPolicyRow[]).map(mapRetentionPolicy),
      });
    });
  }

  async createLegalHold(ctx: PermissionContext, body: unknown): Promise<LegalHoldDto> {
    const input = parseCreateLegalHold(body);
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);

    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      if (input.holdScope === 'document') {
        const documentId = this.documentHoldId(input);
        const document = await this.findDocumentTarget(tx, ctx.tenantId, documentId, true);
        if (!document) throw notFoundDenied();
        if (document.matter_id !== input.matterId) throw validationFailed('LEGAL_HOLD_SCOPE');
      } else {
        const matter = await this.findMatterTarget(tx, ctx.tenantId, input.matterId, true);
        if (!matter) throw notFoundDenied();
      }
      await this.assertNoActiveLegalHold(
        tx,
        ctx.tenantId,
        input.matterId,
        input.holdScope,
        input.documentId ?? null,
      );

      const result = await tx.query(
        `
          INSERT INTO legal_holds (
            tenant_id, matter_id, document_id, hold_scope, reason_code, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING legal_hold_id, matter_id, document_id, hold_scope, status, reason_code,
            created_by, released_by, created_at, released_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.documentId ?? null,
          input.holdScope,
          input.reasonCode,
          ctx.userId,
        ],
      );
      const row = result.rows[0] as LegalHoldRow | undefined;
      if (!row) throw validationFailed('LEGAL_HOLD_CREATE_FAILED');
      if (input.holdScope === 'matter') {
        await tx.query(
          `
            UPDATE matters
            SET legal_hold = true,
              updated_at = now()
            WHERE tenant_id = $1
              AND matter_id = $2
          `,
          [ctx.tenantId, input.matterId],
        );
      } else {
        await tx.query(
          `
            UPDATE documents
            SET legal_hold = true,
              updated_at = now()
            WHERE tenant_id = $1
              AND document_id = $2
          `,
          [ctx.tenantId, input.documentId],
        );
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: this.sessionId(ctx),
          action: 'LEGAL_HOLD_APPLIED',
          targetType: input.holdScope,
          targetId: input.documentId ?? input.matterId,
          matterId: input.matterId,
          metadata: {
            legal_hold_id: row.legal_hold_id,
            matter_id: input.matterId,
            document_id: input.documentId ?? null,
            scope_type: input.holdScope,
            scope_id: input.documentId ?? input.matterId,
            reason_code: input.reasonCode,
          },
        },
        tx,
      );
      return mapLegalHold(row);
    });
  }

  async listLegalHolds(
    ctx: PermissionContext,
    query: { matterId?: string },
  ): Promise<LegalHoldListResponseDto> {
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const params: string[] = [ctx.tenantId];
      const filters = ['tenant_id = $1'];
      if (query.matterId) {
        params.push(query.matterId);
        filters.push(`matter_id = $${params.length}`);
      }
      const result = await tx.query(
        `
          SELECT legal_hold_id, matter_id, document_id, hold_scope, status, reason_code,
            created_by, released_by, created_at, released_at
          FROM legal_holds
          WHERE ${filters.join(' AND ')}
          ORDER BY created_at DESC, legal_hold_id
          LIMIT 100
        `,
        params,
      );
      return legalHoldListResponseSchema.parse({
        holds: (result.rows as LegalHoldRow[]).map(mapLegalHold),
      });
    });
  }

  async releaseLegalHold(ctx: PermissionContext, legalHoldId: string): Promise<LegalHoldDto> {
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);

    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const before = await this.findLegalHold(tx, ctx.tenantId, legalHoldId, true);
      if (!before) throw notFoundDenied();
      if (before.status !== 'active') return mapLegalHold(before);

      const updatedResult = await tx.query(
        `
          UPDATE legal_holds
          SET status = 'released',
            released_by = $3,
            released_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND legal_hold_id = $2
            AND status = 'active'
          RETURNING legal_hold_id, matter_id, document_id, hold_scope, status, reason_code,
            created_by, released_by, created_at, released_at
        `,
        [ctx.tenantId, legalHoldId, ctx.userId],
      );
      const updated = updatedResult.rows[0] as LegalHoldRow | undefined;
      if (!updated) throw validationFailed('LEGAL_HOLD_RELEASE_CONFLICT');
      if (updated.hold_scope === 'matter') {
        const active = await this.countActiveHolds(
          tx,
          ctx.tenantId,
          updated.matter_id,
          'matter',
          null,
        );
        if (active === 0) {
          await tx.query(
            `
              UPDATE matters
              SET legal_hold = false,
                updated_at = now()
              WHERE tenant_id = $1
                AND matter_id = $2
            `,
            [ctx.tenantId, updated.matter_id],
          );
        }
      } else if (updated.document_id) {
        const active = await this.countActiveHolds(
          tx,
          ctx.tenantId,
          updated.matter_id,
          'document',
          updated.document_id,
        );
        if (active === 0) {
          await tx.query(
            `
              UPDATE documents
              SET legal_hold = false,
                updated_at = now()
              WHERE tenant_id = $1
                AND document_id = $2
            `,
            [ctx.tenantId, updated.document_id],
          );
        }
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: this.sessionId(ctx),
          action: 'LEGAL_HOLD_RELEASED',
          targetType: updated.hold_scope,
          targetId: updated.document_id ?? updated.matter_id,
          matterId: updated.matter_id,
          metadata: {
            legal_hold_id: updated.legal_hold_id,
            matter_id: updated.matter_id,
            document_id: updated.document_id,
            scope_type: updated.hold_scope,
            scope_id: updated.document_id ?? updated.matter_id,
            reason_code: updated.reason_code,
          },
        },
        tx,
      );
      return mapLegalHold(updated);
    });
  }

  async archiveDocument(ctx: PermissionContext, body: unknown): Promise<RecordsArchiveDto> {
    const input = parseCreateArchive(body);
    this.assertContext(ctx);

    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const target = await this.findDocumentTarget(tx, ctx.tenantId, input.documentId, true);
      if (!target) throw notFoundDenied();
      await this.assertCanEditMatter(ctx, target.matter_id);
      if (!mutableRecordStatuses.has(target.status)) {
        throw documentLocked('DOCUMENT_IMMUTABLE_STATE');
      }
      this.assertNoHoldFlags(target);
      await this.assertNoActiveHoldsForDocument(
        tx,
        ctx.tenantId,
        target.matter_id,
        input.documentId,
      );
      const updated = await tx.query(
        `
          UPDATE documents
          SET status = 'archived',
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
        `,
        [ctx.tenantId, input.documentId],
      );
      if (updated.rowCount !== 1) throw validationFailed('DOCUMENT_ARCHIVE_CONFLICT');
      const result = await tx.query(
        `
          INSERT INTO records_archives (
            tenant_id, matter_id, document_id, previous_status, reason_code, archived_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING archive_id, matter_id, document_id, previous_status, archive_status,
            created_at
        `,
        [
          ctx.tenantId,
          target.matter_id,
          input.documentId,
          target.status,
          input.reasonCode,
          ctx.userId,
        ],
      );
      const row = result.rows[0] as RecordsArchiveRow | undefined;
      if (!row) throw validationFailed('ARCHIVE_CREATE_FAILED');
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: this.sessionId(ctx),
          action: 'RECORD_ARCHIVED',
          targetType: 'document',
          targetId: input.documentId,
          matterId: target.matter_id,
          metadata: {
            archive_id: row.archive_id,
            matter_id: target.matter_id,
            document_id: input.documentId,
            status_before: target.status,
            status_after: 'archived',
            reason_code: input.reasonCode,
          },
        },
        tx,
      );
      return mapArchive(row);
    });
  }

  async archiveDocumentForClosingBinder(
    client: QueryClient,
    ctx: PermissionContext,
    input: { closingBinderId: string; documentId: string; reasonCode: string },
  ): Promise<RecordsArchiveDto> {
    if (!ctx.tenantId || !ctx.userId) throw validationFailed();
    const existing = await client.query(
      `
        SELECT archive_id, matter_id, document_id, previous_status, archive_status,
          closing_binder_id, created_at
        FROM records_archives
        WHERE tenant_id = $1
          AND document_id = $2
        FOR UPDATE
      `,
      [ctx.tenantId, input.documentId],
    );
    const existingRow = existing.rows[0] as RecordsArchiveRow | undefined;
    if (existingRow) {
      if (existingRow.closing_binder_id === input.closingBinderId) return mapArchive(existingRow);
      throw validationFailed('DOCUMENT_ARCHIVE_CONFLICT');
    }

    const target = await this.findDocumentTarget(client, ctx.tenantId, input.documentId, true);
    if (!target) throw notFoundDenied();
    await this.assertCanEditMatter(ctx, target.matter_id);
    if (!mutableRecordStatuses.has(target.status)) {
      throw documentLocked('DOCUMENT_IMMUTABLE_STATE');
    }
    this.assertNoHoldFlags(target);
    await this.assertNoActiveHoldsForDocument(client, ctx.tenantId, target.matter_id, input.documentId);
    const updated = await client.query(
      `
        UPDATE documents
        SET status = 'archived',
          updated_at = now()
        WHERE tenant_id = $1
          AND document_id = $2
      `,
      [ctx.tenantId, input.documentId],
    );
    if (updated.rowCount !== 1) throw validationFailed('DOCUMENT_ARCHIVE_CONFLICT');
    const result = await client.query(
      `
        INSERT INTO records_archives (
          tenant_id, matter_id, document_id, previous_status, reason_code, archived_by,
          closing_binder_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING archive_id, matter_id, document_id, previous_status, archive_status,
          closing_binder_id, created_at
      `,
      [
        ctx.tenantId,
        target.matter_id,
        input.documentId,
        target.status,
        input.reasonCode,
        ctx.userId,
        input.closingBinderId,
      ],
    );
    const row = result.rows[0] as RecordsArchiveRow | undefined;
    if (!row) throw validationFailed('ARCHIVE_CREATE_FAILED');
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        action: 'RECORD_ARCHIVED',
        targetType: 'document',
        targetId: input.documentId,
        matterId: target.matter_id,
        metadata: {
          archive_id: row.archive_id,
          closing_binder_id: input.closingBinderId,
          matter_id: target.matter_id,
          document_id: input.documentId,
          status_before: target.status,
          status_after: 'archived',
          reason_code: input.reasonCode,
        },
      },
      client,
    );
    return mapArchive(row);
  }

  async createDisposalRequest(ctx: PermissionContext, body: unknown): Promise<DisposalRequestDto> {
    const input = parseCreateDisposal(body);
    this.assertContext(ctx);

    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const target = await this.findDocumentTarget(tx, ctx.tenantId, input.documentId, true);
      if (!target) throw notFoundDenied();
      await this.assertCanEditMatter(ctx, target.matter_id);
      if (!mutableRecordStatuses.has(target.status) && target.status !== 'archived') {
        throw documentLocked('DOCUMENT_IMMUTABLE_STATE');
      }
      this.assertNoHoldFlags(target);
      await this.assertNoActiveHoldsForDocument(
        tx,
        ctx.tenantId,
        target.matter_id,
        input.documentId,
      );
      await this.assertNoBusinessReferences(tx, ctx.tenantId, input.documentId);
      await this.assertNoOpenDisposalRequest(tx, ctx.tenantId, input.documentId);

      const result = await tx.query(
        `
          INSERT INTO disposal_requests (
            tenant_id, matter_id, document_id, reason_code, requested_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING disposal_request_id, matter_id, document_id, status, reason_code,
            requested_by, approved_by, executed_by, assigned_to_user_id, assigned_role,
            due_at, workflow_item_id, workflow_audit_event_id,
            created_at, approved_at, executed_at,
            NULL::uuid AS certificate_id,
            NULL::uuid AS pending_execution_ref
        `,
        [ctx.tenantId, target.matter_id, input.documentId, input.reasonCode, ctx.userId],
      );
      const row = result.rows[0] as DisposalRequestRow | undefined;
      if (!row) throw validationFailed('DISPOSAL_REQUEST_CREATE_FAILED');
      const updated = await tx.query(
        `
          UPDATE documents
          SET status = 'disposal_locked',
            updated_at = now()
          WHERE tenant_id = $1
            AND document_id = $2
        `,
        [ctx.tenantId, input.documentId],
      );
      if (updated.rowCount !== 1) throw validationFailed('DOCUMENT_DISPOSAL_LOCK_FAILED');
      const audit = await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: this.sessionId(ctx),
          action: 'DISPOSAL_REQUESTED',
          targetType: 'document',
          targetId: input.documentId,
          matterId: target.matter_id,
          metadata: {
            disposal_request_id: row.disposal_request_id,
            matter_id: target.matter_id,
            document_id: input.documentId,
            status_before: target.status,
            status_after: 'disposal_locked',
            reason_code: input.reasonCode,
          },
        },
        tx,
      );
      const workItem = await this.workService.openRecordsDisposalWork(tx, {
        tenantId: ctx.tenantId,
        disposalRequestId: row.disposal_request_id,
        matterId: target.matter_id,
        documentId: input.documentId,
        actorUserId: ctx.userId,
        auditEventId: audit.eventId,
        kind: 'records_disposal_approval',
      });
      await this.attachDisposalWorkflow(
        tx,
        ctx.tenantId,
        row.disposal_request_id,
        workItem.workItemId,
        workItem.dueAt,
        audit.eventId,
      );
      return mapDisposalRequest({
        ...row,
        due_at: workItem.dueAt,
        workflow_item_id: workItem.workItemId,
        workflow_audit_event_id: audit.eventId,
      });
    });
  }

  async listDisposalRequests(ctx: PermissionContext): Promise<DisposalReviewListResponseDto> {
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT dr.disposal_request_id, dr.matter_id, dr.document_id, dr.status,
            dr.reason_code, dr.requested_by, dr.approved_by, dr.executed_by,
            dr.assigned_to_user_id, dr.assigned_role, dr.due_at,
            dr.workflow_item_id, dr.workflow_audit_event_id,
            dr.created_at, dr.approved_at, dr.executed_at, dc.certificate_id,
            rdo.disposal_outbox_id AS pending_execution_ref,
            m.matter_code, m.matter_name, d.title AS document_title
          FROM disposal_requests dr
          JOIN matters m
            ON m.tenant_id = dr.tenant_id
            AND m.matter_id = dr.matter_id
          JOIN documents d
            ON d.tenant_id = dr.tenant_id
            AND d.document_id = dr.document_id
          LEFT JOIN disposal_certificates dc
            ON dc.tenant_id = dr.tenant_id
            AND dc.disposal_request_id = dr.disposal_request_id
          LEFT JOIN records_disposal_outbox rdo
            ON rdo.tenant_id = dr.tenant_id
            AND rdo.disposal_request_id = dr.disposal_request_id
          WHERE dr.tenant_id = $1
            AND dr.status IN ('requested', 'approved')
          ORDER BY dr.due_at ASC, dr.created_at DESC, dr.disposal_request_id ASC
          LIMIT 100
        `,
        [ctx.tenantId],
      );
      return disposalReviewListResponseSchema.parse({
        disposals: (result.rows as DisposalReviewRow[]).map(mapDisposalReviewItem),
      });
    });
  }

  async approveDisposalRequest(
    ctx: PermissionContext,
    disposalRequestId: string,
  ): Promise<DisposalRequestDto> {
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);

    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const before = await this.findDisposalRequest(tx, ctx.tenantId, disposalRequestId, true);
      if (!before) throw notFoundDenied();
      if (before.status === 'approved' && before.pending_execution_ref) {
        return mapDisposalRequest(before);
      }
      if (before.status !== 'requested') throw validationFailed('DISPOSAL_NOT_REQUESTED');
      if (before.requested_by === ctx.userId) {
        throw validationFailed('DISPOSAL_SELF_APPROVAL_DENIED');
      }
      const target = await this.findDocumentTarget(tx, ctx.tenantId, before.document_id, true);
      if (!target) throw notFoundDenied();
      this.assertNoHoldFlags(target);
      await this.assertNoActiveHoldsForDocument(
        tx,
        ctx.tenantId,
        before.matter_id,
        before.document_id,
      );
      await this.assertNoBusinessReferences(tx, ctx.tenantId, before.document_id);
      const sealedInventory = await this.buildSealedInventory(tx, {
        tenantId: ctx.tenantId,
        documentId: before.document_id,
      });

      const result = await tx.query(
        `
          UPDATE disposal_requests
          SET status = 'approved',
            approved_by = $3,
            approved_at = now(),
            updated_at = now()
          WHERE tenant_id = $1
            AND disposal_request_id = $2
            AND status = 'requested'
          RETURNING disposal_request_id, matter_id, document_id, status, reason_code,
            requested_by, approved_by, executed_by, assigned_to_user_id, assigned_role,
            due_at, workflow_item_id, workflow_audit_event_id,
            created_at, approved_at, executed_at,
            NULL::uuid AS certificate_id,
            NULL::uuid AS pending_execution_ref
        `,
        [ctx.tenantId, disposalRequestId, ctx.userId],
      );
      const row = result.rows[0] as DisposalRequestRow | undefined;
      if (!row) throw validationFailed('DISPOSAL_APPROVAL_CONFLICT');
      const outboxResult = await tx.query(
        `
          INSERT INTO records_disposal_outbox (
            tenant_id, disposal_request_id, inventory_hash
          )
          VALUES ($1, $2, $3)
          RETURNING disposal_outbox_id
        `,
        [ctx.tenantId, disposalRequestId, sealedInventory.inventoryHash],
      );
      const disposalOutboxId = (outboxResult.rows[0] as { disposal_outbox_id?: string } | undefined)
        ?.disposal_outbox_id;
      if (!disposalOutboxId) throw validationFailed('DISPOSAL_OUTBOX_CREATE_FAILED');
      for (const entry of sealedInventory.entries) {
        const insertResult = await tx.query(
          `
            INSERT INTO records_disposal_inventory (
              tenant_id, disposal_outbox_id, document_id, document_version_id,
              file_object_id, object_kind, storage_key_hash,
              storage_version_fingerprint, content_sha256, canonical_ordinal
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            ctx.tenantId,
            disposalOutboxId,
            entry.documentId,
            entry.documentVersionId,
            entry.fileObjectId,
            entry.objectKind,
            entry.storageKeyHash,
            entry.storageVersionFingerprint,
            entry.contentSha256,
            entry.canonicalOrdinal,
          ],
        );
        if (rowCount(insertResult) !== 1) throw validationFailed('DISPOSAL_INVENTORY_CREATE_FAILED');
      }
      const audit = await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: this.sessionId(ctx),
          action: 'DISPOSAL_APPROVED',
          targetType: 'disposal_request',
          targetId: disposalRequestId,
          matterId: row.matter_id,
          metadata: {
            disposal_request_id: disposalRequestId,
            matter_id: row.matter_id,
            document_id: row.document_id,
            approver_user_id: ctx.userId,
            approval_count: 1,
            evidence_id: disposalOutboxId,
            hash: sealedInventory.inventoryHash,
            item_count: sealedInventory.entries.length,
            status_before: 'requested',
            status_after: 'approved',
          },
        },
        tx,
      );
      await this.workService.completeRecordsDisposalWork(tx, {
        tenantId: ctx.tenantId,
        disposalRequestId,
        actorUserId: ctx.userId,
        auditEventId: audit.eventId,
        kind: 'records_disposal_approval',
      });
      const workItem = await this.workService.openRecordsDisposalWork(tx, {
        tenantId: ctx.tenantId,
        disposalRequestId,
        matterId: row.matter_id,
        documentId: row.document_id,
        actorUserId: ctx.userId,
        auditEventId: audit.eventId,
        kind: 'records_disposal_execution',
      });
      await this.attachDisposalWorkflow(
        tx,
        ctx.tenantId,
        disposalRequestId,
        workItem.workItemId,
        workItem.dueAt,
        audit.eventId,
      );
      return mapDisposalRequest({
        ...row,
        pending_execution_ref: disposalOutboxId,
        due_at: workItem.dueAt,
        workflow_item_id: workItem.workItemId,
        workflow_audit_event_id: audit.eventId,
      });
    }, { isolationLevel: 'repeatable read' });
  }

  async executeDisposalRequest(
    ctx: PermissionContext,
    disposalRequestId: string,
  ): Promise<DisposalCertificateDto> {
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const request = await this.findDisposalRequest(tx, ctx.tenantId, disposalRequestId, true);
      if (!request) throw notFoundDenied();
      if (request.status === 'executed') {
        const existing = await tx.query<DisposalCertificateRow>(`
          SELECT certificate_id, disposal_request_id, matter_id, document_id,
            document_hash, certificate_hash, approved_by, executed_by, executed_at
          FROM disposal_certificates
          WHERE tenant_id = $1 AND disposal_request_id = $2
          LIMIT 1
        `, [ctx.tenantId, disposalRequestId]);
        const certificate = existing.rows[0];
        if (!certificate) throw validationFailed('DISPOSAL_CERTIFICATE_MISSING');
        return mapCertificate(certificate);
      }
      if (request.status !== 'approved' || !request.approved_by) {
        throw validationFailed('DISPOSAL_NOT_APPROVED');
      }
      const target = await this.findDocumentTarget(tx, ctx.tenantId, request.document_id, true);
      if (!target) throw notFoundDenied();
      this.assertNoHoldFlags(target);
      await this.assertNoActiveHoldsForDocument(tx, ctx.tenantId, request.matter_id, request.document_id);
      await this.assertNoBusinessReferences(tx, ctx.tenantId, request.document_id);
      const outbox = await tx.query<{
        disposal_outbox_id: string;
        inventory_hash: string;
        state: string;
      }>(`
        SELECT disposal_outbox_id, inventory_hash, state
        FROM records_disposal_outbox
        WHERE tenant_id = $1 AND disposal_request_id = $2
        FOR UPDATE
      `, [ctx.tenantId, disposalRequestId]);
      const sealed = outbox.rows[0];
      if (!sealed || sealed.state !== 'completed') {
        throw validationFailed('DISPOSAL_NOT_FULLY_PROVEN');
      }
      const receipts = await tx.query<{
        disposal_inventory_id: string;
        canonical_ordinal: number;
        outcome: DisposalReceiptOutcome | null;
        receipt_hash: string | null;
      }>(`
        SELECT inventory.disposal_inventory_id, inventory.canonical_ordinal,
          receipt.outcome, receipt.receipt_hash
        FROM records_disposal_inventory inventory
        LEFT JOIN records_disposal_receipts receipt
          ON receipt.tenant_id = inventory.tenant_id
          AND receipt.disposal_outbox_id = inventory.disposal_outbox_id
          AND receipt.disposal_inventory_id = inventory.disposal_inventory_id
        WHERE inventory.tenant_id = $1 AND inventory.disposal_outbox_id = $2
        ORDER BY inventory.canonical_ordinal ASC
        FOR UPDATE OF inventory, receipt
      `, [ctx.tenantId, sealed.disposal_outbox_id]);
      if (receipts.rows.length === 0 || receipts.rows.some((receipt) => !receipt.outcome || !receipt.receipt_hash)) {
        throw validationFailed('DISPOSAL_RECEIPTS_INCOMPLETE');
      }
      const receiptResultHash = sha256Hex(
        receipts.rows.map((receipt) => [
          receipt.canonical_ordinal,
          receipt.disposal_inventory_id,
          receipt.outcome,
          receipt.receipt_hash,
        ].join(':')).join('\n'),
      );
      const certificateHash = sha256Hex([
        disposalRequestId,
        request.matter_id,
        request.document_id,
        sealed.inventory_hash,
        receiptResultHash,
        request.approved_by,
      ].join(':'));
      const executed = await tx.query<{
        disposal_request_id: string;
        matter_id: string;
        document_id: string;
        approved_by: string;
        executed_by: string;
        executed_at: Date;
      }>(`
        UPDATE disposal_requests
        SET status = 'executed', executed_by = $3, executed_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND disposal_request_id = $2 AND status = 'approved'
        RETURNING disposal_request_id, matter_id, document_id, approved_by, executed_by, executed_at
      `, [ctx.tenantId, disposalRequestId, ctx.userId]);
      const execution = executed.rows[0];
      if (!execution) throw validationFailed('DISPOSAL_FINALIZATION_CONFLICT');
      const inserted = await tx.query<DisposalCertificateRow>(`
        INSERT INTO disposal_certificates (
          tenant_id, disposal_request_id, matter_id, document_id, document_hash,
          certificate_hash, approved_by, executed_by, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING certificate_id, disposal_request_id, matter_id, document_id,
          document_hash, certificate_hash, approved_by, executed_by, executed_at
      `, [
        ctx.tenantId,
        execution.disposal_request_id,
        execution.matter_id,
        execution.document_id,
        sealed.inventory_hash,
        certificateHash,
        execution.approved_by,
        execution.executed_by,
        execution.executed_at,
      ]);
      const certificate = inserted.rows[0];
      if (!certificate) throw validationFailed('DISPOSAL_CERTIFICATE_CREATE_FAILED');
      const audit = await this.auditService.log({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: this.sessionId(ctx),
        action: 'DISPOSAL_CERTIFICATE_CREATED',
        targetType: 'disposal_request',
        targetId: disposalRequestId,
        matterId: execution.matter_id,
        metadata: {
          disposal_request_id: disposalRequestId,
          document_id: execution.document_id,
          evidence_id: sealed.disposal_outbox_id,
          hash: certificateHash,
          item_count: receipts.rows.length,
          status_before: 'approved',
          status_after: 'executed',
        },
      }, tx);
      await this.workService.completeRecordsDisposalWork(tx, {
        tenantId: ctx.tenantId,
        disposalRequestId,
        actorUserId: ctx.userId,
        auditEventId: audit.eventId,
        kind: 'records_disposal_execution',
      });
      return mapCertificate(certificate);
    });
  }

  async authorizeDisposalRetry(
    ctx: PermissionContext,
    disposalRequestId: string,
    body: unknown,
  ): Promise<void> {
    const input = parseRetryDisposal(body);
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);
    await this.auditService.transaction(ctx.tenantId, async (tx) => {
      const outbox = await tx.query<{
        disposal_outbox_id: string;
        disposal_request_id: string;
        state: 'dead_letter' | 'blocked';
        last_error_code: string;
        terminal_at: Date;
        matter_id: string;
        document_id: string;
        document_legal_hold: boolean;
        matter_legal_hold: boolean;
      }>(`
        SELECT outbox.disposal_outbox_id, outbox.disposal_request_id, outbox.state,
          outbox.last_error_code, outbox.terminal_at, d.matter_id, d.document_id,
          d.legal_hold AS document_legal_hold, m.legal_hold AS matter_legal_hold
        FROM records_disposal_outbox outbox
        JOIN disposal_requests dr ON dr.tenant_id = outbox.tenant_id
          AND dr.disposal_request_id = outbox.disposal_request_id
        JOIN documents d ON d.tenant_id = dr.tenant_id AND d.document_id = dr.document_id
        JOIN matters m ON m.tenant_id = d.tenant_id AND m.matter_id = d.matter_id
        WHERE outbox.tenant_id = $1 AND outbox.disposal_request_id = $2
          AND outbox.state IN ('dead_letter', 'blocked')
          AND dr.status = 'approved'
        FOR UPDATE OF outbox, dr, d, m
      `, [ctx.tenantId, disposalRequestId]);
      const row = outbox.rows[0];
      if (!row || !row.last_error_code || !row.terminal_at) throw validationFailed('DISPOSAL_RETRY_NOT_REVIEWABLE');
      if (row.document_legal_hold || row.matter_legal_hold) {
        throw documentLocked('LEGAL_HOLD_ACTIVE');
      }
      const audit = await this.auditService.log({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: this.sessionId(ctx),
        action: 'DISPOSAL_RETRY_AUTHORIZED',
        targetType: 'records_disposal_outbox',
        targetId: row.disposal_outbox_id,
        matterId: row.matter_id,
        metadata: {
          disposal_request_id: row.disposal_request_id,
          document_id: row.document_id,
          evidence_id: row.disposal_outbox_id,
          reason_code: input.reasonCode,
          status_before: row.state,
          status_after: 'pending',
        },
      }, tx);
      await tx.query(`
        INSERT INTO records_disposal_retry_authorizations (
          tenant_id, disposal_outbox_id, terminal_state, terminal_error_code,
          retry_reason_code, authorized_by, audit_event_id, authorized_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      `, [ctx.tenantId, row.disposal_outbox_id, row.state, row.last_error_code, input.reasonCode, ctx.userId, audit.eventId]);
      const updated = await tx.query(`
        UPDATE records_disposal_outbox
        SET state = 'pending', claim_token = NULL, claim_started_at = NULL,
          terminal_at = NULL, last_error_code = NULL, updated_at = now()
        WHERE tenant_id = $1 AND disposal_outbox_id = $2
          AND state = $3
      `, [ctx.tenantId, row.disposal_outbox_id, row.state]);
      if (rowCount(updated) !== 1) throw validationFailed('DISPOSAL_RETRY_CONFLICT');
    });
  }

  async getDisposalCertificate(
    ctx: PermissionContext,
    disposalRequestId: string,
  ): Promise<DisposalCertificateDto> {
    this.assertContext(ctx);
    await this.assertRecordsAdmin(ctx.tenantId as TenantId, ctx.userId);
    return this.auditService.transaction(ctx.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT certificate_id, disposal_request_id, matter_id, document_id,
            document_hash, certificate_hash, approved_by, executed_by, executed_at
          FROM disposal_certificates
          WHERE tenant_id = $1
            AND disposal_request_id = $2
          LIMIT 1
        `,
        [ctx.tenantId, disposalRequestId],
      );
      const row = result.rows[0] as DisposalCertificateRow | undefined;
      if (!row) throw notFoundDenied();
      return mapCertificate(row);
    });
  }

  private assertContext(ctx: PermissionContext): void {
    if (!ctx.tenantId || !ctx.userId || !ctx.sessionId) throw validationFailed();
  }

  private sessionId(ctx: PermissionContext): string {
    if (!ctx.sessionId) throw validationFailed();
    return ctx.sessionId;
  }

  private documentHoldId(input: CreateLegalHoldRequestDto): string {
    if (input.holdScope !== 'document' || !input.documentId) {
      throw validationFailed('LEGAL_HOLD_SCOPE');
    }
    return input.documentId;
  }

  private async assertRecordsAdmin(tenantId: TenantId, actorUserId: string): Promise<void> {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    if (
      actor?.status === 'active' &&
      (actor.role === 'firm_admin' || actor.role === 'security_admin')
    ) {
      return;
    }
    throw permissionDenied();
  }

  private async assertCanEditMatter(ctx: PermissionContext, matterId: string): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canEditMatter(ctx, matterId);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', matterId });
    }
    if (decision?.effect === 'ALLOW') return;
    if (decision?.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
    throw permissionDenied();
  }

  private assertNoHoldFlags(target: DocumentTargetRow): void {
    if (target.document_legal_hold || target.matter_legal_hold) {
      throw documentLocked('LEGAL_HOLD_ACTIVE');
    }
  }

  private async assertNoActiveLegalHold(
    client: QueryClient,
    tenantId: string,
    matterId: string,
    holdScope: string,
    documentId: string | null,
  ): Promise<void> {
    if ((await this.countActiveHolds(client, tenantId, matterId, holdScope, documentId)) > 0) {
      throw validationFailed('ACTIVE_LEGAL_HOLD_EXISTS');
    }
  }

  private async assertNoActiveHoldsForDocument(
    client: QueryClient,
    tenantId: string,
    matterId: string,
    documentId: string,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT count(*)::text AS count
        FROM legal_holds
        WHERE tenant_id = $1
          AND status = 'active'
          AND (
            (hold_scope = 'matter' AND matter_id = $2)
            OR (hold_scope = 'document' AND document_id = $3)
          )
      `,
      [tenantId, matterId, documentId],
    );
    const count = Number((result.rows[0] as CountRow | undefined)?.count ?? '0');
    if (count > 0) throw documentLocked('LEGAL_HOLD_ACTIVE');
  }

  private async assertNoOpenDisposalRequest(
    client: QueryClient,
    tenantId: string,
    documentId: string,
  ): Promise<void> {
    const result = await client.query(
      `
        SELECT count(*)::text AS count
        FROM disposal_requests
        WHERE tenant_id = $1
          AND document_id = $2
          AND status IN ('requested', 'approved')
      `,
      [tenantId, documentId],
    );
    const count = Number((result.rows[0] as CountRow | undefined)?.count ?? '0');
    if (count > 0) throw validationFailed('DISPOSAL_REQUEST_ACTIVE');
  }

  private async assertNoBusinessReferences(
    client: QueryClient,
    tenantId: string,
    documentId: string,
  ): Promise<void> {
    for (const check of businessReferenceChecks) {
      const result = await client.query(check.sql, [tenantId, documentId]);
      const count = Number((result.rows[0] as CountRow | undefined)?.count ?? '0');
      if (count > 0) throw validationFailed(`DISPOSAL_REFERENCE_BLOCKED:${check.table}`);
    }
  }

  private async countActiveHolds(
    client: QueryClient,
    tenantId: string,
    matterId: string,
    holdScope: string,
    documentId: string | null,
  ): Promise<number> {
    const result = await client.query(
      `
        SELECT count(*)::text AS count
        FROM legal_holds
        WHERE tenant_id = $1
          AND matter_id = $2
          AND hold_scope = $3
          AND (($4::uuid IS NULL AND document_id IS NULL) OR document_id = $4::uuid)
          AND status = 'active'
      `,
      [tenantId, matterId, holdScope, documentId],
    );
    return Number((result.rows[0] as CountRow | undefined)?.count ?? '0');
  }

  private async findMatterTarget(
    client: QueryClient,
    tenantId: string,
    matterId: string,
    lockMatter: boolean,
  ): Promise<MatterTargetRow | null> {
    const result = await client.query(
      `
        SELECT matter_id, status, legal_hold
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
        ${lockMatter ? 'FOR UPDATE' : ''}
      `,
      [tenantId, matterId],
    );
    return (result.rows[0] as MatterTargetRow | undefined) ?? null;
  }

  private async findDocumentTarget(
    client: QueryClient,
    tenantId: string,
    documentId: string,
    lockDocument: boolean,
  ): Promise<DocumentTargetRow | null> {
    const result = await client.query(
      `
        SELECT d.document_id, d.matter_id, d.status, m.status AS matter_status,
          d.legal_hold AS document_legal_hold, m.legal_hold AS matter_legal_hold
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
        ${lockDocument ? 'FOR UPDATE OF d' : ''}
      `,
      [tenantId, documentId],
    );
    return (result.rows[0] as DocumentTargetRow | undefined) ?? null;
  }

  private async findLegalHold(
    client: QueryClient,
    tenantId: string,
    legalHoldId: string,
    lockHold: boolean,
  ): Promise<LegalHoldRow | null> {
    const result = await client.query(
      `
        SELECT legal_hold_id, matter_id, document_id, hold_scope, status, reason_code,
          created_by, released_by, created_at, released_at
        FROM legal_holds
        WHERE tenant_id = $1
          AND legal_hold_id = $2
        LIMIT 1
        ${lockHold ? 'FOR UPDATE' : ''}
      `,
      [tenantId, legalHoldId],
    );
    return (result.rows[0] as LegalHoldRow | undefined) ?? null;
  }

  private async findDisposalRequest(
    client: QueryClient,
    tenantId: string,
    disposalRequestId: string,
    lockRequest: boolean,
  ): Promise<DisposalRequestRow | null> {
    const result = await client.query(
      `
        SELECT dr.disposal_request_id, dr.matter_id, dr.document_id, dr.status,
          dr.reason_code, dr.requested_by, dr.approved_by, dr.executed_by,
          dr.assigned_to_user_id, dr.assigned_role, dr.due_at,
          dr.workflow_item_id, dr.workflow_audit_event_id,
          dr.created_at, dr.approved_at, dr.executed_at, dc.certificate_id,
          rdo.disposal_outbox_id AS pending_execution_ref
        FROM disposal_requests dr
        LEFT JOIN disposal_certificates dc
          ON dc.tenant_id = dr.tenant_id
          AND dc.disposal_request_id = dr.disposal_request_id
        LEFT JOIN records_disposal_outbox rdo
          ON rdo.tenant_id = dr.tenant_id
          AND rdo.disposal_request_id = dr.disposal_request_id
        WHERE dr.tenant_id = $1
          AND dr.disposal_request_id = $2
        LIMIT 1
        ${lockRequest ? 'FOR UPDATE OF dr' : ''}
      `,
      [tenantId, disposalRequestId],
    );
    return (result.rows[0] as DisposalRequestRow | undefined) ?? null;
  }

  private async attachDisposalWorkflow(
    client: QueryClient,
    tenantId: string,
    disposalRequestId: string,
    workItemId: string,
    dueAt: Date,
    auditEventId: string,
  ): Promise<void> {
    const result = await client.query(
      `
        UPDATE disposal_requests
        SET workflow_item_id = $3,
          workflow_audit_event_id = $4,
          due_at = $5,
          updated_at = now()
        WHERE tenant_id = $1
          AND disposal_request_id = $2
      `,
      [tenantId, disposalRequestId, workItemId, auditEventId, dueAt],
    );
    if (rowCount(result) !== 1) throw validationFailed('DISPOSAL_WORKFLOW_ATTACH_FAILED');
  }

  private async listVersionFiles(
    client: QueryClient,
    tenantId: string,
    documentId: string,
  ): Promise<VersionFileRow[]> {
    const result = await client.query(
      `
        SELECT dv.version_id, dv.file_object_id, dv.file_hash, f.storage_uri, f.sha256
        FROM document_versions dv
        JOIN file_objects f
          ON f.tenant_id = dv.tenant_id
          AND f.file_object_id = dv.file_object_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
        ORDER BY dv.version_no ASC, dv.version_id ASC
      `,
      [tenantId, documentId],
    );
    return result.rows as VersionFileRow[];
  }

  private async listPreviewFiles(
    client: QueryClient,
    tenantId: string,
    documentId: string,
  ): Promise<FileObjectRefRow[]> {
    const result = await client.query(
      `
        SELECT dpa.file_object_id, f.storage_uri, f.sha256
        FROM document_preview_artifacts dpa
        JOIN file_objects f
          ON f.tenant_id = dpa.tenant_id
          AND f.file_object_id = dpa.file_object_id
        WHERE dpa.tenant_id = $1
          AND dpa.document_id = $2
        ORDER BY dpa.file_object_id ASC
      `,
      [tenantId, documentId],
    );
    return result.rows as FileObjectRefRow[];
  }

  private async buildSealedInventory(
    client: QueryClient,
    input: { tenantId: string; documentId: string },
  ): Promise<{ entries: SealedDisposalInventoryEntry[]; inventoryHash: string }> {
    const versionFiles = await this.listVersionFiles(client, input.tenantId, input.documentId);
    if (versionFiles.length === 0) throw validationFailed('DISPOSAL_FILE_OBJECT_REQUIRED');
    const previewFiles = await this.listPreviewFiles(client, input.tenantId, input.documentId);
    const objects: Array<{
      documentVersionId: string | null;
      fileObjectId: string;
      objectKind: DisposalInventoryObjectKind;
      storageUri: string;
      contentSha256: string;
    }> = [
      ...versionFiles.map((file) => ({
        documentVersionId: file.version_id,
        fileObjectId: file.file_object_id,
        objectKind: 'document_version' as const,
        storageUri: file.storage_uri,
        contentSha256: file.file_hash,
      })),
      ...previewFiles.map((file) => ({
        documentVersionId: null,
        fileObjectId: file.file_object_id,
        objectKind: 'preview_derivative' as const,
        storageUri: file.storage_uri,
        contentSha256: file.sha256,
      })),
    ].sort((left, right) =>
      [left.objectKind, left.documentVersionId ?? '', left.fileObjectId].join(':').localeCompare(
        [right.objectKind, right.documentVersionId ?? '', right.fileObjectId].join(':'),
      ),
    );
    const entries: SealedDisposalInventoryEntry[] = [];
    for (const [index, object] of objects.entries()) {
      const storageVersionFingerprint = await this.storageService.latestVersionFingerprintByStorageUri(
        input.tenantId,
        object.storageUri,
      );
      entries.push({
        documentId: input.documentId,
        documentVersionId: object.documentVersionId,
        fileObjectId: object.fileObjectId,
        objectKind: object.objectKind,
        storageKeyHash: sha256Hex(object.storageUri),
        storageVersionFingerprint,
        contentSha256: object.contentSha256,
        canonicalOrdinal: index + 1,
      });
    }
    return { entries, inventoryHash: sealedDisposalInventoryHash(entries) };
  }

}
