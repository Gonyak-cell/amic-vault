'use client';

import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { SearchGroupBy, SearchSort, SearchTarget } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';

export interface SearchAdvancedSelection {
  clientName?: string | undefined;
  groupBy?: SearchGroupBy | undefined;
  matterCode?: string | undefined;
  matterName?: string | undefined;
  sortBy?: SearchSort | undefined;
  target?: SearchTarget | undefined;
  title?: string | undefined;
}

interface SearchAdvancedControlsProps {
  busy: boolean;
  selection: SearchAdvancedSelection;
  onApply: (selection: SearchAdvancedSelection) => void;
  onReset: () => void;
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

function normalizeInput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedDraft(draft: Required<Pick<SearchAdvancedSelection, 'groupBy' | 'sortBy' | 'target'>> & {
  clientName: string;
  matterCode: string;
  matterName: string;
  title: string;
}): SearchAdvancedSelection {
  return {
    clientName: normalizeInput(draft.clientName),
    groupBy: draft.groupBy,
    matterCode: normalizeInput(draft.matterCode),
    matterName: normalizeInput(draft.matterName),
    sortBy: draft.sortBy,
    target: draft.target,
    title: normalizeInput(draft.title),
  };
}

function countAdvanced(selection: SearchAdvancedSelection): number {
  return [
    selection.clientName,
    selection.groupBy && selection.groupBy !== 'none' ? selection.groupBy : undefined,
    selection.matterCode,
    selection.matterName,
    selection.sortBy && selection.sortBy !== 'relevance' ? selection.sortBy : undefined,
    selection.target && selection.target !== 'all' ? selection.target : undefined,
    selection.title,
  ].filter(Boolean).length;
}

export function SearchAdvancedControls({
  busy,
  onApply,
  onReset,
  selection,
}: SearchAdvancedControlsProps) {
  const [draft, setDraft] = useState({
    clientName: selection.clientName ?? '',
    groupBy: selection.groupBy ?? 'none',
    matterCode: selection.matterCode ?? '',
    matterName: selection.matterName ?? '',
    sortBy: selection.sortBy ?? 'relevance',
    target: selection.target ?? 'all',
    title: selection.title ?? '',
  });

  useEffect(() => {
    setDraft({
      clientName: selection.clientName ?? '',
      groupBy: selection.groupBy ?? 'none',
      matterCode: selection.matterCode ?? '',
      matterName: selection.matterName ?? '',
      sortBy: selection.sortBy ?? 'relevance',
      target: selection.target ?? 'all',
      title: selection.title ?? '',
    });
  }, [selection]);

  const activeCount = countAdvanced(selection);

  return (
    <SectionCard
      icon={<SlidersHorizontal className="h-4 w-4" />}
      title="검색 필터"
      meta="권한 범위 내 결과"
      actions={activeCount > 0 ? <StatusBadge>{activeCount}</StatusBadge> : null}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">
          검색 범위
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.target}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                target: event.target.value as SearchTarget,
              }))
            }
          >
            {Object.entries(targetLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          정렬
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.sortBy}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sortBy: event.target.value as SearchSort,
              }))
            }
          >
            {Object.entries(sortLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          그룹
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.groupBy}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                groupBy: event.target.value as SearchGroupBy,
              }))
            }
          >
            {Object.entries(groupLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          제목 필터
          <Input
            value={draft.title}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Matter Code
          <Input
            value={draft.matterCode}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                matterCode: event.target.value,
              }))
            }
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          고객명
          <Input
            value={draft.clientName}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                clientName: event.target.value,
              }))
            }
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onApply(normalizedDraft(draft))} disabled={busy}>
          적용
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReset} disabled={busy}>
          <X className="h-4 w-4" />
          초기화
        </Button>
      </div>
    </SectionCard>
  );
}
