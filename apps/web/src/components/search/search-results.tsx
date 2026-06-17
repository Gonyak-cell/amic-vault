'use client';

import React from 'react';
import type { SearchResponseDto } from '@amic-vault/shared';
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
  error: SearchErrorKind | null;
  onPage: (page: number) => void;
}

export function SearchResults({ response, page, pageSize, busy, error, onPage }: SearchResultsProps) {
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
      <div className="flex flex-col gap-3">
        {response.results.map((result) => (
          <ResultCard key={result.versionId} result={result} />
        ))}
      </div>
    </section>
  );
}

function searchErrorKey(error: SearchErrorKind): TranslationKey {
  return `search.${error}` as TranslationKey;
}
