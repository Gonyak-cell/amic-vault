import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch } from '../api-client';
import {
  dismissNotification,
  getNotificationCenter,
  getWorkQueue,
  listWorkReassignmentCandidates,
  markNotificationRead,
  notificationCenterToState,
  operationalApiErrorState,
  reassignWorkItem,
  reviewGraphFactNode,
  reviewKnowledgeCandidate,
  updateWorkItemDueAt,
  workQueueQueryFromUrlState,
  workQueueToState,
  workQueueUrl,
  workQueueUrlStateFromParams,
} from './work-ops';

vi.mock('../api-client', async () => {
  const actual = await vi.importActual<typeof import('../api-client')>('../api-client');
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
  };
});

describe('work ops API client', () => {
  it('lists opaque Work reassignment candidates with bounded optional query values', async () => {
    await listWorkReassignmentCandidates('workflow-work/aabbccddeeff', {
      q: '  김 변호사  ',
      limit: 10,
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/work/items/workflow-work%2Faabbccddeeff/reassignment-candidates?q=%EA%B9%80+%EB%B3%80%ED%98%B8%EC%82%AC&limit=10',
      { redirectOnAuthRequired: false },
    );
  });

  it('does not add empty candidate query values', async () => {
    await listWorkReassignmentCandidates('workflow-work-aabbccddeeff', { q: '  ' });

    expect(apiFetch).toHaveBeenCalledWith(
      '/work/items/workflow-work-aabbccddeeff/reassignment-candidates',
      { redirectOnAuthRequired: false },
    );
  });

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
    await getWorkQueue({
      matterId: '11111111-1111-4111-8111-111111111122',
      assignee: 'all',
      limit: 100,
      offset: 0,
    });
    await getNotificationCenter();
    await markNotificationRead('notification-aabbccddeeff0011');
    await dismissNotification('notification-aabbccddeeff0011');
    await reassignWorkItem('workflow-work-aabbccddeeff', '11111111-1111-4111-8111-111111111222');
    await updateWorkItemDueAt('workflow-work-aabbccddeeff', '2026-08-01T00:00:00.000Z');
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
    expect(apiFetch).toHaveBeenCalledWith(
      '/work/items?matterId=11111111-1111-4111-8111-111111111122&limit=100&offset=0',
      {
        redirectOnAuthRequired: false,
      },
    );
    expect(apiFetch).toHaveBeenCalledWith('/notifications', {
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/notifications/notification-aabbccddeeff0011/read', {
      method: 'PATCH',
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/notifications/notification-aabbccddeeff0011/dismiss', {
      method: 'PATCH',
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/work/items/workflow-work-aabbccddeeff/assignee', {
      method: 'PATCH',
      body: JSON.stringify({ assignedToUserId: '11111111-1111-4111-8111-111111111222' }),
      headers: { 'content-type': 'application/json' },
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith('/work/items/workflow-work-aabbccddeeff/due-at', {
      method: 'PATCH',
      body: JSON.stringify({ dueAt: '2026-08-01T00:00:00.000Z' }),
      headers: { 'content-type': 'application/json' },
      redirectOnAuthRequired: false,
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/graph/nodes/11111111-1111-4111-8111-111111111333/review',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'confirm' }),
        headers: { 'content-type': 'application/json' },
        redirectOnAuthRequired: false,
      },
    );
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

  it('keeps a paginated empty slice distinct from a truly empty queue', () => {
    expect(
      workQueueToState({
        generatedAt: '2026-06-19T00:00:00.000Z',
        source: 'persisted_work_items',
        items: [],
        page: { limit: 20, offset: 20, total: 26, hasNext: false },
      }),
    ).toEqual({ status: 'ready', data: [] });
  });

  it('round-trips URL state into the same server query for reload and history restores', () => {
    const filtered = workQueueUrlStateFromParams(
      new URLSearchParams('view=mine&assignee=unassigned&kind=dd_rfi_due&limit=20&offset=40'),
    );
    const defaultState = workQueueUrlStateFromParams(
      new URLSearchParams('view=mine&assignee=mine&limit=20'),
    );

    expect(workQueueUrl(filtered)).toBe(
      '/work?view=mine&assignee=unassigned&limit=20&kind=dd_rfi_due&offset=40',
    );
    expect(workQueueQueryFromUrlState(filtered)).toEqual({
      kind: 'dd_rfi_due',
      assignee: 'unassigned',
      limit: 20,
      offset: 40,
    });
    expect(workQueueQueryFromUrlState(defaultState)).toEqual({
      assignee: 'mine',
      limit: 20,
      offset: 0,
    });
    expect(
      workQueueQueryFromUrlState(
        workQueueUrlStateFromParams(
          new URL(workQueueUrl(filtered), 'https://vault.test').searchParams,
        ),
      ),
    ).toEqual(workQueueQueryFromUrlState(filtered));
  });

  it('reconstructs the same Work query while history switches between both views', () => {
    const mineState = workQueueUrlStateFromParams(
      new URLSearchParams(
        'view=mine&assignee=unassigned&kind=document_ocr_pending&limit=50&offset=100',
      ),
    );
    const notificationUrl = workQueueUrl({ ...mineState, view: 'notifications' });
    const notificationState = workQueueUrlStateFromParams(
      new URL(notificationUrl, 'https://vault.test').searchParams,
    );
    const restoredMineUrl = workQueueUrl({ ...notificationState, view: 'mine' });
    const restoredMineState = workQueueUrlStateFromParams(
      new URL(restoredMineUrl, 'https://vault.test').searchParams,
    );

    expect(notificationUrl).toBe(
      '/work?view=notifications&assignee=unassigned&limit=50&kind=document_ocr_pending&offset=100',
    );
    expect(restoredMineUrl).toBe(
      '/work?view=mine&assignee=unassigned&limit=50&kind=document_ocr_pending&offset=100',
    );
    expect(workQueueQueryFromUrlState(notificationState)).toEqual(
      workQueueQueryFromUrlState(mineState),
    );
    expect(workQueueQueryFromUrlState(restoredMineState)).toEqual(
      workQueueQueryFromUrlState(mineState),
    );
  });

  it('fails repeated or malformed URL query values to safe Work defaults', () => {
    const params = new URLSearchParams(
      'view=notifications&view=mine&assignee=mine&assignee=all&kind=unknown&limit=0&offset=-1',
    );
    const sanitized = workQueueUrlStateFromParams(params);

    expect(sanitized).toEqual({
      view: 'mine',
      assignee: 'mine',
      limit: 20,
      offset: 0,
    });
    expect(workQueueUrl(sanitized)).toBe('/work?view=mine&assignee=mine&limit=20');
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
