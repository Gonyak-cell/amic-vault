import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkQueueClient, WorkQueueContent } from './work-queue-client';

describe('WorkQueueClient', () => {
  it('renders an unavailable real-data-only work queue before API success', () => {
    const html = renderToStaticMarkup(<WorkQueueClient />);

    expect(html).toContain('작업함');
    expect(html).toContain('권한과 운영 상태가 확인된 작업만 표시됩니다.');
    expect(html).toContain('표시할 작업이 없습니다.');
    expect(html).toContain('실제 운영 데이터에서 발생한 작업만 표시됩니다.');
    expect(html).toContain('문서함 조치 필터');
    expect(html).toContain('/files?extractionStatus=failed');
    expect(html).toContain('/files?extractionStatus=ocr_pending');
    expect(html).toContain('/files?aiAllowed=true&amp;sortBy=matter_asc');
    expect(html).toContain('운영 데이터 연결 대기 중입니다.');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
    expect(html).not.toContain('18:42');
  });

  it('renders work items only from supplied dashboard state', () => {
    const html = renderToStaticMarkup(
      <WorkQueueContent
        dashboardState={{
          recentFiles: { status: 'ready', data: [] },
          recentActivity: { status: 'ready', data: [] },
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
      />,
    );

    expect(html).toContain('권한/정책 알림 확인');
    expect(html).toContain('파일 정리 준비 상태 확인');
    expect(html).toContain('통합 상태 확인');
    expect(html).toContain('1건');
    expect(html).not.toContain('표시할 작업이 없습니다.');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
  });
});
