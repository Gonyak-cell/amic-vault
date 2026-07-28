'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  SavedSearchDto,
  SearchFiltersDto,
  SearchGroupBy,
  SearchMode,
  SearchPrivacySettingsDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchSort,
  SearchTarget,
  SearchResultDto,
  EnterpriseApprovedDmsTaxonomyDto,
  EnterpriseApprovedDmsSearchRefinerDto,
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
import { AiAnswerPanel } from '@/components/search/ai-answer-panel';
import { SearchAdvancedControls } from '@/components/search/search-advanced-controls';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFacets, type SearchFacetSelection } from '@/components/search/search-facets';
import { SearchResults, type SearchErrorKind } from '@/components/search/search-results';
import { searchResultKey } from '@/components/search/search-results';
import { SearchSavePanel } from '@/components/search/search-save-panel';
import { SearchFilterSummary } from '@/components/search/search-filter-summary';
import {
  SearchWorkbenchRail,
  type SearchRecentFilesState,
} from '@/components/search/search-workbench-rail';
import { SearchResultInspector } from '@/components/search/search-result-inspector';
import {
  DocumentWorkbenchDrawer,
  DocumentWorkbenchShell,
} from '@/components/document/document-workbench-shell';
import { PreviewSessionFrame } from '@/components/document/preview-session-frame';
import { safeApiErrorMessage, uiErrorKindForApiError } from '@/lib/api/error-messages';
import {
  deleteSavedSearch,
  listSavedSearches,
  recordSavedSearchOpen,
  saveSavedSearch,
  searchDocuments,
} from '@/lib/api/search';
import {
  listApprovedEnterpriseDmsSearchRefiners,
  listApprovedEnterpriseDmsTaxonomies,
} from '@/lib/api/enterprise';
import { useI18n } from '@/lib/i18n';
import {
  hasSearchRefiner,
  searchRefinerFieldKeys,
  searchRefinerKeySet,
  type SearchRefinerKeySet,
} from '@/lib/search-refiners';
import { Button } from '@/components/ui/button';
import { getDashboardOverview } from '@/lib/api/dashboard';

const pageSize = 10;
type SearchSurface = 'results' | 'ai';
const searchSelectionStateKey = 'amicVaultSearchSelection';

function readSearchSelection(): string | null {
  if (typeof window === 'undefined') return null;
  const value = window.history.state?.[searchSelectionStateKey];
  return typeof value === 'string' ? value : null;
}

