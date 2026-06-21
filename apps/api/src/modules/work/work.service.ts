import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  dmsWorkQueueResponseSchema,
  isUserRole,
  type DmsOperationalTone,
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
  kind: RecordsDisposalKind;
  status: DmsWorkItemStatus;
  due_at: Date;
  updated_at: Date;
  matter_label: string | null;
  disposal_status: string;
  reason_code: string;
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
  return `${safeMatterLabel(row.matter_label)} · ${statusLabel(row.status)} · ${row.reason_code}`;
}

function toneForRow(row: WorkItemRow, now: Date): DmsOperationalTone {
  if (row.due_at.getTime() < now.getTime()) return 'blocked';
  if (row.due_at.getTime() - now.getTime() <= 48 * 60 * 60 * 1000) return 'warning';
  return row.kind === 'records_disposal_execution' ? 'warning' : 'neutral';
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
      if (!recordsAdminRoles.has(actor.role)) {
        return dmsWorkQueueResponseSchema.parse({
          generatedAt: now.toISOString(),
          source: 'persisted_work_items',
          items: [],
        });
      }
      const rows = await this.listRecordsDisposalRows(client, actor);
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

  private async listRecordsDisposalRows(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<WorkItemRow[]> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 2, 'm');
    const result = await client.query(
      `
        SELECT
          wi.work_item_id,
          wi.kind,
          wi.status,
          wi.due_at,
          wi.updated_at,
          nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
          dr.status AS disposal_status,
          dr.reason_code
        FROM work_items wi
        JOIN disposal_requests dr
          ON dr.tenant_id = wi.tenant_id
         AND dr.disposal_request_id = wi.target_id
        JOIN matters m
          ON m.tenant_id = wi.tenant_id
         AND m.matter_id = wi.matter_id
        WHERE wi.tenant_id = $1
          AND wi.source = 'records'
          AND wi.status IN ('open', 'in_progress')
          AND wi.assignment_scope = 'records_admin'
          AND (${matterFilter.sql})
        ORDER BY wi.due_at ASC, wi.updated_at DESC, wi.work_item_id
        LIMIT 20
      `,
      [actor.tenantId, ...matterFilter.params],
    );
    return result.rows as WorkItemRow[];
  }

  private mapRecordsDisposalItem(row: WorkItemRow, now: Date): DmsWorkQueueItemDto {
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
}
