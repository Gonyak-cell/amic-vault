import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { workQueueUrlStateFromParams } from '@/lib/api/work-ops';
import { resolveWorkInboxView, WorkInboxTabs } from './work-inbox-tabs';

describe('WorkInboxTabs', () => {
  it('renders native keyboard-focusable view links and marks only the active view', () => {
    const html = renderToStaticMarkup(<WorkInboxTabs activeView="notifications" />);

    expect(html).toContain('aria-label="업무 보기"');
    expect(html).toContain('href="/work?view=mine&amp;assignee=mine&amp;limit=20"');
    expect(html).toContain('href="/work?view=notifications&amp;assignee=mine&amp;limit=20"');
    expect(html).toContain('focus-visible:ring-2');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="page"');
  });

  it('preserves the canonical Work query in both rendered view links', () => {
    const urlState = workQueueUrlStateFromParams({
      view: 'notifications',
      assignee: 'unassigned',
      kind: 'dd_rfi_due',
      limit: '50',
      offset: '100',
    });
    const html = renderToStaticMarkup(
      <WorkInboxTabs activeView="notifications" urlState={urlState} />,
    );

    expect(html).toContain(
      'href="/work?view=mine&amp;assignee=unassigned&amp;limit=50&amp;kind=dd_rfi_due&amp;offset=100"',
    );
    expect(html).toContain(
      'href="/work?view=notifications&amp;assignee=unassigned&amp;limit=50&amp;kind=dd_rfi_due&amp;offset=100"',
    );
  });

  it('allowlists the notification view and defaults malformed values to mine', () => {
    expect(resolveWorkInboxView(undefined)).toBe('mine');
    expect(resolveWorkInboxView('mine')).toBe('mine');
    expect(resolveWorkInboxView('notifications')).toBe('notifications');
    expect(resolveWorkInboxView('unknown')).toBe('mine');
    expect(resolveWorkInboxView(['notifications', 'mine'])).toBe('mine');
  });
});
