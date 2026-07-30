import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkQueueClient, WorkQueueContent } from './work-queue-client';

describe('WorkQueueClient', () => {
  it('renders an unavailable real-data-only work queue before API success', () => {
    const html = renderToStaticMarkup(<WorkQueueClient />);

    expect(html).toContain('작업함');
    expect(html).toContain('작업함 조치 콘솔');
    expect(html).toContain('전체 종류');
    expect(html).toContain('전체 담당');
    expect(html).toContain('value="mine" selected="">내 업무</option>');
    expect(html).toContain('전체 구분');
    expect(html).toContain('전체 상태');
    expect(html).toContain('마감 임박순');
    expect(html).toContain('주의 항목 우선');
    expect(html).toContain('aria-label="업무 보기"');
    expect(html).toContain('href="/work?view=mine"');
    expect(html).toContain('href="/work?view=notifications"');
    expect(html).toContain('업무 상태 연결 대기 중입니다.');
    expect(html).toContain('문서함 조치 필터');
    expect(html).toContain(
      '추출, OCR, 파일 정리 항목은 권한 내 문서함 필터로 바로 열 수 있습니다.',
    );
    expect(html).toContain('/files?extractionStatus=failed');
    expect(html).toContain('/files?extractionStatus=ocr_pending');
    expect(html).toContain('/files?status=draft');
    expect(html).toContain('/files?aiAllowed=true&amp;sortBy=matter_asc');
    expect(html).toContain('/records');
    expect(html).toContain('데이터를 불러오는 중입니다.');
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
          usageStats: { status: 'unavailable' },
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
              kind: 'document_extraction_failed',
              sourceLabel: '문서 운영',
              title: '추출 실패 확인',
              description: 'AMIC-2026-0002 · 계약 증거 파일 · 추출 실패',
              href: '/files?extractionStatus=failed',
              tone: 'blocked',
              status: 'open',
              statusLabel: '대기',
              dueAt: '2026-06-22T00:00:00.000Z',
            },
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
              dueAt: '2026-06-24T00:00:00.000Z',
            },
            {
              itemKey: 'graph-fact-review-bbccddeeff00',
              targetId: '11111111-1111-4111-8111-111111111333',
              source: 'ai_prep',
              kind: 'graph_fact_review',
              sourceLabel: 'AI 준비',
              title: 'AI Fact 후보 확인',
              description: 'AMIC-2026-0004 · 후보 계약서 · 매수인은 잔금을 지급했다.',
              href: '/work?kind=graph_fact_review',
              tone: 'warning',
              status: 'open',
              statusLabel: '대기',
              assignedToLabel: 'Alpha Reviewer',
              dueAt: '2026-06-24T00:00:00.000Z',
            },
          ],
        }}
        workPage={{ limit: 20, offset: 0, total: 26, hasNext: true }}
      />,
    );

    expect(html).toContain('권한/정책 알림 확인');
    expect(html).toContain('파일 정리 준비 상태 확인');
    expect(html).toContain('추출 실패 확인');
    expect(html).toContain('계약 검토 단계 확인');
    expect(html).toContain('지식은행 후보 검토');
    expect(html).toContain('종결 의견서');
    expect(html).toContain('승인');
    expect(html).toContain('반려');
    expect(html).toContain('AI 사실관계 후보 확인');
    expect(html).toContain('매수인은 잔금을 지급했다.');
    expect(html).toContain('확인');
    expect(html).toContain('거절');
    expect(html).toContain('담당자 Alpha Reviewer');
    expect(html).toContain('/files?extractionStatus=failed');
    expect(html).toContain('6건 표시 · 전체 26건');
    expect(html).toContain('1-20 / 26');
    expect(html).toContain('담당자 재배정');
    expect(html).toContain('새 담당자');
    expect(html).not.toContain('새 담당자 ID');
    expect(html).toContain('재배정');
    expect(html).toContain('권한/정책');
    expect(html).toContain('파일 정리 준비');
    expect(html).toContain('문서 운영');
    expect(html).toContain('1건');
    expect(html).not.toContain('표시할 작업이 없습니다.');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('DOC-204');
  });

  it('orders the default queue by real dueAt values and leaves missing deadlines last', () => {
    const html = renderToStaticMarkup(
      <WorkQueueContent
        dashboardState={{
          recentFiles: { status: 'ready', data: [] },
          recentActivity: { status: 'ready', data: [] },
          permissionPolicyAlerts: { status: 'ready', data: [] },
          aiPrepStatus: { status: 'ready', data: [] },
          integrationStatus: { status: 'ready', data: [] },
          usageStats: { status: 'unavailable' },
        }}
        workItemsState={{
          status: 'ready',
          data: [
            {
              itemKey: 'later',
              source: 'operational_data',
              sourceLabel: '문서 운영',
              title: '나중 업무',
              description: '실제 기한이 늦은 업무',
              href: '/files',
              tone: 'warning',
              dueAt: '2026-07-03T00:00:00.000Z',
            },
            {
              itemKey: 'unknown',
              source: 'operational_data',
              sourceLabel: '문서 운영',
              title: '기한 미정 업무',
              description: '기한 값이 없는 업무',
              href: '/files',
              tone: 'neutral',
            },
            {
              itemKey: 'sooner',
              source: 'operational_data',
              sourceLabel: '문서 운영',
              title: '임박 업무',
              description: '실제 기한이 이른 업무',
              href: '/files',
              tone: 'success',
              dueAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        }}
      />,
    );

    expect(html.indexOf('임박 업무')).toBeLessThan(html.indexOf('나중 업무'));
    expect(html.indexOf('나중 업무')).toBeLessThan(html.indexOf('기한 미정 업무'));
  });
});
