import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  dashboardOverviewSchema,
  dashboardUsageStatsResponseSchema,
  dmsNotificationCenterResponseSchema,
  dmsWorkQueueResponseSchema,
  isUserRole,
  type DmsNotificationCenterResponseDto,
  type DmsNotificationItemDto,
  type DmsOperationalTone,
  type DmsWorkQueueItemDto,
  type DmsWorkQueueResponseDto,
  type DashboardAiPrepStatusDto,
  type DashboardIntegrationStatusDto,
  type DashboardOverviewDto,
  type DashboardPolicyAlertDto,
  type DashboardRecentActivityDto,
  type DashboardRecentFileDto,
  type DashboardUsageStatsQueryDto,
  type DashboardUsageStatsResponseDto,
  type UserRole,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  PermissionQueryBuilder,
  type PermissionQueryContext,
} from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';

interface ActorRow {
  role: string;
  status: string;
}

interface RecentFileRow {
  title: string;
  matter_label: string | null;
  updated_at: Date | null;
}

interface RecentActivityRow {
  action: string;
  target_type: string;
  result: string;
  matter_label: string | null;
  created_at: Date;
}

interface PolicyAlertRow {
  action: string;
  result: string;
  created_at: Date;
}

interface AiPrepRow {
  matter_label: string | null;
  pending_count: number | string;
  completed_count: number | string;
  blocked_count: number | string;
  failed_count: number | string;
  rejected_count: number | string;
  stale_count: number | string;
  updated_at: Date | null;
}

interface IntegrationStatusRow {
  integration_label: string;
  status: string;
  row_count: number | string;
  updated_at: Date | null;
}

interface UsageTotalsRow {
  active_users: number | string;
  uploads: number | string;
  downloads: number | string;
  searches: number | string;
}

interface UsageStorageRow {
  storage_bytes: number | string | null;
}

interface UsageTopMatterRow {
  matter_label: string | null;
  activity_count: number | string;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function isoDate(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function safeMatterLabel(value: string | null): string {
  return value?.trim() || '사건 정보 없음';
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    DOCUMENT_VIEWED: '문서 열람',
    DOCUMENT_UPLOADED: '문서 업로드',
    DOCUMENT_METADATA_CHANGED: '문서 정보 변경',
    SEARCH_EXECUTED: '검색 실행',
    PERMISSION_DENIED_HIT: '권한 차단',
    OUTLOOK_EMAIL_FILE_REQUESTED: 'Outlook 파일링 요청',
    OUTLOOK_EMAIL_FILE_COMPLETED: 'Outlook 파일링 완료',
    AI_PREP_REQUESTED: '파일 정리 준비 요청',
    AI_PREP_COMPLETED: '파일 정리 준비 완료',
  };
  if (labels[action]) return labels[action];
  return '활동 기록';
}

function resultLabel(result: string): string {
  if (result === 'success') return '성공';
  if (result === 'denied') return '차단';
  if (result === 'failure') return '실패';
  return '확인 필요';
}

function numberValue(value: number | string): number {
  return typeof value === 'number' ? value : Number.parseInt(value, 10) || 0;
}

function countValue(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  return Number.parseInt(value, 10) || 0;
}

const usageStatsActions = ['DOCUMENT_UPLOADED', 'DOCUMENT_DOWNLOADED', 'SEARCH_EXECUTED'] as const;
const defaultUsageStatsWindowMs = 30 * 24 * 60 * 60 * 1000;

function resolveUsagePeriod(
  query: DashboardUsageStatsQueryDto,
  now: Date,
): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - defaultUsageStatsWindowMs);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() > to.getTime()) {
    throw validationFailed();
  }
  return { from, to };
}

function isUsageStatsAdminRole(role: UserRole): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

