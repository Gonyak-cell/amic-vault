'use client';

import React from 'react';
import type { SearchResponseDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
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
  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (busy && !response) return <p className="text-sm text-muted-foreground">Loading</p>;
  if (!response) return <p className="text-sm text-muted-foreground">Enter a search term</p>;
  if (response.results.length === 0) return <p className="text-sm text-muted-foreground">No results</p>;

  const totalPages = Math.max(1, Math.ceil(response.total / pageSize));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{response.total} results</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || busy}
            onClick={() => onPage(page - 1)}
          >
            Previous
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
            Next
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
