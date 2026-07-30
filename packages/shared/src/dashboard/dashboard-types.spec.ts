import { describe, expect, it } from 'vitest';
import {
  dashboardOverviewSchema,
  dashboardUsageStatsQuerySchema,
  dashboardUsageStatsResponseSchema,
  dmsNotificationCenterResponseSchema,
  dmsWorkReassignmentCandidatesQuerySchema,
  dmsWorkReassignmentCandidatesResponseSchema,
  dmsWorkQueueQuerySchema,
  dmsWorkQueueResponseSchema,
  reassignWorkItemSchema,
  updateWorkItemDueAtSchema,
} from './dashboard-types';

describe('dashboard DTOs', () => {
  it('accepts display-only operational overview data', () => {
    const parsed = dashboardOverviewSchema.parse({
      generatedAt: '2026-06-17T00:00:00.000Z',
      recentFiles: [{ title: 'Board minutes', matterLabel: 'M-001 · Governance' }],
      recentActivity: [
        {
          actionLabel: 'Document viewed',
          targetLabel: 'M-001 · Governance',
          resultLabel: 'Success',
          occurredAt: '2026-06-17T00:00:00.000Z',
        },
      ],
      permissionPolicyAlerts: [],
      aiPrepStatus: [{ matterLabel: 'M-001 · Governance', statusLabel: 'Ready' }],
      integrationStatus: [{ integrationLabel: 'Outlook filing', statusLabel: 'No activity' }],
    });

    expect(parsed.recentFiles).toHaveLength(1);
  });

  it('rejects undeclared internal reference fields', () => {
    expect(() =>
      dashboardOverviewSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        recentFiles: [{ title: 'Board minutes', documentId: 'doc-1' }],
        recentActivity: [],
        permissionPolicyAlerts: [],
        aiPrepStatus: [],
        integrationStatus: [],
      }),
    ).toThrow();
  });

  it('accepts usage statistics without internal ids or raw audit rows', () => {
    const parsed = dashboardUsageStatsResponseSchema.parse({
      generatedAt: '2026-06-17T00:00:00.000Z',
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
      topMatters: [{ matterLabel: 'M-001 · Governance', activityCount: 10 }],
    });

    expect(parsed.totals.searches).toBe(5);
  });

  it('rejects reversed usage statistics periods and undeclared ids', () => {
    expect(() =>
      dashboardUsageStatsQuerySchema.parse({
        from: '2026-06-30T23:59:59.999Z',
        to: '2026-06-01T00:00:00.000Z',
      }),
    ).toThrow();

    expect(() =>
      dashboardUsageStatsResponseSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        period: {
          from: '2026-06-01T00:00:00.000Z',
          to: '2026-06-30T23:59:59.999Z',
        },
        totals: {
          activeUsers: 1,
          uploads: 1,
          downloads: 0,
          searches: 0,
          storageBytes: 1,
        },
        topMatters: [{ matterId: '11111111-1111-4111-8111-111111111111', activityCount: 1 }],
      }),
    ).toThrow();
  });

  it('accepts display-only DMS work queue and notification items', () => {
    expect(
      dmsWorkQueueResponseSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        source: 'dashboard_operational_state',
        items: [
          {
            itemKey: 'permission-policy-0',
            source: 'permission_policy',
            sourceLabel: '권한/정책',
            title: '권한/정책 알림 확인',
            description: '1건의 정책 알림이 있습니다.',
            href: '/audit',
            tone: 'warning',
          },
          {
            itemKey: 'records-disposal-a1b2c3',
            source: 'records',
            kind: 'records_disposal_approval',
            sourceLabel: '기록 보존',
            title: '삭제 승인 요청',
            description: 'AMIC-2026-0001 · 대기 · CLIENT_RECORDS',
            href: '/records?tab=disposal',
            tone: 'neutral',
            status: 'open',
            statusLabel: '대기',
            dueAt: '2026-06-24T00:00:00.000Z',
          },
          {
            itemKey: 'workflow-work-aabbccddeeff',
            source: 'operational_data',
            kind: 'contract_review_stage',
            sourceLabel: '워크플로',
            title: '계약 검토 단계 확인',
            description: 'AMIC-2026-0002 · 계약 검토',
            href: '/work?kind=contract_review_stage',
            tone: 'warning',
            status: 'open',
            statusLabel: '대기',
            assignedToLabel: 'Alpha Reviewer',
            canReassign: true,
            canUpdateDueAt: true,
          },
          {
            itemKey: 'ai-prep-work-aabbccddeeff',
            source: 'ai_prep',
            kind: 'ai_candidate_review',
            sourceLabel: 'AI 준비',
            title: 'AI 후보 검토',
            description: 'AMIC-2026-0003 · 계약서 · 청크 인용 후보',
            href: '/work?kind=ai_candidate_review',
            tone: 'warning',
            status: 'open',
            statusLabel: '대기',
            assignedToLabel: 'Alpha Reviewer',
          },
          {
            itemKey: 'graph-fact-review-aabbccddeeff',
            targetId: '11111111-1111-4111-8111-111111111333',
            source: 'ai_prep',
            kind: 'graph_fact_review',
            sourceLabel: 'AI 준비',
            title: 'AI Fact 후보 확인',
            description: 'AMIC-2026-0004 · 계약서 · 매수인은 잔금을 지급했다.',
            href: '/work?kind=graph_fact_review',
            tone: 'warning',
            status: 'open',
            statusLabel: '대기',
            assignedToLabel: 'Alpha Reviewer',
          },
        ],
        page: { limit: 20, offset: 0, total: 5, hasNext: false },
      }).items,
    ).toHaveLength(5);

    expect(
      dmsNotificationCenterResponseSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        source: 'persisted_notifications',
        partial: false,
        hasMore: false,
        items: [
          {
            itemKey: 'notification-aabbccddeeff0011',
            source: 'records',
            category: '기록 보존',
            title: '삭제 승인 요청',
            description: 'AMIC-2026-0001 · 의뢰인 기록 보존 · 승인 대기',
            tone: 'warning',
            href: '/records?tab=disposal',
            status: 'unread',
            statusLabel: '새 알림',
            occurredAt: '2026-06-17T00:00:00.000Z',
          },
        ],
      }).items,
    ).toHaveLength(1);
  });

  it('keeps notification partial and hasMore state consistent', () => {
    expect(
      dmsNotificationCenterResponseSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        source: 'persisted_notifications',
        items: [],
        partial: true,
        hasMore: true,
      }),
    ).toMatchObject({ partial: true, hasMore: true });

    expect(() =>
      dmsNotificationCenterResponseSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        source: 'persisted_notifications',
        items: [],
        partial: true,
        hasMore: false,
      }),
    ).toThrow();
  });

  it('rejects internal refs on DMS operational items', () => {
    expect(() =>
      dmsWorkQueueResponseSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
        source: 'dashboard_operational_state',
        items: [
          {
            itemKey: 'document-1',
            source: 'operational_data',
            sourceLabel: '운영 데이터',
            title: '문서 확인',
            description: '확인 필요',
            href: '/documents/11111111-1111-4111-8111-111111111111',
            tone: 'neutral',
            documentId: '11111111-1111-4111-8111-111111111111',
          },
        ],
      }),
    ).toThrow();
  });

  it('validates Matter-scoped work reads and work mutation bodies', () => {
    const matterId = '11111111-1111-4111-8111-111111111111';
    expect(dmsWorkQueueQuerySchema.parse({ matterId })).toEqual({
      matterId,
      assignee: 'all',
      limit: 20,
      offset: 0,
    });
    expect(() => dmsWorkQueueQuerySchema.parse({ matterId: 'not-a-uuid' })).toThrow();

    expect(
      reassignWorkItemSchema.parse({
        assignedToUserId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toEqual({ assignedToUserId: '22222222-2222-4222-8222-222222222222' });
    expect(() => reassignWorkItemSchema.parse({ assignedToUserId: 'not-a-uuid' })).toThrow();

    expect(
      updateWorkItemDueAtSchema.parse({
        dueAt: '2026-08-01T09:30:00+09:00',
      }),
    ).toEqual({ dueAt: '2026-08-01T09:30:00+09:00' });
    expect(() => updateWorkItemDueAtSchema.parse({ dueAt: null })).toThrow();
    expect(() => updateWorkItemDueAtSchema.parse({ dueAt: '2026-08-01' })).toThrow();
  });

  it('validates bounded safe Work reassignment candidate contracts', () => {
    expect(dmsWorkReassignmentCandidatesQuerySchema.parse({ q: '  Kim  ' })).toEqual({
      q: 'Kim',
      limit: 25,
    });
    expect(dmsWorkReassignmentCandidatesQuerySchema.parse({ limit: '5' })).toEqual({
      limit: 5,
    });
    expect(() => dmsWorkReassignmentCandidatesQuerySchema.parse({ limit: 26 })).toThrow();
    expect(() => dmsWorkReassignmentCandidatesQuerySchema.parse({ q: 'a'.repeat(81) })).toThrow();

    expect(
      dmsWorkReassignmentCandidatesResponseSchema.parse({
        items: [
          {
            userId: '22222222-2222-4222-8222-222222222222',
            label: 'Alpha Reviewer',
          },
        ],
      }),
    ).toEqual({
      items: [
        {
          userId: '22222222-2222-4222-8222-222222222222',
          label: 'Alpha Reviewer',
        },
      ],
    });
    expect(() =>
      dmsWorkReassignmentCandidatesResponseSchema.parse({
        items: [
          {
            userId: '22222222-2222-4222-8222-222222222222',
            label: 'Alpha Reviewer',
            matterId: '33333333-3333-4333-8333-333333333333',
          },
        ],
      }),
    ).toThrow();
  });
});