function usageStatsFilterRefs(period: { from: Date; to: Date }): readonly string[] {
  return [
    `scope:usage_stats`,
    `date_range:${period.from.toISOString()}..${period.to.toISOString()}`,
  ];
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function usageStatsCsv(stats: DashboardUsageStatsResponseDto): string {
  const period = [stats.period.from, stats.period.to] as const;
  const rows: Array<[string, string, number, string, string]> = [
    ['summary', 'active_users', stats.totals.activeUsers, ...period],
    ['summary', 'uploads', stats.totals.uploads, ...period],
    ['summary', 'downloads', stats.totals.downloads, ...period],
    ['summary', 'searches', stats.totals.searches, ...period],
    ['summary', 'storage_bytes', stats.totals.storageBytes, ...period],
    ...stats.topMatters.map((matter): [string, string, number, string, string] => [
      'top_matter',
      matter.matterLabel,
      matter.activityCount,
      ...period,
    ]),
  ];
  return [
    'section,label,value,period_from,period_to',
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n');
}

function aiPrepStatusLabel(row: AiPrepRow): string {
  const blocked = numberValue(row.blocked_count);
  const failed = numberValue(row.failed_count);
  const rejected = numberValue(row.rejected_count);
  const stale = numberValue(row.stale_count);
  const pending = numberValue(row.pending_count);
  const completed = numberValue(row.completed_count);
  if (blocked > 0) return `차단 ${blocked}건`;
  if (failed > 0) return `실패 ${failed}건`;
  if (rejected > 0) return `거절 ${rejected}건`;
  if (stale > 0) return `갱신 필요 ${stale}건`;
  if (pending > 0) return `대기 ${pending}건`;
  if (completed > 0) return `준비 완료 ${completed}건`;
  return '파일 정리 준비 없음';
}

function integrationStatusLabel(row: IntegrationStatusRow): string {
  const labels: Record<string, string> = {
    active: '활성',
    cancelled: '취소',
    completed: '완료',
    denied: '차단',
    disabled: '비활성',
    failed: '실패',
    pending_admin: '관리자 승인 대기',
    pending_user: '사용자 승인 대기',
    processing: '처리 중',
    queued: '대기',
    revoked: '해지',
  };
  return `${labels[row.status] ?? '확인 필요'} ${numberValue(row.row_count)}건`;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(PermissionQueryBuilder) private readonly permissionQuery: PermissionQueryBuilder,
  ) {}

  async getOverview(actorUserId: string, now = new Date()): Promise<DashboardOverviewDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const actor = await this.findActor(client, context.tenantId, actorUserId);
      if (!actor) throw permissionDenied();
      return dashboardOverviewSchema.parse({
        generatedAt: now.toISOString(),
        recentFiles: await this.listRecentFiles(client, actor),
        recentActivity: await this.listRecentActivity(client, actor),
        permissionPolicyAlerts: await this.listPolicyAlerts(client, actor),
        aiPrepStatus: [],
        integrationStatus: [],
      });
    });
  }

  async getWorkQueue(actorUserId: string, now = new Date()): Promise<DmsWorkQueueResponseDto> {
    const overview = await this.getOverview(actorUserId, now);
    return dmsWorkQueueResponseSchema.parse({
      generatedAt: overview.generatedAt,
      source: 'dashboard_operational_state',
      items: workItemsFromOverview(overview),
    });
  }

  async getNotificationCenter(
    actorUserId: string,
    now = new Date(),
  ): Promise<DmsNotificationCenterResponseDto> {
    const overview = await this.getOverview(actorUserId, now);
    return dmsNotificationCenterResponseSchema.parse({
      generatedAt: overview.generatedAt,
      source: 'dashboard_operational_state',
      items: notificationItemsFromOverview(overview),
    });
  }

  async getUsageStats(
    actorUserId: string,
    query: DashboardUsageStatsQueryDto = {},
    now = new Date(),
  ): Promise<DashboardUsageStatsResponseDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      await this.requireUsageStatsAdmin(client, context.tenantId, actorUserId);
      return this.buildUsageStats(client, context.tenantId, query, now);
    });
  }

  async exportUsageStatsCsv(
    actorUserId: string,
    query: DashboardUsageStatsQueryDto = {},
    now = new Date(),
  ): Promise<string> {
    const context = this.tenantContext.require();
    const startedAt = Date.now();
    return this.auditService.transaction(context.tenantId, async (client) => {
      await this.requireUsageStatsAdmin(client, context.tenantId, actorUserId);
      const stats = await this.buildUsageStats(client, context.tenantId, query, now);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'AUDIT_EXPORT_CREATED',
          targetType: 'usage_stats',
          result: 'success',
          metadata: {
            scope_type: 'usage_stats',
            export_format: 'csv',
            filter_refs: usageStatsFilterRefs({
              from: new Date(stats.period.from),
              to: new Date(stats.period.to),
            }),
            result_count: stats.topMatters.length + 5,
            duration_ms: Date.now() - startedAt,
          },
        },
        client,
      );
      return usageStatsCsv(stats);
    });
  }

  private async requireUsageStatsAdmin(
    client: QueryClient,
    tenantId: string,
    userId: string,
  ): Promise<PermissionQueryContext> {
    const actor = await this.findActor(client, tenantId, userId);
    if (!actor || !isUsageStatsAdminRole(actor.role)) throw permissionDenied();
    return actor;
  }

  private async buildUsageStats(
    client: QueryClient,
    tenantId: string,
    query: DashboardUsageStatsQueryDto,
    now: Date,
  ): Promise<DashboardUsageStatsResponseDto> {
    const period = resolveUsagePeriod(query, now);
    const totalsResult = await client.query(
      `
        SELECT
          (count(DISTINCT ae.actor_id) FILTER (WHERE ae.actor_id IS NOT NULL))::int AS active_users,
          (count(*) FILTER (WHERE ae.action = 'DOCUMENT_UPLOADED'))::int AS uploads,
          (count(*) FILTER (WHERE ae.action = 'DOCUMENT_DOWNLOADED'))::int AS downloads,
          (count(*) FILTER (WHERE ae.action = 'SEARCH_EXECUTED'))::int AS searches
        FROM audit_events ae
        WHERE ae.tenant_id = $1
          AND ae.created_at >= $2
          AND ae.created_at <= $3
      `,
      [tenantId, period.from, period.to],
    );
    const storageResult = await client.query(
      `
        SELECT COALESCE(sum(size_bytes), 0)::bigint AS storage_bytes
        FROM file_objects
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
      `,
      [tenantId, period.from, period.to],
    );
    const topMatterResult = await client.query(
      `
        SELECT
          nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
          count(*)::int AS activity_count
        FROM audit_events ae
        JOIN matters m
          ON m.tenant_id = ae.tenant_id
         AND m.matter_id = ae.matter_id
        WHERE ae.tenant_id = $1
          AND ae.created_at >= $2
          AND ae.created_at <= $3
          AND ae.action = ANY($4::text[])
          AND ae.matter_id IS NOT NULL
        GROUP BY m.matter_id, m.matter_code, m.matter_name
        ORDER BY count(*) DESC, max(ae.created_at) DESC, m.matter_id
        LIMIT 5
      `,
      [tenantId, period.from, period.to, usageStatsActions],
    );
    const totals = totalsResult.rows[0] as UsageTotalsRow | undefined;
    const storage = storageResult.rows[0] as UsageStorageRow | undefined;

    return dashboardUsageStatsResponseSchema.parse({
      generatedAt: now.toISOString(),
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
      },
      totals: {
        activeUsers: countValue(totals?.active_users),
        uploads: countValue(totals?.uploads),
        downloads: countValue(totals?.downloads),
        searches: countValue(totals?.searches),
        storageBytes: countValue(storage?.storage_bytes),
      },
      topMatters: (topMatterResult.rows as UsageTopMatterRow[]).map((row) => ({
        matterLabel: safeMatterLabel(row.matter_label),
        activityCount: countValue(row.activity_count),
      })),
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
    return { tenantId, userId, role: row.role as UserRole };
  }

  private listRecentFiles(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<DashboardRecentFileDto[]> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 2, 'm');
    return client
      .query(
        `
          SELECT
            d.title,
            nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
            COALESCE(dv.created_at, d.created_at) AS updated_at
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          LEFT JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND dv.version_status = 'current'
          WHERE d.tenant_id = $1
            AND d.status <> 'deleted'
            AND (${matterFilter.sql})
          ORDER BY COALESCE(dv.created_at, d.created_at) DESC, d.document_id
          LIMIT 5
        `,
        [actor.tenantId, ...matterFilter.params],
      )
      .then((result) =>
        (result.rows as RecentFileRow[]).map((row) => ({
          title: row.title,
          ...(row.matter_label ? { matterLabel: row.matter_label } : {}),
          ...(isoDate(row.updated_at) ? { updatedAt: isoDate(row.updated_at) } : {}),
        })),
      );
  }

  private listRecentActivity(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<DashboardRecentActivityDto[]> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 2, 'm');
    return client
      .query(
        `
          SELECT
            ae.action,
            ae.target_type,
            ae.result,
            nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
            ae.created_at
          FROM audit_events ae
          JOIN matters m
            ON m.tenant_id = ae.tenant_id
           AND m.matter_id = ae.matter_id
          WHERE ae.tenant_id = $1
            AND (${matterFilter.sql})
          ORDER BY ae.created_at DESC, ae.event_id
          LIMIT 5
        `,
        [actor.tenantId, ...matterFilter.params],
      )
      .then((result) =>
        (result.rows as RecentActivityRow[]).map((row) => ({
          actionLabel: actionLabel(row.action),
          targetLabel: row.matter_label ?? '대상 정보 없음',
          resultLabel: resultLabel(row.result),
          occurredAt: row.created_at.toISOString(),
        })),
      );
  }

  private listPolicyAlerts(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<DashboardPolicyAlertDto[]> {
    return client
      .query(
        `
          SELECT action, result, created_at
          FROM audit_events
          WHERE tenant_id = $1
            AND actor_id = $2
            AND result IN ('denied', 'failure')
          ORDER BY created_at DESC, event_id
          LIMIT 5
        `,
        [actor.tenantId, actor.userId],
      )
      .then((result) =>
        (result.rows as PolicyAlertRow[]).map((row) => ({
          title: row.result === 'denied' ? '요청이 차단됨' : '요청 실패',
          description: `${actionLabel(row.action)} · ${resultLabel(row.result)}`,
          occurredAt: row.created_at.toISOString(),
        })),
      );
  }

  private listAiPrepStatus(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<DashboardAiPrepStatusDto[]> {
    const matterFilter = this.permissionQuery.buildMatterFilter(actor, 2, 'm');
    return client
      .query(
        `
          SELECT
            nullif(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, '')), '') AS matter_label,
            count(*) FILTER (WHERE a.status = 'pending')::int AS pending_count,
            count(*) FILTER (WHERE a.status = 'completed' AND a.is_stale = false)::int AS completed_count,
            count(*) FILTER (WHERE a.status = 'blocked')::int AS blocked_count,
            count(*) FILTER (WHERE a.status = 'failed')::int AS failed_count,
            count(*) FILTER (WHERE a.status = 'rejected')::int AS rejected_count,
            count(*) FILTER (WHERE a.is_stale = true OR a.status = 'stale')::int AS stale_count,
            max(a.updated_at) AS updated_at
          FROM ai_prep_artifacts a
          JOIN matters m
            ON m.tenant_id = a.tenant_id
           AND m.matter_id = a.matter_id
          WHERE a.tenant_id = $1
            AND (${matterFilter.sql})
          GROUP BY m.matter_id, m.matter_code, m.matter_name
          ORDER BY max(a.updated_at) DESC, m.matter_id
          LIMIT 5
        `,
        [actor.tenantId, ...matterFilter.params],
      )
      .then((result) =>
        (result.rows as AiPrepRow[]).map((row) => ({
          matterLabel: safeMatterLabel(row.matter_label),
          statusLabel: aiPrepStatusLabel(row),
          ...(isoDate(row.updated_at) ? { updatedAt: isoDate(row.updated_at) } : {}),
        })),
      );
  }

  private async listIntegrationStatus(
    client: QueryClient,
    actor: PermissionQueryContext,
  ): Promise<DashboardIntegrationStatusDto[]> {
    const filing = await client.query(
      `
        SELECT
          'Outlook 파일링' AS integration_label,
          status,
          count(*)::int AS row_count,
          max(updated_at) AS updated_at
        FROM outlook_filing_requests
        WHERE tenant_id = $1
          AND user_id = $2
        GROUP BY status
        ORDER BY max(updated_at) DESC, status
        LIMIT 3
      `,
      [actor.tenantId, actor.userId],
    );
    const folders = await client.query(
      `
        SELECT
          'Outlook 폴더 매핑' AS integration_label,
          approval_status AS status,
          count(*)::int AS row_count,
          max(updated_at) AS updated_at
        FROM outlook_folder_mappings
        WHERE tenant_id = $1
          AND user_id = $2
        GROUP BY approval_status
        ORDER BY max(updated_at) DESC, approval_status
        LIMIT 3
      `,
      [actor.tenantId, actor.userId],
    );
    return [...(filing.rows as IntegrationStatusRow[]), ...(folders.rows as IntegrationStatusRow[])]
      .sort((left, right) => (right.updated_at?.getTime() ?? 0) - (left.updated_at?.getTime() ?? 0))
      .slice(0, 5)
      .map((row) => ({
        integrationLabel: row.integration_label,
        statusLabel: integrationStatusLabel(row),
        ...(isoDate(row.updated_at) ? { updatedAt: isoDate(row.updated_at) } : {}),
      }));
  }
}

function workItemsFromOverview(overview: DashboardOverviewDto): DmsWorkQueueItemDto[] {
  const items: DmsWorkQueueItemDto[] = [];

  if (overview.permissionPolicyAlerts.length > 0) {
    items.push({
      itemKey: 'permission-policy-0',
      source: 'permission_policy',
      sourceLabel: '권한/정책',
      title: '권한/정책 알림 확인',
      description: `${overview.permissionPolicyAlerts.length}건의 정책 알림이 있습니다.`,
      href: '/audit',
      tone: 'warning',
      updatedAt: overview.permissionPolicyAlerts[0]?.occurredAt,
    });
  }

  if (overview.aiPrepStatus.length > 0) {
    items.push({
      itemKey: 'ai-prep-0',
      source: 'ai_prep',
      sourceLabel: '파일 정리 준비',
      title: '파일 정리 준비 상태 확인',
      description: `${overview.aiPrepStatus.length}개 Matter의 파일 정리 준비 상태가 있습니다.`,
      href: '/files?aiAllowed=true&sortBy=matter_asc',
      tone: 'neutral',
      updatedAt: overview.aiPrepStatus[0]?.updatedAt,
    });
  }

  if (overview.integrationStatus.length > 0) {
    items.push({
      itemKey: 'integration-0',
      source: 'integration',
      sourceLabel: '통합',
      title: '통합 상태 확인',
      description: `${overview.integrationStatus.length}개 통합 상태가 보고되었습니다.`,
      href: '/integrations/outlook',
      tone: 'neutral',
      updatedAt: overview.integrationStatus[0]?.updatedAt,
    });
  }

  return items;
}

function notificationItemsFromOverview(overview: DashboardOverviewDto): DmsNotificationItemDto[] {
  const items: DmsNotificationItemDto[] = [];

  overview.permissionPolicyAlerts.slice(0, 5).forEach((alert, index) => {
    items.push({
      itemKey: `permission-policy-${index}`,
      source: 'permission_policy',
      category: '권한/정책',
      title: alert.title,
      description: alert.description,
      tone: 'warning',
      ...(alert.occurredAt ? { occurredAt: alert.occurredAt } : {}),
    });
  });

  overview.aiPrepStatus.slice(0, 5).forEach((prep, index) => {
    items.push({
      itemKey: `ai-prep-${index}`,
      source: 'ai_prep',
      category: '파일 정리 준비',
      title: prep.matterLabel,
      description: prep.statusLabel,
      tone: 'neutral',
      ...(prep.updatedAt ? { occurredAt: prep.updatedAt } : {}),
    });
  });

  overview.integrationStatus.slice(0, 5).forEach((integration, index) => {
    items.push({
      itemKey: `integration-${index}`,
      source: 'integration',
      category: '통합',
      title: integration.integrationLabel,
      description: integration.statusLabel,
      tone: 'neutral',
      ...(integration.updatedAt ? { occurredAt: integration.updatedAt } : {}),
    });
  });

  overview.recentActivity.slice(0, 5).forEach((activity, index) => {
    items.push({
      itemKey: `recent-activity-${index}`,
      source: 'recent_activity',
      category: '최근 활동',
      title: activity.actionLabel,
      description: `${activity.targetLabel} · ${activity.resultLabel}`,
      tone: notificationToneForActivity(activity),
      occurredAt: activity.occurredAt,
    });
  });

  return items.slice(0, 20);
}

function notificationToneForActivity(activity: DashboardRecentActivityDto): DmsOperationalTone {
  return activity.resultLabel.includes('차단') ? 'blocked' : 'success';
}
