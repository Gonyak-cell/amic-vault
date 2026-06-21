import { describe, expect, it } from 'vitest';
import {
  dashboardOverviewSchema,
  dmsNotificationCenterResponseSchema,
  dmsWorkQueueResponseSchema,
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
            sourceLabel: '기록 보존',
            title: '삭제 승인 요청',
            description: 'AMIC-2026-0001 · 대기 · CLIENT_RECORDS',
            href: '/records?tab=disposal',
            tone: 'neutral',
            status: 'open',
            statusLabel: '대기',
            dueAt: '2026-06-24T00:00:00.000Z',
          },
        ],
      }).items,
    ).toHaveLength(2);

    expect(
      dmsNotificationCenterResponseSchema.parse({
        generatedAt: '2026-06-17T00:00:00.000Z',
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
            occurredAt: '2026-06-17T00:00:00.000Z',
          },
        ],
      }).items,
    ).toHaveLength(1);
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
});
