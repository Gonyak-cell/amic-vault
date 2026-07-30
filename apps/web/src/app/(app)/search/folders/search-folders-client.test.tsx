import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  SearchFoldersClient,
  SearchFoldersContent,
  searchFoldersCompatibilityPath,
  searchUrlForSavedQuery,
} from './search-folders-client';

const savedSearchRef = '11111111-1111-4111-8111-111111111902';
const tenantId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

describe('search/folders compatibility', () => {
  it('renders only a canonical Search Workbench entry point', () => {
    const html = renderToStaticMarkup(
      <>
        <SearchFoldersClient />
        <SearchFoldersContent />
      </>,
    );

    expect(html).toContain('검색 조건은 문서 검색에서 관리합니다.');
    expect(html).toContain('href="/search"');
    expect(html).not.toContain('저장된 검색 기준');
    expect(html).not.toContain('내 검색 폴더');
    expect(html).not.toContain('검색 폴더 관리');
  });

  it('keeps only a validated opaque saved-search reference', () => {
    expect(
      searchFoldersCompatibilityPath({
        searchRef: savedSearchRef,
        q: '비밀 계약서 본문',
        title: '고객 문서 제목',
        matterId: tenantId,
        clientId: userId,
      }),
    ).toBe(`/search?searchRef=${savedSearchRef}`);

    expect(
      searchFoldersCompatibilityPath({
        searchRef: 'not-a-saved-search-ref',
        q: '비밀 계약서 본문',
      }),
    ).toBe('/search');
    expect(searchFoldersCompatibilityPath({ q: '비밀 계약서 본문' })).toBe('/search');
  });

  it('does not copy saved query text, titles, bodies, or raw ids into compatibility URLs', () => {
    const path = searchUrlForSavedQuery(
      {
        query: '비밀 계약서 본문',
        filters: {
          clientId: userId,
          matterId: tenantId,
          title: '고객 문서 제목',
          matterCode: 'AMIC-2026-0002',
        },
        page: 1,
        pageSize: 10,
      },
      savedSearchRef,
    );

    expect(path).toBe(`/search?searchRef=${savedSearchRef}`);
    expect(path).not.toContain('비밀');
    expect(path).not.toContain('고객 문서 제목');
    expect(path).not.toContain(tenantId);
    expect(path).not.toContain(userId);
  });
});
