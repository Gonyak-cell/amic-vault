'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  SavedSearchDto,
  SearchFiltersDto,
  SearchGroupBy,
  SearchPrivacySettingsDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchSort,
  SearchTarget,
} from '@amic-vault/shared';
import {
  documentConfidentialityLevels,
  documentExtractionStatuses,
  documentPrivilegeStatuses,
  documentTypes,
  searchPrivacySettingsSchema,
  searchLegalHoldValues,
  searchRecordsStatusValues,
  searchVersionStatusValues,
} from '@amic-vault/shared';
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
  const searchPrivacySettings = useMemo(() => searchPrivacySettingsFromEnv(), []);
  const initial = useMemo(
    () => stateFromParams(params, searchPrivacySettings),
    [params, searchPrivacySettings],
  );
  const restoredUrl = useRef<string | null>(null);
  const restoredSavedSearchRef = useRef<string | null>(null);
  const [query, setQuery] = useState(initial.query);
  const [selection, setSelection] = useState<SearchFacetSelection>(initial.selection);
  const [page, setPage] = useState(initial.page);
  const [response, setResponse] = useState<SearchResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SearchErrorKind | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearchDto[]>([]);
  const [savedSearchBusy, setSavedSearchBusy] = useState(false);
  const [savedSearchError, setSavedSearchError] = useState<string | null>(null);
  const reusableSearchUrl = useMemo(
    () =>
      searchPrivacySettings.allowPlaintextReusableUrls
        ? urlForState(query, selection, 1)
        : privateSearchUrl(),
    [query, searchPrivacySettings.allowPlaintextReusableUrls, selection],
  );

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
    async (
      nextQuery: string,
      nextSelection: SearchFacetSelection,
      nextPage: number,
      options: { replaceUrl?: string | null } = {},
    ) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) return;
      setBusy(true);
      setError(null);
      setQuery(trimmed);
      setSelection(nextSelection);
      setPage(nextPage);
      const replacementUrl =
        options.replaceUrl === undefined
          ? urlForPolicy(searchPrivacySettings, trimmed, nextSelection, nextPage)
          : options.replaceUrl;
      if (replacementUrl) router.replace(replacementUrl);
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
    [router, searchPrivacySettings],
  );

  const openSavedSearch = useCallback(
    async (savedSearch: SavedSearchDto) => {
      const nextQuery = savedSearch.query.query?.trim();
      if (!nextQuery) return;
      const nextSelection = selectionFromSearchQuery(savedSearch.query);
      setBusy(true);
      setError(null);
      setQuery(nextQuery);
      setSelection(nextSelection);
      setPage(1);
      router.replace(
        searchPrivacySettings.urlMode === 'private_saved_ref'
          ? privateSearchUrl(savedSearch.savedSearchId)
          : urlForState(nextQuery, nextSelection, 1),
      );
      try {
        const result = await searchDocuments({ ...savedSearch.query, page: 1, pageSize });
        setResponse(result);
      } catch (caught) {
        setResponse(null);
        setError(searchErrorKind(caught));
      } finally {
        setBusy(false);
      }
    },
    [router, searchPrivacySettings.urlMode],
  );

  useEffect(() => {
    void refreshSavedSearches();
  }, [refreshSavedSearches]);

  useEffect(() => {
    if (!searchPrivacySettings.allowPlaintextReusableUrls && params.get('q')) {
      const savedSearchId = parseSavedSearchRef(params.get('searchRef'));
      if (savedSearchId) {
        router.replace(privateSearchUrl(savedSearchId));
        return;
      }
      router.replace(privateSearchUrl());
      return;
    }
  }, [params, router, searchPrivacySettings.allowPlaintextReusableUrls]);

  useEffect(() => {
    if (!searchPrivacySettings.allowPlaintextReusableUrls) return;
    if (!initial.query) return;
    const initialUrl = urlForState(initial.query, initial.selection, initial.page);
    if (restoredUrl.current === initialUrl) return;
    restoredUrl.current = initialUrl;
    void runSearch(initial.query, initial.selection, initial.page, { replaceUrl: initialUrl });
  }, [initial, runSearch, searchPrivacySettings.allowPlaintextReusableUrls]);

  useEffect(() => {
    if (!initial.savedSearchId) return;
    if (restoredSavedSearchRef.current === initial.savedSearchId) return;
    const savedSearch = savedSearches.find(
      (item) => item.savedSearchId === initial.savedSearchId,
    );
    if (!savedSearch) return;
    restoredSavedSearchRef.current = initial.savedSearchId;
    void openSavedSearch(savedSearch);
  }, [initial.savedSearchId, openSavedSearch, savedSearches]);

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
      if (searchPrivacySettings.urlMode === 'private_saved_ref') {
        restoredSavedSearchRef.current = saved.savedSearchId;
        router.replace(privateSearchUrl(saved.savedSearchId));
      }
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
        privacyMode={searchPrivacySettings.urlMode}
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
  confidentialityLevels: [],
  extractionStatuses: [],
  legalHolds: [],
  privilegeStatuses: [],
  recordsStatuses: [],
  versionStatuses: [],
  dateRanges: [],
};

