import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch } from '../api-client';
import {
  dismissNotification,
  getNotificationCenter,
  getWorkQueue,
  markNotificationRead,
  notificationCenterToState,
  operationalApiErrorState,
  reassignWorkItem,
  reviewGraphFactNode,
  reviewKnowledgeCandidate,
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
    await getWorkQueue({
      kind: 'contract_review_stage',
      assignee: 'mine',
      limit: 20,
      offset: 20,
    });
    await getWorkQueue({ assignee: 'all' });
    await getWorkQueue({ assignee: 'unassigned' });
    await getNotificationCenter();
    await markNotificationRead('notification-aabbccddeeff0011');
    await dismissNotification('notification-aabbccddeeff0011');
    await reassignWorkItem(
      'workflow-work-aabbccddeeff',
      '11111111-1111-4111-8111-111111111222',
    );
    await reviewGraphFactNode('11111111-1111-4111-8111-111111111333', 'confirm');
    await reviewKnowledgeCandidate('11111111-1111-4111-8111-111111111444', 'approve');

    expect(apiFetch).toHaveBeenCalledWith('/work/items', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/work/items?kind=contract_review_stage&assignee=mine&limit=20&offset=20',
      {
        redirectOnAuthRequired: false,
      },
    );
    expect(apiFetch).toHaveBeenCalledWith('/work/items', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/work/items?assignee=unassigned', {
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
    expect(apiFetch).toHaveBeenCalledWith('/work/items/workflow-work-aabbccddeeff/assignee', {
      method: 'PATCH',
      body: JSON.stringify({ assignedToUserId: '11111111-1111-4111-8111-111111111222' }),
      headers: { 'content-type': 'application/json' },
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/graph/nodes/11111111-1111-4111-8111-111111111333/review', {
      method: 'POST',
      body: JSON.stringify({ action: 'confirm' }),
      headers: { 'content-type': 'application/json' },
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/matters/knowledge-candidates/11111111-1111-4111-8111-111111111444/review',
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' }),
        headers: { 'content-type': 'application/json' },
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

  it('preserves persisted assignment and due fields from the work DTO without browser state', () => {
    const state = workQueueToState({
      generatedAt: '2026-06-19T00:00:00.000Z',
      source: 'persisted_work_items',
      items: [
        {
          itemKey: 'workflow-work-aabbccddeeff',
          source: 'operational_data',
          kind: 'contract_review_stage',
          sourceLabel: '워크플로',
          title: '계약 검토 단계 확인',
          description: 'AMIC-2026-0003 · Alpha Reviewer · 대기',
          href: '/work?kind=contract_review_stage',
          tone: 'warning',
          status: 'open',
          statusLabel: '대기',
          assignedToLabel: 'Alpha Reviewer',
          dueAt: '2026-06-23T00:00:00.000Z',
        },
      ],
    });

    expect(state).toEqual({
      status: 'ready',
      data: [
        expect.objectContaining({
          assignedToLabel: 'Alpha Reviewer',
          dueAt: '2026-06-23T00:00:00.000Z',
          href: '/work?kind=contract_review_stage',
          status: 'open',
        }),
      ],
    });
  });

  it('maps permission failures to fail-closed operational states', () => {
    const state = operationalApiErrorState(new ApiClientError(403, { code: 'PERMISSION_DENIED' }));

    expect(state.status).toBe('forbidden');
    expect(state.error).toContain('접근 권한');
  });
});
