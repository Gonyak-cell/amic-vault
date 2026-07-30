import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DmsWorkQueueItemDto } from '@amic-vault/shared';
import {
  findWorkReassignmentCandidate,
  requestWorkReassignmentCandidates,
  reassignSelectedWorkItem,
  WorkReassignmentCandidateFeedback,
  WorkReassignmentSelect,
  workDueDateToIso,
  WorkQueueClient,
  WorkQueueContent,
} from './work-queue-client';
import { workQueueUrlStateFromParams } from '@/lib/api/work-ops';

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigationMock.push }),
}));

const workItems: DmsWorkQueueItemDto[] = [
  {
    itemKey: 'document-work-aabbccddeeff',
    source: 'operational_data',
    kind: 'document_extraction_failed',
    sourceLabel: '문서 운영',
    title: '추출 실패 확인',
    description: 'AMIC-2026-0002 · 계약 증거 파일 · 추출 실패',
    href: '/files?extractionStatus=failed',
    tone: 'blocked',
    status: 'open',
    statusLabel: '대기',
    canReassign: true,
    canUpdateDueAt: true,
    dueAt: '2026-06-22T00:00:00.000Z',
  },
  {
    itemKey: 'workflow-work-ccddee001122',
    targetId: '11111111-1111-4111-8111-111111111444',
    source: 'operational_data',
    kind: 'knowledge_candidate_review',
    sourceLabel: '워크플로',
    title: '지식은행 후보 검토',
    description: 'AMIC-2026-0005 · 종결 의견서 · 대기',
    href: '/work?kind=knowledge_candidate_review',
    tone: 'warning',
    status: 'open',
    statusLabel: '대기',
    assignedToLabel: 'Alpha Reviewer',
    canReassign: true,
    canUpdateDueAt: true,
    dueAt: '2026-06-24T00:00:00.000Z',
  },
  {
    itemKey: 'ai-prep-work-bbccddeeff00',
    targetId: '11111111-1111-4111-8111-111111111333',
    source: 'ai_prep',
    kind: 'graph_fact_review',
    sourceLabel: '파일 정리 준비',
    title: 'AI Fact 후보 확인',
    description: 'AMIC-2026-0004 · 후보 계약서 · 매수인은 잔금을 지급했다.',
    href: '/work?kind=graph_fact_review',
    tone: 'warning',
    status: 'open',
    statusLabel: '대기',
    assignedToLabel: 'Alpha Reviewer',
    canReassign: false,
    canUpdateDueAt: true,
    dueAt: '2026-06-25T00:00:00.000Z',
  },
];

