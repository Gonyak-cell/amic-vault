import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchFacetsDto } from '@amic-vault/shared';
import {
  SearchFilterSummary,
  searchFilterSummaryItems,
} from './search-filter-summary';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const facets: SearchFacetsDto = {
  clients: [{ value: '11111111-1111-4111-8111-111111111101', label: '한빛전자', count: 3 }],
  matters: [{ value: '11111111-1111-4111-8111-111111111102', label: 'AMIC-2026-0007', count: 2 }],
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
};

describe('SearchFilterSummary', () => {
  it('uses display labels instead of raw facet identifiers', () => {
    const selection = {
      clientId: '11111111-1111-4111-8111-111111111101',
      matterId: '11111111-1111-4111-8111-111111111102',
      documentType: 'contract' as const,
    };
    const html = renderToStaticMarkup(
      <SearchFilterSummary facets={facets} onReset={() => undefined} selection={selection} />,
    );

    expect(html).toContain('적용된 조건');
    expect(html).toContain('한빛전자');
    expect(html).toContain('AMIC-2026-0007');
    expect(html).toContain('계약서');
    expect(html).not.toContain(selection.clientId);
    expect(html).not.toContain(selection.matterId);
  });

  it('does not render default-only conditions', () => {
    expect(searchFilterSummaryItems({}, facets)).toEqual([]);
  });
});
