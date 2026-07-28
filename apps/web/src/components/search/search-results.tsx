import React from 'react';
import type {
  SearchGroupBy,
  SearchMode,
  SearchResponseDto,
  SearchResultDto,
  SearchTarget,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { emptyStateVariantForUiErrorKind, type UiErrorKind } from '@/lib/api/error-messages';
import { formatSearchResultCount, useI18n, type TranslationKey } from '@/lib/i18n';
import { ResultCard } from './result-card';

export type SearchErrorKind = UiErrorKind;

interface SearchResultsProps {
  response: SearchResponseDto | null;
  page: number;
  pageSize: number;
  busy: boolean;
  groupBy?: SearchGroupBy;
  mode?: SearchMode;
  target?: SearchTarget;
  error: SearchErrorKind | null;
  onPage: (page: number) => void;
  onSelect?: (result: SearchResultDto) => void;
  selectedResultKey?: string | null;
}

export function SearchResults({
  response,
  page,
  pageSize,
  busy,
  error,
  groupBy = 'none',
  mode = 'keyword',
  target = 'all',
  onPage,
  onSelect,
  selectedResultKey,
}: SearchResultsProps) {
  const { language, t } = useI18n();

  if (error) {
    const variant = emptyStateVariantForUiErrorKind(error);
    return <EmptyState variant={variant} title={t(searchErrorKey(error))} />;
  }
  if (busy && !response) return <EmptyState variant="api-unavailable" title={t('search.loading')} />;
  if (!response) return <EmptyState variant="pre-search" title={t('search.start')} />;
  if (response.results.length === 0) return <EmptyState title={t('search.empty')} />;

  const totalPages = Math.max(1, Math.ceil(response.total / pageSize));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{formatSearchResultCount(response.total, language)}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || busy}
            onClick={() => onPage(page - 1)}
          >
            {t('search.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || busy}
            onClick={() => onPage(page + 1)}
          >
            {t('search.next')}
          </Button>
        </div>
      </div>
      <GroupedResults
        groupBy={groupBy}
        mode={mode}
        onSelect={onSelect}
        results={response.results}
        selectedResultKey={selectedResultKey}
        target={target}
      />
    </section>
  );
}

function GroupedResults({
  groupBy,
  mode,
  onSelect,
  results,
  selectedResultKey,
  target,
}: {
  groupBy: SearchGroupBy;
  mode: SearchMode;
  onSelect?: ((result: SearchResultDto) => void) | undefined;
  results: SearchResultDto[];
  selectedResultKey?: string | null | undefined;
  target: SearchTarget;
}) {
  if (groupBy === 'none') {
    return (
      <div className="flex flex-col gap-2" role="listbox" aria-label="검색 결과">
        {results.map((result) => (
          <ResultCard
            key={searchResultKey(result)}
            mode={mode}
            onSelect={onSelect}
            result={result}
            selected={selectedResultKey === searchResultKey(result)}
            target={target}
          />
        ))}
      </div>
    );
  }

  const groups = groupResults(results, groupBy);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase text-muted-foreground">{group.label}</h2>
          <div className="flex flex-col gap-2" role="listbox" aria-label={`${group.label} 검색 결과`}>
            {group.items.map((result) => (
              <ResultCard
                key={searchResultKey(result)}
                mode={mode}
                onSelect={onSelect}
                result={result}
                selected={selectedResultKey === searchResultKey(result)}
                target={target}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupResults(results: SearchResultDto[], groupBy: Exclude<SearchGroupBy, 'none'>) {
  const groups = new Map<string, SearchResultDto[]>();
  for (const result of results) {
    const label = groupLabel(result, groupBy);
    groups.set(label, [...(groups.get(label) ?? []), result]);
  }
  return [...groups.entries()].map(([label, items]) => ({ items, label }));
}

function groupLabel(result: SearchResultDto, groupBy: Exclude<SearchGroupBy, 'none'>): string {
  if (String(result.resultKind) === 'authority' || result.authorityId) return '판례·법령';
  if (groupBy === 'type') return result.documentType || '파일 유형 없음';
  if (groupBy === 'client') return result.clientDisplayName || '고객 표시명 없음';
  const code = result.matterDisplayCode?.trim();
  const name = result.matterDisplayName?.trim();
  if (code && name) return `${code} · ${name}`;
  if (code) return code;
  if (name) return name;
  return 'Matter 표시명 없음';
}

export function searchResultKey(result: SearchResultDto): string {
  if (result.authorityId) return `authority:${result.authorityId}`;
  return [
    result.resultKind ?? 'document',
    result.documentId ?? 'document',
    result.versionId ?? 'version',
    result.clauseId ?? 'result',
  ].join(':');
}

function searchErrorKey(error: SearchErrorKind): TranslationKey {
  return `search.${error}` as TranslationKey;
}
