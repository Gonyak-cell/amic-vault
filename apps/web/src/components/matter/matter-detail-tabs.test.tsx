import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MatterDetailTabs,
  matterDetailTabForKeyboard,
  matterDetailTabFromUrl,
  matterDetailTabPanelId,
  matterDetailTabUrl,
  parseMatterDetailTab,
} from './matter-detail-tabs';

describe('MatterDetailTabs', () => {
  it('exposes the five primary tabs with screen-reader semantics', () => {
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
    expect(html).toContain('id="overview-tab"');
    expect(html).toContain('id="documents-tab"');
    expect(html).toContain('id="work-tab"');
    expect(html).toContain('id="team-tab"');
    expect(html).toContain('id="activity-tab"');
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

  it('builds five stable tab URLs that restore the same view on reload and history traversal', () => {
    const base =
      'https://vault.example.test/matters/11111111-1111-4111-8111-111111111111?created=1';
    const overview = matterDetailTabUrl(base, 'overview');
    const documents = matterDetailTabUrl(base, 'documents');
    const work = matterDetailTabUrl(documents, 'work');
    const team = matterDetailTabUrl(work, 'team');
    const activity = matterDetailTabUrl(team, 'activity');

    expect(overview).toBe(`${base}#matter-overview`);
    expect(documents).toBe(`${base}&tab=documents#matter-files`);
    expect(work).toBe(`${base}&tab=work#matter-work`);
    expect(team).toBe(`${base}&tab=team#matter-team`);
    expect(activity).toBe(`${base}&tab=activity#matter-activity`);

    expect(matterDetailTabFromUrl(documents)).toBe('documents');
    expect(matterDetailTabFromUrl(work)).toBe('work');
    expect(matterDetailTabFromUrl(team)).toBe('team');
    expect(matterDetailTabFromUrl(activity)).toBe('activity');
    expect(matterDetailTabFromUrl(documents)).toBe('documents');
    expect(matterDetailTabFromUrl(overview)).toBe('overview');
  });

  it('keeps Arrow, Home, and End keyboard movement deterministic', () => {
    expect(matterDetailTabForKeyboard('overview', 'ArrowRight')).toBe('documents');
    expect(matterDetailTabForKeyboard('overview', 'ArrowLeft')).toBe('activity');
    expect(matterDetailTabForKeyboard('activity', 'ArrowRight')).toBe('overview');
    expect(matterDetailTabForKeyboard('work', 'Home')).toBe('overview');
    expect(matterDetailTabForKeyboard('work', 'End')).toBe('activity');
  });
});
