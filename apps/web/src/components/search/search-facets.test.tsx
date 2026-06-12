import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchFacetsDto } from '@amic-vault/shared';
import { SearchFacets } from './search-facets';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

const facets: SearchFacetsDto = {
  clients: [
    { value: '11111111-1111-4111-8111-111111111301', count: 2 },
    { value: '22222222-2222-4222-8222-222222222301', count: 0 },
  ],
  matters: [{ value: '11111111-1111-4111-8111-111111111302', count: 2 }],
  documentTypes: [
    { value: 'memo', count: 1 },
    { value: 'contract', count: 1 },
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
      <SearchFacets facets={facets} selection={{ documentType: 'memo' }} onChange={() => undefined} />,
    );

    expect(html).toContain('Type');
    expect(html).toContain('memo');
    expect(html).toContain('contract');
    expect(html).toContain('Last 7 days');
    expect(html).toContain('11111111-1111-4111-8111-111111111301');
    expect(html).not.toContain('22222222-2222-4222-8222-222222222301');
    expect(html).not.toContain('Older');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Clear');
  });
});
