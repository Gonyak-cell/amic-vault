import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotificationsClient, NotificationsContent } from './notifications-client';

describe('NotificationsClient', () => {
  it('renders an unavailable real-data-only notification center before API success', () => {
    const html = renderToStaticMarkup(<NotificationsClient />);

    expect(html).toContain('알림');
    expect(html).toContain('권한이 확인된 실제 운영 이벤트와 상태 알림만 표시됩니다.');
    expect(html).toContain('알림 조치 콘솔');
    expect(html).toContain('전체 출처');
    expect(html).toContain('전체 상태');
    expect(html).toContain('주의 알림 우선');
    expect(html).toContain('알림 API 연결 대기 중입니다.');
    expect(html).toContain('운영 데이터 연결 대기 중입니다.');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
    expect(html).not.toContain('18:42');
  });

  it('renders notifications from the dedicated notification API state', () => {
    const html = renderToStaticMarkup(
      <NotificationsContent
        dashboardState={{
          recentFiles: { status: 'ready', data: [] },
          recentActivity: {
            status: 'ready',
            data: [
              {
                actionLabel: '문서 업로드 완료',
                targetLabel: 'AMIC-2026-0001',
                resultLabel: '성공',
                occurredAt: '2026-06-19T00:00:00.000Z',
              },
            ],
          },
          permissionPolicyAlerts: {
            status: 'ready',
            data: [
              {
                title: '요청이 차단됨',
                description: '문서 다운로드 · 차단',
                occurredAt: '2026-06-19T00:00:00.000Z',
              },
            ],
          },
          aiPrepStatus: {
            status: 'ready',
            data: [{ matterLabel: 'AMIC-2026-0001', statusLabel: '대기 2건' }],
          },
          integrationStatus: {
            status: 'ready',
            data: [{ integrationLabel: 'Outlook 파일링', statusLabel: '완료 1건' }],
          },
        }}
        notificationState={{
          status: 'ready',
          data: [
            {
              itemKey: 'permission-policy-0',
              source: 'permission_policy',
              category: '권한/정책',
              title: '요청이 차단됨',
              description: '문서 다운로드 · 차단',
              tone: 'warning',
            },
            {
              itemKey: 'recent-activity-0',
              source: 'recent_activity',
              category: '최근 활동',
              title: '문서 업로드 완료',
              description: 'AMIC-2026-0001 · 성공',
              tone: 'success',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('요청이 차단됨');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('문서 업로드 완료');
    expect(html).toContain('알림 센터');
    expect(html).toContain('2건 표시 · 전체 2건');
    expect(html).toContain('/audit');
    expect(html).toContain('열기');
    expect(html).not.toContain('표시할 알림이 없습니다.');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
  });
});
