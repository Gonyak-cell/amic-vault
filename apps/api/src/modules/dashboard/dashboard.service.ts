import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  dashboardOverviewSchema,
  isUserRole,
  type DashboardAiPrepStatusDto,
  type DashboardIntegrationStatusDto,
  type DashboardOverviewDto,
  type DashboardPolicyAlertDto,
  type DashboardRecentActivityDto,
  type DashboardRecentFileDto,
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

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
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
        aiPrepStatus: await this.listAiPrepStatus(client, actor),
        integrationStatus: await this.listIntegrationStatus(client, actor),
      });
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
