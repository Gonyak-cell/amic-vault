'use client';

import * as React from 'react';
import { Check, Loader2, Search, UserRound, UsersRound } from 'lucide-react';
import type {
  OrgDirectoryPurpose,
  OrgDirectorySubjectDto,
  OrgDirectorySubjectFilter,
} from '@amic-vault/shared';
import { searchOrgDirectorySubjects } from '@/lib/api/org-directory';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';

const subjectTypeLabels = {
  group: '그룹',
  user: '사용자',
} as const satisfies Record<OrgDirectorySubjectDto['subjectType'], string>;

const groupTypeLabels = {
  custom: '사용자 지정',
  practice_group: 'Practice Group',
  team: '팀',
} as const satisfies Record<NonNullable<OrgDirectorySubjectDto['groupType']>, string>;

export interface OrgSubjectPickerProps {
  matterId?: string;
  onSubjectSelected: (subject: OrgDirectorySubjectDto) => void;
  purpose: OrgDirectoryPurpose;
  selectedSubject?: OrgDirectorySubjectDto | null;
  subjectType?: OrgDirectorySubjectFilter;
}

interface OrgSubjectPickerContentProps {
  hasLoadError?: boolean;
  isLoading?: boolean;
  items: readonly OrgDirectorySubjectDto[];
  onSubjectSelected: (subject: OrgDirectorySubjectDto) => void;
  query: string;
  selectedSubject?: OrgDirectorySubjectDto | null | undefined;
}

function secondaryLabel(subject: OrgDirectorySubjectDto): string {
  if (subject.subjectType === 'user') return subject.displayEmail ?? subject.role ?? '';
  if (subject.groupType) return groupTypeLabels[subject.groupType];
  return '';
}

function subjectLabel(subject: OrgDirectorySubjectDto): string {
  return subject.safeLabel || subject.displayName || subject.displayEmail || subjectTypeLabels[subject.subjectType];
}

export function OrgSubjectPickerContent({
  hasLoadError = false,
  isLoading = false,
  items,
  onSubjectSelected,
  query,
  selectedSubject,
}: OrgSubjectPickerContentProps) {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return (
      <EmptyState
        variant="pre-search"
        title="사용자 또는 그룹을 검색해 주세요."
        description="두 글자 이상 입력하면 권한이 확인된 항목만 표시됩니다."
      />
    );
  }

  if (hasLoadError) {
    return (
      <EmptyState
        variant="api-error"
        title="조직 디렉터리를 불러올 수 없습니다."
        description="권한 또는 연결 상태를 확인해 주세요."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        조직 디렉터리를 확인하는 중입니다.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title="선택 가능한 항목이 없습니다."
        description="검색 결과는 현재 권한 범위 안에서만 표시됩니다."
      />
    );
  }

  return (
    <div className="grid gap-2" role="listbox" aria-label="조직 디렉터리 항목 선택">
      {items.map((subject) => {
        const isSelected = selectedSubject?.subjectId === subject.subjectId;
        const Icon = subject.subjectType === 'user' ? UserRound : UsersRound;
        const detail = secondaryLabel(subject);
        return (
          <button
            aria-selected={isSelected}
            className={cn(
              'flex min-h-16 w-full items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected && 'border-primary bg-primary/5',
            )}
            key={`${subject.subjectType}:${subject.subjectId}`}
            onClick={() => onSubjectSelected(subject)}
            role="option"
            type="button"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {subjectLabel(subject)}
                </span>
                {detail ? (
                  <span className="block truncate text-xs text-muted-foreground">{detail}</span>
                ) : null}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusBadge tone="neutral">{subjectTypeLabels[subject.subjectType]}</StatusBadge>
              {isSelected ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OrgSubjectPicker({
  matterId,
  onSubjectSelected,
  purpose,
  selectedSubject,
  subjectType = 'all',
}: OrgSubjectPickerProps) {
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<OrgDirectorySubjectDto[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasLoadError, setHasLoadError] = React.useState(false);

  React.useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setItems([]);
      setIsLoading(false);
      setHasLoadError(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setHasLoadError(false);
    searchOrgDirectorySubjects({
      limit: 12,
      matterId,
      purpose,
      q: trimmedQuery,
      subjectType,
    })
      .then((response) => {
        if (active) setItems(response.items);
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setHasLoadError(true);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [matterId, purpose, query, subjectType]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">사용자 또는 그룹 검색</span>
        <span className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="사용자 또는 그룹 검색"
            value={query}
          />
        </span>
      </label>
      <OrgSubjectPickerContent
        hasLoadError={hasLoadError}
        isLoading={isLoading}
        items={items}
        onSubjectSelected={onSubjectSelected}
        query={query}
        selectedSubject={selectedSubject}
      />
    </div>
  );
}
