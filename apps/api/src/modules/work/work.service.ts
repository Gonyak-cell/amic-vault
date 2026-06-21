import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  dmsWorkQueueResponseSchema,
  isUserRole,
  type DmsOperationalTone,
  type DmsWorkItemSource,
  type DmsWorkItemStatus,
  type DmsWorkQueueItemDto,
  type DmsWorkQueueResponseDto,
  type UserRole,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  PermissionQueryBuilder,
  type PermissionQueryContext,
} from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';

const recordsAdminRoles = new Set<UserRole>(['firm_admin', 'security_admin']);

type RecordsDisposalKind = 'records_disposal_approval' | 'records_disposal_execution';
type DocumentOperationalKind =
  | 'document_extraction_failed'
  | 'document_ocr_pending'
  | 'document_metadata_required'
  | 'duplicate_decision_pending'
  | 'upload_exception';
type WorkItemKind = RecordsDisposalKind | DocumentOperationalKind;

export interface OpenRecordsDisposalWorkInput {
  tenantId: string;
  disposalRequestId: string;
  matterId: string;
  documentId: string;
  actorUserId: string;
  auditEventId: string;
  kind: RecordsDisposalKind;
}

export interface CompleteRecordsDisposalWorkInput {
  tenantId: string;
  disposalRequestId: string;
  actorUserId: string;
  auditEventId: string;
  kind: RecordsDisposalKind;
}

export interface WorkItemRef {
  workItemId: string;
  dueAt: Date;
}

interface ActorRow {
  role: string;
  status: string;
}

