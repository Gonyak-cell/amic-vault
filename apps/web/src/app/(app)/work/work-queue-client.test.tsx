import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkQueueClient, WorkQueueContent } from './work-queue-client';

describe('WorkQueueClient', () => {
  it('renders an unavailable real-data-only work queue before API success', () => {
    const html = renderToStaticMarkup(<WorkQueueClient />);

    expect(html).toContain('작업함');
    expect(html).toContain('권한과 운영 상태가 확인된 작업만 표시됩니다.');
    expect(html).toContain('작업함 조치 콘솔');
    expect(html).toContain('전체 출처');
    expect(html).toContain('전체 상태');
    expect(html).toContain('주의 항목 우선');
    expect(html).toContain('작업 API 연결 대기 중입니다.');
    expect(html).toContain('문서함 조치 필터');
    expect(html).toContain('추출, OCR, 파일 정리 항목은 권한 내 문서함 필터로 바로 열 수 있습니다.');
    expect(html).toContain('/files?extractionStatus=failed');
    expect(html).toContain('/files?extractionStatus=ocr_pending');
    expect(html).toContain('/files?status=draft');
    expect(html).toContain('/files?aiAllowed=true&amp;sortBy=matter_asc');
    expect(html).toContain('/records');
    expect(html).toContain('운영 데이터 연결 대기 중입니다.');
    expect(html).not.toContain('가짜 작업');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
    expect(html).not.toContain('18:42');
  });

  it('renders work items from the dedicated work API state', () => {
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
        workItemsState={{
          status: 'ready',
          data: [
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
              itemKey: 'ai-prep-0',
              source: 'ai_prep',
              sourceLabel: '파일 정리 준비',
              title: '파일 정리 준비 상태 확인',
              description: '1개 Matter의 파일 정리 준비 상태가 있습니다.',
              href: '/files?aiAllowed=true&sortBy=matter_asc',
              tone: 'neutral',
            },
            {
              itemKey: 'document-work-0',
              source: 'operational_data',
              sourceLabel: '문서 운영',
              title: '추출 실패 확인',
              description: 'AMIC-2026-0002 · 계약 증거 파일 · 추출 실패',
              href: '/files?extractionStatus=failed',
              tone: 'blocked',
              status: 'open',
              statusLabel: '대기',
              dueAt: '2026-06-22T00:00:00.000Z',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('권한/정책 알림 확인');
    expect(html).toContain('파일 정리 준비 상태 확인');
    expect(html).toContain('추출 실패 확인');
    expect(html).toContain('/files?extractionStatus=failed');
    expect(html).toContain('3건 표시 · 전체 3건');
    expect(html).toContain('권한/정책');
    expect(html).toContain('파일 정리 준비');
    expect(html).toContain('문서 운영');
    expect(html).toContain('1건');
    expect(html).not.toContain('표시할 작업이 없습니다.');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
  });
});
