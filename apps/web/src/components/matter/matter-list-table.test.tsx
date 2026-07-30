import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import {
  MatterListTable,
  type MatterListTableCopy,
} from './matter-list-table';

describe('MatterListTable responsive density', () => {
  it('keeps the matter identity, status, and actions at narrow widths', () => {
    const matter = matterFixture();
    const html = renderToStaticMarkup(<MatterListTable copy={matterListCopy} matters={[matter]} />);

    expect(html).not.toContain('min-w-[900px]');
    expect(html).toContain('grid-cols-[minmax(0,1fr)_auto_auto]');
    expect(html).toContain('md:grid-cols-[minmax(0,1fr)_minmax(140px,0.55fr)_auto_auto]');
    expect(html).toContain('xl:grid-cols-[minmax(240px,1fr)_180px_160px_110px_120px_72px]');
    expect(html).toContain('계약 검토');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('제안됨');
    expect(html).toContain('aria-label="계약 검토 파일함"');
    expect(html).toContain('aria-label="계약 검토 검색"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('href="/matters/11111111-1111-4111-8111-111111111122"');
    expect(html).not.toMatch(/>11111111-1111-4111-8111-111111111122</);
  });

  it('keeps lower-priority client, owner, and update cells in the DOM for wider breakpoints', () => {
    const html = renderToStaticMarkup(
      <MatterListTable copy={matterListCopy} matters={[matterFixture()]} />,
    );

    expect(html).toContain('hidden truncate text-muted-foreground md:block');
    expect(html).toContain('hidden truncate text-muted-foreground xl:block');
    expect(html).toContain('hidden text-xs text-muted-foreground xl:block');
    expect(html).toContain('한빛전자');
    expect(html).toContain('담당 변호사');
    expect(html).toContain('2026.06.18');
  });
});

const matterListCopy = {
  actions: '작업',
  client: '고객',
  fileCabinet: '파일함',
  matter: 'Matter',
  moreActions: '추가 작업',
  owner: '담당자',
  ownerUnassigned: '미지정',
  recentUpdate: '최근 변경',
  searchMatter: '검색',
  status: '상태',
} satisfies MatterListTableCopy;

function matterFixture(): MatterDto {
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
    status: 'proposed',
    tenantId: '11111111-1111-4111-8111-111111111100',
    updatedAt: '2026-06-18T01:00:00.000Z',
    leadLawyerId: null,
    leadPartnerId: null,
  };
}
