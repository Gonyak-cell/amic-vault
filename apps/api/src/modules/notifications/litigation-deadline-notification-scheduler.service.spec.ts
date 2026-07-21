import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import {
  isLitigationDeadlineNotificationSchedulerEnabled,
  litigationDeadlineNotificationSweepCron,
  LitigationDeadlineNotificationSchedulerService,
} from './litigation-deadline-notification-scheduler.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

describe('LitigationDeadlineNotificationSchedulerService', () => {
  it('sweeps tenants by opening work items before notification materialization', async () => {
    const calls: string[] = [];
    const litigation = {
      refreshLitigationDeadlineWorkForTenant: vi.fn(async (tenantId: string) => {
        calls.push(`work:${tenantId}`);
        return { refreshedCount: 1 };
      }),
    };
    const notifications = {
      refreshLitigationDeadlineNotificationsForTenant: vi.fn(async (tenantId: string) => {
        calls.push(`notifications:${tenantId}`);
        return { refreshedCount: 2 };
      }),
    };
    const tenantReader = {
      listActiveTenantIds: vi.fn(async () => [tenantId]),
    };
    const service = new LitigationDeadlineNotificationSchedulerService(
      litigation,
      notifications,
      tenantReader,
    );

    await expect(service.sweepLitigationDeadlineNotifications()).resolves.toEqual({
      tenantCount: 1,
      refreshedCount: 3,
      failedCount: 0,
    });
    expect(calls).toEqual([
      `work:${tenantId}`,
      `notifications:${tenantId}`,
    ]);
  });

  it('keeps the worker disabled unless explicitly enabled', () => {
    expect(isLitigationDeadlineNotificationSchedulerEnabled({})).toBe(false);
    expect(
      isLitigationDeadlineNotificationSchedulerEnabled({
        LITIGATION_DEADLINE_NOTIFICATION_SWEEPER_ENABLED: '1',
      }),
    ).toBe(true);
    expect(
      litigationDeadlineNotificationSweepCron({
        LITIGATION_DEADLINE_NOTIFICATION_SWEEP_CRON: '*/15 * * * *',
      }),
    ).toBe('*/15 * * * *');
  });
});
