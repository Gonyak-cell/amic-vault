import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { describe, expect, it, vi } from 'vitest';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';
import { NotificationsService } from './notifications.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const userId = '11111111-1111-4111-8111-111111111102';

function createService(rowsFor: (sql: string, params: readonly unknown[]) => unknown[]): {
  auditLog: ReturnType<typeof vi.fn>;
  context: TenantContextService;
  params: readonly unknown[][];
  queries: string[];
  service: NotificationsService;
} {
  const params: unknown[][] = [];
  const queries: string[] = [];
  const auditLog = vi.fn(async () => ({
    eventId: '77777777-7777-4777-8777-777777777777',
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
  }));
  const auditService = {
    async transaction<T>(_tenantId: string, run: (client: { query: typeof query }) => Promise<T>) {
      return run({ query });
    },
    log: auditLog,
  };

  async function query(sql: string, queryParams: readonly unknown[] = []) {
    queries.push(sql);
    params.push([...queryParams]);
    const rows = rowsFor(sql, queryParams);
    return {
      rows,
      rowCount: sql.includes('UPDATE notifications n') ? rows.length : null,
    };
  }

  const context = new TenantContextService();
  return {
    auditLog,
    context,
    params,
    queries,
    service: new NotificationsService(auditService as never, context, new PermissionQueryBuilder()),
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
            source: 'records',
            kind: 'legal_hold_active',
            status: 'unread',
            occurred_at: new Date('2026-06-20T00:30:00.000Z'),
            matter_label: 'AMIC-2026-0001 · Governance',
            document_title: null,
            extraction_status: null,
            hold_scope: 'matter',
            legal_hold_reason_code: 'CLIENT_RECORDS',
            disposal_status: null,
            disposal_reason_code: null,
            due_at: null,
          },
          {
            notification_id: '31111111-1111-4111-8111-111111111112',
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
          {
            notification_id: '41111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'edit_lock_expired',
            status: 'unread',
            occurred_at: new Date('2026-06-20T01:30:00.000Z'),
            matter_label: 'AMIC-2026-0001 · Governance',
            document_title: '계약 검토본',
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            due_at: null,
          },
          {
            notification_id: '51111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'edit_lock_released',
            status: 'unread',
            occurred_at: new Date('2026-06-20T01:40:00.000Z'),
            matter_label: 'AMIC-2026-0001 · Governance',
            document_title: '계약 검토본',
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            due_at: null,
          },
          {
            notification_id: '61111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'break_glass_approval_requested',
            status: 'unread',
            occurred_at: new Date('2026-06-20T01:50:00.000Z'),
            matter_label: 'AMIC-2026-0001 · Governance',
            document_title: null,
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            break_glass_status: 'pending',
            break_glass_reason_code: 'court_deadline',
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
      partial: false,
      hasMore: false,
      items: [
        {
          source: 'records',
          category: '기록 보존',
          title: '삭제 승인 요청',
          description: 'AMIC-2026-0001 · Governance · 의뢰인 기록 보존 · 승인 대기',
          href: '/records?tab=disposal',
          status: 'unread',
        },
        {
          source: 'records',
          category: '기록 보존',
          title: '법적 보존 조치 적용',
          description: 'AMIC-2026-0001 · Governance · Matter 보존 · 의뢰인 기록 보존',
          href: '/records?tab=holds',
          status: 'unread',
        },
        {
          source: 'operational_data',
          category: '문서 처리',
          title: '문서 처리 실패',
          href: '/files?extractionStatus=failed',
          status: 'read',
        },
        {
          source: 'operational_data',
          category: '편집 잠금',
          title: '편집 잠금 만료',
          href: '/files',
          status: 'unread',
        },
        {
          source: 'operational_data',
          category: '편집 잠금',
          title: '편집 잠금 해제',
          href: '/files',
          status: 'unread',
        },
        {
          source: 'operational_data',
          category: '보안 운영',
          title: '긴급 접근 승인 요청',
          description: 'AMIC-2026-0001 · Governance · 재판 기한 대응 · 승인 필요',
          href: '/admin/security',
          status: 'unread',
        },
      ],
    });
    expect(response.items[0]?.itemKey).toMatch(/^notification-[0-9a-f]{16}$/);
    expect(JSON.stringify(response)).not.toMatch(
      /Break-glass|Legal Hold|CLIENT_RECORDS|requested|court_deadline/,
    );
    expect(JSON.stringify(response)).not.toMatch(
      /tenantId|workspaceId|documentId|matterId|11111111-1111|hash|raw/i,
    );
    expect(queries.some((sql) => sql.includes('INSERT INTO notifications'))).toBe(true);
    expect(queries.some((sql) => sql.includes("ae.action = 'LEGAL_HOLD_APPLIED'"))).toBe(true);
    expect(queries.some((sql) => sql.includes('FROM break_glass_requests bgr'))).toBe(true);
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
  });

  it('updates read and dismissed state only through visible notification filters', async () => {
    const { auditLog, context, params, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('UPDATE notifications n')) {
        return [
          {
            notification_id: '21111111-1111-4111-8111-111111111111',
            matter_id: '31111111-1111-4111-8111-111111111111',
          },
        ];
      }
      return [];
    });

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(service.markRead(userId, 'notification-aabbccddeeff0011')).resolves.toEqual({
        itemKey: 'notification-aabbccddeeff0011',
        status: 'read',
      });
      await expect(service.dismiss(userId, 'notification-aabbccddeeff0011')).resolves.toEqual({
        itemKey: 'notification-aabbccddeeff0011',
        status: 'dismissed',
      });
    });

    expect(queries.filter((sql) => sql.includes('UPDATE notifications n'))).toHaveLength(2);
    expect(queries.some((sql) => sql.includes('digest(n.notification_id::text'))).toBe(true);
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
    expect(params.some((values) => values.includes('aabbccddeeff0011'))).toBe(true);
    expect(auditLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'NOTIFICATION_READ',
        targetType: 'notification',
        targetId: '21111111-1111-4111-8111-111111111111',
        matterId: '31111111-1111-4111-8111-111111111111',
      }),
      expect.objectContaining({ query: expect.any(Function) }),
    );
    expect(auditLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'NOTIFICATION_DISMISSED',
        targetType: 'notification',
        targetId: '21111111-1111-4111-8111-111111111111',
        matterId: '31111111-1111-4111-8111-111111111111',
      }),
      expect.objectContaining({ query: expect.any(Function) }),
    );
  });

  it('fails closed without an audit when the mutation target is not visible', async () => {
    const { auditLog, context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'active' }] : [],
    );

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(
        service.markRead(userId, 'notification-aabbccddeeff0011'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    expect(auditLog).not.toHaveBeenCalled();
  });

  it('propagates audit failure from the mutation transaction', async () => {
    const { auditLog, context, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('UPDATE notifications n')) {
        return [
          {
            notification_id: '21111111-1111-4111-8111-111111111111',
            matter_id: '31111111-1111-4111-8111-111111111111',
          },
        ];
      }
      return [];
    });
    auditLog.mockRejectedValueOnce(new Error('audit unavailable'));

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(service.dismiss(userId, 'notification-aabbccddeeff0011')).rejects.toThrow(
        'audit unavailable',
      );
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NOTIFICATION_DISMISSED' }),
      expect.objectContaining({ query: expect.any(Function) }),
    );
  });

  it('returns only twenty notification items and marks a twenty-first visible row as partial', async () => {
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('ORDER BY') && sql.includes('FROM notifications n')) {
        return Array.from({ length: 21 }, (_, index) => ({
          notification_id: `21111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
          source: 'operational_data',
          kind: 'processing_complete',
          matter_id: '31111111-1111-4111-8111-111111111111',
          target_id: `41111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
          status: 'unread',
          occurred_at: new Date(`2026-06-20T00:${String(index).padStart(2, '0')}:00.000Z`),
          matter_label: 'AMIC-2026-0001 · Governance',
          document_title: `처리 문서 ${index + 1}`,
          extraction_status: 'ready',
          hold_scope: null,
          legal_hold_reason_code: null,
          disposal_status: null,
          disposal_reason_code: null,
          break_glass_status: null,
          break_glass_reason_code: null,
          rfi_code: null,
          rfi_title: null,
          rfi_status: null,
          rfi_due_date: null,
          hearing_title: null,
          hearing_type: null,
          hearing_scheduled_at: null,
          dlp_actor_name: null,
          dlp_actor_email: null,
          dlp_event_count: null,
          dlp_total_bytes: null,
          dlp_threshold_count: null,
          dlp_threshold_bytes: null,
          dlp_window_start: null,
          dlp_window_end: null,
          due_at: null,
        }));
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listNotifications(userId, new Date('2026-06-20T02:00:00.000Z')),
    );

    expect(response.items).toHaveLength(20);
    expect(response).toMatchObject({ partial: true, hasMore: true });
    expect(queries.some((sql) => sql.includes('LIMIT 21'))).toBe(true);
  });

  it('maps DD RFI notification kinds to the DD matter tab', async () => {
    const matterId = '21111111-1111-4111-8111-111111111111';
    const overdueRfiId = '31111111-1111-4111-8111-111111111111';
    const unmappedRfiId = '41111111-1111-4111-8111-111111111111';
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('SELECT') && sql.includes('FROM notifications n')) {
        return [
          {
            notification_id: '51111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'dd_rfi_overdue',
            matter_id: matterId,
            target_id: overdueRfiId,
            status: 'unread',
            occurred_at: new Date('2026-06-20T00:00:00.000Z'),
            matter_label: 'AMIC-2026-DD · 거래 실사',
            document_title: null,
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            break_glass_status: null,
            break_glass_reason_code: null,
            rfi_code: 'MA.CORP.01',
            rfi_title: 'Corporate registry extract',
            rfi_status: 'requested',
            rfi_due_date: '2026-06-19',
            due_at: null,
          },
          {
            notification_id: '61111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'dd_rfi_unmapped',
            matter_id: matterId,
            target_id: unmappedRfiId,
            status: 'unread',
            occurred_at: new Date('2026-06-20T00:01:00.000Z'),
            matter_label: 'AMIC-2026-DD · 거래 실사',
            document_title: null,
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            break_glass_status: null,
            break_glass_reason_code: null,
            rfi_code: 'MA.FIN.01',
            rfi_title: 'Recent financial statements',
            rfi_status: 'requested',
            rfi_due_date: null,
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

    expect(response.items).toMatchObject([
      {
        category: 'DD 요청',
        title: '기한 초과 RFI',
        href: `/matters/${matterId}/dd?rfiId=${overdueRfiId}`,
        status: 'unread',
      },
      {
        category: 'DD 요청',
        title: '미매핑 RFI',
        href: `/matters/${matterId}/dd?rfiId=${unmappedRfiId}`,
        status: 'unread',
      },
    ]);
    expect(response.items[0]?.description).toContain('2026-06-19');
    expect(response.items[1]?.description).toContain('자료 미매핑');
    expect(queries.some((sql) => sql.includes('FROM dd_rfis r'))).toBe(true);
    expect(queries.some((sql) => sql.includes("'dd_rfi_overdue'"))).toBe(true);
    expect(queries.some((sql) => sql.includes("'dd_rfi_unmapped'"))).toBe(true);
  });

  it('maps litigation deadline notifications to the litigation matter tab', async () => {
    const matterId = '21111111-1111-4111-8111-111111111111';
    const hearingId = '71111111-1111-4111-8111-111111111111';
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('SELECT') && sql.includes('FROM notifications n')) {
        return [
          {
            notification_id: '81111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'litigation_deadline',
            matter_id: matterId,
            target_id: hearingId,
            status: 'unread',
            occurred_at: new Date('2026-07-04T00:00:00.000Z'),
            matter_label: 'AMIC-2026-LIT · 손해배상',
            document_title: null,
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            break_glass_status: null,
            break_glass_reason_code: null,
            rfi_code: null,
            rfi_title: null,
            rfi_status: null,
            rfi_due_date: null,
            hearing_title: '준비서면 제출기한',
            hearing_type: 'deadline',
            hearing_scheduled_at: new Date('2026-07-10T00:00:00.000Z'),
            due_at: new Date('2026-07-10T00:00:00.000Z'),
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listNotifications(userId, new Date('2026-07-04T02:00:00.000Z')),
    );

    expect(response.items).toMatchObject([
      {
        category: '송무',
        title: '송무 기일',
        href: `/matters/${matterId}/litigation?hearingId=${hearingId}`,
        status: 'unread',
      },
    ]);
    expect(response.items[0]?.description).toContain('준비서면 제출기한');
    expect(JSON.stringify(response)).not.toContain('secret');
    expect(queries.some((sql) => sql.includes('litigation_hearings lhg'))).toBe(true);
    expect(queries.some((sql) => sql.includes("'litigation_deadline'"))).toBe(true);
  });

  it('maps DLP bulk download alerts without exposing a raw actor identifier', async () => {
    const matterId = '21111111-1111-4111-8111-111111111111';
    const alertId = '91111111-1111-4111-8111-111111111111';
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'security_admin', status: 'active' }];
      if (sql.includes('SELECT') && sql.includes('FROM notifications n')) {
        return [
          {
            notification_id: '92111111-1111-4111-8111-111111111111',
            source: 'operational_data',
            kind: 'dlp_bulk_download',
            matter_id: matterId,
            target_id: alertId,
            status: 'unread',
            occurred_at: new Date('2026-07-04T01:00:00.000Z'),
            matter_label: 'AMIC-2026-SEC · 보안 점검',
            document_title: null,
            extraction_status: null,
            hold_scope: null,
            legal_hold_reason_code: null,
            disposal_status: null,
            disposal_reason_code: null,
            break_glass_status: null,
            break_glass_reason_code: null,
            rfi_code: null,
            rfi_title: null,
            rfi_status: null,
            rfi_due_date: null,
            hearing_title: null,
            hearing_type: null,
            hearing_scheduled_at: null,
            dlp_actor_name: null,
            dlp_actor_email: null,
            dlp_event_count: 55,
            dlp_total_bytes: '560000000',
            dlp_threshold_count: 50,
            dlp_threshold_bytes: '524288000',
            dlp_window_start: new Date('2026-07-04T00:00:00.000Z'),
            dlp_window_end: new Date('2026-07-04T01:00:00.000Z'),
            due_at: null,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listNotifications(userId, new Date('2026-07-04T02:00:00.000Z')),
    );

    expect(response.items).toMatchObject([
      {
        category: '보안 운영',
        title: '대량 다운로드 감지',
        href: '/admin/security?panel=dlp-downloads',
        status: 'unread',
      },
    ]);
    expect(response.items[0]?.description).toContain('사용자');
    expect(response.items[0]?.description).toContain('55건');
    expect(response.items[0]?.description).not.toContain(userId);
    expect(queries.some((sql) => sql.includes('dlp_behavior_alerts dba'))).toBe(true);
    expect(queries.some((sql) => sql.includes('dba.actor_user_id::text'))).toBe(false);
    expect(queries.some((sql) => sql.includes("'dlp_bulk_download'"))).toBe(true);
    expect(
      queries.some((sql) =>
        sql.includes("n.kind IN ('break_glass_approval_requested', 'dlp_bulk_download')"),
      ),
    ).toBe(true);
  });

  it('fails closed when the actor is inactive', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'locked' }] : [],
    );

    await context.run({ tenantId, slug: 'amic', status: 'active', source: 'session' }, async () => {
      await expect(service.listNotifications(userId)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
