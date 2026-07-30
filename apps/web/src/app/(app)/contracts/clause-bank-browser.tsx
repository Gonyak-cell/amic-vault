'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import type {
  ClauseBankEntryDto,
  ClauseBankEntryStatus,
  ClauseSearchResultDto,
} from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { maskInternalReference } from '@/components/security/secure-ref';
import {
  listClauseBankEntries,
  searchSimilarClauses,
  updateClauseBankEntry,
} from '@/lib/api/contract-intel';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

type EntryFilter = ClauseBankEntryStatus | 'all';
type PageState =
  | { status: 'loading' }
  | { status: 'ready'; entries: ClauseBankEntryDto[] }
  | { status: 'error'; message: string };
type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; results: ClauseSearchResultDto[] }
  | { status: 'error'; message: string };

const statusFilters: Array<{ value: EntryFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'draft', label: '승인 대기' },
  { value: 'approved', label: '승인됨' },
  { value: 'deprecated', label: '폐기됨' },
];

export function ClauseBankBrowser() {
  const [filter, setFilter] = useState<EntryFilter>('draft');
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      ...(filter === 'all' ? {} : { status: filter }),
      limit: 50,
    }),
    [filter],
  );

  const loadEntries = useCallback(() => {
    setState({ status: 'loading' });
    listClauseBankEntries(query)
      .then((response) => {
        setState({ status: 'ready', entries: response.entries });
      })
      .catch((caught) => {
        setState({ status: 'error', message: safeApiErrorMessage(caught) });
      });
  }, [query]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const approveEntry = useCallback(
    async (entryId: string) => {
      setBusyEntryId(entryId);
      try {
        await updateClauseBankEntry(entryId, { status: 'approved' });
        loadEntries();
      } catch (caught) {
        setState({ status: 'error', message: safeApiErrorMessage(caught) });
      } finally {
        setBusyEntryId(null);
      }
    },
    [loadEntries],
  );

  return (
    <PageShell>
      <PageHeader breadcrumbs={['문서 보관', '계약']} title="조항 라이브러리" />

      <SectionCard
        title="조항 라이브러리 항목"
        meta="본문은 저장하지 않고 원문 조항의 참조 정보와 해시만 표시합니다."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">상태</span>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={filter}
              onChange={(event) => setFilter(event.target.value as EntryFilter)}
            >
              {statusFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {state.status === 'loading' ? (
          <EmptyState variant="api-unavailable" title="조항 라이브러리를 불러오는 중입니다." />
        ) : null}
        {state.status === 'error' ? (
          <EmptyState
            variant="api-error"
            title="조항 라이브러리를 표시할 수 없습니다."
            description={state.message}
          />
        ) : null}
        {state.status === 'ready' ? (
          <ClauseBankTable
            entries={state.entries}
            busyEntryId={busyEntryId}
            onApprove={approveEntry}
          />
        ) : null}
      </SectionCard>

      <ClauseSearchPanel />
    </PageShell>
  );
}

export function ClauseSearchPanel() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  const runSearch = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (trimmed.length < 2) return;
      setState({ status: 'loading' });
      try {
        const response = await searchSimilarClauses({ query: trimmed, limit: 10 });
        setState({ status: 'ready', results: response.results });
      } catch (caught) {
        setState({ status: 'error', message: safeApiErrorMessage(caught) });
      }
    },
    [query],
  );

  return (
    <SectionCard
      title="유사 조항"
      meta="권한 범위 안의 승인 조항과 계약 조항을 의미 기준으로 검색합니다."
      actions={
        <form className="flex min-w-[320px] items-center gap-2" onSubmit={runSearch}>
          <input
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="손해배상 책임 상한"
          />
          <Button
            type="submit"
            size="sm"
            disabled={state.status === 'loading' || query.trim().length < 2}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            검색
          </Button>
        </form>
      }
    >
      {state.status === 'idle' ? <EmptyState title="검색어를 입력하세요." /> : null}
      {state.status === 'loading' ? (
        <EmptyState variant="api-unavailable" title="유사 조항을 검색하는 중입니다." />
      ) : null}
      {state.status === 'error' ? (
        <EmptyState
          variant="api-error"
          title="유사 조항을 표시할 수 없습니다."
          description={state.message}
        />
      ) : null}
      {state.status === 'ready' ? <ClauseSearchResults results={state.results} /> : null}
    </SectionCard>
  );
}

