import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  dmsNotificationCenterResponseSchema,
  isUserRole,
  type DmsNotificationCenterResponseDto,
  type DmsNotificationItemDto,
  type DmsNotificationSource,
  type DmsNotificationStatus,
  type DmsOperationalTone,
  type UserRole,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  PermissionQueryBuilder,
  type PermissionQueryContext,
} from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';

const recordsAdminRoles = new Set<UserRole>(['firm_admin', 'security_admin']);
const notificationKeyPrefix = 'notification-';

type NotificationKind =
  | 'processing_complete'
  | 'processing_failed'
  | 'duplicate_decision_pending'
  | 'edit_lock_expired'
  | 'edit_lock_released'
  | 'break_glass_approval_requested'
  | 'legal_hold_active'
  | 'disposal_approval_requested'
  | 'disposal_execution_ready'
  | 'dd_rfi_overdue'
  | 'dd_rfi_unmapped'
  | 'litigation_deadline'
  | 'dlp_bulk_download'
  | 'email_autofile_completed';

interface ActorRow {
  role: string;
  status: string;
}

interface NotificationRow {
  notification_id: string;
  source: DmsNotificationSource;
  kind: NotificationKind;
  matter_id: string;
  target_id: string;
  status: DmsNotificationStatus;
  occurred_at: Date;
  matter_label: string | null;
  document_title: string | null;
  extraction_status: string | null;
  hold_scope: string | null;
  legal_hold_reason_code: string | null;
  disposal_status: string | null;
  disposal_reason_code: string | null;
  break_glass_status: string | null;
  break_glass_reason_code: string | null;
  rfi_code: string | null;
  rfi_title: string | null;
  rfi_status: string | null;
  rfi_due_date: Date | string | null;
  hearing_title: string | null;
  hearing_type: string | null;
  hearing_scheduled_at: Date | null;
  dlp_actor_name: string | null;
  dlp_actor_email: string | null;
  dlp_event_count: number | null;
  dlp_total_bytes: string | number | null;
  dlp_threshold_count: number | null;
  dlp_threshold_bytes: string | number | null;
  dlp_window_start: Date | null;
  dlp_window_end: Date | null;
  due_at: Date | null;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function stableKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function parseNotificationKey(itemKey: string): string {
  if (!itemKey.startsWith(notificationKeyPrefix)) throw notFoundDenied();
  const digest = itemKey.slice(notificationKeyPrefix.length);
  if (!/^[0-9a-f]{16}$/.test(digest)) throw notFoundDenied();
  return digest;
}

function safeMatterLabel(value: string | null): string {
  return value?.trim() || '사건 정보 없음';
}

function safeDocumentLabel(value: string | null): string {
  return value?.trim() || '문서 정보 없음';
}

function statusLabel(status: DmsNotificationStatus): string {
  return status === 'read' ? '읽음' : '새 알림';
}

function holdScopeLabel(scope: string | null): string {
  if (scope === 'document') return '문서 보존';
  if (scope === 'matter') return 'Matter 보존';
  return '보존 상태';
}

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function formatBytes(value: string | number | null): string {
  const bytes = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let scaled = bytes;
  let unit: (typeof units)[number] = units[0];
  for (const nextUnit of units) {
    scaled /= 1024;
    unit = nextUnit;
    if (scaled < 1024 || nextUnit === 'TB') break;
  }
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}${unit}`;
}

function titleForKind(kind: NotificationKind): string {
  const labels: Record<NotificationKind, string> = {
    processing_complete: '문서 처리 완료',
    processing_failed: '문서 처리 실패',
    duplicate_decision_pending: '중복 결정 대기',
    edit_lock_expired: '편집 잠금 만료',
    edit_lock_released: '편집 잠금 해제',
    break_glass_approval_requested: 'Break-glass 승인 요청',
    legal_hold_active: 'Legal Hold 적용',
    disposal_approval_requested: '삭제 승인 요청',
    disposal_execution_ready: '삭제 실행 대기',
    dd_rfi_overdue: '기한 초과 RFI',
    dd_rfi_unmapped: '미매핑 RFI',
    litigation_deadline: '송무 기일',
    dlp_bulk_download: '대량 다운로드 감지',
    email_autofile_completed: '이메일 자동 저장',
  };
  return labels[kind];
}

function categoryForKind(kind: NotificationKind): string {
  if (kind === 'break_glass_approval_requested' || kind === 'dlp_bulk_download') {
    return '보안 운영';
  }
  if (kind === 'legal_hold_active' || kind.startsWith('disposal_')) return '기록 보존';
  if (kind.startsWith('dd_rfi_')) return 'DD 요청';
  if (kind === 'litigation_deadline') return '송무';
  if (kind === 'email_autofile_completed') return '이메일';
  if (kind === 'edit_lock_expired' || kind === 'edit_lock_released') return '편집 잠금';
  return '문서 처리';
}

function hrefForKind(row: NotificationRow): string {
  const kind = row.kind;
  if (kind === 'processing_complete') return '/files?extractionStatus=ready';
  if (kind === 'processing_failed') return '/files?extractionStatus=failed';
  if (kind === 'duplicate_decision_pending') return '/work';
  if (kind === 'edit_lock_expired' || kind === 'edit_lock_released') return '/files';
  if (kind === 'break_glass_approval_requested') return '/admin/security';
  if (kind === 'dlp_bulk_download') return '/admin/security?panel=dlp-downloads';
  if (kind === 'legal_hold_active') return '/records?tab=holds';
  if (kind === 'dd_rfi_overdue' || kind === 'dd_rfi_unmapped') {
    return `/matters/${row.matter_id}/dd?rfiId=${row.target_id}`;
  }
  if (kind === 'litigation_deadline') {
    return `/matters/${row.matter_id}/litigation?hearingId=${row.target_id}`;
  }
  if (kind === 'email_autofile_completed') return `/matters/${row.matter_id}`;
  return '/records?tab=disposal';
}

function toneForKind(kind: NotificationKind): DmsOperationalTone {
  if (kind === 'processing_complete') return 'success';
  if (kind === 'processing_failed') return 'blocked';
  if (kind === 'edit_lock_expired') return 'warning';
  if (kind === 'edit_lock_released') return 'neutral';
  if (kind === 'break_glass_approval_requested') return 'warning';
  if (kind === 'dlp_bulk_download') return 'warning';
  if (kind === 'legal_hold_active') return 'warning';
  if (kind === 'dd_rfi_overdue' || kind === 'dd_rfi_unmapped') return 'warning';
  if (kind === 'litigation_deadline') return 'warning';
  if (kind === 'email_autofile_completed') return 'success';
  return 'warning';
}

function descriptionForRow(row: NotificationRow): string {
  if (row.kind === 'break_glass_approval_requested') {
    return `${safeMatterLabel(row.matter_label)} · ${
      row.break_glass_reason_code ?? '보안 예외'
    } · 승인 필요`;
  }
  if (row.kind === 'dlp_bulk_download') {
    const actor = row.dlp_actor_name?.trim() || row.dlp_actor_email?.trim() || '사용자';
    return `${actor} · ${row.dlp_event_count ?? 0}건 · ${formatBytes(row.dlp_total_bytes)}`;
  }
  if (row.kind === 'legal_hold_active') {
    return `${safeMatterLabel(row.matter_label)} · ${holdScopeLabel(row.hold_scope)} · ${
      row.legal_hold_reason_code ?? '기록 보존'
    }`;
  }
  if (row.kind === 'disposal_approval_requested' || row.kind === 'disposal_execution_ready') {
    return `${safeMatterLabel(row.matter_label)} · ${row.disposal_reason_code ?? '기록 보존'} · ${
      row.disposal_status ?? '확인 필요'
    }`;
  }
  if (row.kind === 'dd_rfi_overdue') {
    return `${safeMatterLabel(row.matter_label)} · ${row.rfi_code ?? 'RFI'} · ${
      dateOnly(row.rfi_due_date) ?? '기한 정보 없음'
    }`;
  }
  if (row.kind === 'dd_rfi_unmapped') {
    return `${safeMatterLabel(row.matter_label)} · ${row.rfi_code ?? 'RFI'} · 자료 미매핑`;
  }
  if (row.kind === 'litigation_deadline') {
    return `${safeMatterLabel(row.matter_label)} · ${row.hearing_title ?? '송무 기일'} · ${
      dateOnly(row.hearing_scheduled_at) ?? '기일 정보 없음'
    }`;
  }
  if (row.kind === 'email_autofile_completed') {
    return `${safeMatterLabel(row.matter_label)} · 자동 저장 완료`;
  }
  if (row.kind === 'duplicate_decision_pending') {
    return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(
      row.document_title,
    )} · 중복 처리 결정 필요`;
  }
  if (row.kind === 'edit_lock_expired') {
    return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(
      row.document_title,
    )} · 편집 잠금 만료`;
  }
  if (row.kind === 'edit_lock_released') {
    return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(
      row.document_title,
    )} · 편집 잠금 해제`;
  }
  const processingLabel = row.kind === 'processing_complete' ? '추출 완료' : '추출 실패';
  return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(
    row.document_title,
  )} · ${processingLabel}`;
}

function mapNotification(row: NotificationRow): DmsNotificationItemDto {
  return {
    itemKey: `${notificationKeyPrefix}${stableKey(row.notification_id)}`,
    source: row.source,
    category: categoryForKind(row.kind),
    title: titleForKind(row.kind),
    description: descriptionForRow(row),
    tone: toneForKind(row.kind),
    href: hrefForKind(row),
    status: row.status,
    statusLabel: statusLabel(row.status),
    occurredAt: row.occurred_at.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(PermissionQueryBuilder) private readonly permissionQuery: PermissionQueryBuilder,
  ) {}

  async listNotifications(
    actorUserId: string,
    now = new Date(),
  ): Promise<DmsNotificationCenterResponseDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const actor = await this.findActor(client, context.tenantId, actorUserId);
      if (!actor) throw permissionDenied();
      await this.refreshNotifications(client, actor);
      const rows = await this.listNotificationRows(client, actor);
      return dmsNotificationCenterResponseSchema.parse({
        generatedAt: now.toISOString(),
        source: 'persisted_notifications',
        items: rows.map(mapNotification),
      });
    });
  }

  async markRead(
    actorUserId: string,
    itemKey: string,
  ): Promise<{ itemKey: string; status: 'read' }> {
    const digest = parseNotificationKey(itemKey);
    const context = this.tenantContext.require();
    await this.auditService.transaction(context.tenantId, async (client) => {
      const actor = await this.findActor(client, context.tenantId, actorUserId);
      if (!actor) throw permissionDenied();
      const rowCount = await this.updateVisibleNotification(client, actor, digest, 'read');
      if (rowCount !== 1) throw notFoundDenied();
    });
    return { itemKey, status: 'read' };
  }

  async dismiss(
    actorUserId: string,
    itemKey: string,
  ): Promise<{ itemKey: string; status: 'dismissed' }> {
    const digest = parseNotificationKey(itemKey);
    const context = this.tenantContext.require();
    await this.auditService.transaction(context.tenantId, async (client) => {
      const actor = await this.findActor(client, context.tenantId, actorUserId);
      if (!actor) throw permissionDenied();
      const rowCount = await this.updateVisibleNotification(client, actor, digest, 'dismissed');
      if (rowCount !== 1) throw notFoundDenied();
    });
    return { itemKey, status: 'dismissed' };
  }

  async refreshDdRfiNotificationsForTenant(tenantId: string): Promise<{ refreshedCount: number }> {
    return this.auditService.transaction(tenantId, async (client) => {
      const result = await this.refreshDdRfiNotifications(client, tenantId);
      return { refreshedCount: result.rowCount ?? 0 };
    });
  }

  async refreshLitigationDeadlineNotificationsForTenant(
    tenantId: string,
  ): Promise<{ refreshedCount: number }> {
    return this.auditService.transaction(tenantId, async (client) => {
      const result = await this.refreshLitigationDeadlineNotifications(client, tenantId);
      return { refreshedCount: result.rowCount ?? 0 };
    });
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

  private async refreshNotifications(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    await this.refreshDocumentProcessingNotifications(client, actor);
    await this.refreshDuplicateWorkNotifications(client, actor);
    await this.refreshDdRfiNotifications(client, actor.tenantId);
    await this.refreshLitigationDeadlineNotifications(client, actor.tenantId);
    if (recordsAdminRoles.has(actor.role)) {
      await this.refreshRecordsNotifications(client, actor);
      await this.refreshBreakGlassNotifications(client, actor);
    }
    await this.cancelResolvedNotifications(client, actor);
  }

  private async refreshDocumentProcessingNotifications(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 4, 'm');
    const canRefreshAllVisible = recordsAdminRoles.has(actor.role);
    await client.query(
      `
        WITH candidates AS (
          SELECT
            d.tenant_id,
            d.matter_id,
            d.document_id,
            d.created_by,
            cd.extraction_status,
            COALESCE(cd.extracted_at, ae.created_at, cd.updated_at) AS occurred_at,
            ae.event_id
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND dv.version_status = 'current'
          JOIN canonical_documents cd
            ON cd.tenant_id = dv.tenant_id
           AND cd.version_id = dv.version_id
          JOIN LATERAL (
            SELECT ae.event_id, ae.created_at
            FROM audit_events ae
            WHERE ae.tenant_id = d.tenant_id
              AND ae.target_type = 'document'
              AND ae.target_id = d.document_id
              AND ae.action = 'DOCUMENT_TEXT_EXTRACTED'
              AND ae.metadata_json->>'version_id' = dv.version_id::text
            ORDER BY ae.created_at DESC, ae.event_id DESC
            LIMIT 1
          ) ae ON TRUE
          WHERE d.tenant_id = $1
            AND d.status <> 'deleted'
            AND cd.extraction_status IN ('ready', 'failed')
            AND ($3::boolean OR d.created_by = $2::uuid)
            AND (${matterFilter.sql})
        )
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id,
          'operational_data',
          CASE
            WHEN extraction_status = 'ready' THEN 'processing_complete'
            ELSE 'processing_failed'
          END,
          'document',
          document_id,
          matter_id,
          document_id,
          'user',
          created_by,
          'user:' || created_by::text,
          'unread',
          occurred_at,
          event_id,
          event_id
        FROM candidates
        ON CONFLICT (tenant_id, source, kind, target_type, target_id, recipient_key)
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          status = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN 'unread'
            ELSE notifications.status
          END,
          read_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_by
          END,
          read_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_at
          END,
          dismissed_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_by
          END,
          dismissed_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_at
          END,
          updated_at = now()
      `,
      [actor.tenantId, actor.userId, canRefreshAllVisible, ...matterFilter.params],
    );
  }

  private async refreshDuplicateWorkNotifications(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 3, 'm');
    await client.query(
      `
        WITH duplicate_work AS (
          SELECT
            wi.tenant_id,
            wi.matter_id,
            d.document_id,
            wi.work_item_id,
            wi.assigned_to_user_id,
            wi.created_audit_event_id,
            wi.last_audit_event_id,
            wi.updated_at
          FROM work_items wi
          JOIN matters m
            ON m.tenant_id = wi.tenant_id
           AND m.matter_id = wi.matter_id
          JOIN document_versions dv
            ON wi.target_type = 'document_version'
           AND dv.tenant_id = wi.tenant_id
           AND dv.version_id = wi.target_id
          JOIN documents d
            ON d.tenant_id = dv.tenant_id
           AND d.document_id = dv.document_id
          WHERE wi.tenant_id = $1
            AND wi.source = 'operational_data'
            AND wi.kind = 'duplicate_decision_pending'
            AND wi.assignment_scope = 'user'
            AND wi.assigned_to_user_id = $2::uuid
            AND wi.status IN ('open', 'in_progress')
            AND (${matterFilter.sql})
        )
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id,
          'operational_data',
          'duplicate_decision_pending',
          'work_item',
          work_item_id,
          matter_id,
          document_id,
          'user',
          assigned_to_user_id,
          'user:' || assigned_to_user_id::text,
          'unread',
          updated_at,
          created_audit_event_id,
          last_audit_event_id
        FROM duplicate_work
        ON CONFLICT (tenant_id, source, kind, target_type, target_id, recipient_key)
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          status = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN 'unread'
            ELSE notifications.status
          END,
          read_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_by
          END,
          read_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_at
          END,
          dismissed_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_by
          END,
          dismissed_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_at
          END,
          updated_at = now()
      `,
      [actor.tenantId, actor.userId, ...matterFilter.params],
    );
  }

  private async refreshDdRfiNotifications(
    client: QueryClient,
    tenantId: string,
  ): Promise<{ rowCount: number | null }> {
    return client.query(
      `
        WITH candidates AS (
          SELECT
            r.tenant_id,
            r.matter_id,
            r.rfi_id,
            r.owner_user_id,
            k.kind,
            COALESCE(r.due_date::timestamptz, r.updated_at) AS occurred_at,
            ae.event_id
          FROM dd_rfis r
          JOIN matters m
            ON m.tenant_id = r.tenant_id
           AND m.matter_id = r.matter_id
          JOIN LATERAL (
            SELECT kind
            FROM (
              VALUES
                ('dd_rfi_overdue'::text),
                ('dd_rfi_unmapped'::text)
            ) AS kinds(kind)
            WHERE (
                kind = 'dd_rfi_overdue'
                AND r.due_date IS NOT NULL
                AND r.due_date < current_date
                AND r.status NOT IN ('complete', 'reported')
              )
              OR (
                kind = 'dd_rfi_unmapped'
                AND r.status NOT IN ('complete', 'reported')
                AND NOT EXISTS (
                  SELECT 1
                  FROM dd_data_room_mappings drm
                  WHERE drm.tenant_id = r.tenant_id
                    AND drm.rfi_id = r.rfi_id
                    AND drm.mapping_status = 'mapped'
                )
              )
          ) k ON TRUE
          JOIN LATERAL (
            SELECT ae.event_id
            FROM audit_events ae
            WHERE ae.tenant_id = r.tenant_id
              AND ae.action = 'DD_RFI_CHANGED'
              AND ae.target_type = 'dd_rfi'
              AND ae.target_id = r.rfi_id
            ORDER BY ae.created_at DESC, ae.event_id DESC
            LIMIT 1
          ) ae ON TRUE
          WHERE r.tenant_id = $1
            AND r.owner_user_id IS NOT NULL
        )
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id,
          'operational_data',
          kind,
          'dd_rfi',
          rfi_id,
          matter_id,
          NULL::uuid,
          'user',
          owner_user_id,
          'user:' || owner_user_id::text,
          'unread',
          occurred_at,
          event_id,
          event_id
        FROM candidates
        ON CONFLICT (tenant_id, source, kind, target_type, target_id, recipient_key)
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          status = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN 'unread'
            ELSE notifications.status
          END,
          read_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_by
          END,
          read_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_at
          END,
          dismissed_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_by
          END,
          dismissed_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_at
          END,
          updated_at = now()
      `,
      [tenantId],
    );
  }

  private async refreshLitigationDeadlineNotifications(
    client: QueryClient,
    tenantId: string,
  ): Promise<{ rowCount: number | null }> {
    return client.query(
      `
        WITH candidates AS (
          SELECT
            wi.tenant_id,
            wi.matter_id,
            wi.target_id AS hearing_id,
            wi.assigned_to_user_id,
            wi.due_at AS occurred_at,
            wi.created_audit_event_id,
            wi.last_audit_event_id
          FROM work_items wi
          JOIN litigation_hearings lh
            ON lh.tenant_id = wi.tenant_id
           AND lh.hearing_id = wi.target_id
          WHERE wi.tenant_id = $1
            AND wi.source = 'operational_data'
            AND wi.kind = 'litigation_deadline'
            AND wi.target_type = 'litigation_key_date'
            AND wi.assignment_scope = 'user'
            AND wi.assigned_to_user_id IS NOT NULL
            AND wi.status IN ('open', 'in_progress')
            AND lh.status = 'scheduled'
            AND lh.scheduled_at >= now()
        )
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id,
          'operational_data',
          'litigation_deadline',
          'litigation_hearing',
          hearing_id,
          matter_id,
          NULL::uuid,
          'user',
          assigned_to_user_id,
          'user:' || assigned_to_user_id::text,
          'unread',
          occurred_at,
          created_audit_event_id,
          last_audit_event_id
        FROM candidates
        ON CONFLICT (tenant_id, source, kind, target_type, target_id, recipient_key)
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          status = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN 'unread'
            ELSE notifications.status
          END,
          read_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_by
          END,
          read_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_at
          END,
          dismissed_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_by
          END,
          dismissed_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_at
          END,
          updated_at = now()
      `,
      [tenantId],
    );
  }

  private async refreshRecordsNotifications(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 2, 'm');
    await client.query(
      `
        WITH legal_hold_candidates AS (
          SELECT
            lh.tenant_id,
            lh.matter_id,
            lh.document_id,
            lh.legal_hold_id,
            lh.created_at,
            ae.event_id
          FROM legal_holds lh
          JOIN matters m
            ON m.tenant_id = lh.tenant_id
           AND m.matter_id = lh.matter_id
          JOIN LATERAL (
            SELECT ae.event_id
            FROM audit_events ae
            WHERE ae.tenant_id = lh.tenant_id
              AND ae.action = 'LEGAL_HOLD_APPLIED'
              AND ae.metadata_json->>'legal_hold_id' = lh.legal_hold_id::text
            ORDER BY ae.created_at DESC, ae.event_id DESC
            LIMIT 1
          ) ae ON TRUE
          WHERE lh.tenant_id = $1
            AND lh.status = 'active'
            AND (${matterFilter.sql})
        ),
        disposal_candidates AS (
          SELECT
            dr.tenant_id,
            dr.matter_id,
            dr.document_id,
            dr.disposal_request_id,
            CASE
              WHEN dr.status = 'requested' THEN 'disposal_approval_requested'
              ELSE 'disposal_execution_ready'
            END AS kind,
            COALESCE(dr.approved_at, dr.created_at) AS occurred_at,
            dr.workflow_audit_event_id
          FROM disposal_requests dr
          JOIN matters m
            ON m.tenant_id = dr.tenant_id
           AND m.matter_id = dr.matter_id
          WHERE dr.tenant_id = $1
            AND dr.status IN ('requested', 'approved')
            AND dr.workflow_audit_event_id IS NOT NULL
            AND (${matterFilter.sql})
        )
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id,
          'records',
          'legal_hold_active',
          'legal_hold',
          legal_hold_id,
          matter_id,
          document_id,
          'records_admin',
          NULL::uuid,
          'records_admin',
          'unread',
          created_at,
          event_id,
          event_id
        FROM legal_hold_candidates
        UNION ALL
        SELECT
          tenant_id,
          'records',
          kind,
          'disposal_request',
          disposal_request_id,
          matter_id,
          document_id,
          'records_admin',
          NULL::uuid,
          'records_admin',
          'unread',
          occurred_at,
          workflow_audit_event_id,
          workflow_audit_event_id
        FROM disposal_candidates
        ON CONFLICT (tenant_id, source, kind, target_type, target_id, recipient_key)
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          status = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN 'unread'
            ELSE notifications.status
          END,
          read_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_by
          END,
          read_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_at
          END,
          dismissed_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_by
          END,
          dismissed_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_at
          END,
          updated_at = now()
      `,
      [actor.tenantId, ...matterFilter.params],
    );
  }

  private async refreshBreakGlassNotifications(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    await client.query(
      `
        WITH pending_requests AS (
          SELECT
            bgr.tenant_id,
            bgr.matter_id,
            bgr.request_id,
            ae.created_at AS occurred_at,
            ae.event_id
          FROM break_glass_requests bgr
          JOIN matters m
            ON m.tenant_id = bgr.tenant_id
           AND m.matter_id = bgr.matter_id
          JOIN LATERAL (
            SELECT ae.event_id, ae.created_at
            FROM audit_events ae
            WHERE ae.tenant_id = bgr.tenant_id
              AND ae.action = 'BREAK_GLASS_REQUESTED'
              AND ae.target_id = bgr.request_id
            ORDER BY ae.created_at DESC, ae.event_id DESC
            LIMIT 1
          ) ae ON TRUE
          WHERE bgr.tenant_id = $1
            AND bgr.status = 'pending'
            AND bgr.expires_at > now()
        )
        INSERT INTO notifications (
          tenant_id, source, kind, target_type, target_id, matter_id, document_id,
          recipient_scope, recipient_user_id, recipient_key, status, occurred_at,
          created_audit_event_id, last_audit_event_id
        )
        SELECT
          tenant_id,
          'operational_data',
          'break_glass_approval_requested',
          'break_glass_request',
          request_id,
          matter_id,
          NULL::uuid,
          'records_admin',
          NULL::uuid,
          'records_admin',
          'unread',
          occurred_at,
          event_id,
          event_id
        FROM pending_requests
        ON CONFLICT (tenant_id, source, kind, target_type, target_id, recipient_key)
        DO UPDATE SET
          occurred_at = EXCLUDED.occurred_at,
          last_audit_event_id = EXCLUDED.last_audit_event_id,
          status = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN 'unread'
            ELSE notifications.status
          END,
          read_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_by
          END,
          read_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.read_at
          END,
          dismissed_by = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_by
          END,
          dismissed_at = CASE
            WHEN notifications.last_audit_event_id IS DISTINCT FROM EXCLUDED.last_audit_event_id
              OR notifications.status = 'cancelled'
              THEN NULL
            ELSE notifications.dismissed_at
          END,
          updated_at = now()
      `,
      [actor.tenantId],
    );
  }

  private async cancelResolvedNotifications(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<void> {
    const cancelStatusSql = `
      status = 'cancelled',
      read_by = NULL,
      read_at = NULL,
      dismissed_by = NULL,
      dismissed_at = NULL,
      updated_at = now()
    `;
    await client.query(
      `
        UPDATE notifications n
        SET ${cancelStatusSql}
        WHERE n.tenant_id = $1
          AND n.source = 'operational_data'
          AND n.status IN ('unread', 'read')
          AND (
            (
              n.kind = 'processing_failed'
              AND NOT EXISTS (
                SELECT 1
                FROM documents d
                JOIN document_versions dv
                  ON dv.tenant_id = d.tenant_id
                 AND dv.document_id = d.document_id
                 AND dv.version_status = 'current'
                JOIN canonical_documents cd
                  ON cd.tenant_id = dv.tenant_id
                 AND cd.version_id = dv.version_id
                WHERE d.tenant_id = n.tenant_id
                  AND d.document_id = n.target_id
                  AND d.status <> 'deleted'
                  AND cd.extraction_status = 'failed'
              )
            )
            OR (
              n.kind = 'duplicate_decision_pending'
              AND NOT EXISTS (
                SELECT 1
                FROM work_items wi
                WHERE wi.tenant_id = n.tenant_id
                  AND wi.work_item_id = n.target_id
                  AND wi.kind = 'duplicate_decision_pending'
                  AND wi.status IN ('open', 'in_progress')
              )
            )
            OR (
              n.kind = 'dd_rfi_overdue'
              AND NOT EXISTS (
                SELECT 1
                FROM dd_rfis r
                WHERE r.tenant_id = n.tenant_id
                  AND r.rfi_id = n.target_id
                  AND r.due_date IS NOT NULL
                  AND r.due_date < current_date
                  AND r.status NOT IN ('complete', 'reported')
              )
            )
            OR (
              n.kind = 'dd_rfi_unmapped'
              AND NOT EXISTS (
                SELECT 1
                FROM dd_rfis r
                WHERE r.tenant_id = n.tenant_id
                  AND r.rfi_id = n.target_id
                  AND r.status NOT IN ('complete', 'reported')
                  AND NOT EXISTS (
                    SELECT 1
                    FROM dd_data_room_mappings drm
                    WHERE drm.tenant_id = r.tenant_id
                      AND drm.rfi_id = r.rfi_id
                      AND drm.mapping_status = 'mapped'
                  )
              )
            )
            OR (
              n.kind = 'litigation_deadline'
              AND NOT EXISTS (
                SELECT 1
                FROM litigation_hearings lh
                WHERE lh.tenant_id = n.tenant_id
                  AND lh.hearing_id = n.target_id
                  AND lh.status = 'scheduled'
                  AND lh.scheduled_at >= now()
              )
            )
          )
      `,
      [actor.tenantId],
    );
    if (!recordsAdminRoles.has(actor.role)) return;
    await client.query(
      `
        UPDATE notifications n
        SET ${cancelStatusSql}
        WHERE n.tenant_id = $1
          AND n.source = 'records'
          AND n.status IN ('unread', 'read')
          AND (
            (
              n.kind = 'legal_hold_active'
              AND NOT EXISTS (
                SELECT 1
                FROM legal_holds lh
                WHERE lh.tenant_id = n.tenant_id
                  AND lh.legal_hold_id = n.target_id
                  AND lh.status = 'active'
              )
            )
            OR (
              n.kind = 'disposal_approval_requested'
              AND NOT EXISTS (
                SELECT 1
                FROM disposal_requests dr
                WHERE dr.tenant_id = n.tenant_id
                  AND dr.disposal_request_id = n.target_id
                  AND dr.status = 'requested'
              )
            )
            OR (
              n.kind = 'disposal_execution_ready'
              AND NOT EXISTS (
                SELECT 1
                FROM disposal_requests dr
                WHERE dr.tenant_id = n.tenant_id
                  AND dr.disposal_request_id = n.target_id
                  AND dr.status = 'approved'
              )
            )
          )
      `,
      [actor.tenantId],
    );
    await client.query(
      `
        UPDATE notifications n
        SET ${cancelStatusSql}
        WHERE n.tenant_id = $1
          AND n.source = 'operational_data'
          AND n.kind = 'break_glass_approval_requested'
          AND n.status IN ('unread', 'read')
          AND NOT EXISTS (
            SELECT 1
            FROM break_glass_requests bgr
            WHERE bgr.tenant_id = n.tenant_id
              AND bgr.request_id = n.target_id
              AND bgr.status = 'pending'
              AND bgr.expires_at > now()
          )
      `,
      [actor.tenantId],
    );
    await client.query(
      `
        UPDATE notifications n
        SET ${cancelStatusSql}
        WHERE n.tenant_id = $1
          AND n.source = 'operational_data'
          AND n.kind = 'dlp_bulk_download'
          AND n.status IN ('unread', 'read')
          AND NOT EXISTS (
            SELECT 1
            FROM dlp_behavior_alerts dba
            WHERE dba.tenant_id = n.tenant_id
              AND dba.alert_id = n.target_id
              AND dba.status = 'open'
          )
      `,
      [actor.tenantId],
    );
  }

  private async listNotificationRows(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<NotificationRow[]> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 4, 'm');
    const canViewRecordsAdmin = recordsAdminRoles.has(actor.role);
    const result = await client.query(
      `
        SELECT
          n.notification_id,
          n.source,
          n.kind,
          n.matter_id,
          n.target_id,
          n.status,
          n.occurred_at,
          nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
          d.title AS document_title,
          cd.extraction_status,
          lh.hold_scope,
          lh.reason_code AS legal_hold_reason_code,
          dr.status AS disposal_status,
          dr.reason_code AS disposal_reason_code,
          bgr.status AS break_glass_status,
          bgr.reason_code AS break_glass_reason_code,
          r.rfi_code,
          r.title AS rfi_title,
          r.status AS rfi_status,
          r.due_date AS rfi_due_date,
          lhg.title AS hearing_title,
          lhg.hearing_type,
          lhg.scheduled_at AS hearing_scheduled_at,
          coalesce(nullif(dlp_actor.name, ''), dlp_actor.email, dba.actor_user_id::text) AS dlp_actor_name,
          dlp_actor.email AS dlp_actor_email,
          dba.event_count AS dlp_event_count,
          dba.total_bytes AS dlp_total_bytes,
          dba.threshold_count AS dlp_threshold_count,
          dba.threshold_bytes AS dlp_threshold_bytes,
          dba.window_start AS dlp_window_start,
          dba.window_end AS dlp_window_end,
          COALESCE(wi.due_at, lhg.scheduled_at) AS due_at
        FROM notifications n
        JOIN matters m
          ON m.tenant_id = n.tenant_id
         AND m.matter_id = n.matter_id
        LEFT JOIN legal_holds lh
          ON n.target_type = 'legal_hold'
         AND lh.tenant_id = n.tenant_id
         AND lh.legal_hold_id = n.target_id
        LEFT JOIN disposal_requests dr
          ON n.target_type = 'disposal_request'
         AND dr.tenant_id = n.tenant_id
         AND dr.disposal_request_id = n.target_id
        LEFT JOIN work_items wi
          ON n.target_type = 'work_item'
         AND wi.tenant_id = n.tenant_id
         AND wi.work_item_id = n.target_id
        LEFT JOIN break_glass_requests bgr
          ON n.target_type = 'break_glass_request'
         AND bgr.tenant_id = n.tenant_id
         AND bgr.request_id = n.target_id
        LEFT JOIN dd_rfis r
          ON n.target_type = 'dd_rfi'
         AND r.tenant_id = n.tenant_id
         AND r.rfi_id = n.target_id
        LEFT JOIN litigation_hearings lhg
          ON n.target_type = 'litigation_hearing'
         AND lhg.tenant_id = n.tenant_id
         AND lhg.hearing_id = n.target_id
        LEFT JOIN dlp_behavior_alerts dba
          ON n.target_type = 'dlp_behavior_alert'
         AND dba.tenant_id = n.tenant_id
         AND dba.alert_id = n.target_id
        LEFT JOIN users dlp_actor
          ON dlp_actor.tenant_id = dba.tenant_id
         AND dlp_actor.user_id = dba.actor_user_id
        LEFT JOIN documents d
          ON d.tenant_id = n.tenant_id
          AND d.document_id = COALESCE(n.document_id, lh.document_id, dr.document_id, wi.document_id)
        LEFT JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
         AND cd.version_id = dv.version_id
        WHERE n.tenant_id = $1
          AND n.status IN ('unread', 'read')
          AND (
            (n.recipient_scope = 'user' AND n.recipient_user_id = $2::uuid)
            OR (n.recipient_scope = 'records_admin' AND $3::boolean)
          )
          AND (
            (n.kind = 'processing_complete' AND d.document_id IS NOT NULL AND cd.extraction_status = 'ready')
            OR (n.kind = 'processing_failed' AND d.document_id IS NOT NULL AND cd.extraction_status = 'failed')
            OR (n.kind = 'duplicate_decision_pending' AND wi.work_item_id IS NOT NULL AND wi.status IN ('open', 'in_progress'))
            OR (n.kind IN ('edit_lock_expired', 'edit_lock_released') AND d.document_id IS NOT NULL)
            OR (n.kind = 'break_glass_approval_requested' AND bgr.request_id IS NOT NULL AND bgr.status = 'pending' AND bgr.expires_at > now())
            OR (n.kind = 'legal_hold_active' AND lh.legal_hold_id IS NOT NULL AND lh.status = 'active')
            OR (n.kind = 'disposal_approval_requested' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'requested')
            OR (n.kind = 'disposal_execution_ready' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'approved')
            OR (
              n.kind = 'dd_rfi_overdue'
              AND r.rfi_id IS NOT NULL
              AND r.due_date IS NOT NULL
              AND r.due_date < current_date
              AND r.status NOT IN ('complete', 'reported')
            )
            OR (
              n.kind = 'dd_rfi_unmapped'
              AND r.rfi_id IS NOT NULL
              AND r.status NOT IN ('complete', 'reported')
              AND NOT EXISTS (
                SELECT 1
                FROM dd_data_room_mappings drm
                WHERE drm.tenant_id = r.tenant_id
                  AND drm.rfi_id = r.rfi_id
                  AND drm.mapping_status = 'mapped'
              )
            )
            OR (
              n.kind = 'litigation_deadline'
              AND lhg.hearing_id IS NOT NULL
              AND lhg.status = 'scheduled'
              AND lhg.scheduled_at >= now()
            )
            OR (
              n.kind = 'dlp_bulk_download'
              AND dba.alert_id IS NOT NULL
              AND dba.status = 'open'
            )
            OR (
              n.kind = 'email_autofile_completed'
              AND n.target_type = 'email'
            )
          )
          AND (
            (n.kind IN ('break_glass_approval_requested', 'dlp_bulk_download') AND $3::boolean)
            OR (${matterFilter.sql})
          )
        ORDER BY
          CASE n.status WHEN 'unread' THEN 0 ELSE 1 END,
          n.occurred_at DESC,
          n.notification_id
        LIMIT 20
      `,
      [actor.tenantId, actor.userId, canViewRecordsAdmin, ...matterFilter.params],
    );
    return result.rows as NotificationRow[];
  }

  private async updateVisibleNotification(
    client: QueryClient,
    actor: PermissionQueryContext,
    digest: string,
    status: 'read' | 'dismissed',
  ): Promise<number> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 6, 'm');
    const canViewRecordsAdmin = recordsAdminRoles.has(actor.role);
    const statusSet =
      status === 'read'
        ? `
            status = 'read',
            read_by = $5::uuid,
            read_at = now(),
            dismissed_by = NULL,
            dismissed_at = NULL,
            updated_at = now()
          `
        : `
            status = 'dismissed',
            read_by = NULL,
            read_at = NULL,
            dismissed_by = $5::uuid,
            dismissed_at = now(),
            updated_at = now()
          `;
    const result = await client.query(
      `
        WITH visible AS (
          SELECT n.notification_id
          FROM notifications n
          JOIN matters m
            ON m.tenant_id = n.tenant_id
           AND m.matter_id = n.matter_id
          LEFT JOIN legal_holds lh
            ON n.target_type = 'legal_hold'
           AND lh.tenant_id = n.tenant_id
           AND lh.legal_hold_id = n.target_id
          LEFT JOIN disposal_requests dr
            ON n.target_type = 'disposal_request'
           AND dr.tenant_id = n.tenant_id
           AND dr.disposal_request_id = n.target_id
          LEFT JOIN work_items wi
            ON n.target_type = 'work_item'
           AND wi.tenant_id = n.tenant_id
           AND wi.work_item_id = n.target_id
          LEFT JOIN break_glass_requests bgr
            ON n.target_type = 'break_glass_request'
           AND bgr.tenant_id = n.tenant_id
           AND bgr.request_id = n.target_id
          LEFT JOIN dd_rfis r
            ON n.target_type = 'dd_rfi'
           AND r.tenant_id = n.tenant_id
           AND r.rfi_id = n.target_id
          LEFT JOIN litigation_hearings lhg
            ON n.target_type = 'litigation_hearing'
           AND lhg.tenant_id = n.tenant_id
           AND lhg.hearing_id = n.target_id
          LEFT JOIN dlp_behavior_alerts dba
            ON n.target_type = 'dlp_behavior_alert'
           AND dba.tenant_id = n.tenant_id
           AND dba.alert_id = n.target_id
          LEFT JOIN documents d
            ON d.tenant_id = n.tenant_id
            AND d.document_id = COALESCE(n.document_id, lh.document_id, dr.document_id, wi.document_id)
          LEFT JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND dv.version_status = 'current'
          LEFT JOIN canonical_documents cd
            ON cd.tenant_id = dv.tenant_id
           AND cd.version_id = dv.version_id
          WHERE n.tenant_id = $1
            AND substring(encode(digest(n.notification_id::text, 'sha256'), 'hex') from 1 for 16) = $4
            AND n.status IN ('unread', 'read')
            AND (
              (n.recipient_scope = 'user' AND n.recipient_user_id = $2::uuid)
              OR (n.recipient_scope = 'records_admin' AND $3::boolean)
            )
            AND (
              (n.kind = 'processing_complete' AND d.document_id IS NOT NULL AND cd.extraction_status = 'ready')
              OR (n.kind = 'processing_failed' AND d.document_id IS NOT NULL AND cd.extraction_status = 'failed')
              OR (n.kind = 'duplicate_decision_pending' AND wi.work_item_id IS NOT NULL AND wi.status IN ('open', 'in_progress'))
              OR (n.kind IN ('edit_lock_expired', 'edit_lock_released') AND d.document_id IS NOT NULL)
              OR (n.kind = 'break_glass_approval_requested' AND bgr.request_id IS NOT NULL AND bgr.status = 'pending' AND bgr.expires_at > now())
              OR (n.kind = 'legal_hold_active' AND lh.legal_hold_id IS NOT NULL AND lh.status = 'active')
              OR (n.kind = 'disposal_approval_requested' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'requested')
              OR (n.kind = 'disposal_execution_ready' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'approved')
              OR (
                n.kind = 'dd_rfi_overdue'
                AND r.rfi_id IS NOT NULL
                AND r.due_date IS NOT NULL
                AND r.due_date < current_date
                AND r.status NOT IN ('complete', 'reported')
              )
              OR (
                n.kind = 'dd_rfi_unmapped'
                AND r.rfi_id IS NOT NULL
                AND r.status NOT IN ('complete', 'reported')
                AND NOT EXISTS (
                  SELECT 1
                  FROM dd_data_room_mappings drm
                  WHERE drm.tenant_id = r.tenant_id
                    AND drm.rfi_id = r.rfi_id
                    AND drm.mapping_status = 'mapped'
                )
              )
              OR (
                n.kind = 'litigation_deadline'
                AND lhg.hearing_id IS NOT NULL
                AND lhg.status = 'scheduled'
                AND lhg.scheduled_at >= now()
              )
              OR (
                n.kind = 'dlp_bulk_download'
                AND dba.alert_id IS NOT NULL
                AND dba.status = 'open'
              )
              OR (
                n.kind = 'email_autofile_completed'
                AND n.target_type = 'email'
              )
            )
            AND (
              (n.kind IN ('break_glass_approval_requested', 'dlp_bulk_download') AND $3::boolean)
              OR (${matterFilter.sql})
            )
          LIMIT 1
        )
        UPDATE notifications n
        SET ${statusSet}
        FROM visible
        WHERE n.notification_id = visible.notification_id
        RETURNING n.notification_id
      `,
      [
        actor.tenantId,
        actor.userId,
        canViewRecordsAdmin,
        digest,
        actor.userId,
        ...matterFilter.params,
      ],
    );
    return result.rowCount ?? 0;
  }
}