function stateFromParams(
  params: { get(name: string): string | null },
  privacySettings: SearchPrivacySettingsDto,
) {
  return {
    query: privacySettings.allowPlaintextReusableUrls ? params.get('q') ?? '' : '',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
    savedSearchId: parseSavedSearchRef(params.get('searchRef')),
    selection: {
      matterId: params.get('matterId') ?? undefined,
      clientId: params.get('clientId') ?? undefined,
      confidentialityLevel: parseConfidentialityLevel(params.get('confidentialityLevel')),
      documentType: parseDocumentType(params.get('documentType')),
      extractionStatus: parseExtractionStatus(params.get('extractionStatus')),
      legalHold: parseLegalHold(params.get('legalHold')),
      recordsStatus: parseRecordsStatus(params.get('recordsStatus')),
      versionStatus: parseVersionStatus(params.get('versionStatus')),
      dateRange: parseDateRange(params.get('dateRange')),
      clientName: params.get('clientName') ?? undefined,
      groupBy: parseGroupBy(params.get('groupBy')),
      matterCode: params.get('matterCode') ?? undefined,
      matterName: params.get('matterName') ?? undefined,
      privilegeStatus: parsePrivilegeStatus(params.get('privilegeStatus')),
      sortBy: parseSort(params.get('sortBy')),
      target: parseTarget(params.get('target')),
      title: params.get('title') ?? undefined,
    },
  };
}

function urlForPolicy(
  privacySettings: SearchPrivacySettingsDto,
  query: string,
  selection: SearchFacetSelection,
  page: number,
): string {
  if (!privacySettings.allowPlaintextReusableUrls) return privateSearchUrl();
  return urlForState(query, selection, page);
}

function urlForState(query: string, selection: SearchFacetSelection, page: number): string {
  const params = new URLSearchParams();
  params.set('q', query);
  if (page > 1) params.set('page', String(page));
  if (selection.matterId) params.set('matterId', selection.matterId);
  if (selection.clientId) params.set('clientId', selection.clientId);
  if (selection.confidentialityLevel) {
    params.set('confidentialityLevel', selection.confidentialityLevel);
  }
  if (selection.documentType) params.set('documentType', selection.documentType);
  if (selection.extractionStatus) params.set('extractionStatus', selection.extractionStatus);
  if (selection.legalHold) params.set('legalHold', selection.legalHold);
  if (selection.recordsStatus) params.set('recordsStatus', selection.recordsStatus);
  if (selection.versionStatus) params.set('versionStatus', selection.versionStatus);
  if (selection.dateRange) params.set('dateRange', selection.dateRange);
  if (selection.clientName) params.set('clientName', selection.clientName);
  if (selection.groupBy && selection.groupBy !== 'none') params.set('groupBy', selection.groupBy);
  if (selection.matterCode) params.set('matterCode', selection.matterCode);
  if (selection.matterName) params.set('matterName', selection.matterName);
  if (selection.privilegeStatus) params.set('privilegeStatus', selection.privilegeStatus);
  if (selection.sortBy && selection.sortBy !== 'relevance') params.set('sortBy', selection.sortBy);
  if (selection.target && selection.target !== 'all') params.set('target', selection.target);
  if (selection.title) params.set('title', selection.title);
  return `/search?${params.toString()}`;
}

function privateSearchUrl(savedSearchId?: string): string {
  if (!savedSearchId) return '/search';
  const params = new URLSearchParams();
  params.set('searchRef', savedSearchId);
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
  if (selection.confidentialityLevel) {
    filters.confidentialityLevel =
      selection.confidentialityLevel as SearchFiltersDto['confidentialityLevel'];
  }
  if (selection.documentType) filters.documentType = selection.documentType as SearchFiltersDto['documentType'];
  if (selection.extractionStatus) {
    filters.extractionStatus = selection.extractionStatus as SearchFiltersDto['extractionStatus'];
  }
  if (selection.legalHold) {
    filters.legalHold = selection.legalHold as SearchFiltersDto['legalHold'];
  }
  if (selection.privilegeStatus) {
    filters.privilegeStatus = selection.privilegeStatus as SearchFiltersDto['privilegeStatus'];
  }
  if (selection.recordsStatus) {
    filters.recordsStatus = selection.recordsStatus as SearchFiltersDto['recordsStatus'];
  }
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
    confidentialityLevel: filters?.confidentialityLevel,
    documentType,
    extractionStatus: filters?.extractionStatus,
    groupBy: input.groupBy,
    legalHold: filters?.legalHold,
    matterCode: filters?.matterCode,
    matterId: filters?.matterId,
    matterName: filters?.matterName,
    privilegeStatus: filters?.privilegeStatus,
    recordsStatus: filters?.recordsStatus,
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

function parseConfidentialityLevel(
  value: string | null,
): SearchFacetSelection['confidentialityLevel'] {
  return (documentConfidentialityLevels as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['confidentialityLevel'])
    : undefined;
}

function parsePrivilegeStatus(value: string | null): SearchFacetSelection['privilegeStatus'] {
  return (documentPrivilegeStatuses as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['privilegeStatus'])
    : undefined;
}

function parseVersionStatus(value: string | null): SearchFacetSelection['versionStatus'] {
  return (searchVersionStatusValues as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['versionStatus'])
    : undefined;
}

function parseExtractionStatus(value: string | null): SearchFacetSelection['extractionStatus'] {
  return (documentExtractionStatuses as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['extractionStatus'])
    : undefined;
}

function parseLegalHold(value: string | null): SearchFacetSelection['legalHold'] {
  return (searchLegalHoldValues as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['legalHold'])
    : undefined;
}

function parseRecordsStatus(value: string | null): SearchFacetSelection['recordsStatus'] {
  return (searchRecordsStatusValues as readonly string[]).includes(value ?? '')
    ? (value as SearchFacetSelection['recordsStatus'])
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

function parseSavedSearchRef(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : undefined;
}

export function searchPrivacySettingsFromEnv(): SearchPrivacySettingsDto {
  const urlMode =
    process.env.NEXT_PUBLIC_SEARCH_URL_PRIVACY_MODE === 'private_saved_ref'
      ? 'private_saved_ref'
      : 'plaintext_url';
  return searchPrivacySettingsSchema.parse({ urlMode });
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