export function ClauseSearchResults({ results }: { results: ClauseSearchResultDto[] }) {
  if (results.length === 0) {
    return <EmptyState title="검색 결과가 없습니다." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="sr-only">유사 조항 검색 결과</caption>
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <TableHeader>유사도</TableHeader>
            <TableHeader>유형</TableHeader>
            <TableHeader>조항</TableHeader>
            <TableHeader>태그</TableHeader>
            <TableHeader>출처</TableHeader>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.clauseId} className="border-t">
              <TableCell>{result.score.toFixed(3)}</TableCell>
              <TableCell>{clauseKindLabel(result.clauseKind)}</TableCell>
              <TableCell className="font-medium">{result.clauseNumber}</TableCell>
              <TableCell>
                {result.tags.length > 0 ? result.tags.map(clauseTagLabel).join(', ') : '-'}
              </TableCell>
              <TableCell>
                {maskInternalReference(result.approved ? result.citationRef : result.clauseId)}
              </TableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClauseBankTable({
  busyEntryId,
  entries,
  onApprove,
}: {
  busyEntryId: string | null;
  entries: ClauseBankEntryDto[];
  onApprove: (entryId: string) => Promise<void>;
}) {
  if (entries.length === 0) {
    return <EmptyState title="표시할 조항 라이브러리 항목이 없습니다." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <caption className="sr-only">전사 조항 라이브러리 목록</caption>
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <TableHeader>상태</TableHeader>
            <TableHeader>유형</TableHeader>
            <TableHeader>조항</TableHeader>
            <TableHeader>태그</TableHeader>
            <TableHeader>출처</TableHeader>
            <TableHeader>수정일</TableHeader>
            <TableHeader>작업</TableHeader>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.entryId} className="border-t">
              <TableCell>
                <StatusBadge tone={entryStatusTone(entry.status)}>
                  {entryStatusLabel(entry.status)}
                </StatusBadge>
              </TableCell>
              <TableCell>{clauseKindLabel(entry.clauseKind)}</TableCell>
              <TableCell className="font-medium">{entry.clauseNumber}</TableCell>
              <TableCell>
                {entry.tags.length > 0 ? entry.tags.map(clauseTagLabel).join(', ') : '-'}
              </TableCell>
              <TableCell>
                {entry.sourceAccessible ? maskInternalReference(entry.citationRef) : '권한 제한'}
              </TableCell>
              <TableCell>{formatDate(entry.updatedAt)}</TableCell>
              <TableCell>
                {entry.status === 'draft' ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyEntryId === entry.entryId}
                    onClick={() => void onApprove(entry.entryId)}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    승인
                  </Button>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-semibold">{children}</th>;
}

function TableCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function entryStatusTone(status: ClauseBankEntryStatus): StatusBadgeTone {
  if (status === 'approved') return 'success';
  if (status === 'deprecated') return 'blocked';
  return 'warning';
}

function entryStatusLabel(status: ClauseBankEntryStatus): string {
  if (status === 'approved') return '승인됨';
  if (status === 'deprecated') return '폐기됨';
  return '승인 대기';
}

function clauseKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    article: '조',
    clause: '조항',
    paragraph: '항',
    section: '절',
    sentence: '문장',
  };
  return labels[kind] ?? '기타';
}

function clauseTagLabel(tag: string): string {
  const labels: Record<string, string> = {
    governing_law: '준거법',
    liability_cap: '책임 한도',
  };
  return labels[tag] ?? tag.replaceAll('_', ' ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
