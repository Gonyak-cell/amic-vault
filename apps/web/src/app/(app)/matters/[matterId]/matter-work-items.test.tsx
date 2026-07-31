import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DmsWorkQueueResponseDto } from '@amic-vault/shared';
import { ApiClientError } from '@/lib/api-client';
import {
  MatterResourceNotice,
  MatterWorkItemsView,
  matterLoadStatusForError,
  matterWorkQueueQuery,
} from './matter-work-items';

describe('Matter work items', () => {
  it('requests only the selected Matter work queue', () => {
    expect(matterWorkQueueQuery('11111111-1111-4111-8111-111111111111')).toEqual({
      matterId: '11111111-1111-4111-8111-111111111111',
      assignee: 'all',
      limit: 100,
      offset: 0,
    });
  });

  it('maps permission, Ethical Wall, and connectivity failures through the shared helper', () => {
    expect(matterLoadStatusForError(new ApiClientError(403, { code: 'PERMISSION_DENIED' }))).toBe(
      'permission',
    );
    expect(
      matterLoadStatusForError(new ApiClientError(403, { code: 'ETHICAL_WALL_BLOCKED' })),
    ).toBe('policy');
    expect(matterLoadStatusForError(new TypeError('fetch failed'))).toBe('unavailable');
  });

  it('renders actual server work items without deriving client-side placeholders', () => {
    const html = renderToStaticMarkup(
      <MatterWorkItemsView state={{ status: 'ready', response: workResponse() }} />,
    );

    expect(html).toContain('답변서 제출');
    expect(html).toContain('7월 31일까지 법원에 제출');
    expect(html).toContain('href="/matters/11111111-1111-4111-8111-111111111111/litigation"');
    expect(html).not.toContain('이 Matter에 처리할 업무가 없습니다.');
  });

  it('keeps empty, permission, policy, and connectivity states distinct', () => {
    const empty = renderToStaticMarkup(
      <MatterWorkItemsView
        state={{
          status: 'ready',
          response: {
            ...workResponse(),
            items: [],
            page: {
              limit: 100,
              offset: 0,
              total: 0,
              hasNext: false,
            },
          },
        }}
      />,
    );
    const permission = renderToStaticMarkup(
      <MatterWorkItemsView state={{ status: 'permission' }} />,
    );
    const policy = renderToStaticMarkup(<MatterWorkItemsView state={{ status: 'policy' }} />);
    const connectivity = renderToStaticMarkup(
      <MatterWorkItemsView state={{ status: 'unavailable' }} />,
    );

    expect(empty).toContain('이 Matter에 처리할 업무가 없습니다.');
    expect(permission).toContain('이 Matter의 업무를 볼 권한이 없습니다.');
    expect(permission).not.toContain('서버 연결');
    expect(policy).toContain('정보 차단 정책으로 업무를 표시할 수 없습니다.');
    expect(connectivity).toContain('업무 연결에 실패했습니다.');
    expect(connectivity).toContain('서버 연결을 확인한 뒤 다시 시도해 주세요.');
  });

  it('uses section-specific states so timeline failures do not describe the Matter as failed', () => {
    const matter = renderToStaticMarkup(
      <MatterResourceNotice resource="matter" status="permission" />,
    );
    const timeline = renderToStaticMarkup(
      <MatterResourceNotice resource="timeline" status="unavailable" />,
    );

    expect(matter).toContain('Matter를 볼 권한이 없습니다.');
    expect(timeline).toContain('이메일 기록 연결에 실패했습니다.');
    expect(timeline).not.toContain('Matter 연결에 실패했습니다.');
  });
});

function workResponse(): DmsWorkQueueResponseDto {
  return {
    generatedAt: '2026-07-31T02:00:00.000Z',
    source: 'persisted_work_items',
    items: [
      {
        itemKey: 'litigation-deadline-111111111111',
        targetId: '22222222-2222-4222-8222-222222222222',
        source: 'operational_data',
        kind: 'litigation_deadline',
        sourceLabel: '송무 기한',
        title: '답변서 제출',
        description: '7월 31일까지 법원에 제출',
        href: '/matters/11111111-1111-4111-8111-111111111111/litigation',
        tone: 'warning',
        status: 'open',
        statusLabel: '진행 전',
        dueAt: '2026-07-31T09:00:00.000+09:00',
        updatedAt: '2026-07-30T09:00:00.000+09:00',
      },
    ],
    page: {
      limit: 100,
      offset: 0,
      total: 1,
      hasNext: false,
    },
  };
}