interface WorkItemRow {
  work_item_id: string;
  source: DmsWorkItemSource;
  kind: WorkItemKind;
  status: DmsWorkItemStatus;
  due_at: Date;
  updated_at: Date;
  matter_label: string | null;
  disposal_status: string | null;
  reason_code: string | null;
  document_title: string | null;
  document_status: string | null;
  document_type: string | null;
  extraction_status: string | null;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function iso(value: Date): string {
  return value.toISOString();
}

function stableKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function safeMatterLabel(value: string | null): string {
  return value?.trim() || '사건 정보 없음';
}

function safeDocumentLabel(value: string | null): string {
  return value?.trim() || '문서 정보 없음';
}

function statusLabel(status: DmsWorkItemStatus): string {
  const labels: Record<DmsWorkItemStatus, string> = {
    open: '대기',
    in_progress: '진행 중',
    completed: '완료',
    cancelled: '취소',
  };
  return labels[status];
}

function titleForKind(kind: RecordsDisposalKind): string {
  return kind === 'records_disposal_execution' ? '삭제 실행 대기' : '삭제 승인 요청';
}

function descriptionForRow(row: WorkItemRow): string {
  return `${safeMatterLabel(row.matter_label)} · ${statusLabel(row.status)} · ${
    row.reason_code ?? '기록 보존'
  }`;
}

function toneForRow(row: WorkItemRow, now: Date): DmsOperationalTone {
  if (row.due_at.getTime() < now.getTime()) return 'blocked';
  if (row.due_at.getTime() - now.getTime() <= 48 * 60 * 60 * 1000) return 'warning';
  return row.kind === 'records_disposal_execution' ? 'warning' : 'neutral';
}

function isRecordsDisposalKind(kind: WorkItemKind): kind is RecordsDisposalKind {
  return kind === 'records_disposal_approval' || kind === 'records_disposal_execution';
}

function titleForDocumentKind(kind: DocumentOperationalKind): string {
  const labels: Record<DocumentOperationalKind, string> = {
    document_extraction_failed: '추출 실패 확인',
    document_ocr_pending: 'OCR 처리 대기',
    document_metadata_required: '메타데이터 보완 필요',
    duplicate_decision_pending: '중복 결정 대기',
    upload_exception: '업로드 예외 확인',
  };
  return labels[kind];
}

function descriptionForDocumentRow(row: WorkItemRow): string {
  const detail =
    row.kind === 'document_extraction_failed'
      ? '추출 실패'
      : row.kind === 'document_ocr_pending'
        ? 'OCR 필요'
        : row.kind === 'document_metadata_required'
          ? '문서 유형 또는 세부 분류 보완'
          : '문서 작업 확인';
  return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(row.document_title)} · ${detail}`;
}

function hrefForDocumentKind(kind: DocumentOperationalKind): string {
  if (kind === 'document_extraction_failed') return '/files?extractionStatus=failed';
  if (kind === 'document_ocr_pending') return '/files?extractionStatus=ocr_pending';
  if (kind === 'document_metadata_required') return '/files?status=draft';
  return '/files?sortBy=updated_desc';
}

function toneForDocumentRow(row: WorkItemRow, now: Date): DmsOperationalTone {
  if (row.kind === 'document_extraction_failed') return 'blocked';
  if (row.due_at.getTime() < now.getTime()) return 'blocked';
  return 'warning';
}

@Injectable()
export class WorkService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(PermissionQueryBuilder) private readonly permissionQuery: PermissionQueryBuilder,
  ) {}

  async listWorkItems(actorUserId: string, now = new Date()): Promise<DmsWorkQueueResponseDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const actor = await this.findActor(client, context.tenantId, actorUserId);
      if (!actor) throw permissionDenied();
      await this.refreshDocumentOperationalWorkItems(client, actor);
      const rows = await this.listWorkItemRows(client, actor);
      return dmsWorkQueueResponseSchema.parse({
        generatedAt: now.toISOString(),
        source: 'persisted_work_items',
        items: rows.map((row) => this.mapRecordsDisposalItem(row, now)),
      });
    });
  }

  async openRecordsDisposalWork(
    client: QueryClient,
    input: OpenRecordsDisposalWorkInput,
  ): Promise<WorkItemRef> {
    const result = await client.query(
      `
        INSERT INTO work_items (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          status, assignment_scope, due_at, created_by, created_audit_event_id,
          last_audit_event_id
        )
        VALUES (
          $1, 'records', $2, 'disposal_request', $3, $4, $5,
          'open', 'records_admin', now() + interval '7 days', $6, $7, $7
        )
        ON CONFLICT (tenant_id, source, kind, target_type, target_id)
        DO UPDATE SET
          status = 'open',
          completed_by = NULL,
          completed_at = NULL,
          due_at = EXCLUDED.due_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
        RETURNING work_item_id, due_at
      `,
      [
        input.tenantId,
        input.kind,
        input.disposalRequestId,
        input.matterId,
        input.documentId,
        input.actorUserId,
        input.auditEventId,
      ],
    );
    const row = result.rows[0] as { work_item_id: string; due_at: Date } | undefined;
    if (!row) throw new Error('work item insert returned no row');
    return { workItemId: row.work_item_id, dueAt: row.due_at };
  }

  async completeRecordsDisposalWork(
    client: QueryClient,
    input: CompleteRecordsDisposalWorkInput,
  ): Promise<void> {
    await client.query(
      `
        UPDATE work_items
        SET status = 'completed',
          completed_by = $4,
          completed_at = now(),
          last_audit_event_id = $5,
          updated_at = now()
        WHERE tenant_id = $1
          AND source = 'records'
          AND kind = $2
          AND target_type = 'disposal_request'
          AND target_id = $3
          AND status IN ('open', 'in_progress')
      `,
      [
        input.tenantId,
        input.kind,
        input.disposalRequestId,
        input.actorUserId,
        input.auditEventId,
      ],
    );
  }

  private async findActor(
    client: QueryClient,
    tenantId: string,
    userId: string,
  ): Promise<PermissionQueryContext | null> {
    const result = await client.query(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [tenantId, userId],
    );
    const row = result.rows[0] as ActorRow | undefined;
    if (!row || row.status !== 'active' || !isUserRole(row.role)) return null;
    return { tenantId, userId, role: row.role };
  }

  private async refreshDocumentOperationalWorkItems(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 4, 'm');
    const canRefreshAllVisible = recordsAdminRoles.has(actor.role);
    await client.query(
      `
        WITH document_candidates AS (
          SELECT
            d.tenant_id,
            d.matter_id,
            d.document_id,
            d.created_by,
            latest_audit.event_id,
            CASE
              WHEN cd.extraction_status = 'failed' THEN 'document_extraction_failed'
              WHEN cd.extraction_status = 'ocr_pending' THEN 'document_ocr_pending'
              WHEN d.status = 'draft' AND (d.document_type = 'other' OR d.subtype IS NULL)
                THEN 'document_metadata_required'
              ELSE NULL
            END AS kind,
            CASE
              WHEN cd.extraction_status = 'failed' THEN coalesce(cd.updated_at, d.updated_at) + interval '1 day'
              WHEN cd.extraction_status = 'ocr_pending' THEN coalesce(cd.updated_at, d.updated_at) + interval '3 days'
              WHEN d.status = 'draft' AND (d.document_type = 'other' OR d.subtype IS NULL)
                THEN d.updated_at + interval '2 days'
              ELSE d.updated_at + interval '2 days'
            END AS due_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          LEFT JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND dv.version_status = 'current'
          LEFT JOIN canonical_documents cd
            ON cd.tenant_id = dv.tenant_id
           AND cd.version_id = dv.version_id
          JOIN LATERAL (
            SELECT ae.event_id
            FROM audit_events ae
            WHERE ae.tenant_id = d.tenant_id
              AND ae.target_type = 'document'
              AND ae.target_id = d.document_id
              AND ae.action IN (
                'DOCUMENT_UPLOADED',
                'DOCUMENT_VERSION_ADDED',
                'DOCUMENT_METADATA_CHANGED',
                'DOCUMENT_TEXT_EXTRACTED'
              )
            ORDER BY ae.created_at DESC, ae.event_id DESC
            LIMIT 1
          ) latest_audit ON TRUE
          WHERE d.tenant_id = $1
            AND d.status <> 'deleted'
            AND ($3::boolean OR d.created_by = $2::uuid)
            AND (${matterFilter.sql})
        ),
        actionable AS (
          SELECT *
          FROM document_candidates
          WHERE kind IS NOT NULL
        )
        INSERT INTO work_items (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          status, assignment_scope, assigned_to_user_id, due_at, created_by,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id, 'operational_data', kind, 'document', document_id, matter_id, document_id,
          'open', 'user', created_by, due_at, created_by, event_id, event_id
        FROM actionable
        ON CONFLICT (tenant_id, source, kind, target_type, target_id)
        DO UPDATE SET
          status = 'open',
          assigned_to_user_id = EXCLUDED.assigned_to_user_id,
          completed_by = NULL,
          completed_at = NULL,
          due_at = EXCLUDED.due_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          updated_at = now()
      `,
      [actor.tenantId, actor.userId, canRefreshAllVisible, ...matterFilter.params],
    );

    await client.query(
      `
        UPDATE work_items wi
        SET status = 'cancelled',
          completed_by = wi.created_by,
          completed_at = now(),
          updated_at = now()
        WHERE wi.tenant_id = $1
          AND wi.source = 'operational_data'
          AND wi.target_type = 'document'
          AND wi.kind IN (
            'document_extraction_failed',
            'document_ocr_pending',
            'document_metadata_required'
          )
          AND wi.status IN ('open', 'in_progress')
          AND NOT EXISTS (
            SELECT 1
            FROM documents d
            LEFT JOIN document_versions dv
              ON dv.tenant_id = d.tenant_id
             AND dv.document_id = d.document_id
             AND dv.version_status = 'current'
            LEFT JOIN canonical_documents cd
              ON cd.tenant_id = dv.tenant_id
             AND cd.version_id = dv.version_id
            WHERE d.tenant_id = wi.tenant_id
              AND d.document_id = wi.target_id
              AND d.status <> 'deleted'
              AND (
                (wi.kind = 'document_extraction_failed' AND cd.extraction_status = 'failed')
                OR (wi.kind = 'document_ocr_pending' AND cd.extraction_status = 'ocr_pending')
                OR (
                  wi.kind = 'document_metadata_required'
                  AND d.status = 'draft'
                  AND (d.document_type = 'other' OR d.subtype IS NULL)
                )
              )
          )
      `,
      [actor.tenantId],
    );
  }

  private async listWorkItemRows(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<WorkItemRow[]> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 4, 'm');
    const canViewRecordsAdmin = recordsAdminRoles.has(actor.role);
    const result = await client.query(
      `
        SELECT
          wi.work_item_id,
          wi.source,
          wi.kind,
          wi.status,
          wi.due_at,
          wi.updated_at,
          nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
          dr.status AS disposal_status,
          dr.reason_code,
          d.title AS document_title,
          d.status AS document_status,
          d.document_type,
          cd.extraction_status
        FROM work_items wi
        JOIN matters m
          ON m.tenant_id = wi.tenant_id
         AND m.matter_id = wi.matter_id
        LEFT JOIN disposal_requests dr
          ON wi.target_type = 'disposal_request'
         AND dr.tenant_id = wi.tenant_id
         AND dr.disposal_request_id = wi.target_id
        LEFT JOIN documents d
          ON wi.target_type = 'document'
         AND d.tenant_id = wi.tenant_id
         AND d.document_id = wi.target_id
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
         AND cd.version_id = dv.version_id
        WHERE wi.tenant_id = $1
          AND wi.source IN ('records', 'operational_data')
          AND wi.status IN ('open', 'in_progress')
          AND (
            (wi.assignment_scope = 'records_admin' AND $3::boolean)
            OR (
              wi.assignment_scope = 'user'
              AND (wi.assigned_to_user_id = $2::uuid OR $3::boolean)
            )
          )
          AND (
            (wi.target_type = 'disposal_request' AND dr.disposal_request_id IS NOT NULL)
            OR (wi.target_type = 'document' AND d.document_id IS NOT NULL)
          )
          AND (${matterFilter.sql})
        ORDER BY
          CASE WHEN wi.source = 'records' THEN 0 ELSE 1 END,
          wi.due_at ASC,
          wi.updated_at DESC,
          wi.work_item_id
        LIMIT 20
      `,
      [actor.tenantId, actor.userId, canViewRecordsAdmin, ...matterFilter.params],
    );
    return result.rows as WorkItemRow[];
  }

  private mapRecordsDisposalItem(row: WorkItemRow, now: Date): DmsWorkQueueItemDto {
    if (!isRecordsDisposalKind(row.kind)) return this.mapDocumentOperationalItem(row, now);
    return {
      itemKey: `records-disposal-${stableKey(row.work_item_id)}`,
      source: 'records',
      sourceLabel: '기록 보존',
      title: titleForKind(row.kind),
      description: descriptionForRow(row),
      href: '/records?tab=disposal',
      tone: toneForRow(row, now),
      status: row.status,
      statusLabel: statusLabel(row.status),
      dueAt: iso(row.due_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapDocumentOperationalItem(row: WorkItemRow, now: Date): DmsWorkQueueItemDto {
    const kind = row.kind as DocumentOperationalKind;
    return {
      itemKey: `document-work-${stableKey(row.work_item_id)}`,
      source: 'operational_data',
      sourceLabel: '문서 운영',
      title: titleForDocumentKind(kind),
      description: descriptionForDocumentRow(row),
      href: hrefForDocumentKind(kind),
      tone: toneForDocumentRow(row, now),
      status: row.status,
      statusLabel: statusLabel(row.status),
      dueAt: iso(row.due_at),
      updatedAt: iso(row.updated_at),
    };
  }
}
