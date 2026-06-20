import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchFacetsDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { SearchFacets } from './search-facets';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

const facets: SearchFacetsDto = {
  clients: [
    { value: '11111111-1111-4111-8111-111111111301', label: 'AMIC', count: 2 },
    { value: '22222222-2222-4222-8222-222222222301', count: 0 },
  ],
  matters: [
    {
      value: '11111111-1111-4111-8111-111111111302',
      label: 'AMIC-2026 · Vault UI',
      count: 2,
    },
  ],
  documentTypes: [
    { value: 'memo', count: 1 },
    { value: 'contract', count: 1 },
  ],
  confidentialityLevels: [
    { value: 'restricted', count: 1 },
    { value: 'standard', count: 1 },
  ],
  extractionStatuses: [
    { value: 'failed', count: 1 },
    { value: 'ready', count: 0 },
  ],
  legalHolds: [
    { value: 'document_hold', count: 1 },
    { value: 'no_hold', count: 1 },
  ],
  privilegeStatuses: [
    { value: 'privileged', count: 1 },
    { value: 'none', count: 1 },
  ],
  recordsStatuses: [
    { value: 'archived', count: 1 },
    { value: 'active', count: 1 },
  ],
  versionStatuses: [{ value: 'current', count: 2 }],
  dateRanges: [
    { value: 'last_7_days', label: 'Last 7 days', count: 2 },
    { value: 'older', label: 'Older', count: 0 },
  ],
};

describe('SearchFacets', () => {
  it('renders server-provided facet buckets without zero-count rows', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchFacets facets={facets} selection={{ documentType: 'memo' }} onChange={() => undefined} />
      </LanguageProvider>,
    );

    expect(html).toContain('파일 유형');
    expect(html).toContain('메모');
    expect(html).toContain('계약서');
    expect(html).toContain('기밀도');
    expect(html).toContain('제한');
    expect(html).toContain('표준');
    expect(html).toContain('특권 상태');
    expect(html).toContain('변호사-의뢰인 특권');
    expect(html).toContain('특권 없음');
    expect(html).toContain('추출/OCR');
    expect(html).toContain('추출 실패');
    expect(html).toContain('보존/삭제 금지');
    expect(html).toContain('파일 삭제 금지');
    expect(html).toContain('보존 조치 없음');
    expect(html).toContain('기록 상태');
    expect(html).toContain('보관됨');
    expect(html).toContain('운영 중');
    expect(html).not.toContain('본문 검색 가능');
    expect(html).toContain('사건');
    expect(html).toContain('고객');
    expect(html).toContain('AMIC-2026 · Vault UI');
    expect(html).toContain('AMIC');
    expect(html).toContain('최근 7일');
    expect(html).not.toContain('표시 가능한 라벨 없음');
    expect(html).not.toContain('ID 11111111');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111301');
    expect(html).not.toContain('11111111-1111-4111-8111-111111111302');
    expect(html).not.toContain('22222222-2222-4222-8222-222222222301');
    expect(html).not.toContain('Older');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('필터 초기화');
  });
});