describe('WorkQueueClient', () => {
  beforeEach(() => {
    navigationMock.push.mockReset();
  });

  it('renders only the persisted Work API state before loading', () => {
    const html = renderToStaticMarkup(
      <WorkQueueClient
        urlState={workQueueUrlStateFromParams({
          view: 'mine',
          assignee: 'mine',
          limit: '20',
        })}
      />,
    );

    expect(html).toContain('작업함 조치 콘솔');
    expect(html).toContain('전체 종류');
    expect(html).toContain('value="mine" selected="">내 업무</option>');
    expect(html).toContain('업무 상태 연결 대기 중입니다.');
    expect(html).not.toContain('전체 구분');
    expect(html).not.toContain('전체 상태');
    expect(html).not.toContain('마감 임박순');
    expect(html).not.toContain('href="/audit"');
    expect(html).not.toContain('href="/integrations');
    expect(html).not.toContain('aiAllowed=true');
    expect(html).not.toContain('새 담당자');
  });

  it('renders every itemKey exactly once with capability-scoped reassignment inline', () => {
    const html = renderToStaticMarkup(
      <WorkQueueContent
        workItemsState={{ status: 'ready', data: workItems }}
        workPage={{ limit: 20, offset: 0, total: 26, hasNext: true }}
      />,
    );

    for (const item of workItems) {
      expect(html.match(new RegExp(`data-work-item-key="${item.itemKey}"`, 'gu'))).toHaveLength(1);
    }
    expect(html).toContain('지식은행 후보 검토');
    expect(html).toContain('승인');
    expect(html).toContain('반려');
    expect(html).toContain('AI 사실관계 후보 확인');
    expect(html).toContain('확인');
    expect(html).toContain('거절');
    expect(html).toContain('type="date"');
    expect(html).toContain('기한 저장');
    expect(html).toContain('담당자 변경');
    expect(html).not.toContain('새 담당자');
    expect(html).not.toContain('담당자 재배정');
  });

  it('uses server capabilities instead of an admin role or directory picker', () => {
    const html = renderToStaticMarkup(
      <WorkQueueContent
        workItemsState={{
          status: 'ready',
          data: workItems.map((item) => ({ ...item, canReassign: false })),
        }}
      />,
    );

    expect(html).not.toContain('새 담당자');
    expect(html).not.toContain('조직 디렉터리');
    expect(html).not.toContain('담당자 변경');
  });

  it('does not call the candidate endpoint for a non-capable Work item', () => {
    const load = vi.fn();

    expect(
      requestWorkReassignmentCandidates({ ...workItems[0]!, canReassign: false }, true, load),
    ).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('requests candidates only after an actionable capable panel opens', async () => {
    const load = vi.fn(async () => ({ items: [] }));

    await requestWorkReassignmentCandidates(workItems[0]!, true, load);

    expect(load).toHaveBeenCalledWith(workItems[0]!.itemKey, { limit: 25 });
  });

  it('selects duplicate labels by opaque user id and sends that id to the mutation', async () => {
    const candidates = [
      { userId: '11111111-1111-4111-8111-111111111201', label: '김민서 · 긴 한국어 담당자 이름' },
      { userId: '11111111-1111-4111-8111-111111111202', label: '김민서 · 긴 한국어 담당자 이름' },
    ];
    const onReassign = vi.fn(async () => undefined);

    const selected = findWorkReassignmentCandidate(candidates, candidates[1]!.userId);
    await reassignSelectedWorkItem(workItems[0]!.itemKey, selected, onReassign);

    expect(selected).toEqual(candidates[1]);
    expect(onReassign).toHaveBeenCalledWith(workItems[0]!.itemKey, candidates[1]!.userId);
  });

  it('uses a native labelled selector and keeps duplicate display labels selectable', () => {
    const candidates = [
      { userId: '11111111-1111-4111-8111-111111111201', label: '김민서 · 긴 한국어 담당자 이름' },
      { userId: '11111111-1111-4111-8111-111111111202', label: '김민서 · 긴 한국어 담당자 이름' },
    ];
    const html = renderToStaticMarkup(
      <div>
        <label htmlFor="candidate-select">새 담당자</label>
        <WorkReassignmentSelect
          candidates={candidates}
          id="candidate-select"
          onChange={() => undefined}
          value={candidates[1]!.userId}
        />
      </div>,
    );

    expect(html).toContain('for="candidate-select"');
    expect(html).toContain('id="candidate-select"');
    expect(html.match(/김민서 · 긴 한국어 담당자 이름/gu)).toHaveLength(2);
    expect(html).toContain(`value="${candidates[1]!.userId}" selected=""`);
  });

  it('keeps candidate loading, empty, and API error feedback distinct from mutation errors', () => {
    const loading = renderToStaticMarkup(<WorkReassignmentCandidateFeedback status="loading" />);
    const empty = renderToStaticMarkup(<WorkReassignmentCandidateFeedback status="empty" />);
    const error = renderToStaticMarkup(<WorkReassignmentCandidateFeedback status="error" />);

    expect(loading).toContain('담당자 후보를 불러오는 중입니다.');
    expect(empty).toContain('현재 작업에서 선택 가능한 담당자가 없습니다.');
    expect(error).toContain('담당자 후보를 불러오지 못했습니다.');
    expect(error).not.toContain('작업 변경을 완료하지 못했습니다.');
  });

  it('does not render a due-date control when the server denies the mutation', () => {
    const html = renderToStaticMarkup(
      <WorkQueueContent
        workItemsState={{
          status: 'ready',
          data: [{ ...workItems[0]!, canUpdateDueAt: false }],
        }}
      />,
    );

    expect(html).not.toContain('type="date"');
    expect(html).not.toContain('기한 저장');
  });

  it('keeps mutation failures and partial pages distinct from empty state', () => {
    const html = renderToStaticMarkup(
      <WorkQueueContent
        mutationError="작업 변경을 완료하지 못했습니다."
        urlState={workQueueUrlStateFromParams({
          view: 'mine',
          assignee: 'unassigned',
          kind: 'document_extraction_failed',
          limit: '20',
          offset: '20',
        })}
        workItemsState={{ status: 'ready', data: [workItems[0]!] }}
        workPage={{ limit: 20, offset: 20, total: 26, hasNext: false }}
      />,
    );

    expect(html).toContain('작업 변경을 완료하지 못했습니다.');
    expect(html).toContain('추출 실패 확인');
    expect(html).toContain('현재 페이지 1건 · 전체 26건');
    expect(html).toContain('21-26 / 26');
    expect(html).toContain('이전');
    expect(html).not.toContain('표시할 작업이 없습니다.');
  });

  it('converts the native due date to one explicit ISO timestamp', () => {
    expect(workDueDateToIso('2026-08-01')).toBe('2026-08-01T00:00:00.000Z');
    expect(workDueDateToIso('2026-02-30')).toBeNull();
    expect(workDueDateToIso('08/01/2026')).toBeNull();
    expect(workDueDateToIso('')).toBeNull();
  });

  it('preserves the server response order instead of applying a browser-only sort', () => {
    const html = renderToStaticMarkup(
      <WorkQueueContent
        workItemsState={{
          status: 'ready',
          data: [
            {
              ...workItems[0]!,
              itemKey: 'later',
              title: '서버 첫 번째 업무',
              dueAt: '2026-07-03T00:00:00.000Z',
            },
            {
              ...workItems[0]!,
              itemKey: 'sooner',
              title: '서버 두 번째 업무',
              dueAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        }}
      />,
    );

    expect(html.indexOf('서버 첫 번째 업무')).toBeLessThan(html.indexOf('서버 두 번째 업무'));
  });
});
