'use client';

import * as React from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import type { MatterAppLookupResponseDto, MatterDto, MatterListDto } from '@amic-vault/shared';
import { lookupMatterAppMatters } from '@/lib/api-client';
import {
  filterMatterCodeOptions,
  isMatterAppSourceAvailable,
  isVaultInternalReferenceLike,
  matterAppSourceDescriptions,
  matterAppSourceLabels,
  matterAppSourceMode,
  toMatterCodeOption,
  type MatterAppSourceMode,
  type MatterCodeOption,
} from '@/lib/matter-app';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface MatterCodePickerProps {
  initialMatterCode?: string;
  selectedMatter: MatterCodeOption | null;
  onMatterSelected: (matter: MatterCodeOption | null) => void;
  sourceMode?: MatterAppSourceMode;
}

function mattersToOptions(
  response: MatterAppLookupResponseDto | MatterListDto,
  sourceMode: MatterAppSourceMode,
): MatterCodeOption[] {
  return response.items.map((matter) =>
    isMatterCodeOption(matter) ? matter : toMatterCodeOption(matter, sourceMode),
  );
}

function isMatterCodeOption(value: MatterCodeOption | MatterDto): value is MatterCodeOption {
  return 'matterReference' in value;
}

export function MatterCodePicker({
  initialMatterCode,
  onMatterSelected,
  selectedMatter,
  sourceMode,
}: MatterCodePickerProps) {
  const resolvedSourceMode = sourceMode ?? matterAppSourceMode();
  const rawInitialMatterCodeValue = initialMatterCode?.trim() ?? '';
  const initialMatterCodeValue = isVaultInternalReferenceLike(rawInitialMatterCodeValue)
    ? ''
    : rawInitialMatterCodeValue;
  const [query, setQuery] = React.useState(initialMatterCodeValue);
  const [rejectedInternalReference, setRejectedInternalReference] = React.useState(
    isVaultInternalReferenceLike(rawInitialMatterCodeValue),
  );
  const [options, setOptions] = React.useState<MatterCodeOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasLoadError, setHasLoadError] = React.useState(false);
  const [sourceUnavailable, setSourceUnavailable] = React.useState(false);
  const appliedInitialMatterCodeRef = React.useRef('');
  const sourceAvailable = isMatterAppSourceAvailable(resolvedSourceMode);

  React.useEffect(() => {
    if (isVaultInternalReferenceLike(rawInitialMatterCodeValue)) {
      setQuery('');
      setRejectedInternalReference(true);
      appliedInitialMatterCodeRef.current = '';
      onMatterSelected(null);
      return;
    }
    if (!rawInitialMatterCodeValue) {
      setRejectedInternalReference(false);
      return;
    }
    setRejectedInternalReference(false);
    setQuery(initialMatterCodeValue);
    appliedInitialMatterCodeRef.current = '';
  }, [initialMatterCodeValue, onMatterSelected, rawInitialMatterCodeValue]);

  React.useEffect(() => {
    if (!sourceAvailable) return;
    let active = true;
    setIsLoading(true);
    setHasLoadError(false);
    setSourceUnavailable(false);
    lookupMatterAppMatters({ q: query, pageSize: 50 })
      .then((response) => {
        if (!active) return;
        if (!response.lookupAvailable || !response.source.sourceAvailable) {
          setOptions([]);
          setSourceUnavailable(true);
          return;
        }
        setOptions(mattersToOptions(response, response.source.mode));
      })
      .catch(() => {
        if (active) setHasLoadError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, sourceAvailable]);

  React.useEffect(() => {
    if (
      !initialMatterCodeValue ||
      selectedMatter ||
      appliedInitialMatterCodeRef.current === initialMatterCodeValue
    ) {
      return;
    }
    const initialOption = findMatterCodeOption(options, initialMatterCodeValue);
    if (!initialOption) return;
    appliedInitialMatterCodeRef.current = initialMatterCodeValue;
    onMatterSelected(initialOption);
  }, [initialMatterCodeValue, onMatterSelected, options, selectedMatter]);

  if (!sourceAvailable || sourceUnavailable) {
    return (
      <EmptyState
        variant="api-unavailable"
        title="Matter app 연결 필요"
        description="Matter app에서 확인된 Matter Code를 선택한 뒤 작업을 진행합니다."
      />
    );
  }

  const filteredOptions = filterMatterCodeOptions(options, query).slice(0, 12);
  const sourceLabel = matterAppSourceLabels[resolvedSourceMode];
  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    if (isVaultInternalReferenceLike(nextQuery)) {
      setQuery('');
      setRejectedInternalReference(true);
      onMatterSelected(null);
      return;
    }
    setRejectedInternalReference(false);
    setQuery(nextQuery);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Matter Code 검색</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              value={query}
              placeholder="Matter Code, 이름 또는 고객 검색"
              onChange={handleQueryChange}
            />
          </span>
        </label>
        <div className="text-xs font-medium text-muted-foreground">{sourceLabel}</div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {matterAppSourceDescriptions[resolvedSourceMode]}
      </p>

      {rejectedInternalReference ? (
        <EmptyState
          variant="no-data"
          title="Matter Code 또는 이름으로 검색해 주세요."
          description="일반 문서 작업에서는 Vault 내부 참조를 사용할 수 없습니다."
        />
      ) : null}

      {hasLoadError ? (
        <EmptyState
          variant="api-error"
          title="Matter Code를 불러올 수 없습니다."
          description="권한 또는 Matter app 연결 상태를 확인해 주세요."
        />
      ) : null}

      {isLoading ? (
        <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Matter Code를 확인하는 중입니다.
        </div>
      ) : null}

      {!isLoading && !hasLoadError && !rejectedInternalReference ? (
        <div className="grid gap-2" role="listbox" aria-label="Matter Code 선택">
          {filteredOptions.map((option) => {
            const isSelected = selectedMatter?.matterReference === option.matterReference;
            const secondaryLabel = [option.matterName, option.clientDisplayName]
              .filter(Boolean)
              .join(' · ');
            return (
              <button
                className={cn(
                  'flex min-h-16 w-full items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected && 'border-primary bg-primary/5',
                )}
                key={option.matterReference}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onMatterSelected(option)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {option.matterCode}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {secondaryLabel}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {option.practiceGroup ? <span>{option.practiceGroup}</span> : null}
                  {isSelected ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
                </span>
              </button>
            );
          })}
          {filteredOptions.length === 0 ? (
            <EmptyState
              variant="no-data"
              title="선택 가능한 Matter Code가 없습니다."
              description="접근 권한이 있는 Matter만 표시됩니다."
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function findMatterCodeOption(
  options: readonly MatterCodeOption[],
  matterCode: string,
): MatterCodeOption | null {
  const normalizedMatterCode = matterCode.trim().toLocaleLowerCase();
  if (!normalizedMatterCode) return null;
  if (isVaultInternalReferenceLike(normalizedMatterCode)) return null;
  return (
    options.find((option) => option.matterCode.toLocaleLowerCase() === normalizedMatterCode) ?? null
  );
}

export { mattersToOptions };
