import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch } from '../api-client';
import {
  dismissNotification,
  getNotificationCenter,
  getWorkQueue,
  markNotificationRead,
  notificationCenterToState,
  operationalApiErrorState,
  workQueueToState,
} from './work-ops';

vi.mock('../api-client', async () => {
  const actual = await vi.importActual<typeof import('../api-client')>('../api-client');
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
  };
});

describe('work ops API client', () => {
  it('loads work and notification API payloads without auth redirects', async () => {
    await getWorkQueue();
    await getNotificationCenter();
    await markNotificationRead('notification-aabbccddeeff0011');
    await dismissNotification('notification-aabbccddeeff0011');

    expect(apiFetch).toHaveBeenCalledWith('/work/items', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/notifications', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/notifications/notification-aabbccddeeff0011/read', {
      method: 'PATCH',
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/notifications/notification-aabbccddeeff0011/dismiss',
      {
        method: 'PATCH',
        redirectOnAuthRequired: false,
      },
    );
  });

  it('maps empty and ready operational responses to data states', () => {
    expect(
      workQueueToState({
        generatedAt: '2026-06-19T00:00:00.000Z',
        source: 'dashboard_operational_state',
        items: [],
      }),
    ).toEqual({ status: 'empty' });

    expect(
      notificationCenterToState({
        generatedAt: '2026-06-19T00:00:00.000Z',
        source: 'persisted_notifications',
        items: [
          {
            itemKey: 'notification-aabbccddeeff0011',
            source: 'records',
            category: '기록 보존',
            title: '삭제 승인 요청',
            description: 'AMIC-2026-0001 · CLIENT_RECORDS · requested',
            tone: 'warning',
            href: '/records?tab=disposal',
            status: 'unread',
            statusLabel: '새 알림',
          },
        ],
      }).status,
    ).toBe('ready');
  });

  it('maps permission failures to fail-closed operational states', () => {
    const state = operationalApiErrorState(new ApiClientError(403, { code: 'PERMISSION_DENIED' }));

    expect(state.status).toBe('forbidden');
    expect(state.error).toContain('접근 권한');
  });
});
