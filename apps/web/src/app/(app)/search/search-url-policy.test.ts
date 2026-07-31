import { describe, expect, it } from 'vitest';
import { privateSearchUrl, urlForPolicy, urlForState } from './search-url-policy';

const matterId = '11111111-1111-4111-8111-111111111901';
const clientId = '11111111-1111-4111-8111-111111111902';
const tenantId = '11111111-1111-4111-8111-111111111903';
const userId = '11111111-1111-4111-8111-111111111904';

describe('search URL policy', () => {
  it('keeps explicit shell q and display-safe filters without title or tenant/user IDs', () => {
    const selection = {
      clientId,
      documentType: 'contract' as const,
      matterId,
      tenantId,
      title: '비공개 문서 제목',
      userId,
    };
    const url = urlForState('명시적 shell 검색', selection, 2);
    const params = new URL(url, 'https://vault.test').searchParams;

    expect(Object.fromEntries(params)).toEqual({
      q: '명시적 shell 검색',
      page: '2',
      matterId,
      clientId,
      documentType: 'contract',
    });
    expect(url).not.toContain('비공개');
    expect(url).not.toContain(tenantId);
    expect(url).not.toContain(userId);
  });

  it('uses only an opaque saved-search reference in private mode', () => {
    expect(
      urlForPolicy(
        { allowPlaintextReusableUrls: false, urlMode: 'private_saved_ref' },
        '민감 검색',
        { documentType: 'memo' },
        3,
      ),
    ).toBe('/search');
    expect(privateSearchUrl(matterId)).toBe(`/search?searchRef=${matterId}`);
  });
});
