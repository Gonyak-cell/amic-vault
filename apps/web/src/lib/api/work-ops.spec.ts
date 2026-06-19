import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch } from '../api-client';
import {
  getNotificationCenter,
  getWorkQueue,
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

    expect(apiFetch).toHaveBeenCalledWith('/work/items', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/notifications', {
      redirectOnAuthRequired: false,
    });
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
        source: 'dashboard_operational_state',
        items: [
          {
            itemKey: 'permission-policy-0',
            source: 'permission_policy',
            category: '권한/정책',
            title: '요청이 차단됨',
            description: '문서 다운로드 · 차단',
            tone: 'warning',
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