function rememberSearchSelection(value: string | null): void {
  if (typeof window === 'undefined') return;
  const nextState = { ...(window.history.state ?? {}) };
  if (value) nextState[searchSelectionStateKey] = value;
  else delete nextState[searchSelectionStateKey];
  window.history.replaceState(nextState, '');
}

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
  const [taxonomyCatalog, setTaxonomyCatalog] = useState<EnterpriseApprovedDmsTaxonomyDto[]>([]);
  const [refinerCatalog, setRefinerCatalog] = useState<EnterpriseApprovedDmsSearchRefinerDto[]>([]);
  const [surface, setSurface] = useState<SearchSurface>('results');
  const [savedSearchBusy, setSavedSearchBusy] = useState(false);
  const [savedSearchError, setSavedSearchError] = useState<string | null>(null);
  const [selectedResultKey, setSelectedResultKey] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<SearchResultDto | null>(null);
  const [recentFiles, setRecentFiles] = useState<SearchRecentFilesState>({ status: 'loading' });
  const railTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const saveTriggerRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const approvedRefinerKeys = useMemo(() => searchRefinerKeySet(refinerCatalog), [refinerCatalog]);
  const reusableSearchUrl = useMemo(
    () =>
      searchPrivacySettings.allowPlaintextReusableUrls
        ? urlForState(query, constrainSelection(selection, approvedRefinerKeys), 1)
        : privateSearchUrl(),
    [approvedRefinerKeys, query, searchPrivacySettings.allowPlaintextReusableUrls, selection],
  );
  const aiMatterContext = useMemo(
    () => matterContextForAi(selection, response),
    [response, selection],
  );
  const selectedResult = useMemo(
    () =>
      response?.results.find((result) => searchResultKey(result) === selectedResultKey) ?? null,
    [response, selectedResultKey],
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

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      listApprovedEnterpriseDmsTaxonomies(),
      listApprovedEnterpriseDmsSearchRefiners(),
    ]).then(([taxonomyResult, refinerResult]) => {
      if (!active) return;
      setTaxonomyCatalog(
        taxonomyResult.status === 'fulfilled' ? taxonomyResult.value.taxonomies : [],
      );
      setRefinerCatalog(refinerResult.status === 'fulfilled' ? refinerResult.value.refiners : []);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getDashboardOverview()
      .then((overview) => {
        if (!active) return;
        setRecentFiles(
          overview.recentFiles.length > 0
            ? { status: 'ready', items: overview.recentFiles }
            : { status: 'empty' },
        );
      })
      .catch(() => {
        if (active) setRecentFiles({ status: 'unavailable' });
      });
    return () => {
      active = false;
    };
  }, []);

  const runSearch = useCallback(
    async (
      nextQuery: string,
      nextSelection: SearchFacetSelection,
      nextPage: number,
      options: { preserveSelection?: boolean; replaceUrl?: string | null } = {},
    ) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) return;
      const restoredSelection = options.preserveSelection ? readSearchSelection() : null;
      const constrainedSelection = constrainSelection(nextSelection, approvedRefinerKeys);
      setBusy(true);
      setError(null);
      setQuery(trimmed);
      setSelection(constrainedSelection);
      setPage(nextPage);
      if (!options.preserveSelection) {
        setSelectedResultKey(null);
        rememberSearchSelection(null);
      }
      const replacementUrl =
        options.replaceUrl === undefined
          ? urlForPolicy(searchPrivacySettings, trimmed, constrainedSelection, nextPage)
          : options.replaceUrl;
      if (replacementUrl) router.replace(replacementUrl);
      try {
        const request = requestForState(
          trimmed,
          constrainedSelection,
          nextPage,
          approvedRefinerKeys,
        );
        const result = await searchDocuments(request);
        setResponse(result);
        if (options.preserveSelection) {
          const availableSelection = result.results.some(
            (item) => searchResultKey(item) === restoredSelection,
          )
            ? restoredSelection
            : null;
          setSelectedResultKey(availableSelection);
          rememberSearchSelection(availableSelection);
        }
      } catch (caught) {
        setResponse(null);
        setError(searchErrorKind(caught));
      } finally {
        setBusy(false);
      }
    },
    [approvedRefinerKeys, router, searchPrivacySettings],
  );

  const openSavedSearch = useCallback(
    async (savedSearch: SavedSearchDto) => {
      const nextQuery = savedSearch.query.query?.trim();
      if (!nextQuery) return;
      const nextSelection = constrainSelection(
        selectionFromSearchQuery(savedSearch.query),
        approvedRefinerKeys,
      );
      setBusy(true);
      setError(null);
      setQuery(nextQuery);
      setSelection(nextSelection);
      setPage(1);
      setSelectedResultKey(null);
      rememberSearchSelection(null);
      router.replace(
        searchPrivacySettings.urlMode === 'private_saved_ref'
          ? privateSearchUrl(savedSearch.savedSearchId)
          : urlForState(nextQuery, nextSelection, 1),
      );
      try {
        const opened = await recordSavedSearchOpen(savedSearch.savedSearchId);
        setSavedSearches((current) => sortSavedSearches(upsertSavedSearch(current, opened)));
        const result = await searchDocuments(
          requestForState(nextQuery, nextSelection, 1, approvedRefinerKeys),
        );
        setResponse(result);
      } catch (caught) {
        setResponse(null);
        setError(searchErrorKind(caught));
      } finally {
        setBusy(false);
      }
    },
    [approvedRefinerKeys, router, searchPrivacySettings.urlMode],
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
    const constrainedInitialSelection = constrainSelection(initial.selection, approvedRefinerKeys);
    const initialUrl = urlForState(initial.query, constrainedInitialSelection, initial.page);
    if (restoredUrl.current === initialUrl) return;
    restoredUrl.current = initialUrl;
    void runSearch(initial.query, constrainedInitialSelection, initial.page, {
      preserveSelection: true,
      replaceUrl: initialUrl,
    });
  }, [approvedRefinerKeys, initial, runSearch, searchPrivacySettings.allowPlaintextReusableUrls]);

  useEffect(() => {
    if (!initial.savedSearchId) return;
    if (restoredSavedSearchRef.current === initial.savedSearchId) return;
    const savedSearch = savedSearches.find((item) => item.savedSearchId === initial.savedSearchId);
    if (!savedSearch) return;
    restoredSavedSearchRef.current = initial.savedSearchId;
    void openSavedSearch(savedSearch);
  }, [initial.savedSearchId, openSavedSearch, savedSearches]);

  function applyFacets(next: SearchFacetSelection) {
    void runSearch(query, next, 1);
  }

  function selectResult(result: SearchResultDto) {
    const key = searchResultKey(result);
    setSelectedResultKey(key);
    rememberSearchSelection(key);
    setInspectorOpen(true);
  }

  function submitSearchBar(nextQuery: string) {
    if (surface === 'ai') {
      setQuery(nextQuery.trim());
      return;
    }
    void runSearch(nextQuery, selection, 1);
  }

  async function saveCurrentSearch(request: {
    matterId?: string;
    name: string;
    scope: SavedSearchDto['scope'];
  }) {
    if (!query.trim()) return;
    setSavedSearchBusy(true);
    setSavedSearchError(null);
    try {
      const saved = await saveSavedSearch({
        matterId: request.matterId,
        name: request.name,
        query: requestForState(query, selection, 1, approvedRefinerKeys),
        scope: request.scope,
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
    <main className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-normal">{t('search.title')}</h1>
        <SearchBar
          initialQuery={query}
          busy={busy}
          mode={selection.mode ?? 'keyword'}
          onModeChange={(nextMode) => {
            const nextSelection = { ...selection, mode: nextMode };
            if (query.trim()) {
              void runSearch(query, nextSelection, 1);
              return;
            }
            setSelection(nextSelection);
          }}
          onSearch={submitSearchBar}
        />
      </section>
      <SearchSurfaceTabs surface={surface} onChange={setSurface} />
      <SearchAdvancedControls
        approvedRefinerKeys={approvedRefinerKeys}
        busy={busy}
        taxonomyCatalog={taxonomyCatalog}
        selection={selection}
        onApply={(advanced) => runSearch(query, { ...selection, ...advanced }, 1)}
        onReset={() => runSearch(query, resetAdvancedSelection(selection), 1)}
      >
        <SearchFacets
          approvedRefinerKeys={approvedRefinerKeys}
          facets={response?.facets ?? emptyFacets}
          selection={selection}
          onChange={applyFacets}
        />
      </SearchAdvancedControls>
      {surface === 'results' ? (
        <>
          <SearchFilterSummary
            facets={response?.facets ?? emptyFacets}
            onReset={() => runSearch(query, resetAdvancedSelection(selection), 1)}
            selection={selection}
          />
          <DocumentWorkbenchShell
            inspector={
              <SearchResultInspector
                onOpen={() => rememberSearchSelection(selectedResultKey)}
                onPreview={setPreviewResult}
                previewTriggerRef={previewTriggerRef}
                result={selectedResult}
                target={selection.target ?? 'all'}
              />
            }
            mobileControls={
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setRailOpen(true)}
                  ref={railTriggerRef}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  검색 폴더
                </Button>
                <Button
                  disabled={!selectedResult}
                  onClick={() => setInspectorOpen(true)}
                  ref={inspectorTriggerRef}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  결과 정보
                </Button>
                <Button
                  onClick={() => setSaveOpen(true)}
                  ref={saveTriggerRef}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  현재 검색 저장
                </Button>
              </div>
            }
            rail={
              <SearchWorkbenchRail
                busy={busy || savedSearchBusy}
                onDelete={(savedSearchId) => void deleteCurrentSavedSearch(savedSearchId)}
                onOpen={(savedSearch) => void openSavedSearch(savedSearch)}
                onSave={() => setSaveOpen(true)}
                privacyMode={searchPrivacySettings.urlMode}
                recentFiles={recentFiles}
                savedSearchError={savedSearchError}
                savedSearches={savedSearches}
              />
            }
          >
            <SearchResults
              response={response}
              page={page}
              pageSize={pageSize}
              busy={busy}
              groupBy={selection.groupBy ?? 'none'}
              mode={selection.mode ?? 'keyword'}
              target={selection.target ?? 'all'}
              error={error}
              onPage={(nextPage) => runSearch(query, selection, nextPage)}
              onSelect={selectResult}
              selectedResultKey={selectedResultKey}
            />
          </DocumentWorkbenchShell>
          <DocumentWorkbenchDrawer
            onClose={() => setRailOpen(false)}
            open={railOpen}
            returnFocusRef={railTriggerRef}
            title="검색 폴더"
          >
            <SearchWorkbenchRail
              busy={busy || savedSearchBusy}
              onDelete={(savedSearchId) => void deleteCurrentSavedSearch(savedSearchId)}
              onOpen={(savedSearch) => {
                setRailOpen(false);
                void openSavedSearch(savedSearch);
              }}
              onSave={() => {
                setRailOpen(false);
                setSaveOpen(true);
              }}
              privacyMode={searchPrivacySettings.urlMode}
              recentFiles={recentFiles}
              savedSearchError={savedSearchError}
              savedSearches={savedSearches}
            />
          </DocumentWorkbenchDrawer>
          <DocumentWorkbenchDrawer
            onClose={() => setInspectorOpen(false)}
            open={inspectorOpen}
            returnFocusRef={inspectorTriggerRef}
            side="right"
            title="검색 결과 정보"
          >
            <SearchResultInspector
              onOpen={() => rememberSearchSelection(selectedResultKey)}
              onPreview={setPreviewResult}
              result={selectedResult}
              target={selection.target ?? 'all'}
            />
          </DocumentWorkbenchDrawer>
          <DocumentWorkbenchDrawer
            onClose={() => setSaveOpen(false)}
            open={saveOpen}
            returnFocusRef={saveTriggerRef}
            side="right"
            title="현재 검색 저장"
          >
            <SearchSavePanel
              busy={busy}
              onSaveSearch={(name) => void saveCurrentSearch(name)}
              privacyMode={searchPrivacySettings.urlMode}
              query={query}
              reusableUrl={reusableSearchUrl}
              savedSearchBusy={savedSearchBusy}
              savedSearchError={savedSearchError}
              selection={selection}
              showSavedList={false}
            />
          </DocumentWorkbenchDrawer>
          <DocumentWorkbenchDrawer
            onClose={() => setPreviewResult(null)}
            open={Boolean(previewResult)}
            returnFocusRef={previewTriggerRef}
            side="right"
            title="문서 미리보기"
          >
            {previewResult?.documentId ? (
              <div className="min-h-[65vh] overflow-hidden border bg-muted/20">
                <PreviewSessionFrame
                  documentId={previewResult.documentId}
                  key={previewResult.documentId}
                  title={previewResult.displayName || previewResult.title}
                />
              </div>
            ) : null}
          </DocumentWorkbenchDrawer>
        </>
      ) : (
        <AiAnswerPanel
          seedQuery={query}
          matterId={aiMatterContext.matterId}
          matterLabel={aiMatterContext.label}
        />
      )}
    </main>
  );
}

function SearchSurfaceTabs({
  onChange,
  surface,
}: {
  onChange: (surface: SearchSurface) => void;
  surface: SearchSurface;
}) {
  return (
    <div aria-label="검색 표면" className="flex w-fit rounded-md border bg-background p-0.5">
      <Button
        type="button"
        size="sm"
        variant={surface === 'results' ? 'default' : 'ghost'}
        aria-pressed={surface === 'results'}
        onClick={() => onChange('results')}
      >
        검색 결과
      </Button>
      <Button
        type="button"
        size="sm"
        variant={surface === 'ai' ? 'default' : 'ghost'}
        aria-pressed={surface === 'ai'}
        onClick={() => onChange('ai')}
      >
        AI에게 질문
      </Button>
    </div>
  );
}

const emptyFacets: SearchResponseDto['facets'] = {
  clients: [],
  matters: [],
  documentTypes: [],
  confidentialityLevels: [],
  extractionStatuses: [],
  emailRecipientDomains: [],
  emailSenderDomains: [],
  ocrConfidence: [],
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
    query: privacySettings.allowPlaintextReusableUrls ? (params.get('q') ?? '') : '',
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
    savedSearchId: parseSavedSearchRef(params.get('searchRef')),
    selection: {
      matterId: params.get('matterId') ?? undefined,
      clientId: params.get('clientId') ?? undefined,
      confidentialityLevel: parseConfidentialityLevel(params.get('confidentialityLevel')),
      documentType: parseDocumentType(params.get('documentType')),
      extractionStatus: parseExtractionStatus(params.get('extractionStatus')),
      ocrConfidence: parseOcrConfidence(params.get('ocrConfidence')),
      legalHold: parseLegalHold(params.get('legalHold')),
      recordsStatus: parseRecordsStatus(params.get('recordsStatus')),
      versionStatus: parseVersionStatus(params.get('versionStatus')),
      dateRange: parseDateRange(params.get('dateRange')),
      clientName: params.get('clientName') ?? undefined,
      groupBy: parseGroupBy(params.get('groupBy')),
      matterCode: params.get('matterCode') ?? undefined,
      matterName: params.get('matterName') ?? undefined,
      mode: parseMode(params.get('mode')),
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
  if (selection.ocrConfidence) params.set('ocrConfidence', selection.ocrConfidence);
  if (selection.legalHold) params.set('legalHold', selection.legalHold);
  if (selection.recordsStatus) params.set('recordsStatus', selection.recordsStatus);
  if (selection.versionStatus) params.set('versionStatus', selection.versionStatus);
  if (selection.dateRange) params.set('dateRange', selection.dateRange);
  if (selection.clientName) params.set('clientName', selection.clientName);
  if (selection.groupBy && selection.groupBy !== 'none') params.set('groupBy', selection.groupBy);
  if (selection.matterCode) params.set('matterCode', selection.matterCode);
  if (selection.matterName) params.set('matterName', selection.matterName);
  if (selection.mode && selection.mode !== 'keyword') params.set('mode', selection.mode);
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
  approvedRefinerKeys: SearchRefinerKeySet,
): SearchQueryDto {
  return {
    query: query.trim(),
    filters: filtersForSelection(selection, approvedRefinerKeys),
    page,
    pageSize,
    ...(selection.groupBy ? { groupBy: selection.groupBy } : {}),
    ...(selection.mode ? { mode: selection.mode } : {}),
    ...(selection.sortBy ? { sortBy: selection.sortBy } : {}),
    ...(selection.target ? { target: selection.target } : {}),
  };
}

function matterContextForAi(
  selection: SearchFacetSelection,
  response: SearchResponseDto | null,
): { matterId?: string; label?: string } {
  if (selection.matterId) return matterContext(selection.matterId, matterLabelFromSelection(selection));
  const results = response?.results ?? [];
  const matterIds = [...new Set(results.map((result) => result.matterId).filter(Boolean))];
  if (matterIds.length !== 1 || !matterIds[0]) return {};
  const result = results.find((item) => item.matterId === matterIds[0]);
  return matterContext(matterIds[0], result ? matterLabelFromResult(result) : undefined);
}

function matterContext(matterId: string, label?: string): { matterId: string; label?: string } {
  return label ? { matterId, label } : { matterId };
}

function matterLabelFromSelection(selection: SearchFacetSelection): string | undefined {
  const code = selection.matterCode?.trim();
  const name = selection.matterName?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || undefined;
}

function matterLabelFromResult(result: SearchResponseDto['results'][number]): string | undefined {
  const code = result.matterDisplayCode?.trim();
  const name = result.matterDisplayName?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || undefined;
}

function filtersForSelection(
  selection: SearchFacetSelection,
  approvedRefinerKeys: SearchRefinerKeySet,
): SearchFiltersDto {
  const filters: SearchFiltersDto = {};
  if (
    selection.matterId &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterId)
  ) {
    filters.matterId = selection.matterId;
  }
  if (
    selection.clientId &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientId)
  ) {
    filters.clientId = selection.clientId;
  }
  if (
    selection.clientName &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientName)
  ) {
    filters.clientName = selection.clientName;
  }
  if (
    selection.matterCode &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterCode)
  ) {
    filters.matterCode = selection.matterCode;
  }
  if (
    selection.matterName &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterName)
  ) {
    filters.matterName = selection.matterName;
  }
  if (selection.title && hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.title)) {
    filters.title = selection.title;
  }
  if (
    selection.confidentialityLevel &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.confidentialityLevel)
  ) {
    filters.confidentialityLevel =
      selection.confidentialityLevel as SearchFiltersDto['confidentialityLevel'];
  }
  if (
    selection.documentType &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.documentType)
  ) {
    filters.documentType = selection.documentType as SearchFiltersDto['documentType'];
  }
  if (
    selection.extractionStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.extractionStatus)
  ) {
    filters.extractionStatus = selection.extractionStatus as SearchFiltersDto['extractionStatus'];
  }
  if (
    selection.ocrConfidence &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.ocrConfidence)
  ) {
    filters.ocrConfidence = selection.ocrConfidence as SearchFiltersDto['ocrConfidence'];
  }
  if (
    selection.legalHold &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.legalHold)
  ) {
    filters.legalHold = selection.legalHold as SearchFiltersDto['legalHold'];
  }
  if (
    selection.privilegeStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.privilegeStatus)
  ) {
    filters.privilegeStatus = selection.privilegeStatus as SearchFiltersDto['privilegeStatus'];
  }
  if (
    selection.recordsStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.recordsStatus)
  ) {
    filters.recordsStatus = selection.recordsStatus as SearchFiltersDto['recordsStatus'];
  }
  if (
    selection.versionStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.versionStatus)
  ) {
    filters.versionStatus = selection.versionStatus as SearchFiltersDto['versionStatus'];
  }
  const dateRange = datesForRange(selection.dateRange);
  if (hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.dateRange)) {
    if (dateRange.dateFrom) filters.dateFrom = dateRange.dateFrom;
    if (dateRange.dateTo) filters.dateTo = dateRange.dateTo;
  }
  return filters;
}

