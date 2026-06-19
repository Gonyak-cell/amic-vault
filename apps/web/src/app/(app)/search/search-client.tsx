'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  SavedSearchDto,
  SearchFiltersDto,
  SearchGroupBy,
  SearchQueryDto,
  SearchResponseDto,
  SearchSort,
  SearchTarget,
} from '@amic-vault/shared';
import { documentTypes, searchVersionStatusValues } from '@amic-vault/shared';
import type { SearchDateRange } from '@/components/search/search-advanced-controls';
import { SearchAdvancedControls } from '@/components/search/search-advanced-controls';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFacets, type SearchFacetSelection } from '@/components/search/search-facets';
import { SearchResults, type SearchErrorKind } from '@/components/search/search-results';
import { SearchSavePanel } from '@/components/search/search-save-panel';
import { safeApiErrorMessage, uiErrorKindForApiError } from '@/lib/api/error-messages';
import {
  deleteSavedSearch,
  listSavedSearches,
  saveSavedSearch,
  searchDocuments,
} from '@/lib/api/search';
import { useI18n } from '@/lib/i18n';

const pageSize = 10;

export function SearchClient() {
  const { t } = useI18n();
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
  const [savedSearches, setSavedSearches] = useState<SavedSearchDto[]>([]);
  const [savedSearchBusy, setSavedSearchBusy] = useState(false);
  const [savedSearchError, setSavedSearchError] = useState<string | null>(null);
  const reusableSearchUrl = useMemo(() => urlForState(query, selection, 1), [query, selection]);

  const refreshSavedSearches = useCallback(async () => {
    setSavedSearchBusy(true);
    setSavedSearchError(null);
    try {
      const result = await listSavedSearches();
      setSavedSearches(result.items);
    } catch (caught) {
      setSavedSearchError(safeApiErrorMessage(caught));
      setSavedSearches([]);
    } finally {
      setSavedSearchBusy(false);
    }
  }, []);

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
        const request = requestForState(trimmed, nextSelection, nextPage);
        const result = await searchDocuments(request);
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
    void refreshSavedSearches();
  }, [refreshSavedSearches]);

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

  async function saveCurrentSearch(name: string) {
    if (!query.trim()) return;
    setSavedSearchBusy(true);
    setSavedSearchError(null);
    try {
      const saved = await saveSavedSearch({
        name,
        query: requestForState(query, selection, 1),
      });
      setSavedSearches((current) => sortSavedSearches(upsertSavedSearch(current, saved)));
    } catch (caught) {
      setSavedSearchError(safeApiErrorMessage(caught));
    } finally {
      setSavedSearchBusy(false);
    }
  }

  async function deleteCurrentSavedSearch(savedSearchId: string) {
    setSavedSearchBusy(true);
    setSavedSearchError(null);
    try {
      await deleteSavedSearch(savedSearchId);
      setSavedSearches((current) =>
        current.filter((savedSearch) => savedSearch.savedSearchId !== savedSearchId),
      );
    } catch (caught) {
      setSavedSearchError(safeApiErrorMessage(caught));
    } finally {
      setSavedSearchBusy(false);
    }
  }

  async function openSavedSearch(savedSearch: SavedSearchDto) {
    const nextQuery = savedSearch.query.query?.trim();
    if (!nextQuery) return;
    const nextSelection = selectionFromSearchQuery(savedSearch.query);
    setBusy(true);
    setError(null);
    setQuery(nextQuery);
    setSelection(nextSelection);
    setPage(1);
    router.replace(urlForState(nextQuery, nextSelection, 1));
    try {
      const result = await searchDocuments({ ...savedSearch.query, page: 1, pageSize });
      setResponse(result);
    } catch (caught) {
      setResponse(null);
      setError(searchErrorKind(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-normal">
          {t('search.title')}
        </h1>
        <SearchBar
          initialQuery={query}
          busy={busy}
          onSearch={(nextQuery) => runSearch(nextQuery, selection, 1)}
        />
      </section>
      <SearchAdvancedControls
        busy={busy}
        selection={selection}
        onApply={(advanced) => runSearch(query, { ...selection, ...advanced }, 1)}
        onReset={() => runSearch(query, resetAdvancedSelection(selection), 1)}
      />
      <SearchSavePanel
        busy={busy}
        onDeleteSavedSearch={(savedSearchId) => void deleteCurrentSavedSearch(savedSearchId)}
        onOpenSavedSearch={(savedSearch) => void openSavedSearch(savedSearch)}
        onSaveSearch={(name) => void saveCurrentSearch(name)}
        query={query}
        selection={selection}
        savedSearchBusy={savedSearchBusy}
        savedSearchError={savedSearchError}
        savedSearches={savedSearches}
        reusableUrl={reusableSearchUrl}
      />
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
          groupBy={selection.groupBy ?? 'none'}
          target={selection.target ?? 'all'}
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
      documentType: parseDocumentType(params.get('documentType')),
      versionStatus: parseVersionStatus(params.get('versionStatus')),
      dateRange: parseDateRange(params.get('dateRange')),
      clientName: params.get('clientName') ?? undefined,
      groupBy: parseGroupBy(params.get('groupBy')),
      matterCode: params.get('matterCode') ?? undefined,
      matterName: params.get('matterName') ?? undefined,
      sortBy: parseSort(params.get('sortBy')),
      target: parseTarget(params.get('target')),
      title: params.get('title') ?? undefined,
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
  if (selection.clientName) params.set('clientName', selection.clientName);
  if (selection.groupBy && selection.groupBy !== 'none') params.set('groupBy', selection.groupBy);
  if (selection.matterCode) params.set('matterCode', selection.matterCode);
  if (selection.matterName) params.set('matterName', selection.matterName);
  if (selection.sortBy && selection.sortBy !== 'relevance') params.set('sortBy', selection.sortBy);
  if (selection.target && selection.target !== 'all') params.set('target', selection.target);
  if (selection.title) params.set('title', selection.title);
  return `/search?${params.toString()}`;
}

function requestForState(
  query: string,
  selection: SearchFacetSelection,
  page: number,
): SearchQueryDto {
  return {
    query: query.trim(),
    filters: filtersForSelection(selection),
    page,
    pageSize,
    ...(selection.groupBy ? { groupBy: selection.groupBy } : {}),
    ...(selection.sortBy ? { sortBy: selection.sortBy } : {}),
    ...(selection.target ? { target: selection.target } : {}),
  };
}

function filtersForSelection(selection: SearchFacetSelection): SearchFiltersDto {
  const filters: SearchFiltersDto = {};
  if (selection.matterId) filters.matterId = selection.matterId;
  if (selection.clientId) filters.clientId = selection.clientId;
  if (selection.clientName) filters.clientName = selection.clientName;
  if (selection.matterCode) filters.matterCode = selection.matterCode;
  if (selection.matterName) filters.matterName = selection.matterName;
  if (selection.title) filters.title = selection.title;
  if (selection.documentType) filters.documentType = selection.documentType as SearchFiltersDto['documentType'];
  if (selection.versionStatus) {
    filters.versionStatus = selection.versionStatus as SearchFiltersDto['versionStatus'];
  }
  const dateRange = datesForRange(selection.dateRange);
  if (dateRange.dateFrom) filters.dateFrom = dateRange.dateFrom;
  if (dateRange.dateTo) filters.dateTo = dateRange.dateTo;
  return filters;
}

function selectionFromSearchQuery(input: SearchQueryDto): SearchFacetSelection {
  const filters = input.filters;
  const documentType = Array.isArray(filters?.documentType)
    ? filters.documentType[0]
    : filters?.documentType;
  return {
    clientId: filters?.clientId,
    clientName: filters?.clientName,
    documentType,
    groupBy: input.groupBy,
    matterCode: filters?.matterCode,
    matterId: filters?.matterId,
    matterName: filters?.matterName,
    sortBy: input.sortBy,
    target: input.target,
    title: filters?.title,
    versionStatus: filters?.versionStatus,
  };
}

function resetAdvancedSelection(selection: SearchFacetSelection): SearchFacetSelection {
  return {
    clientId: selection.clientId,
    matterId: selection.matterId,
  };
}

function parseDocumentType(value: string | null): SearchFacetSelection['documentType'] {
  return (documentTypes as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['documentType'])
    : undefined;
}

function parseVersionStatus(value: string | null): SearchFacetSelection['versionStatus'] {
  return (searchVersionStatusValues as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['versionStatus'])
    : undefined;
}

function parseDateRange(value: string | null): SearchDateRange | undefined {
  return value === 'last_7_days' || value === 'last_30_days' || value === 'older'
    ? value
    : undefined;
}

function parseTarget(value: string | null): SearchTarget | undefined {
  return value === 'title' || value === 'body' || value === 'all' ? value : undefined;
}

function parseSort(value: string | null): SearchSort | undefined {
  if (
    value === 'relevance' ||
    value === 'updated_desc' ||
    value === 'updated_asc' ||
    value === 'title_asc' ||
    value === 'matter_asc' ||
    value === 'type_asc'
  ) {
    return value;
  }
  return undefined;
}

function parseGroupBy(value: string | null): SearchGroupBy | undefined {
  return value === 'matter' || value === 'client' || value === 'type' || value === 'none'
    ? value
    : undefined;
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

function upsertSavedSearch(
  current: SavedSearchDto[],
  next: SavedSearchDto,
): SavedSearchDto[] {
  const withoutExisting = current.filter(
    (savedSearch) => savedSearch.savedSearchId !== next.savedSearchId,
  );
  return [next, ...withoutExisting];
}

function sortSavedSearches(items: SavedSearchDto[]): SavedSearchDto[] {
  return [...items].sort((a, b) => {
    const updated = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (updated !== 0) return updated;
    return a.name.localeCompare(b.name);
  });
}
