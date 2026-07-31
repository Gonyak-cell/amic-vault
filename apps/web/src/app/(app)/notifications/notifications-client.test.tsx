import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  notificationMutationErrorMessage,
  NotificationsClient,
  NotificationsContent,
} from './notifications-client';
import NotificationsPage from './page';
import { workQueueUrlStateFromParams } from '@/lib/api/work-ops';

describe('NotificationsClient', () => {
  it('renders an unavailable real-data-only notification center before API success', () => {
    const html = renderToStaticMarkup(<NotificationsClient />);

    expect(html).toContain('알림');
    expect(html).toContain('알림 조치 콘솔');
    expect(html).toContain('전체 구분');
    expect(html).toContain('전체 상태');
    expect(html).toContain('주의 알림 우선');
    expect(html).toContain('aria-label="업무 보기"');
    expect(html).toContain('href="/work?view=mine&amp;assignee=mine&amp;limit=20"');
    expect(html).toContain('href="/work?view=notifications&amp;assignee=mine&amp;limit=20"');
    expect(html).toContain('알림 연결 대기 중입니다.');
    expect(html).not.toContain('권한/정책');
    expect(html).not.toContain('파일 정리 준비');
    expect(html).not.toContain('연동 상태');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
    expect(html).not.toContain('18:42');
  });

  it('preserves the sanitized Work query in both notification view links', () => {
    const html = renderToStaticMarkup(
      <NotificationsContent
        notificationState={{ status: 'empty' }}
        urlState={workQueueUrlStateFromParams({
          view: 'notifications',
          assignee: 'unassigned',
          kind: 'dd_rfi_due',
          limit: '50',
          offset: '100',
        })}
      />,
    );

    expect(html).toContain(
      'href="/work?view=mine&amp;assignee=unassigned&amp;limit=50&amp;kind=dd_rfi_due&amp;offset=100"',
    );
    expect(html).toContain(
      'href="/work?view=notifications&amp;assignee=unassigned&amp;limit=50&amp;kind=dd_rfi_due&amp;offset=100"',
    );
  });

  it('renders notifications from the dedicated notification API state', () => {
    const html = renderToStaticMarkup(
      <NotificationsContent
        notificationState={{
          status: 'ready',
          data: [
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
            },
            {
              itemKey: 'notification-bbccddeeff001122',
              source: 'operational_data',
              category: '문서 처리',
              title: '문서 처리 완료',
              description: 'AMIC-2026-0001 · 계약 검토본 · 추출 완료',
              tone: 'success',
              href: '/files?extractionStatus=ready',
              status: 'read',
              statusLabel: '읽음',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('삭제 승인 요청');
    expect(html).toContain('AMIC-2026-0001');
    expect(html).toContain('문서 처리 완료');
    expect(html).toContain('알림 센터');
    expect(html).toContain('2건 표시 · 전체 2건');
    expect(html).toContain('/records?tab=disposal');
    expect(html).toContain('/files?extractionStatus=ready');
    expect(html).toContain('열기');
    expect(html).toContain('새 알림');
    expect(html).toContain('읽음');
    expect(html).not.toContain('표시할 알림이 없습니다.');
    expect(html).not.toContain('파일 정리 준비');
    expect(html).not.toContain('Outlook 파일링');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
  });

  it('shows partial-list and mutation failure states independently', () => {
    const mutationError = notificationMutationErrorMessage('dismiss');
    const html = renderToStaticMarkup(
      <NotificationsContent
        mutationError={mutationError}
        notificationPartial
        notificationState={{
          status: 'ready',
          data: [
            {
              itemKey: 'notification-aabbccddeeff0011',
              source: 'records',
              category: '기록 보존',
              title: '삭제 승인 요청',
              description: 'AMIC-2026-0001 · 의뢰인 기록 보존 · 승인 대기',
              tone: 'warning',
              status: 'unread',
              statusLabel: '새 알림',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain(mutationError);
    expect(html).toContain('role="status"');
    expect(html).toContain('더 많은 알림이 있어 이 목록이 전체가 아닙니다.');
    expect(html).toContain('1건 표시 · 최근 1건 중 일부');
  });

  it('uses specific Korean retry copy for each notification mutation', () => {
    expect(notificationMutationErrorMessage('read')).toBe(
      '읽음 처리를 완료하지 못했습니다. 다시 시도해 주세요.',
    );
    expect(notificationMutationErrorMessage('dismiss')).toBe(
      '알림을 숨기지 못했습니다. 다시 시도해 주세요.',
    );
  });

  it('keeps the old notifications route on the same data UI without a home redirect', () => {
    const html = renderToStaticMarkup(<NotificationsPage />);

    expect(html).toContain('알림 조치 콘솔');
    expect(html).toContain('href="/work?view=notifications&amp;assignee=mine&amp;limit=20"');
    expect(html).not.toContain('href="/"');
  });

  it('keeps forbidden notification data fail-closed inside the compatible view', () => {
    const html = renderToStaticMarkup(
      <NotificationsContent
        notificationState={{ status: 'forbidden', error: '접근 권한을 확인할 수 없습니다.' }}
      />,
    );

    expect(html).toContain('알림 데이터에 접근할 권한이 없습니다.');
    expect(html).toContain('권한 정책 적용');
    expect(html).toContain('href="/work?view=notifications&amp;assignee=mine&amp;limit=20"');
    expect(html).not.toContain('href="/"');
  });

  it('keeps notification API loading, error, blocked, and empty states distinct', () => {
    const states = [
      {
        state: { status: 'unavailable' } as const,
        expected: '알림 연결 대기 중입니다.',
      },
      {
        state: { status: 'error', error: '연결 실패' } as const,
        expected: '알림 데이터를 표시할 수 없습니다.',
      },
      {
        state: { status: 'blocked', error: '정책 차단' } as const,
        expected: '정보 차단 정책에 따라 표시할 수 없습니다.',
      },
      {
        state: { status: 'empty' } as const,
        expected: '표시할 알림이 없습니다.',
        summary: '표시할 알림 없음',
      },
    ];

    for (const { expected, state, summary } of states) {
      const html = renderToStaticMarkup(<NotificationsContent notificationState={state} />);
      expect(html).toContain(expected);
      if (summary) expect(html).toContain(summary);
      expect(html).not.toContain('파일 정리 준비');
      expect(html).not.toContain('연동 상태');
    }
  });
});
