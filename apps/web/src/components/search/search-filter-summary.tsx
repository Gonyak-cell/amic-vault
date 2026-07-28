import React from 'react';
import type { SearchFacetsDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import type { SearchFacetSelection } from './search-facets';
import { searchPatternItems } from './search-save-panel';

export interface SearchFilterSummaryProps {
  facets: SearchFacetsDto;
  onReset: () => void;
  selection: SearchFacetSelection;
}

export function searchFilterSummaryItems(
  selection: SearchFacetSelection,
  facets: SearchFacetsDto,
): Array<{ label: string; value: string }> {
  const defaults = new Set(['검색어', '검색 방식']);
  const items = searchPatternItems('', selection).filter(
    (item) =>
      !defaults.has(item.label) &&
      !(item.label === '검색 범위' && item.value === '제목+본문') &&
      !(item.label === '정렬' && item.value === '관련도') &&
      !(item.label === '그룹' && item.value === '그룹 없음'),
  );
  if (selection.matterId) {
    items.push({
      label: 'Matter',
      value: facetLabel(facets.matters, selection.matterId) ?? '선택한 Matter',
    });
  }
  if (selection.clientId) {
    items.push({
      label: '고객',
      value: facetLabel(facets.clients, selection.clientId) ?? '선택한 고객',
    });
  }
  return items;
}

export function SearchFilterSummary({
  facets,
  onReset,
  selection,
}: SearchFilterSummaryProps) {
  const items = searchFilterSummaryItems(selection, facets);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3" aria-label="적용된 검색 조건">
      <span className="text-xs font-semibold text-muted-foreground">적용된 조건</span>
      {items.map((item) => (
        <span
          className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border bg-muted/30 px-2.5 text-xs"
          key={`${item.label}-${item.value}`}
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="max-w-48 truncate font-semibold">{item.value}</span>
        </span>
      ))}
      <Button onClick={onReset} size="sm" type="button" variant="ghost">
        모두 초기화
      </Button>
    </div>
  );
}

function facetLabel(
  buckets: SearchFacetsDto['matters'] | SearchFacetsDto['clients'],
  value: string,
): string | undefined {
  return buckets.find((bucket) => bucket.value === value)?.label?.trim() || undefined;
}
