import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import { MatterDetailTabs } from '@/components/matter/matter-detail-tabs';
import {
  MatterIssuesKeyDatesPanel,
  isDueWithinDays,
} from '@/components/matter/matter-issues-key-dates-panel';
import {
  MatterContextSummary,
  matterStatusLabel,
  matterTypeLabel,
  resolveMatterEmailTimeline,
  riskLabel,
} from './matter-detail-state';
import { MatterResourceNotice } from './matter-work-items';
import MatterDetailPage from './page';

describe('MatterDetailPage', () => {
  it('remounts stateful Matter content when the route identity changes', () => {
    const first = MatterDetailPage({ params: { matterId: 'matter-a' } });
    const second = MatterDetailPage({ params: { matterId: 'matter-b' } });

    expect(first.key).toBe('matter-a');
    expect(second.key).toBe('matter-b');
    expect(first.key).not.toBe(second.key);
  });

  it('guides newly created matters to the Conflicts panel', () => {
    const html = renderToStaticMarkup(
      <MatterDetailPage
        params={{ matterId: '11111111-1111-4111-8111-111111111111' }}
        searchParams={{ created: '1' }}
      />,
    );

    expect(html).toContain('Matter가 생성되었습니다.');
    expect(html).toContain('이해상충 검토를 실행하고 해소한 뒤 Matter를 열 수 있습니다.');
    expect(html).toContain('href="#matter-conflicts"');
  });

  it('keeps the Matter body and five tabs when the email timeline request rejects', async () => {
    const timeline = await resolveMatterEmailTimeline(
      '11111111-1111-4111-8111-111111111111',
      async () => {
        throw new TypeError('fetch failed');
      },
    );

    expect(timeline).toEqual({ status: 'unavailable', emails: [], threads: [] });
    if (timeline.status === 'ready') throw new Error('expected a rejected timeline result');

    const html = renderToStaticMarkup(
      <MatterDetailTabs
        initialTab="documents"
        panels={{
          overview: <p>계약 검토 Matter 본문</p>,
          documents: (
            <>
              <p>계약 검토 문서 본문</p>
              <MatterResourceNotice resource="timeline" status={timeline.status} />
            </>
          ),
          work: <p>업무 본문</p>,
          team: <p>팀 본문</p>,
          activity: <p>활동 본문</p>,
        }}
      />,
    );

    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html).toContain('id="documents-tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('계약 검토 문서 본문');
    expect(html).toContain('이메일 기록 연결에 실패했습니다.');
    expect(html).not.toContain('Matter를 표시하지 못했습니다.');
  });

  it('maps dashboard risk and related Matter status without raw enum values', () => {
    expect(matterTypeLabel('litigation')).toBe('송무');
    expect(riskLabel('critical')).toBe('최고 위험 · 매우 높음');
    expect(riskLabel('high')).toBe('최고 위험 · 높음');
    expect(matterStatusLabel('active')).toBe('진행 중');
    expect(matterStatusLabel('disposal_review')).toBe('폐기 검토');
    expect(matterStatusLabel('unknown')).toBe('상태 미확인');
  });

  it('renders normal, Wall, and legal-hold context as separate Matter states', () => {
    const normal = renderToStaticMarkup(<MatterContextSummary matter={matterFixture()} />);
    const wall = renderToStaticMarkup(
      <MatterContextSummary matter={matterFixture({ ethicalWallActive: true })} />,
    );
    const hold = renderToStaticMarkup(
      <MatterContextSummary matter={matterFixture({ legalHold: true })} />,
    );

    expect(normal).toMatch(/보안 등급[\s\S]*표준/);
    expect(normal).toMatch(/보존 제한[\s\S]*없음/);
    expect(normal).not.toContain('Wall 활성');
    expect(wall).toContain('표준 · Wall 활성');
    expect(wall).toMatch(/보존 제한[\s\S]*없음/);
    expect(hold).toMatch(/보존 제한[\s\S]*적용됨/);
    expect(hold).not.toContain('Wall 활성');
  });

  it('renders matter issues and near-term key dates with visible status cues', () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 3);
    const soonDate = soon.toISOString().slice(0, 10);

    const html = renderToStaticMarkup(
      <MatterIssuesKeyDatesPanel
        matterId="11111111-1111-4111-8111-111111111111"
        initialIssues={[
          {
            issueId: '11111111-1111-4111-8111-111111111222',
            matterId: '11111111-1111-4111-8111-111111111111',
            title: '핵심 책임 쟁점',
            summary: null,
            status: 'monitoring',
            riskLevel: 'critical',
            createdAt: '2026-07-03T00:00:00.000Z',
            updatedAt: '2026-07-03T00:00:00.000Z',
          },
        ]}
        initialKeyDates={[
          {
            keyDateId: '11111111-1111-4111-8111-111111111333',
            coreKeyDateId: '11111111-1111-4111-8111-111111111333',
            matterId: '11111111-1111-4111-8111-111111111111',
            title: '답변서 제출',
            dueDate: soonDate,
            dateType: 'court',
            status: 'pending',
            assignedToUserId: null,
            sourceType: 'core',
            sourceId: '11111111-1111-4111-8111-111111111333',
            mutable: true,
            createdAt: '2026-07-03T00:00:00.000Z',
            updatedAt: '2026-07-03T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(isDueWithinDays(soonDate, 7)).toBe(true);
    expect(html).toContain('긴급');
    expect(html).toContain('핵심 책임 쟁점');
    expect(html).toContain('임박');
    expect(html).toContain('답변서 제출');
    expect(html).toContain('날짜순');
  });
});

function matterFixture(overrides: Partial<MatterDto> = {}): MatterDto {
  return {
    clientId: '11111111-1111-4111-8111-111111111111',
    clientDisplayName: '한빛전자',
    confidentialityLevel: 'standard',
    conflictsStatus: 'cleared',
    createdAt: '2026-06-18T00:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111112',
    displayName: '계약 검토',
    ethicalWallActive: false,
    legalHold: false,
    leadAssociateId: null,
    leadAssociateDisplayName: null,
    leadLawyerDisplayName: '담당 변호사',
    leadPartnerDisplayName: null,
    matterCode: 'AMIC-2026-0007',
    matterId: '11111111-1111-4111-8111-111111111122',
    matterName: '계약 검토',
    matterType: 'advisory',
    metadata: {},
    openedAt: '2026-06-01T00:00:00.000Z',
    closedAt: null,
    practiceGroup: 'AMIC_LAW_GROUP',
    safeLabel: '계약 검토',
    status: 'open',
    tenantId: '11111111-1111-4111-8111-111111111100',
    updatedAt: '2026-06-18T01:00:00.000Z',
    leadLawyerId: null,
    leadPartnerId: null,
    ...overrides,
  };
}
