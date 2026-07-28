import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SearchResultDto } from '@amic-vault/shared';
import { SearchResultInspector } from './search-result-inspector';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ asChild, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => {
    void asChild;
    return <button {...props}>{children}</button>;
  },
}));

const result: SearchResultDto = {
  documentId: '11111111-1111-4111-8111-111111111401',
  versionId: '11111111-1111-4111-8111-111111111402',
  matterId: '11111111-1111-4111-8111-111111111403',
  clientId: '11111111-1111-4111-8111-111111111404',
  author: null,
  clientDisplayName: '한빛전자',
  contentTruncated: false,
  title: 'NDA 검토본',
  matterDisplayCode: 'AMIC-2026-0007',
  matterDisplayName: 'Vault Upgrade',
  snippet: '권한이 확인된 검색 문맥',
  highlights: [],
  documentType: 'contract',
  extractionStatus: 'ready',
  permissionBadges: {
    confidentiality: 'standard',
    legalHold: 'no_hold',
    privilege: 'none',
  },
  aiAllowed: false,
  prevVersionId: null,
  nextVersionId: null,
  versionStatus: 'current',
  score: 0.9,
  updatedAt: '2026-07-28T00:00:00.000Z',
};

describe('SearchResultInspector', () => {
  it('shows safe metadata and explicit preview/open actions without raw identifiers', () => {
    const html = renderToStaticMarkup(
      <SearchResultInspector
        onOpen={() => undefined}
        onPreview={() => undefined}
        result={result}
        target="body"
      />,
    );

    expect(html).toContain('NDA 검토본');
    expect(html).toContain('AMIC-2026-0007 · Vault Upgrade');
    expect(html).toContain('한빛전자');
    expect(html).toContain('미리보기');
    expect(html).toContain('문서 열기');
    expect(html).toContain('from=search');
    expect(html).not.toContain(result.matterId);
    expect(html).not.toContain(result.clientId);
    expect(html).not.toContain(result.versionId);
  });

  it('has a truthful empty selection state', () => {
    const html = renderToStaticMarkup(
      <SearchResultInspector
        onOpen={() => undefined}
        onPreview={() => undefined}
        result={null}
        target="all"
      />,
    );
    expect(html).toContain('결과를 선택하면');
    expect(html).not.toContain('미리보기');
  });
});
