import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SavedSearchDto } from '@amic-vault/shared';
import { SearchWorkbenchRail } from './search-workbench-rail';

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

const savedSearch: SavedSearchDto = {
  canRevoke: true,
  createdAt: '2026-07-28T00:00:00.000Z',
  lastOpenedAt: null,
  name: '계약서 본문',
  openCount: 1,
  query: { query: '계약서', filters: { matterCode: 'AMIC-2026-0007' }, page: 1, pageSize: 10 },
  savedSearchId: '11111111-1111-4111-8111-111111111901',
  scope: 'matter-team',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

describe('SearchWorkbenchRail', () => {
  it('groups authorized saved searches and shows approved recent-file data without invented links', () => {
    const html = renderToStaticMarkup(
      <SearchWorkbenchRail
        busy={false}
        onDelete={() => undefined}
        onOpen={() => undefined}
        onSave={() => undefined}
        privacyMode="plaintext_url"
        recentFiles={{
          status: 'ready',
          items: [{ title: 'NDA 검토본', matterLabel: 'AMIC-2026-0007' }],
        }}
        savedSearchError={null}
        savedSearches={[savedSearch]}
      />,
    );

    expect(html).toContain('현재 검색 저장');
    expect(html).toContain('Matter 팀');
    expect(html).toContain('계약서 본문');
    expect(html).toContain('최근 문서');
    expect(html).toContain('NDA 검토본');
    expect(html).toContain('href="/files"');
    expect(html).not.toContain(savedSearch.savedSearchId);
    expect(html).not.toContain('/documents/');
  });

  it('uses an honest unavailable state', () => {
    const html = renderToStaticMarkup(
      <SearchWorkbenchRail
        busy={false}
        onDelete={() => undefined}
        onOpen={() => undefined}
        onSave={() => undefined}
        privacyMode="plaintext_url"
        recentFiles={{ status: 'unavailable' }}
        savedSearchError={null}
        savedSearches={[]}
      />,
    );

    expect(html).toContain('일부 데이터를 표시할 수 없습니다.');
    expect(html).not.toContain('0건');
  });
});
