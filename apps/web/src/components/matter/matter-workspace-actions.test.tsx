import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import { MatterWorkspaceActions } from './matter-workspace-actions';

describe('MatterWorkspaceActions', () => {
  it('keeps only daily Matter document and work actions in the header', () => {
    const matter = matterFixture();
    const html = renderToStaticMarkup(<MatterWorkspaceActions matter={matter} />);

    expect(html).toContain('Matter 코드 기준 작업');
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).toContain('파일함');
    expect(html).toContain('검색');
    expect(html).toContain('작업함');
    expect(html).toContain('href="/files?matterCode=AMIC-2026-0007"');
    expect(html).toContain(
      'href="/search?matterCode=AMIC-2026-0007&amp;target=all&amp;groupBy=matter"',
    );
    expect(html).toContain('href="/work"');
    expect(html).not.toContain('외부 공유');
    expect(html).not.toContain('기록 보존');
    expect(html).not.toContain('감사 기록');
    expect(html).not.toContain('/sharing');
    expect(html).not.toContain('/records');
    expect(html).not.toContain('/audit');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain(matter.matterId);
  });
});

function matterFixture(overrides: Partial<MatterDto> = {}): MatterDto {
  return {
    clientId: '11111111-1111-4111-8111-111111111111',
    confidentialityLevel: 'standard',
    conflictsStatus: 'cleared',
    createdAt: '2026-06-18T00:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111112',
    displayName: '계약 검토',
    ethicalWallActive: false,
    leadAssociateId: null,
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
    leadPartnerId: null,
    ...overrides,
  };
}
