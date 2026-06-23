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
import MattersPage from './page';

vi.mock('@/lib/api-client', () => ({
  listMatters: vi.fn(),
}));

describe('MattersPage', () => {
  it('surfaces Matter app registration without turning the Matter list into upload flow', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <MattersPage />
      </LanguageProvider>,
    );

    expect(html).toContain('Matter 목록');
    expect(html).toContain('Matter app 연동 기준');
    expect(html).toContain('New Matter');
    expect(html.match(/New Matter/g)).toHaveLength(1);
    expect(html).toContain('href="/integrations/matter-app"');
    expect(html.match(/href="\/integrations\/matter-app"/g)).toHaveLength(1);
    expect(html).toContain('Matter app에서 확정된 Matter Code');
    expect(html).not.toContain('파일 업로드');
    expect(html).not.toContain('href="/files"');
    expect(html).not.toMatch(/>18</);
    expect(html).not.toMatch(/>642</);
    expect(html).not.toMatch(/>9</);
  });

  it('renders Matter-first DMS actions for real matter rows without fake counts', () => {
    const matter = matterFixture();
    const html = renderToStaticMarkup(
      <MatterListTable copy={matterListCopy} matters={[matter]} />,
    );

    expect(html).toContain('계약 검토');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('파일함');
    expect(html).toContain('검색');
    expect(html).toContain('min-w-[1040px]');
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('href="/matters/11111111-1111-4111-8111-111111111122"');
    expect(html).toContain('href="/files?matterCode=AMIC-2026-0007"');
    expect(html).toContain('href="/search?matterCode=AMIC-2026-0007&amp;target=all&amp;groupBy=matter"');
    expect(html).toContain('href="/files?matterCode=AMIC-2026-0007">파일함</a>');
    expect(html).toContain(
      'href="/search?matterCode=AMIC-2026-0007&amp;target=all&amp;groupBy=matter">검색</a>',
    );
    expect(html).not.toMatch(/>18</);
    expect(html).not.toMatch(/>642</);
    expect(html).not.toMatch(/>9</);
  });

  it('builds Matter action URLs from Matter Code only', () => {
    const matter = matterFixture();

    expect(matterFileCabinetUrl(matter)).toBe('/files?matterCode=AMIC-2026-0007');
    expect(matterSearchUrl(matter)).toBe('/search?matterCode=AMIC-2026-0007&target=all&groupBy=matter');
    expect(matterFileCabinetUrl(matter)).not.toContain(matter.matterId);
    expect(matterSearchUrl(matter)).not.toContain(matter.matterId);
  });
});

const matterListCopy = {
  actions: '작업',
  fileCabinet: '파일함',
  matter: 'Matter',
  openMatter: '열기',
  protected: '보호됨',
  searchMatter: '검색',
  security: '보안',
  status: '상태',
  type: '유형',
} satisfies MatterListTableCopy;

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
