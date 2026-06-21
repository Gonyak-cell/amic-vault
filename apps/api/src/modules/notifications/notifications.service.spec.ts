import { ForbiddenException } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { describe, expect, it } from 'vitest';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';
import { NotificationsService } from './notifications.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const userId = '11111111-1111-4111-8111-111111111102';

function createService(rowsFor: (sql: string, params: readonly unknown[]) => unknown[]): {
  context: TenantContextService;
  params: readonly unknown[][];
  queries: string[];
  service: NotificationsService;
} {
  const params: unknown[][] = [];
  const queries: string[] = [];
  const auditService = {
    async transaction<T>(_tenantId: string, run: (client: { query: typeof query }) => Promise<T>) {
      return run({ query });
    },
  };

  async function query(sql: string, queryParams: readonly unknown[] = []) {
    queries.push(sql);
    params.push([...queryParams]);
    if (sql.includes('UPDATE notifications n') && sql.includes('WITH visible')) {
      return { rows: rowsFor(sql, queryParams), rowCount: 1 };
    }
    return { rows: rowsFor(sql, queryParams), rowCount: null };
  }

  const context = new TenantContextService();
  return {
    context,
    params,
    queries,
    service: new NotificationsService(
      auditService as never,
      context,
      new PermissionQueryBuilder(),
    ),
  };
}

describe('NotificationsService', () => {
  it('materializes and returns persisted notification state with safe display labels', async () => {
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'firm_admin', status: 'active' }];
      if (sql.includes('SELECT') && sql.includes('FROM notifications n')) {
        return [
          {
            notification_id: '21111111-1111-4111-8111-111111111111',
            source: 'records',
            kind: 'disposal_approval_requested',
            status: 'unread',
            occurred_at: new Date('2026-06-20T00:00:00.000Z'),
            matter_label: 'AMIC-2026-0001 · Governance',
            document_title: null,
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: 'requested',
            disposal_reason_code: 'CLIENT_RECORDS',
            due_at: null,
          },
          {
            notification_id: '31111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'processing_failed',
            status: 'read',
            occurred_at: new Date('2026-06-20T01:00:00.000Z'),
            matter_label: 'AMIC-2026-0001 · Governance',
            document_title: '계약 검토본',
            extraction_status: 'failed',
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            due_at: null,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listNotifications(userId, new Date('2026-06-20T02:00:00.000Z')),
    );

    expect(response).toMatchObject({
      generatedAt: '2026-06-20T02:00:00.000Z',
      source: 'persisted_notifications',
      items: [
        {
          source: 'records',
          category: '기록 보존',
          title: '삭제 승인 요청',
          href: '/records?tab=disposal',
          status: 'unread',
        },
        {
          source: 'operational_data',
          category: '문서 처리',
          title: '문서 처리 실패',
          href: '/files?extractionStatus=failed',
          status: 'read',
        },
      ],
    });
    expect(response.items[0]?.itemKey).toMatch(/^notification-[0-9a-f]{16}$/);
    expect(JSON.stringify(response)).not.toMatch(
      /tenantId|workspaceId|documentId|matterId|11111111-1111|hash|raw/i,
    );
    expect(queries.some((sql) => sql.includes('INSERT INTO notifications'))).toBe(true);
    expect(queries.some((sql) => sql.includes("ae.action = 'LEGAL_HOLD_APPLIED'"))).toBe(true);
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
  });

  it('updates read and dismissed state only through visible notification filters', async () => {
    const { context, params, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('UPDATE notifications n')) {
        return [{ notification_id: '21111111-1111-4111-8111-111111111111' }];
      }
      return [];
    });

    await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      async () => {
        await expect(
          service.markRead(userId, 'notification-aabbccddeeff0011'),
        ).resolves.toEqual({
          itemKey: 'notification-aabbccddeeff0011',
          status: 'read',
        });
        await expect(
          service.dismiss(userId, 'notification-aabbccddeeff0011'),
        ).resolves.toEqual({
          itemKey: 'notification-aabbccddeeff0011',
          status: 'dismissed',
        });
      },
    );

    expect(queries.filter((sql) => sql.includes('UPDATE notifications n'))).toHaveLength(2);
    expect(queries.some((sql) => sql.includes('digest(n.notification_id::text'))).toBe(true);
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
    expect(params.some((values) => values.includes('aabbccddeeff0011'))).toBe(true);
  });

  it('fails closed when the actor is inactive', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'locked' }] : [],
    );

    await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      async () => {
        await expect(service.listNotifications(userId)).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });
});
