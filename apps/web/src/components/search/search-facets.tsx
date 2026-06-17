'use client';

import React from 'react';
import type {
  SearchDateRangeFacetDto,
  SearchFacetBucketDto,
  SearchFacetsDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { useI18n, type Language } from '@/lib/i18n';

export interface SearchFacetSelection {
  clientId?: string | undefined;
  matterId?: string | undefined;
  documentType?: string | undefined;
  versionStatus?: string | undefined;
  dateRange?: string | undefined;
}

interface SearchFacetsProps {
  facets: SearchFacetsDto;
  selection: SearchFacetSelection;
  onChange: (next: SearchFacetSelection) => void;
}

export function SearchFacets({ facets, selection, onChange }: SearchFacetsProps) {
  const { language } = useI18n();
  const copy = facetCopy[language];

  return (
    <aside className="flex flex-col gap-5 rounded-md border bg-card p-4">
      <FacetGroup
        title={copy.type}
        buckets={facets.documentTypes}
        selected={selection.documentType}
        onSelect={(value) => onChange({ ...selection, documentType: value })}
        language={language}
      />
      <FacetGroup
        title={copy.version}
        buckets={facets.versionStatuses}
        selected={selection.versionStatus}
        onSelect={(value) => onChange({ ...selection, versionStatus: value })}
        language={language}
      />
      <FacetGroup
        title={copy.matter}
        buckets={facets.matters}
        selected={selection.matterId}
        onSelect={(value) => onChange({ ...selection, matterId: value })}
        compact
        language={language}
      />
      <FacetGroup
        title={copy.client}
        buckets={facets.clients}
        selected={selection.clientId}
        onSelect={(value) => onChange({ ...selection, clientId: value })}
        compact
        language={language}
      />
      <FacetGroup
        title={copy.updated}
        buckets={facets.dateRanges}
        selected={selection.dateRange}
        onSelect={(value) => onChange({ ...selection, dateRange: value })}
        language={language}
      />
      {hasSelection(selection) ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({})}>
          {copy.clear}
        </Button>
      ) : null}
    </aside>
  );
}

const facetCopy = {
  ko: {
    type: '파일 유형',
    version: '버전 상태',
    matter: 'Matter',
    client: '고객',
    updated: '수정일',
    clear: '필터 초기화',
    unavailable: '표시 가능한 라벨 없음',
  },
  en: {
    type: 'File type',
    version: 'Version status',
    matter: 'Matter',
    client: 'Client',
    updated: 'Updated',
    clear: 'Clear filters',
    unavailable: 'No display label available',
  },
} as const;

function FacetGroup({
  title,
  buckets,
  selected,
  onSelect,
  compact = false,
  language,
}: {
  title: string;
  buckets: readonly (SearchFacetBucketDto | SearchDateRangeFacetDto)[];
  selected?: string | undefined;
  onSelect: (value: string | undefined) => void;
  compact?: boolean;
  language: Language;
}) {
  const visible = buckets.filter((bucket) => bucket.count > 0);
  if (visible.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h2>
      <div className="flex flex-col gap-1">
        {visible.map((bucket) => {
          const active = selected === bucket.value;
          return (
            <button
              key={bucket.value}
              type="button"
              className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-muted data-[active=true]:bg-muted data-[active=true]:text-foreground"
              aria-pressed={active}
              data-active={active ? 'true' : 'false'}
              onClick={() => onSelect(active ? undefined : bucket.value)}
            >
              <span className={compact ? 'truncate text-xs' : 'truncate'}>
                {labelForBucket(bucket, language)}
              </span>
              <span className="text-xs text-muted-foreground">{bucket.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function labelForBucket(bucket: SearchFacetBucketDto | SearchDateRangeFacetDto, language: Language): string {
  const raw = 'label' in bucket && typeof bucket.label === 'string' ? bucket.label : bucket.value;
  const normalized = raw.trim().toLowerCase();
  const commonLabels: Record<string, { ko: string; en: string }> = {
    contract: { ko: '계약서', en: 'Contract' },
    memo: { ko: '메모', en: 'Memo' },
    current: { ko: '최신 버전', en: 'Current' },
    superseded: { ko: '이전 버전', en: 'Superseded' },
    last_7_days: { ko: '최근 7일', en: 'Last 7 days' },
    'last 7 days': { ko: '최근 7일', en: 'Last 7 days' },
    last_30_days: { ko: '최근 30일', en: 'Last 30 days' },
    older: { ko: '30일 이전', en: 'Older' },
  };
  if (commonLabels[normalized]) return commonLabels[normalized][language];
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw)) {
    return facetCopy[language].unavailable;
  }
  return raw;
}

function hasSelection(selection: SearchFacetSelection): boolean {
  return Boolean(
    selection.clientId ||
      selection.matterId ||
      selection.documentType ||
      selection.versionStatus ||
      selection.dateRange,
  );
}