function constrainSelection(
  selection: SearchFacetSelection,
  approvedRefinerKeys: SearchRefinerKeySet,
): SearchFacetSelection {
  return {
    ...selection,
    clientId: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientId)
      ? selection.clientId
      : undefined,
    clientName: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientName)
      ? selection.clientName
      : undefined,
    confidentialityLevel: hasSearchRefiner(
      approvedRefinerKeys,
      searchRefinerFieldKeys.confidentialityLevel,
    )
      ? selection.confidentialityLevel
      : undefined,
    dateRange: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.dateRange)
      ? selection.dateRange
      : undefined,
    documentType: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.documentType)
      ? selection.documentType
      : undefined,
    extractionStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.extractionStatus)
      ? selection.extractionStatus
      : undefined,
    ocrConfidence: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.ocrConfidence)
      ? selection.ocrConfidence
      : undefined,
    legalHold: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.legalHold)
      ? selection.legalHold
      : undefined,
    matterCode: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterCode)
      ? selection.matterCode
      : undefined,
    matterId: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterId)
      ? selection.matterId
      : undefined,
    matterName: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterName)
      ? selection.matterName
      : undefined,
    privilegeStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.privilegeStatus)
      ? selection.privilegeStatus
      : undefined,
    recordsStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.recordsStatus)
      ? selection.recordsStatus
      : undefined,
    title: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.title)
      ? selection.title
      : undefined,
    versionStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.versionStatus)
      ? selection.versionStatus
      : undefined,
  };
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
    ocrConfidence: filters?.ocrConfidence,
    groupBy: input.groupBy,
    legalHold: filters?.legalHold,
    matterCode: filters?.matterCode,
    matterId: filters?.matterId,
    matterName: filters?.matterName,
    mode: input.mode,
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
    mode: selection.mode,
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

function parseOcrConfidence(value: string | null): SearchFacetSelection['ocrConfidence'] {
  return value === 'ocr_low_confidence' ? value : undefined;
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
  return value === 'title' ||
    value === 'body' ||
    value === 'all' ||
    value === 'email' ||
    value === 'clause' ||
    value === 'authority'
    ? value
    : undefined;
}

function parseMode(value: string | null): SearchMode | undefined {
  return value === 'keyword' || value === 'semantic' || value === 'hybrid'
    ? value
    : undefined;
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

function upsertSavedSearch(current: SavedSearchDto[], next: SavedSearchDto): SavedSearchDto[] {
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
