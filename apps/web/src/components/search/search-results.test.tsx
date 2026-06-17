import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResponseDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { SearchResults } from './search-results';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

const response: SearchResponseDto = {
  total: 12,
  facets: {
    clients: [],
    matters: [],
    documentTypes: [],
    versionStatuses: [],
    dateRanges: [],
  },
  results: [
    {
      documentId: '11111111-1111-4111-8111-111111111401',
      versionId: '11111111-1111-4111-8111-111111111402',
      matterId: '11111111-1111-4111-8111-111111111403',
      clientId: '11111111-1111-4111-8111-111111111404',
      title: 'Search Result One',
      snippet: 'authorized snippet',
      highlights: [],
      documentType: 'contract',
      versionStatus: 'current',
      score: 0.42,
      updatedAt: '2026-06-12T10:00:00.000Z',
    },
  ],
};

describe('SearchResults', () => {
  it('renders result cards and stable pagination', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={response}
          page={2}
          pageSize={10}
          busy={false}
          error={null}
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(html).toContain('결과 12개');
    expect(html).toContain('Search Result One');
    expect(html).toContain('2 / 2');
    expect(html).toContain('이전');
    expect(html).toContain('다음');
  });

  it('shows safe empty and error states without server internals', () => {
    const emptyHtml = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={{ ...response, total: 0, results: [] }}
          page={1}
          pageSize={10}
          busy={false}
          error={null}
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );
    const errorHtml = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={null}
          page={1}
          pageSize={10}
          busy={false}
          error="permission"
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(emptyHtml).toContain('검색 결과가 없습니다.');
    expect(errorHtml).toContain('이 항목을 볼 권한이 없습니다.');
    expect(errorHtml).not.toContain('PERMISSION_DENIED');
  });

  it('separates pre-search and policy-blocked states', () => {
    const startHtml = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={null}
          page={1}
          pageSize={10}
          busy={false}
          error={null}
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );
    const blockedHtml = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={null}
          page={1}
          pageSize={10}
          busy={false}
          error="policy"
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(startHtml).toContain('검색어를 입력하면 접근 권한이 있는 파일만 보여줍니다.');
    expect(blockedHtml).toContain('정보 차단 또는 권한 정책으로 표시할 수 없습니다.');
  });
});
