'use client';

import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  documentTypes,
  searchVersionStatusValues,
  type DocumentType,
  type SearchGroupBy,
  type SearchSort,
  type SearchTarget,
  type SearchVersionStatus,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';

export type SearchDateRange = 'last_7_days' | 'last_30_days' | 'older';

export interface SearchAdvancedSelection {
  clientName?: string | undefined;
  dateRange?: SearchDateRange | undefined;
  documentType?: DocumentType | undefined;
  groupBy?: SearchGroupBy | undefined;
  matterCode?: string | undefined;
  matterName?: string | undefined;
  sortBy?: SearchSort | undefined;
  target?: SearchTarget | undefined;
  title?: string | undefined;
  versionStatus?: SearchVersionStatus | undefined;
}

interface SearchAdvancedControlsProps {
  busy: boolean;
  selection: SearchAdvancedSelection;
  onApply: (selection: SearchAdvancedSelection) => void;
  onReset: () => void;
}

type SearchAdvancedDraft = Required<
  Pick<SearchAdvancedSelection, 'groupBy' | 'sortBy' | 'target'>
> & {
  clientName: string;
  dateRange: SearchDateRange | '';
  documentType: DocumentType | '';
  matterCode: string;
  matterName: string;
  title: string;
  versionStatus: SearchVersionStatus | '';
};

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

const documentTypeLabels = {
  contract: '계약서',
  memo: '메모',
  opinion: '의견서',
  court_filing: '법원 제출 문서',
  evidence: '증거',
  correspondence: '서신',
  corporate_record: '회사 기록',
  financial: '재무',
  other: '기타',
} as const satisfies Record<DocumentType, string>;

const versionStatusLabels = {
  current: '현재 버전',
  superseded: '이전 버전',
  all: '전체 버전',
} as const satisfies Record<SearchVersionStatus, string>;

const dateRangeLabels = {
  last_7_days: '최근 7일',
  last_30_days: '최근 30일',
  older: '30일 이전',
} as const satisfies Record<SearchDateRange, string>;

function normalizeInput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedDraft(draft: SearchAdvancedDraft): SearchAdvancedSelection {
  return {
    clientName: normalizeInput(draft.clientName),
    dateRange: draft.dateRange || undefined,
    documentType: draft.documentType || undefined,
    groupBy: draft.groupBy,
    matterCode: normalizeInput(draft.matterCode),
    matterName: normalizeInput(draft.matterName),
    sortBy: draft.sortBy,
    target: draft.target,
    title: normalizeInput(draft.title),
    versionStatus: draft.versionStatus || undefined,
  };
}

function countAdvanced(selection: SearchAdvancedSelection): number {
  return [
    selection.clientName,
    selection.dateRange,
    selection.documentType,
    selection.groupBy && selection.groupBy !== 'none' ? selection.groupBy : undefined,
    selection.matterCode,
    selection.matterName,
    selection.sortBy && selection.sortBy !== 'relevance' ? selection.sortBy : undefined,
    selection.target && selection.target !== 'all' ? selection.target : undefined,
    selection.title,
    selection.versionStatus,
  ].filter(Boolean).length;
}

export function SearchAdvancedControls({
  busy,
  onApply,
  onReset,
  selection,
}: SearchAdvancedControlsProps) {
  const [draft, setDraft] = useState<SearchAdvancedDraft>({
    clientName: selection.clientName ?? '',
    dateRange: selection.dateRange ?? '',
    documentType: selection.documentType ?? '',
    groupBy: selection.groupBy ?? 'none',
    matterCode: selection.matterCode ?? '',
    matterName: selection.matterName ?? '',
    sortBy: selection.sortBy ?? 'relevance',
    target: selection.target ?? 'all',
    title: selection.title ?? '',
    versionStatus: selection.versionStatus ?? '',
  });

  useEffect(() => {
    setDraft({
      clientName: selection.clientName ?? '',
      dateRange: selection.dateRange ?? '',
      documentType: selection.documentType ?? '',
      groupBy: selection.groupBy ?? 'none',
      matterCode: selection.matterCode ?? '',
      matterName: selection.matterName ?? '',
      sortBy: selection.sortBy ?? 'relevance',
      target: selection.target ?? 'all',
      title: selection.title ?? '',
      versionStatus: selection.versionStatus ?? '',
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
      <div className="grid gap-3 md:grid-cols-4">
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
          문서 유형
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.documentType}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                documentType: event.target.value as DocumentType | '',
              }))
            }
          >
            <option value="">전체</option>
            {documentTypes.map((type) => (
              <option key={type} value={type}>
                {documentTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          버전 상태
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.versionStatus}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                versionStatus: event.target.value as SearchVersionStatus | '',
              }))
            }
          >
            <option value="">현재 버전 기본</option>
            {searchVersionStatusValues.map((status) => (
              <option key={status} value={status}>
                {versionStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          수정 기간
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.dateRange}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                dateRange: event.target.value as SearchDateRange | '',
              }))
            }
          >
            <option value="">전체 기간</option>
            {Object.entries(dateRangeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          제목
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
          Matter 이름
          <Input
            value={draft.matterName}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                matterName: event.target.value,
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
