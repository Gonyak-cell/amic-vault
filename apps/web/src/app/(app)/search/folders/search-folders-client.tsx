import React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { SearchQueryDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';

/**
 * The old folder URL is still a supported bookmark, but it is no longer a
 * second saved-search surface. Only an opaque saved-search reference may be
 * carried into the canonical Search Workbench.
 */
export type SearchFoldersSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

const savedSearchRefPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function searchFoldersCompatibilityPath(
  searchParams: SearchFoldersSearchParams = {},
): string {
  const savedSearchRef = firstSearchParam(searchParams.searchRef);
  if (!savedSearchRef || !savedSearchRefPattern.test(savedSearchRef)) return '/search';
  return `/search?searchRef=${encodeURIComponent(savedSearchRef)}`;
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Kept as a small compatibility helper for stale imports. Search state is
 * intentionally not copied from a saved query into a URL: query text,
 * document titles/bodies, and raw organization/account keys are not URL state.
 * The canonical Workbench resolves authorized saved searches by reference.
 */
export function searchUrlForSavedQuery(
  _query: SearchQueryDto,
  savedSearchId?: string,
): string {
  return searchFoldersCompatibilityPath({ searchRef: savedSearchId });
}

/**
 * The server route redirects before this client is mounted. Keep this
 * fallback for stale prefetched bundles and direct component consumers; it
 * deliberately contains no saved-search API calls or duplicate list.
 */
export function SearchFoldersClient() {
  return <SearchFoldersCompatibilityNotice />;
}

export function SearchFoldersContent() {
  return <SearchFoldersCompatibilityNotice />;
}

function SearchFoldersCompatibilityNotice() {
  return (
    <SectionCard title="검색 조건은 문서 검색에서 관리합니다." meta="검색 워크벤치">
      <p className="text-sm text-muted-foreground">
        저장된 검색을 만들고 열고 해제하는 작업은 문서 검색 화면에서 계속할 수 있습니다.
      </p>
      <Button asChild className="mt-4" size="sm" variant="outline">
        <Link href="/search">
          <Search className="h-4 w-4" aria-hidden="true" />
          문서 검색으로 이동
        </Link>
      </Button>
    </SectionCard>
  );
}
