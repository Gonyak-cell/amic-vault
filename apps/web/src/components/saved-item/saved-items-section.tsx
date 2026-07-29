import React from 'react';
import Link from 'next/link';
import { FileText, FolderKanban, Search, Star } from 'lucide-react';
import type { SavedItemDto, SavedItemTargetType } from '@amic-vault/shared';
import { StatusBadge } from '@/components/ui/status-badge';

export interface SavedItemsSectionProps {
  error?: string | null;
  items: readonly SavedItemDto[];
  loading?: boolean;
}

const typeLabels: Record<SavedItemTargetType, string> = {
  document: '문서',
  matter: 'Matter',
  saved_search: '저장된 검색',
};

const typeIcons = {
  document: FileText,
  matter: FolderKanban,
  saved_search: Search,
} as const;

export function SavedItemsSection({
  error = null,
  items,
  loading = false,
}: SavedItemsSectionProps) {
  const titleId = React.useId();

  return (
    <section className="grid gap-2 border-t pt-4" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground" id={titleId}>
            즐겨찾기
          </h2>
        </div>
        {items.length > 0 ? <StatusBadge tone="neutral">{items.length}</StatusBadge> : null}
      </div>
      {loading ? <p className="text-xs leading-5 text-muted-foreground">불러오는 중</p> : null}
      {error ? (
        <p className="text-xs leading-5 text-destructive" role="alert">
          즐겨찾기를 표시할 수 없습니다.
        </p>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          자주 쓰는 문서, Matter, 저장된 검색을 즐겨찾기에 추가할 수 있습니다.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="grid max-h-72 gap-1 overflow-x-hidden overflow-y-auto">
          {items.map((item) => {
            const Icon = typeIcons[item.targetType];
            return (
              <li key={item.savedItemId}>
                <Link
                  className="flex min-h-10 items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={item.href}
                >
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.contextLabel || typeLabels[item.targetType]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
