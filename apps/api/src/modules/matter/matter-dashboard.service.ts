import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  MatterDashboardAiSessionDto,
  MatterDashboardDto,
  MatterDashboardExternalActivityDto,
  MatterDashboardIssueSummaryDto,
  MatterDashboardKeyDateDto,
  MatterDashboardKeyDocumentDto,
  MatterDashboardMatterSummaryDto,
  MatterDashboardRecentActivityDto,
  MatterIssueRiskLevel,
  PermissionDecision,
  TenantId,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { tenantQuery } from '../../common/db/tenant-query';
import { DatabaseService } from '../../common/db/database.service';

interface MatterRow {
  matter_id: string;
  matter_code: string;
  matter_name: string;
  client_display_name: string | null;
  status: MatterDashboardMatterSummaryDto['status'];
  confidentiality_level: MatterDashboardMatterSummaryDto['confidentialityLevel'];
}

interface RecentActivityRow {
  action: string;
  target_type: string;
  result: string;
  created_at: Date;
}

interface KeyDocumentRow {
  title: string;
  source: string;
  version_label: string | null;
  version_significance: string;
  updated_at: Date;
}

interface IssueSummaryRow {
  open_count: number | string;
  highest_risk_level: MatterIssueRiskLevel | null;
}

interface KeyDateRow {
  title: string;
  due_date: Date | string;
  date_type: MatterDashboardKeyDateDto['dateType'];
  status: MatterDashboardKeyDateDto['status'];
  source_type: MatterDashboardKeyDateDto['sourceType'];
}

interface ExternalActivityRow {
  workspace_code: string;
  display_ref: string;
  status: string;
  active_link_count: number | string;
  access_count: number | string;
  expires_at: Date;
  updated_at: Date;
}

interface AiSessionRow {
  ai_session_id: string;
  actor_id: string;
  model_route: string;
  status: string;
  latency_ms: number | null;
  escalation_required: boolean;
  blocked_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class MatterDashboardService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async getDashboard(
    actorUserId: string,
    matterId: string,
    now = new Date(),
  ): Promise<MatterDashboardDto> {
    const context = this.tenantContext.require();
    const matterSummary = await this.getMatterSummary(context.tenantId, matterId);
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    const today = now.toISOString().slice(0, 10);

    return this.auditService.transaction(context.tenantId, async (client) => {
      const [
        recentActivity,
        keyDocuments,
        issueSummary,
        upcomingKeyDates,
        externalActivity,
        aiSessions,
      ] = await Promise.all([
        this.listRecentActivity(client, context.tenantId, matterId),
        this.listKeyDocuments(client, context.tenantId, matterId),
        this.getIssueSummary(client, context.tenantId, matterId),
        this.listUpcomingKeyDates(client, context.tenantId, matterId, today),
        this.listExternalActivity(client, context.tenantId, matterId),
        this.listAiSessions(client, context.tenantId, matterId),
      ]);

      return {
        generatedAt: now.toISOString(),
        matterId,
        matterSummary,
        recentActivity,
        keyDocuments,
        issueSummary,
        upcomingKeyDates,
        externalActivity,
        aiSessions,
      };
    });
  }

