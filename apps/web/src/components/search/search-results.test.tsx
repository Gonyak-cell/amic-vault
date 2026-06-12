import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResponseDto } from '@amic-vault/shared';
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
      <SearchResults
        response={response}
        page={2}
        pageSize={10}
        busy={false}
        error={null}
        onPage={() => undefined}
      />,
    );

    expect(html).toContain('12 results');
    expect(html).toContain('Search Result One');
    expect(html).toContain('2 / 2');
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });

  it('shows safe empty and error states without server internals', () => {
    const emptyHtml = renderToStaticMarkup(
      <SearchResults
        response={{ ...response, total: 0, results: [] }}
        page={1}
        pageSize={10}
        busy={false}
        error={null}
        onPage={() => undefined}
      />,
    );
    const errorHtml = renderToStaticMarkup(
      <SearchResults
        response={null}
        page={1}
        pageSize={10}
        busy={false}
        error="Access unavailable"
        onPage={() => undefined}
      />,
    );

    expect(emptyHtml).toContain('No results');
    expect(errorHtml).toContain('Access unavailable');
    expect(errorHtml).not.toContain('PERMISSION_DENIED');
  });
});
