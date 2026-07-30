import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MatterIssuesKeyDatesPanel,
  isDueWithinDays,
} from '@/components/matter/matter-issues-key-dates-panel';
import MatterDetailPage from './page';

describe('MatterDetailPage', () => {
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

  it('wires the Email Vault upload card into the Matter email timeline', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toMatch(/<EmailUploadCard/);
    expect(source).toContain('title="이메일 업로드"');
    expect(source).toContain('EML·MSG 원문 보관');
    expect(source).toMatch(/onFiled=\{refreshEmails\}/);
    expect(source).toMatch(/listMatterEmailTimeline\(params\.matterId\)/);
    expect(source).toContain('setEmailThreads([...(timeline.threads ?? [])])');
    expect(source).toMatch(/fileEmailThreadToMatter\(threadId/);
    expect(source).toContain('onFileThread={(threadId) => void fileEmailThread(threadId)}');
  });

  it('wires related Matter controls and security fields into the detail surface', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('title="관련 Matter"');
    expect(source).toContain('보안 등급');
    expect(source).toContain('리드 파트너');
    expect(source).toContain('리드 어소');
    expect(source).toMatch(/listMatterRelatedMatters\(params\.matterId\)/);
    expect(source).toMatch(/addMatterRelatedMatter\(params\.matterId/);
    expect(source).toContain('const result = await removeMatterRelatedMatter');
    expect(source).toContain('권한 제한 Matter');
  });

  it('wires the Matter dashboard aggregate into the first-screen workspace panel', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toMatch(/getMatterDashboard\(params\.matterId\)/);
    expect(source).toContain('<MatterDashboardPanel');
    expect(source).toContain('id="matter-dashboard"');
    expect(source).toContain('최근 활동');
    expect(source).toContain('핵심 문서');
    expect(source).toContain('외부 활동');
    expect(source).toContain('AI 세션');
    expect(source).toContain('href: `/audit?matterId=${encodeURIComponent(matterId)}`');
    expect(source).toContain('id="matter-ai"');
  });

  it('wires the Matter knowledge tab into the detail surface without opening sealed routes', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('MatterKnowledgeTab');
    expect(source).toContain('latestSessionId={dashboard?.aiSessions[0]?.sessionId ?? null}');
  });

  it('wires the Closing checklist panel into the Matter detail surface', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('MatterClosingChecklistPanel');
    expect(source).toContain('id="matter-closing"');
    expect(source).toContain('onMatterUpdated={setMatter}');
  });

  it('owns the five primary Matter tabs while preserving secondary workstreams', () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'),
      'utf8',
    );

    expect(source).toContain('<MatterDetailTabs');
    expect(source).toContain('initialTab={searchParams?.tab ?? null}');
    expect(source).toMatch(/overview:\s*\(/);
    expect(source).toMatch(/documents:\s*\(/);
    expect(source).toMatch(/work:\s*\(/);
    expect(source).toMatch(/team:\s*<MatterTeamTab/);
    expect(source).toMatch(/activity:\s*<MatterAuditTimeline/);
    expect(source).toContain('<MatterWorkstreamTabs matterId={matter.matterId} />');
    expect(source).toContain('href={`/matters/${encodeURIComponent(matterId)}/team`}');
    expect(source).not.toContain('권한으로 보호됨');
    expect(source).not.toContain('href="/walls"');
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
