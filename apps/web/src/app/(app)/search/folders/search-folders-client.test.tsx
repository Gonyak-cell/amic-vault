import { describe, expect, it } from 'vitest';
import { searchFoldersCompatibilityPath } from './search-folders-client';

const savedSearchRef = '11111111-1111-4111-8111-111111111902';
const tenantId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

describe('search/folders compatibility', () => {
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
    expect(
      searchFoldersCompatibilityPath({
        searchRef: ['not-a-saved-search-ref', savedSearchRef],
        q: '비밀 계약서 본문',
      }),
    ).toBe('/search');
    expect(
      searchFoldersCompatibilityPath({
        searchRef: `${savedSearchRef}%5C%5Cevil`,
        q: '비밀 계약서 본문',
      }),
    ).toBe('/search');
  });
});
