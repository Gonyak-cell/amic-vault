import { ForbiddenException } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { describe, expect, it } from 'vitest';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';
import { DashboardService } from './dashboard.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const userId = '11111111-1111-4111-8111-111111111102';

function createService(rowsFor: (sql: string, params?: readonly unknown[]) => unknown[]): {
  auditLogs: unknown[];
  queries: string[];
  service: DashboardService;
  context: TenantContextService;
} {
  const auditLogs: unknown[] = [];
  const queries: string[] = [];
  const auditService = {
    async transaction<T>(_tenantId: string, run: (client: { query: typeof query }) => Promise<T>) {
      return run({ query });
    },
    async log(input: unknown) {
      auditLogs.push(input);
      return { eventId: '11111111-1111-4111-8111-111111111199', createdAt: new Date() };
    },
  };

  async function query(sql: string, params?: readonly unknown[]) {
    queries.push(sql);
    return { rows: rowsFor(sql, params), rowCount: null };
  }

  const context = new TenantContextService();
  return {
    auditLogs,
    queries,
    service: new DashboardService(auditService as never, context, new PermissionQueryBuilder()),
    context,
  };
}

describe('DashboardService', () => {
  it('returns display-only dashboard overview from permission-scoped queries', async () => {
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM documents d')) {
        return [
          {
            title: 'Board minutes',
            matter_label: 'M-001 · Governance',
            updated_at: new Date('2026-06-17T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM audit_events ae')) {
        return [
          {
            action: 'DOCUMENT_VIEWED',
            target_type: 'document',
            result: 'success',
            matter_label: 'M-001 · Governance',
            created_at: new Date('2026-06-17T01:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM audit_events')) {
        return [
          {
            action: 'PERMISSION_DENIED_HIT',
            result: 'denied',
            created_at: new Date('2026-06-17T02:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM ai_prep_artifacts')) {
        return [
          {
            matter_label: 'M-001 · Governance',
            pending_count: 0,
            completed_count: 2,
            blocked_count: 0,
            failed_count: 0,
            rejected_count: 0,
            stale_count: 0,
            updated_at: new Date('2026-06-17T03:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM outlook_filing_requests')) {
        return [
          {
            integration_label: 'Outlook 파일링',
            status: 'completed',
            row_count: 1,
            updated_at: new Date('2026-06-17T04:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM outlook_folder_mappings')) return [];
      return [];
    });

    const overview = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.getOverview(userId, new Date('2026-06-17T05:00:00.000Z')),
    );

    expect(overview).toMatchObject({
      generatedAt: '2026-06-17T05:00:00.000Z',
      recentFiles: [{ title: 'Board minutes', matterLabel: 'M-001 · Governance' }],
      aiPrepStatus: [{ matterLabel: 'M-001 · Governance', statusLabel: '준비 완료 2건' }],
      integrationStatus: [{ integrationLabel: 'Outlook 파일링', statusLabel: '완료 1건' }],
    });
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
    expect(JSON.stringify(overview)).not.toMatch(
      /documentId|matterId|tenantId|workspaceId|hash|raw/i,
    );
  });

  it('derives work queue and notification API payloads from permission-scoped dashboard data', async () => {
    const { context, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM documents d')) return [];
      if (sql.includes('FROM audit_events ae')) {
        return [
          {
            action: 'DOCUMENT_UPLOADED',
            target_type: 'document',
            result: 'success',
            matter_label: 'AMIC-2026-0001 · Governance',
            created_at: new Date('2026-06-17T01:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM audit_events')) {
        return [
          {
            action: 'PERMISSION_DENIED_HIT',
            result: 'denied',
            created_at: new Date('2026-06-17T02:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM ai_prep_artifacts')) {
        return [
          {
            matter_label: 'AMIC-2026-0001 · Governance',
            pending_count: 2,
            completed_count: 0,
            blocked_count: 0,
            failed_count: 0,
            rejected_count: 0,
            stale_count: 0,
            updated_at: new Date('2026-06-17T03:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM outlook_filing_requests')) {
        return [
          {
            integration_label: 'Outlook 파일링',
            status: 'completed',
            row_count: 1,
            updated_at: new Date('2026-06-17T04:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM outlook_folder_mappings')) return [];
      return [];
    });

    const [workQueue, notifications] = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () =>
        Promise.all([
          service.getWorkQueue(userId, new Date('2026-06-17T05:00:00.000Z')),
          service.getNotificationCenter(userId, new Date('2026-06-17T05:00:00.000Z')),
        ]),
    );

    expect(workQueue).toMatchObject({
      generatedAt: '2026-06-17T05:00:00.000Z',
      source: 'dashboard_operational_state',
      items: [
        { source: 'permission_policy', title: '권한/정책 알림 확인', href: '/audit' },
        {
          source: 'ai_prep',
          title: '파일 정리 준비 상태 확인',
          href: '/files?aiAllowed=true&sortBy=matter_asc',
        },
        { source: 'integration', title: '통합 상태 확인', href: '/integrations/outlook' },
      ],
    });
    expect(notifications.items.map((item) => item.source)).toEqual([
      'permission_policy',
      'ai_prep',
      'integration',
      'recent_activity',
    ]);
    expect(JSON.stringify({ workQueue, notifications })).not.toMatch(
      /documentId|matterId|tenantId|workspaceId|hash|raw/i,
    );
  });

  it('aggregates usage stats on explicit month boundaries with storage totals', async () => {
    const seenParams: Array<readonly unknown[]> = [];
    const { context, service } = createService((sql, params) => {
      seenParams.push(params ?? []);
      if (sql.includes('FROM users')) return [{ role: 'firm_admin', status: 'active' }];
      if (sql.includes('count(DISTINCT ae.actor_id)')) {
        return [{ active_users: 3, uploads: 3, downloads: 2, searches: 5 }];
      }
      if (sql.includes('FROM file_objects')) return [{ storage_bytes: '3072' }];
      if (sql.includes('GROUP BY m.matter_id')) {
        return [{ matter_label: 'AMIC-2026-001 · Governance', activity_count: 10 }];
      }
      return [];
    });

    const stats = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () =>
        service.getUsageStats(
          userId,
          {
            from: '2026-06-01T00:00:00.000Z',
            to: '2026-06-30T23:59:59.999Z',
          },
          new Date('2026-07-01T00:00:00.000Z'),
        ),
    );

    expect(stats).toMatchObject({
      generatedAt: '2026-07-01T00:00:00.000Z',
      period: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.999Z',
      },
      totals: {
        activeUsers: 3,
        uploads: 3,
        downloads: 2,
        searches: 5,
        storageBytes: 3072,
      },
      topMatters: [{ matterLabel: 'AMIC-2026-001 · Governance', activityCount: 10 }],
    });
    expect(
      seenParams.some(
        (params) =>
          params[1] instanceof Date &&
          params[1].toISOString() === '2026-06-01T00:00:00.000Z' &&
          params[2] instanceof Date &&
          params[2].toISOString() === '2026-06-30T23:59:59.999Z',
      ),
    ).toBe(true);
  });

  it('returns zero usage stats for empty periods and audits CSV exports', async () => {
    const { auditLogs, context, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'security_admin', status: 'active' }];
      if (sql.includes('count(DISTINCT ae.actor_id)')) {
        return [{ active_users: 0, uploads: 0, downloads: 0, searches: 0 }];
      }
      if (sql.includes('FROM file_objects')) return [{ storage_bytes: null }];
      return [];
    });

    const csv = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () =>
        service.exportUsageStatsCsv(
          userId,
          {
            from: '2026-05-01T00:00:00.000Z',
            to: '2026-05-31T23:59:59.999Z',
          },
          new Date('2026-06-01T00:00:00.000Z'),
        ),
    );

    expect(csv).toContain('summary,active_users,0');
    expect(csv).toContain('summary,storage_bytes,0');
    expect(auditLogs).toEqual([
      expect.objectContaining({
        action: 'AUDIT_EXPORT_CREATED',
        targetType: 'usage_stats',
        metadata: expect.objectContaining({
          scope_type: 'usage_stats',
          export_format: 'csv',
          result_count: 5,
        }),
      }),
    ]);
  });

  it('fails closed when the actor is not active', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'locked' }] : [],
    );

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(service.getOverview(userId)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
