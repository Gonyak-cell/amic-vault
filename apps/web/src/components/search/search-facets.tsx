'use client';

import React from 'react';
import type {
  SearchDateRangeFacetDto,
  SearchFacetBucketDto,
  SearchFacetsDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';

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
  return (
    <aside className="flex flex-col gap-5 rounded-md border bg-card p-4">
      <FacetGroup
        title="Type"
        buckets={facets.documentTypes}
        selected={selection.documentType}
        onSelect={(value) => onChange({ ...selection, documentType: value })}
      />
      <FacetGroup
        title="Version"
        buckets={facets.versionStatuses}
        selected={selection.versionStatus}
        onSelect={(value) => onChange({ ...selection, versionStatus: value })}
      />
      <FacetGroup
        title="Matter"
        buckets={facets.matters}
        selected={selection.matterId}
        onSelect={(value) => onChange({ ...selection, matterId: value })}
        compact
      />
      <FacetGroup
        title="Client"
        buckets={facets.clients}
        selected={selection.clientId}
        onSelect={(value) => onChange({ ...selection, clientId: value })}
        compact
      />
      <FacetGroup
        title="Updated"
        buckets={facets.dateRanges}
        selected={selection.dateRange}
        onSelect={(value) => onChange({ ...selection, dateRange: value })}
      />
      {hasSelection(selection) ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({})}>
          Clear
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
  compact = false,
}: {
  title: string;
  buckets: readonly (SearchFacetBucketDto | SearchDateRangeFacetDto)[];
  selected?: string | undefined;
  onSelect: (value: string | undefined) => void;
  compact?: boolean;
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
              <span className={compact ? 'truncate font-mono text-xs' : 'truncate'}>
                {labelForBucket(bucket)}
              </span>
              <span className="text-xs text-muted-foreground">{bucket.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function labelForBucket(bucket: SearchFacetBucketDto | SearchDateRangeFacetDto): string {
  if ('label' in bucket && typeof bucket.label === 'string') return bucket.label;
  return bucket.value;
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
