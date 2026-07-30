import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MatterDetailTabs,
  matterDetailTabPanelId,
  parseMatterDetailTab,
} from './matter-detail-tabs';

describe('MatterDetailTabs', () => {
  it('keeps the five primary tabs keyboard and screen-reader addressable', () => {
    const html = renderToStaticMarkup(
      <MatterDetailTabs
        panels={{
          overview: <p>overview panel</p>,
          documents: <p>documents panel</p>,
          work: <p>work panel</p>,
          team: <p>team panel</p>,
          activity: <p>activity panel</p>,
        }}
      />,
    );

    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html).toContain('aria-label="Matter 기본 탭"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="matter-overview"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="overview-tab"');
    for (const label of ['개요', '문서', '업무', '팀', '활동']) {
      expect(html).toContain(label);
    }
  });

  it('maps query and existing hash links without changing specialized route ownership', () => {
    expect(parseMatterDetailTab({ query: '?tab=documents' })).toBe('documents');
    expect(parseMatterDetailTab({ hash: '#matter-activity' })).toBe('activity');
    expect(parseMatterDetailTab({ hash: '#matter-knowledge' })).toBe('overview');
    expect(parseMatterDetailTab({ hash: '#matter-files', query: '?tab=overview' })).toBe(
      'documents',
    );
    expect(parseMatterDetailTab({ query: '?tab=unknown' })).toBe('overview');
  });

  it('keeps stable panel anchors for dashboard and old bookmarks', () => {
    expect(matterDetailTabPanelId('documents')).toBe('matter-files');
    expect(matterDetailTabPanelId('activity')).toBe('matter-activity');
    expect(matterDetailTabPanelId('work')).toBe('matter-work');
  });
});
