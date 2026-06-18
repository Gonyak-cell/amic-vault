import { ForbiddenException } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { describe, expect, it } from 'vitest';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';
import { DashboardService } from './dashboard.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const userId = '11111111-1111-4111-8111-111111111102';

function createService(rowsFor: (sql: string) => unknown[]): {
  queries: string[];
  service: DashboardService;
  context: TenantContextService;
} {
  const queries: string[] = [];
  const auditService = {
    async transaction<T>(_tenantId: string, run: (client: { query: typeof query }) => Promise<T>) {
      return run({ query });
    },
  };

  async function query(sql: string) {
    queries.push(sql);
    return { rows: rowsFor(sql), rowCount: null };
  }

  const context = new TenantContextService();
  return {
    queries,
    service: new DashboardService(
      auditService as never,
      context,
      new PermissionQueryBuilder(),
    ),
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
    expect(JSON.stringify(overview)).not.toMatch(/documentId|matterId|tenantId|workspaceId|hash|raw/i);
  });

  it('fails closed when the actor is not active', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'locked' }] : [],
    );

    await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      async () => {
        await expect(service.getOverview(userId)).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });
});
