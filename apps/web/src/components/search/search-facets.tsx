'use client';

import React from 'react';
import type {
  SearchDateRangeFacetDto,
  SearchFacetBucketDto,
  SearchFacetsDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { getTranslation, useI18n, type Language, type TranslationKey } from '@/lib/i18n';
import type { SearchAdvancedSelection } from './search-advanced-controls';

export interface SearchFacetSelection extends SearchAdvancedSelection {
  clientId?: string | undefined;
  matterId?: string | undefined;
}

interface SearchFacetsProps {
  facets: SearchFacetsDto;
  selection: SearchFacetSelection;
  onChange: (next: SearchFacetSelection) => void;
}

export function SearchFacets({ facets, selection, onChange }: SearchFacetsProps) {
  const { language, t } = useI18n();

  return (
    <aside className="flex flex-col gap-5 rounded-md border bg-card p-4">
      <FacetGroup
        title={t('search.facet.type')}
        buckets={facets.documentTypes}
        selected={selection.documentType}
        onSelect={(value) =>
          onChange({ ...selection, documentType: value as SearchFacetSelection['documentType'] })
        }
        language={language}
      />
      <FacetGroup
        title={t('search.facet.version')}
        buckets={facets.versionStatuses}
        selected={selection.versionStatus}
        onSelect={(value) =>
          onChange({ ...selection, versionStatus: value as SearchFacetSelection['versionStatus'] })
        }
        language={language}
      />
      <FacetGroup
        title={t('search.facet.searchability')}
        buckets={facets.extractionStatuses}
        selected={selection.extractionStatus}
        onSelect={(value) =>
          onChange({
            ...selection,
            extractionStatus: value as SearchFacetSelection['extractionStatus'],
          })
        }
        language={language}
      />
      <FacetGroup
        title={t('search.facet.matter')}
        buckets={facets.matters}
        selected={selection.matterId}
        onSelect={(value) => onChange({ ...selection, matterId: value })}
        hideUndisplayableRefs
        language={language}
      />
      <FacetGroup
        title={t('search.facet.client')}
        buckets={facets.clients}
        selected={selection.clientId}
        onSelect={(value) => onChange({ ...selection, clientId: value })}
        hideUndisplayableRefs
        language={language}
      />
      <FacetGroup
        title={t('search.facet.updated')}
        buckets={facets.dateRanges}
        selected={selection.dateRange}
        onSelect={(value) =>
          onChange({ ...selection, dateRange: value as SearchFacetSelection['dateRange'] })
        }
        language={language}
      />
      {hasSelection(selection) ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({})}>
          {t('search.facet.clear')}
        </Button>
      ) : null}
    </aside>
  );
}

function FacetGroup({
  title,
  buckets,
  selected,
  onSelect,
  hideUndisplayableRefs = false,
  language,
}: {
  title: string;
  buckets: readonly (SearchFacetBucketDto | SearchDateRangeFacetDto)[];
  selected?: string | undefined;
  onSelect: (value: string | undefined) => void;
  hideUndisplayableRefs?: boolean;
  language: Language;
}) {
  const visible = buckets.filter(
    (bucket) => bucket.count > 0 && (!hideUndisplayableRefs || hasDisplayableLabel(bucket)),
  );
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
              <span className="truncate">{labelForBucket(bucket, language)}</span>
              <span className="text-xs text-muted-foreground">{bucket.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function hasDisplayableLabel(bucket: SearchFacetBucketDto | SearchDateRangeFacetDto): boolean {
  const raw = 'label' in bucket && typeof bucket.label === 'string' ? bucket.label : bucket.value;
  return !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw.trim());
}

function labelForBucket(bucket: SearchFacetBucketDto | SearchDateRangeFacetDto, language: Language): string {
  const raw = 'label' in bucket && typeof bucket.label === 'string' ? bucket.label : bucket.value;
  const normalized = raw.trim().toLowerCase();
  const commonLabels: Record<string, TranslationKey> = {
    contract: 'search.facet.contract',
    memo: 'search.facet.memo',
    current: 'search.facet.current',
    superseded: 'search.facet.superseded',
    ready: 'search.facet.extractionReady',
    pending: 'search.facet.extractionPending',
    ocr_pending: 'search.facet.extractionOcrPending',
    failed: 'search.facet.extractionFailed',
    last_7_days: 'search.facet.last7Days',
    'last 7 days': 'search.facet.last7Days',
    last_30_days: 'search.facet.last30Days',
    older: 'search.facet.older',
  };
  if (commonLabels[normalized]) return getTranslation(commonLabels[normalized], language);
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw)) {
    return getTranslation('search.facet.unavailable', language);
  }
  return raw;
}

function hasSelection(selection: SearchFacetSelection): boolean {
  return Boolean(
    selection.clientId ||
      selection.matterId ||
      selection.documentType ||
      selection.extractionStatus ||
      selection.versionStatus ||
      selection.dateRange,
  );
}
