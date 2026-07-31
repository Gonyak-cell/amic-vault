import { describe, expect, it, vi } from 'vitest';
import SearchFoldersPage from './page';

const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('SearchFoldersPage compatibility route', () => {
  it('redirects the old bookmark to the canonical Search Workbench', () => {
    expect(() => SearchFoldersPage({})).toThrow('NEXT_REDIRECT:/search');
  });

  it('preserves only an authorized-by-reference opaque saved-search entry point', () => {
    expect(() =>
      SearchFoldersPage({
        searchParams: {
          searchRef: '11111111-1111-4111-8111-111111111902',
          q: '민감한 본문',
          title: '민감한 제목',
        },
      }),
    ).toThrow('NEXT_REDIRECT:/search?searchRef=11111111-1111-4111-8111-111111111902');
    expect(redirectMock).toHaveBeenCalled();
  });
});
