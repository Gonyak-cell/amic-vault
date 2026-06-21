'use client';

import React from 'react';
import type {
  SearchDateRangeFacetDto,
  SearchFacetBucketDto,
  SearchFacetsDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { getTranslation, useI18n, type Language, type TranslationKey } from '@/lib/i18n';
import {
  hasSearchRefiner,
  searchRefinerFieldKeys,
  type SearchRefinerKeySet,
} from '@/lib/search-refiners';
import type { SearchAdvancedSelection } from './search-advanced-controls';

export interface SearchFacetSelection extends SearchAdvancedSelection {
  clientId?: string | undefined;
  matterId?: string | undefined;
}

interface SearchFacetsProps {
  approvedRefinerKeys?: SearchRefinerKeySet;
  facets: SearchFacetsDto;
  selection: SearchFacetSelection;
  onChange: (next: SearchFacetSelection) => void;
}

const emptySearchRefinerKeys: SearchRefinerKeySet = new Set();

export function SearchFacets({
  approvedRefinerKeys = emptySearchRefinerKeys,
  facets,
  selection,
  onChange,
}: SearchFacetsProps) {
  const { language, t } = useI18n();
  const allowed = (fieldKey: keyof typeof searchRefinerFieldKeys) =>
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys[fieldKey]);

  return (
    <aside className="flex flex-col gap-5 rounded-md border bg-card p-4">
      {allowed('documentType') ? (
        <FacetGroup
          title={t('search.facet.type')}
          buckets={facets.documentTypes}
          selected={selection.documentType}
          onSelect={(value) =>
            onChange({ ...selection, documentType: value as SearchFacetSelection['documentType'] })
          }
          language={language}
        />
      ) : null}
      {allowed('versionStatus') ? (
        <FacetGroup
          title={t('search.facet.version')}
          buckets={facets.versionStatuses}
          selected={selection.versionStatus}
          onSelect={(value) =>
            onChange({
              ...selection,
              versionStatus: value as SearchFacetSelection['versionStatus'],
            })
          }
          language={language}
        />
      ) : null}
      {allowed('confidentialityLevel') ? (
        <FacetGroup
          title={t('search.facet.confidentiality')}
          buckets={facets.confidentialityLevels}
          selected={selection.confidentialityLevel}
          onSelect={(value) =>
            onChange({
              ...selection,
              confidentialityLevel: value as SearchFacetSelection['confidentialityLevel'],
            })
          }
          language={language}
        />
      ) : null}
      {allowed('privilegeStatus') ? (
        <FacetGroup
          title={t('search.facet.privilege')}
          buckets={facets.privilegeStatuses}
          selected={selection.privilegeStatus}
          onSelect={(value) =>
            onChange({
              ...selection,
              privilegeStatus: value as SearchFacetSelection['privilegeStatus'],
            })
          }
          language={language}
        />
      ) : null}
      {allowed('extractionStatus') ? (
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
      ) : null}
      {allowed('legalHold') ? (
        <FacetGroup
          title={t('search.facet.legalHold')}
          buckets={facets.legalHolds}
          selected={selection.legalHold}
          onSelect={(value) =>
            onChange({
              ...selection,
              legalHold: value as SearchFacetSelection['legalHold'],
            })
          }
          language={language}
        />
      ) : null}
      {allowed('recordsStatus') ? (
        <FacetGroup
          title={t('search.facet.recordsStatus')}
          buckets={facets.recordsStatuses}
          selected={selection.recordsStatus}
          onSelect={(value) =>
            onChange({
              ...selection,
              recordsStatus: value as SearchFacetSelection['recordsStatus'],
            })
          }
          language={language}
        />
      ) : null}
      {allowed('matterId') ? (
        <FacetGroup
          title={t('search.facet.matter')}
          buckets={facets.matters}
          selected={selection.matterId}
          onSelect={(value) => onChange({ ...selection, matterId: value })}
          hideUndisplayableRefs
          language={language}
        />
      ) : null}
      {allowed('clientId') ? (
        <FacetGroup
          title={t('search.facet.client')}
          buckets={facets.clients}
          selected={selection.clientId}
          onSelect={(value) => onChange({ ...selection, clientId: value })}
          hideUndisplayableRefs
          language={language}
        />
      ) : null}
      {allowed('dateRange') ? (
        <FacetGroup
          title={t('search.facet.updated')}
          buckets={facets.dateRanges}
          selected={selection.dateRange}
          onSelect={(value) =>
            onChange({ ...selection, dateRange: value as SearchFacetSelection['dateRange'] })
          }
          language={language}
        />
      ) : null}
      {hasSelection(selection, approvedRefinerKeys) ? (
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

function labelForBucket(
  bucket: SearchFacetBucketDto | SearchDateRangeFacetDto,
  language: Language,
): string {
  const raw = 'label' in bucket && typeof bucket.label === 'string' ? bucket.label : bucket.value;
  const normalized = raw.trim().toLowerCase();
  const commonLabels: Record<string, TranslationKey> = {
    contract: 'search.facet.contract',
    memo: 'search.facet.memo',
    current: 'search.facet.current',
    superseded: 'search.facet.superseded',
    standard: 'search.facet.confidentialityStandard',
    high: 'search.facet.confidentialityHigh',
    restricted: 'search.facet.confidentialityRestricted',
    none: 'search.facet.privilegeNone',
    privileged: 'search.facet.privileged',
    work_product: 'search.facet.workProduct',
    joint_privilege: 'search.facet.jointPrivilege',
    ready: 'search.facet.extractionReady',
    pending: 'search.facet.extractionPending',
    ocr_pending: 'search.facet.extractionOcrPending',
    failed: 'search.facet.extractionFailed',
    document_hold: 'search.facet.documentHold',
    matter_hold: 'search.facet.matterHold',
    no_hold: 'search.facet.noHold',
    active: 'search.facet.recordsActive',
    archived: 'search.facet.recordsArchived',
    disposal_locked: 'search.facet.recordsDisposalLocked',
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

function hasSelection(
  selection: SearchFacetSelection,
  approvedRefinerKeys: SearchRefinerKeySet,
): boolean {
  return Boolean(
    (selection.clientId &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientId)) ||
    (selection.matterId &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterId)) ||
    (selection.confidentialityLevel &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.confidentialityLevel)) ||
    (selection.documentType &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.documentType)) ||
    (selection.extractionStatus &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.extractionStatus)) ||
    (selection.legalHold &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.legalHold)) ||
    (selection.privilegeStatus &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.privilegeStatus)) ||
    (selection.recordsStatus &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.recordsStatus)) ||
    (selection.versionStatus &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.versionStatus)) ||
    (selection.dateRange &&
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.dateRange)),
  );
}
