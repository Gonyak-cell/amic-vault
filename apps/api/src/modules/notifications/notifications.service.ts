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
  | 'legal_hold_active'
  | 'disposal_approval_requested'
  | 'disposal_execution_ready';

interface ActorRow {
  role: string;
  status: string;
}

interface NotificationRow {
  notification_id: string;
  source: DmsNotificationSource;
  kind: NotificationKind;
  status: DmsNotificationStatus;
  occurred_at: Date;
  matter_label: string | null;
  document_title: string | null;
  extraction_status: string | null;
  hold_scope: string | null;
  legal_hold_reason_code: string | null;
  disposal_status: string | null;
  disposal_reason_code: string | null;
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

function titleForKind(kind: NotificationKind): string {
  const labels: Record<NotificationKind, string> = {
    processing_complete: '문서 처리 완료',
    processing_failed: '문서 처리 실패',
    duplicate_decision_pending: '중복 결정 대기',
    legal_hold_active: 'Legal Hold 적용',
    disposal_approval_requested: '삭제 승인 요청',
    disposal_execution_ready: '삭제 실행 대기',
  };
  return labels[kind];
}

function categoryForKind(kind: NotificationKind): string {
  if (kind === 'legal_hold_active' || kind.startsWith('disposal_')) return '기록 보존';
  return '문서 처리';
}

function hrefForKind(kind: NotificationKind): string {
  if (kind === 'processing_complete') return '/files?extractionStatus=ready';
  if (kind === 'processing_failed') return '/files?extractionStatus=failed';
  if (kind === 'duplicate_decision_pending') return '/work';
  if (kind === 'legal_hold_active') return '/records?tab=holds';
  return '/records?tab=disposal';
}

function toneForKind(kind: NotificationKind): DmsOperationalTone {
  if (kind === 'processing_complete') return 'success';
  if (kind === 'processing_failed') return 'blocked';
  if (kind === 'legal_hold_active') return 'warning';
  return 'warning';
}

function descriptionForRow(row: NotificationRow): string {
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
  if (row.kind === 'duplicate_decision_pending') {
    return `${safeMatterLabel(row.matter_label)} · ${safeDocumentLabel(
      row.document_title,
    )} · 중복 처리 결정 필요`;
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
    href: hrefForKind(row.kind),
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

  async markRead(actorUserId: string, itemKey: string): Promise<{ itemKey: string; status: 'read' }> {
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

  async dismiss(actorUserId: string, itemKey: string): Promise<{ itemKey: string; status: 'dismissed' }> {
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
    if (recordsAdminRoles.has(actor.role)) {
      await this.refreshRecordsNotifications(client, actor);
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
          n.status,
          n.occurred_at,
          nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
          d.title AS document_title,
          cd.extraction_status,
          lh.hold_scope,
          lh.reason_code AS legal_hold_reason_code,
          dr.status AS disposal_status,
          dr.reason_code AS disposal_reason_code,
          wi.due_at
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
            OR (n.kind = 'legal_hold_active' AND lh.legal_hold_id IS NOT NULL AND lh.status = 'active')
            OR (n.kind = 'disposal_approval_requested' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'requested')
            OR (n.kind = 'disposal_execution_ready' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'approved')
          )
          AND (${matterFilter.sql})
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
              OR (n.kind = 'legal_hold_active' AND lh.legal_hold_id IS NOT NULL AND lh.status = 'active')
              OR (n.kind = 'disposal_approval_requested' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'requested')
              OR (n.kind = 'disposal_execution_ready' AND dr.disposal_request_id IS NOT NULL AND dr.status = 'approved')
            )
            AND (${matterFilter.sql})
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
