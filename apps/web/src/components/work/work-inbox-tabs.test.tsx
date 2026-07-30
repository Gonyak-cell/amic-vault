import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveWorkInboxView, WorkInboxTabs } from './work-inbox-tabs';

describe('WorkInboxTabs', () => {
  it('renders native keyboard-focusable view links and marks only the active view', () => {
    const html = renderToStaticMarkup(<WorkInboxTabs activeView="notifications" />);

    expect(html).toContain('aria-label="업무 보기"');
    expect(html).toContain('href="/work?view=mine"');
    expect(html).toContain('href="/work?view=notifications"');
    expect(html).toContain('focus-visible:ring-2');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="page"');
  });

  it('allowlists the notification view and defaults malformed values to mine', () => {
    expect(resolveWorkInboxView(undefined)).toBe('mine');
    expect(resolveWorkInboxView('mine')).toBe('mine');
    expect(resolveWorkInboxView('notifications')).toBe('notifications');
    expect(resolveWorkInboxView('unknown')).toBe('mine');
    expect(resolveWorkInboxView(['notifications', 'mine'])).toBe('mine');
  });
});
