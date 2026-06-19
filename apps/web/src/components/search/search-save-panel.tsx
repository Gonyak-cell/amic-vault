'use client';

import React from 'react';
import { Bookmark, Copy, Save } from 'lucide-react';
import type { SearchGroupBy, SearchSort, SearchTarget } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { SearchFacetSelection } from './search-facets';

export interface SearchSavePanelProps {
  busy: boolean;
  query: string;
  selection: SearchFacetSelection;
  reusableUrl: string;
}

interface SearchPatternItem {
  label: string;
  value: string;
}

const targetLabels = {
  all: '제목+본문',
  title: '제목',
  body: '본문',
} as const satisfies Record<SearchTarget, string>;

const sortLabels = {
  relevance: '관련도',
  updated_desc: '최근 수정',
  updated_asc: '오래된 수정',
  title_asc: '제목',
  matter_asc: 'Matter',
  type_asc: '파일 유형',
} as const satisfies Record<SearchSort, string>;

const groupLabels = {
  none: '그룹 없음',
  matter: 'Matter',
  client: '고객',
  type: '파일 유형',
} as const satisfies Record<SearchGroupBy, string>;

const dateRangeLabels = {
  last_7_days: '최근 7일',
  last_30_days: '최근 30일',
  older: '30일 이전',
} as const;

export function SearchSavePanel({
  busy,
  query,
  reusableUrl,
  selection,
}: SearchSavePanelProps) {
  const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');
  const items = searchPatternItems(query, selection);
  const hasReusableSearch = query.trim().length > 0;

  async function copyReusableUrl() {
    if (!hasReusableSearch || busy) return;
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(reusableUrl);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  return (
    <SectionCard
      icon={<Bookmark className="h-4 w-4" />}
      title="검색 저장 준비"
      meta="현재 조건 재사용"
      actions={<StatusBadge tone={hasReusableSearch ? 'neutral' : 'warning'}>API 준비 전</StatusBadge>}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          {hasReusableSearch ? (
            <>
              <p className="text-sm font-medium text-foreground">현재 검색 조건</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <div key={item.label} className="rounded-md border bg-background px-3 py-2">
                    <dt className="text-[11px] font-medium text-muted-foreground">{item.label}</dt>
                    <dd className="mt-1 truncate text-[13px] font-semibold text-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 break-all rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {reusableUrl}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              검색어를 입력하면 현재 조건을 다시 열 수 있는 링크가 표시됩니다.
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            저장된 검색 목록과 검색 폴더는 영구 저장 API가 승인된 뒤 활성화됩니다. 지금은 임시 저장
            상태를 만들지 않고 현재 검색 URL만 재사용합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:flex-col">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasReusableSearch || busy}
            onClick={copyReusableUrl}
          >
            <Copy className="h-4 w-4" />
            링크 복사
          </Button>
          <Button type="button" variant="outline" size="sm" disabled>
            <Save className="h-4 w-4" />
            저장된 검색
          </Button>
          {copyStatus === 'copied' ? (
            <p className="text-xs font-medium text-primary" role="status">
              링크를 복사했습니다.
            </p>
          ) : null}
          {copyStatus === 'error' ? (
            <p className="text-xs font-medium text-destructive" role="alert">
              브라우저에서 링크 복사를 허용하지 않았습니다.
            </p>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

export function searchPatternItems(
  query: string,
  selection: SearchFacetSelection,
): SearchPatternItem[] {
  const items: SearchPatternItem[] = [{ label: '검색어', value: query.trim() || '입력 전' }];
  items.push({ label: '검색 범위', value: targetLabels[selection.target ?? 'all'] });
  items.push({ label: '정렬', value: sortLabels[selection.sortBy ?? 'relevance'] });
  items.push({ label: '그룹', value: groupLabels[selection.groupBy ?? 'none'] });
  if (selection.title) items.push({ label: '제목', value: selection.title });
  if (selection.matterCode) items.push({ label: 'Matter Code', value: selection.matterCode });
  if (selection.matterName) items.push({ label: 'Matter 이름', value: selection.matterName });
  if (selection.clientName) items.push({ label: '고객명', value: selection.clientName });
  if (selection.documentType) items.push({ label: '문서 유형', value: selection.documentType });
  if (selection.versionStatus) items.push({ label: '버전 상태', value: selection.versionStatus });
  if (selection.dateRange) items.push({ label: '수정 기간', value: dateRangeLabels[selection.dateRange] });
  return items;
}
