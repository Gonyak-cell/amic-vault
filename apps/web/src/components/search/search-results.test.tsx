import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResponseDto } from '@amic-vault/shared';
import { ApiClientError } from '@/lib/api-client';
import { uiErrorStateForApiError } from '@/lib/api/error-messages';
import { LanguageProvider } from '@/lib/i18n';
import { SearchResults, searchResultKey } from './search-results';

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
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => {
    void asChild;
    return <button {...props}>{children}</button>;
  },
}));

const response: SearchResponseDto = {
  total: 12,
  facets: {
    clients: [],
    matters: [],
    documentTypes: [],
    confidentialityLevels: [],
    extractionStatuses: [],
    emailRecipientDomains: [],
    emailSenderDomains: [],
    ocrConfidence: [],
    legalHolds: [],
    privilegeStatuses: [],
    recordsStatuses: [],
    versionStatuses: [],
    dateRanges: [],
  },
  results: [
    {
      documentId: '11111111-1111-4111-8111-111111111401',
      versionId: '11111111-1111-4111-8111-111111111402',
      matterId: '11111111-1111-4111-8111-111111111403',
      clientId: '11111111-1111-4111-8111-111111111404',
      author: null,
      clientDisplayName: 'AMIC',
      contentTruncated: false,
      title: 'Search Result One',
      matterDisplayCode: 'AMIC-2026-0007',
      matterDisplayName: 'Vault Upgrade',
      snippet: 'authorized snippet',
      highlights: [],
      documentType: 'contract',
      extractionStatus: 'failed',
      permissionBadges: {
        confidentiality: 'standard',
        legalHold: 'no_hold',
        privilege: 'none',
      },
      aiAllowed: false,
      prevVersionId: null,
      nextVersionId: null,
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
    expect(html).toContain('추출 실패');
    expect(html).toContain('본문 검색 품질이 제한될 수 있습니다.');
    expect(html).toContain('2 / 2');
    expect(html).toContain('이전');
    expect(html).toContain('다음');
  });

  it('marks one selectable result without requesting preview data', () => {
    const selectedKey = searchResultKey(response.results[0]!);
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={response}
          page={1}
          pageSize={10}
          busy={false}
          error={null}
          onPage={() => undefined}
          onSelect={() => undefined}
          selectedResultKey={selectedKey}
        />
      </LanguageProvider>,
    );

    expect(selectedKey).toContain(response.results[0]!.documentId);
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain('preview-session');
  });

  it('groups results by display-safe matter labels', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={response}
          page={1}
          pageSize={10}
          busy={false}
          error={null}
          groupBy="matter"
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC-2026-0007 · Vault Upgrade');
    expect(html).not.toContain(response.results[0]?.matterId);
    expect(html).not.toContain(response.results[0]?.clientId);
  });

  it('renders a natural document-type label when grouping results by type', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={response}
          page={1}
          pageSize={10}
          busy={false}
          error={null}
          groupBy="type"
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(html).toContain('계약');
    expect(html).not.toContain('>contract<');
  });

  it('renders capped totals as 1,000+', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={{ ...response, total: 1001 }}
          page={1}
          pageSize={10}
          busy={false}
          error={null}
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(html).toContain('결과 1,000+개');
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
          error={uiErrorStateForApiError(new ApiClientError(403, { code: 'PERMISSION_DENIED' }))}
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
          error={uiErrorStateForApiError(new ApiClientError(403, { code: 'ETHICAL_WALL_BLOCKED' }))}
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(startHtml).toContain('검색어를 입력하면 접근 가능한 문서만 표시됩니다.');
    expect(blockedHtml).toContain('정보 차단 정책에 따라 표시할 수 없습니다.');
  });

  it('keeps transport unavailable separate from permission and policy errors', () => {
    const renderError = (caught: unknown) =>
      renderToStaticMarkup(
        <LanguageProvider>
          <SearchResults
            response={null}
            page={1}
            pageSize={10}
            busy={false}
            error={uiErrorStateForApiError(caught)}
            onPage={() => undefined}
          />
        </LanguageProvider>,
      );

    const unavailableHtml = renderError(new TypeError('Failed to fetch'));
    const permissionHtml = renderError(new ApiClientError(403, { code: 'PERMISSION_DENIED' }));
    const policyHtml = renderError(new ApiClientError(403, { code: 'ETHICAL_WALL_BLOCKED' }));

    expect(unavailableHtml).toContain(
      '데이터 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(unavailableHtml).not.toContain('요청한 데이터를 표시할 수 없습니다.');
    expect(permissionHtml).toContain('이 항목을 볼 권한이 없습니다.');
    expect(permissionHtml).not.toContain('정보 차단 정책에 따라 표시할 수 없습니다.');
    expect(policyHtml).toContain('정보 차단 정책에 따라 표시할 수 없습니다.');
    expect(policyHtml).not.toContain('이 항목을 볼 권한이 없습니다.');
  });

  it('keeps active loading separate from an unavailable connection', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <SearchResults
          response={null}
          page={1}
          pageSize={10}
          busy
          error={null}
          onPage={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(html).toContain('검색 결과를 불러오는 중입니다.');
    expect(html).not.toContain('데이터 연결을 확인할 수 없습니다.');
  });
});
