'use client';

import React from 'react';
import type { SearchResponseDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { ResultCard } from './result-card';

interface SearchResultsProps {
  response: SearchResponseDto | null;
  page: number;
  pageSize: number;
  busy: boolean;
  error: string | null;
  onPage: (page: number) => void;
}

export function SearchResults({ response, page, pageSize, busy, error, onPage }: SearchResultsProps) {
  const { language } = useI18n();
  const copy = language === 'ko'
    ? {
        loading: '검색 결과를 불러오는 중입니다.',
        start: '검색어를 입력하면 접근 권한이 있는 파일만 보여줍니다.',
        empty: '검색 결과가 없습니다.',
        results: (total: number) => `결과 ${total}개`,
        previous: '이전',
        next: '다음',
      }
    : {
        loading: 'Loading results.',
        start: 'Enter a search term to see files you can access.',
        empty: 'No results.',
        results: (total: number) => `${total} results`,
        previous: 'Previous',
        next: 'Next',
      };

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (busy && !response) return <p className="text-sm text-muted-foreground">{copy.loading}</p>;
  if (!response) return <p className="text-sm text-muted-foreground">{copy.start}</p>;
  if (response.results.length === 0) return <p className="text-sm text-muted-foreground">{copy.empty}</p>;

  const totalPages = Math.max(1, Math.ceil(response.total / pageSize));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{copy.results(response.total)}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || busy}
            onClick={() => onPage(page - 1)}
          >
            {copy.previous}
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
            {copy.next}
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
