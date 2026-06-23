import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import { matterRecordsUrl } from '@/components/matter/matter-dms-links';
import { MatterWorkspaceActions } from './matter-workspace-actions';

describe('MatterWorkspaceActions', () => {
  it('links a Matter workspace to DMS operating routes through Matter Code', () => {
    const matter = matterFixture();
    const html = renderToStaticMarkup(<MatterWorkspaceActions matter={matter} />);

    expect(html).toContain('Matter Code 기준 작업');
    expect(html).toContain('파일함');
    expect(html).toContain('검색');
    expect(html).toContain('작업함');
    expect(html).toContain('기록 보존');
    expect(html).toContain('감사 기록');
    expect(html).toContain('href="/files?matterCode=AMIC-2026-0007"');
    expect(html).toContain('href="/search?matterCode=AMIC-2026-0007&amp;target=all&amp;groupBy=matter"');
    expect(html).toContain('href="/work"');
    expect(html).toContain('href="/records?tab=holds&amp;matterCode=AMIC-2026-0007"');
    expect(html).toContain('href="/audit"');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(matter.matterId);
    expect(html).not.toMatch(/>18</);
    expect(html).not.toMatch(/>642</);
    expect(html).not.toMatch(/>9</);
  });

  it('builds records context links from display-safe Matter Code only', () => {
    const matter = matterFixture();

    expect(matterRecordsUrl(matter)).toBe('/records?tab=holds&matterCode=AMIC-2026-0007');
    expect(matterRecordsUrl(matter)).not.toContain(matter.matterId);
  });
});

function matterFixture(overrides: Partial<MatterDto> = {}): MatterDto {
  return {
    clientId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-06-18T00:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111112',
    displayName: '계약 검토',
    legalHold: false,
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
    ...overrides,
  };
}
