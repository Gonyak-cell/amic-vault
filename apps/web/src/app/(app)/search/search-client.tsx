'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SearchFiltersDto, SearchResponseDto } from '@amic-vault/shared';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFacets, type SearchFacetSelection } from '@/components/search/search-facets';
import { SearchResults, type SearchErrorKind } from '@/components/search/search-results';
import { uiErrorKindForApiError } from '@/lib/api/error-messages';
import { searchDocuments } from '@/lib/api/search';
import { useI18n } from '@/lib/i18n';

const pageSize = 10;

export function SearchClient() {
  const { language } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const initial = useMemo(() => stateFromParams(params), [params]);
  const restoredUrl = useRef<string | null>(null);
  const [query, setQuery] = useState(initial.query);
  const [selection, setSelection] = useState<SearchFacetSelection>(initial.selection);
  const [page, setPage] = useState(initial.page);
  const [response, setResponse] = useState<SearchResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SearchErrorKind | null>(null);

  const runSearch = useCallback(
    async (nextQuery: string, nextSelection: SearchFacetSelection, nextPage: number) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) return;
      setBusy(true);
      setError(null);
      setQuery(trimmed);
      setSelection(nextSelection);
      setPage(nextPage);
      router.replace(urlForState(trimmed, nextSelection, nextPage));
      try {
        const result = await searchDocuments({
          query: trimmed,
          filters: filtersForSelection(nextSelection),
          page: nextPage,
          pageSize,
        });
        setResponse(result);
      } catch (caught) {
        setResponse(null);
        setError(searchErrorKind(caught));
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!initial.query) return;
    const initialUrl = urlForState(initial.query, initial.selection, initial.page);
    if (restoredUrl.current === initialUrl) return;
    restoredUrl.current = initialUrl;
    void runSearch(initial.query, initial.selection, initial.page);
  }, [initial, runSearch]);

  function applyFacets(next: SearchFacetSelection) {
    void runSearch(query, next, 1);
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-normal">
          {language === 'ko' ? '파일 검색' : 'Search files'}
        </h1>
        <SearchBar
          initialQuery={query}
          busy={busy}
          onSearch={(nextQuery) => runSearch(nextQuery, selection, 1)}
        />
      </section>
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <SearchFacets
          facets={response?.facets ?? emptyFacets}
          selection={selection}
          onChange={applyFacets}
        />
        <SearchResults
          response={response}
          page={page}
          pageSize={pageSize}
          busy={busy}
          error={error}
          onPage={(nextPage) => runSearch(query, selection, nextPage)}
        />
      </div>
    </main>
  );
}

const emptyFacets: SearchResponseDto['facets'] = {
  clients: [],
  matters: [],
  documentTypes: [],
  versionStatuses: [],
  dateRanges: [],
};

function stateFromParams(params: { get(name: string): string | null }) {
  return {
    query: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
    selection: {
      matterId: params.get('matterId') ?? undefined,
      clientId: params.get('clientId') ?? undefined,
      documentType: params.get('documentType') ?? undefined,
      versionStatus: params.get('versionStatus') ?? undefined,
      dateRange: params.get('dateRange') ?? undefined,
    },
  };
}

function urlForState(query: string, selection: SearchFacetSelection, page: number): string {
  const params = new URLSearchParams();
  params.set('q', query);
  if (page > 1) params.set('page', String(page));
  if (selection.matterId) params.set('matterId', selection.matterId);
  if (selection.clientId) params.set('clientId', selection.clientId);
  if (selection.documentType) params.set('documentType', selection.documentType);
  if (selection.versionStatus) params.set('versionStatus', selection.versionStatus);
  if (selection.dateRange) params.set('dateRange', selection.dateRange);
  return `/search?${params.toString()}`;
}

function filtersForSelection(selection: SearchFacetSelection): SearchFiltersDto {
  const filters: SearchFiltersDto = {};
  if (selection.matterId) filters.matterId = selection.matterId;
  if (selection.clientId) filters.clientId = selection.clientId;
  if (selection.documentType) filters.documentType = selection.documentType as SearchFiltersDto['documentType'];
  if (selection.versionStatus) {
    filters.versionStatus = selection.versionStatus as SearchFiltersDto['versionStatus'];
  }
  const dateRange = datesForRange(selection.dateRange);
  if (dateRange.dateFrom) filters.dateFrom = dateRange.dateFrom;
  if (dateRange.dateTo) filters.dateTo = dateRange.dateTo;
  return filters;
}

function datesForRange(value: string | undefined): { dateFrom?: string; dateTo?: string } {
  if (!value) return {};
  const now = new Date();
  if (value === 'last_7_days') {
    now.setUTCDate(now.getUTCDate() - 7);
    return { dateFrom: now.toISOString() };
  }
  if (value === 'last_30_days') {
    now.setUTCDate(now.getUTCDate() - 30);
    return { dateFrom: now.toISOString() };
  }
  if (value === 'older') {
    now.setUTCDate(now.getUTCDate() - 30);
    return { dateTo: now.toISOString() };
  }
  return {};
}

function searchErrorKind(error: unknown): SearchErrorKind {
  return uiErrorKindForApiError(error);
}
