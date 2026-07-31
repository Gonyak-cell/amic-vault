import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DmsWorkQueueItemDto, MatterDto } from '@amic-vault/shared';
import { describe, expect, it } from 'vitest';
import { createDashboardUnavailableState } from '@/lib/api/dashboard';
import { VaultActivityClient, VaultActivityContent } from './vault-activity-client';

describe('VaultActivityClient', () => {
  it('keeps two working quick actions and omits dead, admin, AI, integration, usage, and protection UI', () => {
    const html = renderToStaticMarkup(<VaultActivityClient />);
    const quickActionCount = (html.match(/data-dashboard-quick-action="true"/g) ?? []).length;

    expect(quickActionCount).toBe(2);
    expect(html).toContain('문서 업무 바로가기');
    expect(html).toContain('문서 검색');
    expect(html).toContain('내 업무');
    expect(html).toContain('href="/search"');
    expect(html).toContain('href="/work"');
    expect(html).toContain('href="/work?view=notifications"');
    expect(html).not.toContain('href="/notifications"');
    expect(html).toContain('업무 기한');
    expect(html).toContain('접근 가능한 Matter');
    expect(html).toContain('최근 문서');
    expect(html).toContain('최근 활동');
    expect(html).toContain('권한/정책 알림');
    expect(html).toContain('데이터를 불러오는 중입니다.');
    expect(html).toContain('업무 상태 연결 대기 중입니다.');
    expect(html).not.toContain('href="/audit"');

    expect(html).not.toContain('접근 가능한 항목만 표시됩니다');
    expect(html).not.toContain('보호됨');
    expect(html).not.toContain('사용 통계');
    expect(html).not.toContain('사용 통계 CSV 다운로드');
    expect(html).not.toContain('문서 정리 준비');
    expect(html).not.toContain('문서 업로드');
    expect(html).not.toContain('/files#matter-upload');
    expect(html).not.toContain('연동 상태');
    expect(html).not.toContain('운영 데이터 연결 상태');
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain('aiAllowed');
    expect(html).not.toContain('href="/integrations/outlook"');
    expect(html).not.toContain('href="/search/folders"');
  });

  it.each([
    { count: 0, state: { status: 'empty' as const } },
    { count: 1, state: { status: 'ready' as const, data: makeWorkItems(1) } },
    { count: 5, state: { status: 'ready' as const, data: makeWorkItems(5) } },
    { count: 6, state: { status: 'ready' as const, data: makeWorkItems(6) } },
  ])('renders a server-provided work queue with $count item(s)', ({ count, state }) => {
    const html = renderToStaticMarkup(
      <VaultActivityContent
        dashboardState={createDashboardUnavailableState()}
        recentMattersState={{ status: 'empty' }}
        workItemsState={state}
      />,
    );

    if (state.status !== 'ready') {
      expect(count).toBe(0);
      expect(html).toContain('표시할 작업이 없습니다.');
      return;
    }

    for (const item of state.data.slice(0, 5)) {
      expect(html.match(new RegExp(item.title, 'g')) ?? []).toHaveLength(1);
    }
    expect(html).toContain(`${Math.min(count, 5)}건`);
    if (count > 5) expect(html).not.toContain(state.data[5]?.title);
  });

  it('puts the work queue before quick actions and keeps long titles readable', () => {
    const longTitle = '긴 한국어 업무 제목 '.repeat(20).trim();
    const html = renderToStaticMarkup(
      <VaultActivityContent
        dashboardState={createDashboardUnavailableState()}
        recentMattersState={{ status: 'empty' }}
        workItemsState={{
          status: 'ready',
          data: [makeWorkItem('long-title', longTitle)],
        }}
      />,
    );

    expect(html.indexOf('내 업무')).toBeLessThan(html.indexOf('문서 업무 바로가기'));
    expect(html).toContain(longTitle);
    expect(html).toContain('1건');
  });

  it('keeps independent sections visible when the other request fails', () => {
    const readyHtml = renderToStaticMarkup(
      <VaultActivityContent
        dashboardState={{
          ...createDashboardUnavailableState(),
          recentFiles: { status: 'error', error: 'connection' },
        }}
        recentMattersState={{ status: 'empty' }}
        workItemsState={{ status: 'ready', data: [makeWorkItem('still-ready', '검토 대기 업무')] }}
      />,
    );

    expect(readyHtml).toContain('검토 대기 업무');
    expect(readyHtml).toContain('데이터를 표시할 수 없습니다.');

    const failedHtml = renderToStaticMarkup(
      <VaultActivityContent
        dashboardState={{
          ...createDashboardUnavailableState(),
          recentFiles: { status: 'ready', data: [{ title: '권한 내 문서' }] },
        }}
        recentMattersState={{ status: 'empty' }}
        workItemsState={{ status: 'error', error: 'connection' }}
      />,
    );

    expect(failedHtml).toContain('권한 내 문서');
    expect(failedHtml).toContain('업무 데이터를 표시할 수 없습니다.');
    expect(failedHtml).not.toContain('표시할 작업이 없습니다.');
  });

  it('renders permission-scoped daily work, due dates, recent Matters, and recent documents', () => {
    const dueItem: DmsWorkQueueItemDto = {
      itemKey: 'review-due',
      source: 'operational_data',
      sourceLabel: '운영 데이터',
      title: '검토 의견 제출',
      description: '담당 검토 의견의 제출 기한입니다.',
      href: '/work?focus=review-due',
      tone: 'warning',
      dueAt: '2026-07-31T09:00:00.000+09:00',
    };
    const undatedItem: DmsWorkQueueItemDto = {
      itemKey: 'metadata-check',
      source: 'operational_data',
      sourceLabel: '운영 데이터',
      title: '문서 정보 확인',
      description: '문서 정보를 확인해야 합니다.',
      href: '/work?focus=metadata-check',
      tone: 'neutral',
    };

    const html = renderToStaticMarkup(
      <VaultActivityContent
        dashboardState={{
          recentFiles: {
            status: 'ready',
            data: [{ title: 'Board minutes', matterLabel: 'M-001 · Governance' }],
          },
          recentActivity: {
            status: 'ready',
            data: [
              {
                actionLabel: 'Document viewed',
                targetLabel: 'M-001 · Governance',
                resultLabel: 'Success',
                occurredAt: '2026-06-17T00:00:00.000Z',
              },
            ],
          },
          permissionPolicyAlerts: {
            status: 'ready',
            data: [
              {
                title: '권한 정책 확인',
                description: '확인이 필요한 권한 정책 알림입니다.',
              },
            ],
          },
          aiPrepStatus: {
            status: 'ready',
            data: [{ matterLabel: 'M-001 · Governance', statusLabel: '정리 준비 완료 2건' }],
          },
          integrationStatus: {
            status: 'ready',
            data: [{ integrationLabel: 'Outlook', statusLabel: 'Outlook 완료 1건' }],
          },
          usageStats: {
            status: 'ready',
            data: {
              generatedAt: '2026-07-01T00:00:00.000Z',
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
              topMatters: [{ matterLabel: '사용 통계 Matter', activityCount: 10 }],
            },
          },
        }}
        recentMattersState={{ status: 'ready', data: [recentMatter] }}
        workItemsState={{ status: 'ready', data: [dueItem, undatedItem] }}
      />,
    );

    expect(html).toContain('Board minutes');
    expect(html).toContain('Document viewed');
    expect(html).toContain('M-001 · Governance · Success');
    expect(html).toContain('검토 의견 제출');
    expect(html).toContain('문서 정보 확인');
    expect(html).toContain('dateTime="2026-07-31T09:00:00.000+09:00"');
    expect(html).toContain('2026. 7. 31. AM 9:00');
    expect(html).toContain('한빛 신규 자문');
    expect(html).toContain('AMIC-2026-1001 · 한빛');
    expect(html).toContain('href="/matters/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/files"');
    expect(html).not.toContain('title=Board');
    expect(html).toContain('문서함 열기');
    expect(html).not.toContain('href="/audit"');
    expect(html).toContain('알림 열기');
    expect(html.match(/href="\/work\?view=notifications"/g) ?? []).toHaveLength(2);
    expect(html).not.toContain('href="/notifications"');
    expect(html.match(/검토 의견 제출/g) ?? []).toHaveLength(2);
    expect(html.match(/문서 정보 확인/g) ?? []).toHaveLength(1);

    expect(html).not.toContain('정리 준비 완료 2건');
    expect(html).not.toContain('Outlook 완료 1건');
    expect(html).not.toContain('사용 통계 Matter');
    expect(html).not.toContain('활성 사용자');
    expect(html).not.toContain('운영 데이터 연결 상태');
  });

  it('keeps loading, empty, error, forbidden, and blocked states distinct', () => {
    const html = renderToStaticMarkup(
      <VaultActivityContent
        dashboardState={{
          recentFiles: { status: 'loading' },
          recentActivity: { status: 'empty' },
          permissionPolicyAlerts: { status: 'error', error: 'connection' },
          aiPrepStatus: { status: 'unavailable' },
          integrationStatus: { status: 'unavailable' },
          usageStats: { status: 'unavailable' },
        }}
        recentMattersState={{ status: 'forbidden', error: 'permission' }}
        workItemsState={{ status: 'blocked', error: 'policy' }}
      />,
    );

    expect(html).toContain('데이터를 불러오는 중입니다.');
    expect(html).toContain('표시할 활동이 없습니다.');
    expect(html).toContain('데이터를 표시할 수 없습니다.');
    expect(html).toContain('이 항목을 볼 권한이 없습니다.');
    expect(html).toContain('정보 차단 정책에 따라 표시할 수 없습니다.');
  });
});

const recentMatter: MatterDto = {
  matterId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  clientId: '33333333-3333-4333-8333-333333333333',
  clientDisplayName: '한빛',
  confidentialityLevel: 'standard',
  matterCode: 'AMIC-2026-1001',
  matterName: '한빛 신규 자문',
  matterType: 'advisory',
  status: 'active',
  conflictsStatus: 'cleared',
  openedAt: '2026-07-01T00:00:00.000Z',
  closedAt: null,
  leadLawyerId: null,
  leadPartnerId: null,
  leadAssociateId: null,
  practiceGroup: null,
  metadata: {},
  legalHold: false,
  ethicalWallActive: false,
  createdBy: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
};

function makeWorkItem(itemKey: string, title: string): DmsWorkQueueItemDto {
  return {
    itemKey,
    source: 'operational_data',
    sourceLabel: '운영 데이터',
    title,
    description: '담당 확인이 필요한 업무입니다.',
    href: `/work?focus=${itemKey}`,
    tone: 'neutral',
  };
}

function makeWorkItems(count: number): DmsWorkQueueItemDto[] {
  return Array.from({ length: count }, (_, index) =>
    makeWorkItem(`work-${index + 1}`, `업무 ${index + 1}`),
  );
}
