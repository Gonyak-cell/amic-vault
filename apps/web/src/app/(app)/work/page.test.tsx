import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import WorkQueuePage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

describe('WorkQueuePage', () => {
  it('defaults to the mine view and restores the allowlisted notification view', () => {
    const mineHtml = renderToStaticMarkup(<WorkQueuePage />);
    const notificationsHtml = renderToStaticMarkup(
      <WorkQueuePage searchParams={{ view: 'notifications' }} />,
    );

    expect(mineHtml).toContain('작업함 조치 콘솔');
    expect(mineHtml).not.toContain('알림 조치 콘솔');
    expect(notificationsHtml).toContain('알림 조치 콘솔');
    expect(notificationsHtml).not.toContain('작업함 조치 콘솔');
  });

  it('fails malformed or repeated view values back to mine without redirecting', () => {
    const malformedHtml = renderToStaticMarkup(
      <WorkQueuePage
        searchParams={{
          view: ['notifications', 'mine'],
          assignee: ['all', 'mine'],
          kind: 'unknown',
          limit: '0',
          offset: '-1',
        }}
      />,
    );

    expect(malformedHtml).toContain('작업함 조치 콘솔');
    expect(malformedHtml).not.toContain('알림 조치 콘솔');
    expect(malformedHtml).toContain('href="/work?view=mine&amp;assignee=mine&amp;limit=20"');
    expect(malformedHtml).toContain(
      'href="/work?view=notifications&amp;assignee=mine&amp;limit=20"',
    );
    expect(malformedHtml).not.toContain('kind=unknown');
  });

  it('restores the allowlisted Work query state from the URL', () => {
    const html = renderToStaticMarkup(
      <WorkQueuePage
        searchParams={{
          view: 'mine',
          assignee: 'unassigned',
          kind: 'dd_rfi_due',
          limit: '20',
          offset: '40',
        }}
      />,
    );

    expect(html).toContain('value="unassigned" selected="">미배정</option>');
    expect(html).toContain('value="dd_rfi_due" selected="">DD RFI</option>');
    expect(html).toContain('초기화');
    expect(html).toContain(
      'href="/work?view=mine&amp;assignee=unassigned&amp;limit=20&amp;kind=dd_rfi_due&amp;offset=40"',
    );
    expect(html).toContain(
      'href="/work?view=notifications&amp;assignee=unassigned&amp;limit=20&amp;kind=dd_rfi_due&amp;offset=40"',
    );
  });
});