  private async getMatterSummary(
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterDashboardMatterSummaryDto> {
    const result = await tenantQuery<MatterRow>(
      this.databaseService,
      tenantId,
      `
        SELECT m.matter_id, m.matter_code, m.matter_name,
          c.name AS client_display_name, m.status, m.confidentiality_level
        FROM matters m
        JOIN clients c
          ON c.tenant_id = m.tenant_id
         AND c.client_id = m.client_id
        WHERE m.tenant_id = $1
          AND m.matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) throw notFoundDenied();
    return {
      matterCode: row.matter_code,
      matterName: row.matter_name,
      clientDisplayName: row.client_display_name,
      status: row.status,
      confidentialityLevel: row.confidentiality_level,
    };
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.permissionService.canReadMatter({ tenantId, userId: actorUserId }, matterId);
    } catch {
      decision = undefined;
    }
    if (decision?.effect !== 'ALLOW') throwReadDenied(decision ?? permissionDeniedDecision());
  }

  private async listRecentActivity(
    client: PoolClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterDashboardRecentActivityDto[]> {
    const result = await client.query<RecentActivityRow>(
      `
        SELECT action, target_type, result, created_at
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY created_at DESC, event_id DESC
        LIMIT 5
      `,
      [tenantId, matterId],
    );
    return result.rows.map((row) => ({
      actionLabel: actionLabel(row.action),
      targetLabel: targetLabel(row.target_type),
      resultLabel: resultLabel(row.result),
      occurredAt: row.created_at.toISOString(),
    }));
  }

  private async listKeyDocuments(
    client: PoolClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterDashboardKeyDocumentDto[]> {
    const result = await client.query<KeyDocumentRow>(
      `
        SELECT d.title, d.source, dv.version_label, dv.version_significance,
          GREATEST(d.updated_at, dv.created_at) AS updated_at
        FROM documents d
        JOIN document_versions dv
          ON dv.tenant_id = d.tenant_id
         AND dv.document_id = d.document_id
         AND dv.version_status = 'current'
        WHERE d.tenant_id = $1
          AND d.matter_id = $2
          AND d.status <> 'deleted'
        ORDER BY
          CASE dv.version_significance
            WHEN 'execution_copy' THEN 6
            WHEN 'final' THEN 5
            WHEN 'client_sent' THEN 4
            WHEN 'counterparty_sent' THEN 3
            WHEN 'negotiation' THEN 2
            ELSE 1
          END DESC,
          GREATEST(d.updated_at, dv.created_at) DESC,
          d.document_id DESC
        LIMIT 5
      `,
      [tenantId, matterId],
    );
    return result.rows.map((row) => ({
      title: row.title,
      source: row.source,
      versionLabel: row.version_label,
      versionSignificance: row.version_significance,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  private async getIssueSummary(
    client: PoolClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterDashboardIssueSummaryDto> {
    const result = await client.query<IssueSummaryRow>(
      `
        SELECT count(*)::int AS open_count,
          (
            array_agg(
              risk_level
              ORDER BY CASE risk_level
                WHEN 'critical' THEN 4
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                ELSE 1
              END DESC
            )
          )[1] AS highest_risk_level
        FROM matter_issues
        WHERE tenant_id = $1
          AND matter_id = $2
          AND status <> 'resolved'
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    return {
      openCount: numberValue(row?.open_count ?? 0),
      highestRiskLevel: row?.highest_risk_level ?? null,
    };
  }

  private async listUpcomingKeyDates(
    client: PoolClient,
    tenantId: TenantId,
    matterId: string,
    today: string,
  ): Promise<MatterDashboardKeyDateDto[]> {
    const result = await client.query<KeyDateRow>(
      `
        SELECT title, due_date, date_type, status, source_type
        FROM (
          SELECT title, due_date, date_type, status, 'core'::text AS source_type, updated_at
          FROM matter_key_dates
          WHERE tenant_id = $1
            AND matter_id = $2
            AND status = 'pending'
            AND due_date >= $3::date
          UNION ALL
          SELECT pleading_code AS title, internal_deadline AS due_date, 'court'::text AS date_type,
            'pending'::text AS status, 'litigation_pleading'::text AS source_type, updated_at
          FROM litigation_pleadings
          WHERE tenant_id = $1
            AND matter_id = $2
            AND internal_deadline IS NOT NULL
            AND internal_deadline >= $3::date
            AND filing_status NOT IN ('filed_recorded', 'served_recorded', 'withdrawn')
          UNION ALL
          SELECT title, due_date, 'internal'::text AS date_type, 'pending'::text AS status,
            'dd_rfi'::text AS source_type, updated_at
          FROM dd_rfis
          WHERE tenant_id = $1
            AND matter_id = $2
            AND due_date IS NOT NULL
            AND due_date >= $3::date
            AND status NOT IN ('complete', 'reported')
        ) dates
        ORDER BY due_date ASC, updated_at DESC, title ASC
        LIMIT 5
      `,
      [tenantId, matterId, today],
    );
    return result.rows.map((row) => ({
      title: row.title,
      dueDate: dateOnly(row.due_date),
      dateType: row.date_type,
      status: row.status,
      sourceType: row.source_type,
    }));
  }

  private async listExternalActivity(
    client: PoolClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterDashboardExternalActivityDto[]> {
    const result = await client.query<ExternalActivityRow>(
      `
        SELECT ew.workspace_code, ew.display_ref, ew.status,
          count(esl.link_id) FILTER (WHERE esl.status = 'active')::int AS active_link_count,
          coalesce(sum(esl.access_count), 0)::int AS access_count,
          ew.expires_at,
          GREATEST(ew.updated_at, coalesce(max(esl.updated_at), ew.updated_at)) AS updated_at
        FROM external_workspaces ew
        LEFT JOIN external_secure_links esl
          ON esl.tenant_id = ew.tenant_id
         AND esl.workspace_id = ew.workspace_id
        WHERE ew.tenant_id = $1
          AND ew.matter_id = $2
        GROUP BY ew.workspace_id, ew.workspace_code, ew.display_ref, ew.status, ew.expires_at, ew.updated_at
        ORDER BY updated_at DESC, ew.workspace_id DESC
        LIMIT 5
      `,
      [tenantId, matterId],
    );
    return result.rows.map((row) => ({
      workspaceCode: row.workspace_code,
      displayRef: row.display_ref,
      status: row.status,
      activeLinkCount: numberValue(row.active_link_count),
      accessCount: numberValue(row.access_count),
      expiresAt: row.expires_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  private async listAiSessions(
    client: PoolClient,
    tenantId: TenantId,
    matterId: string,
  ): Promise<MatterDashboardAiSessionDto[]> {
    const result = await client.query<AiSessionRow>(
      `
        SELECT ai_session_id, actor_id, model_route, status, latency_ms, escalation_required,
          blocked_reason, created_at, updated_at
        FROM ai_sessions
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY created_at DESC, ai_session_id DESC
        LIMIT 5
      `,
      [tenantId, matterId],
    );
    return result.rows.map((row) => ({
      sessionId: row.ai_session_id,
      ownerUserId: row.actor_id,
      modelRoute: row.model_route,
      status: row.status,
      latencyMs: row.latency_ms,
      escalationRequired: row.escalation_required,
      blockedReason: row.blocked_reason,
      policySummary: aiSessionPolicySummary(row),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }
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
  return labels[action] ?? '활동 기록';
}

function targetLabel(targetType: string): string {
  const labels: Record<string, string> = {
    document: '문서',
    matter: '사건',
    search: '검색',
    ai_session: 'AI 세션',
    email: '이메일',
  };
  return labels[targetType] ?? '대상';
}

function resultLabel(result: string): string {
  if (result === 'success') return '성공';
  if (result === 'denied') return '차단';
  if (result === 'failure') return '실패';
  return '확인 필요';
}

function aiSessionPolicySummary(row: Pick<AiSessionRow, 'blocked_reason' | 'escalation_required'>): string {
  if (row.blocked_reason === 'ai_policy_blocked') return '정책 차단';
  if (row.blocked_reason === 'permission_denied') return '권한 차단';
  if (row.blocked_reason === 'ethical_wall_blocked') return '윤리장벽 차단';
  if (row.blocked_reason === 'dlp_blocked') return 'DLP 차단';
  if (row.blocked_reason === 'unsupported_scope') return '지원 범위 외';
  if (row.blocked_reason === 'validation_failed') return '검증 실패';
  if (row.escalation_required) return '검토 필요';
  return '정책 통과';
}

function numberValue(value: number | string): number {
  return typeof value === 'number' ? value : Number.parseInt(value, 10) || 0;
}

function dateOnly(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return value.slice(0, 10);
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function permissionDeniedDecision(): PermissionDecision {
  return { effect: 'DENY', reasonCode: 'PERMISSION_DENIED', appliedRules: [] };
}

function throwReadDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw permissionDenied();
}
