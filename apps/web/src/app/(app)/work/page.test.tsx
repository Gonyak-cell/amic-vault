import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorkQueuePage from './page';

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
      <WorkQueuePage searchParams={{ view: ['notifications', 'mine'] }} />,
    );

    expect(malformedHtml).toContain('작업함 조치 콘솔');
    expect(malformedHtml).not.toContain('알림 조치 콘솔');
  });
});
