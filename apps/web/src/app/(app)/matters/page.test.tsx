import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import {
  MatterListTable,
  matterFileCabinetUrl,
  matterSearchUrl,
  type MatterListTableCopy,
} from '@/components/matter/matter-list-table';
import { listMatterQueryFromSearchParams } from './matter-list-query';
import MattersPage from './page';

vi.mock('@/lib/api-client', () => ({
  listMatters: vi.fn(),
}));

describe('MattersPage', () => {
  it('keeps Matter headers title-only without turning the list into upload flow', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <MattersPage />
      </LanguageProvider>,
    );

    expect(html).toContain('Matter 목록');
    expect(html).not.toContain('Matter 관리 시스템 연동 기준');
    expect(html).toContain('새 Matter');
    expect(html.match(/새 Matter/g)).toHaveLength(1);
    expect(html).toContain('href="/matters/new"');
    expect(html.match(/href="\/matters\/new"/g)).toHaveLength(1);
    expect(html).not.toContain('Matter 관리 시스템에서 동기화된');
    expect(html).not.toContain('Matter 관리 시스템에서 확정된 Matter 코드');
    expect(html).not.toContain('Matter 코드 동기화');
    expect(html).not.toContain('파일 업로드');
    expect(html).not.toContain('href="/files"');
    expect(html).not.toMatch(/>18</);
    expect(html).not.toMatch(/>642</);
    expect(html).not.toMatch(/>9</);
  });

  it('uses direct empty copy without presenting loading as a failure', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <MattersPage />
      </LanguageProvider>,
    );

    expect(html).toContain('불러오는 중입니다.');
    expect(html).not.toContain('데이터를 불러올 수 없습니다.');
    expect(html).not.toContain('Matter 관리 시스템');
  });

  it('passes a selected client filter from the route into the matter list query', () => {
    expect(
      listMatterQueryFromSearchParams({
        clientId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({
      clientId: '11111111-1111-4111-8111-111111111111',
      pageSize: 20,
    });
    expect(listMatterQueryFromSearchParams({ clientId: 'not-a-uuid' })).toEqual({
      pageSize: 20,
    });
  });

  it('renders client-filtered matter context with a clear path back to all matters', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <MattersPage searchParams={{ clientId: '11111111-1111-4111-8111-111111111111' }} />
      </LanguageProvider>,
    );

    expect(html).toContain('선택한 고객의 Matter만 표시합니다.');
    expect(html).toContain('전체 Matter 보기');
    expect(html).toContain('href="/matters"');
  });

  it('renders Matter-first DMS actions for real matter rows without fake counts', () => {
    const matter = matterFixture({ confidentialityLevel: 'high', ethicalWallActive: true });
    const html = renderToStaticMarkup(<MatterListTable copy={matterListCopy} matters={[matter]} />);

    expect(html).toContain('계약 검토');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('한빛전자');
    expect(html).toContain('담당자');
    expect(html).toContain('미지정');
    expect(html).toContain('최근 변경');
    expect(html).toContain('2026.06.18');
    expect(html).not.toContain('정보 차단');
    expect(html).not.toContain('높음');
    expect(html).toContain('파일함');
    expect(html).toContain('검색');
    expect(html).toContain('추가 작업');
    expect(html).toContain('aria-label="계약 검토 파일함"');
    expect(html).toContain('aria-label="계약 검토 검색"');
    expect(html).toContain('href="/matters/11111111-1111-4111-8111-111111111122"');
    expect(html).toContain('href="/files?matterCode=AMIC-2026-0007"');
    expect(html).toContain(
      'href="/search?matterCode=AMIC-2026-0007&amp;target=all&amp;groupBy=matter"',
    );
    expect(html).not.toMatch(/>18</);
    expect(html).not.toMatch(/>642</);
    expect(html).not.toMatch(/>9</);
  });

  it('builds matter action URLs from matter code only', () => {
    const matter = matterFixture();

    expect(matterFileCabinetUrl(matter)).toBe('/files?matterCode=AMIC-2026-0007');
    expect(matterSearchUrl(matter)).toBe(
      '/search?matterCode=AMIC-2026-0007&target=all&groupBy=matter',
    );
    expect(matterFileCabinetUrl(matter)).not.toContain(matter.matterId);
    expect(matterSearchUrl(matter)).not.toContain(matter.matterId);
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

function matterFixture(overrides: Partial<MatterDto> = {}): MatterDto {
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
