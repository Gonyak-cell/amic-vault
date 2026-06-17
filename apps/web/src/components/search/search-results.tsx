'use client';

import React from 'react';
import type { SearchResponseDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n';
import { ResultCard } from './result-card';

export type SearchErrorKind = 'auth' | 'permission' | 'policy' | 'api';

interface SearchResultsProps {
  response: SearchResponseDto | null;
  page: number;
  pageSize: number;
  busy: boolean;
  error: SearchErrorKind | null;
  onPage: (page: number) => void;
}

export function SearchResults({ response, page, pageSize, busy, error, onPage }: SearchResultsProps) {
  const { language } = useI18n();
  const copy = language === 'ko'
    ? {
        loading: '검색 결과를 불러오는 중입니다.',
        start: '검색어를 입력하면 접근 권한이 있는 파일만 보여줍니다.',
        empty: '검색 결과가 없습니다.',
        auth: '로그인이 필요합니다.',
        permission: '이 항목을 볼 권한이 없습니다.',
        policy: '정보 차단 또는 권한 정책으로 표시할 수 없습니다.',
        api: '데이터를 표시할 수 없습니다.',
        results: (total: number) => `결과 ${total}개`,
        previous: '이전',
        next: '다음',
      }
    : {
        loading: 'Loading results.',
        start: 'Enter a search term to see files you can access.',
        empty: 'No results.',
        auth: 'Sign in required.',
        permission: 'You do not have permission to view this item.',
        policy: 'Information barrier or permission policy prevents display.',
        api: 'Unable to display data.',
        results: (total: number) => `${total} results`,
        previous: 'Previous',
        next: 'Next',
      };

  if (error) {
    const variant =
      error === 'permission' || error === 'auth'
        ? 'no-access'
        : error === 'policy'
          ? 'policy-blocked'
          : 'api-error';
    return <EmptyState variant={variant} title={copy[error]} />;
  }
  if (busy && !response) return <EmptyState variant="api-unavailable" title={copy.loading} />;
  if (!response) return <EmptyState variant="pre-search" title={copy.start} />;
  if (response.results.length === 0) return <EmptyState title={copy.empty} />;

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
