'use client';

import React from 'react';
import Link from 'next/link';
import { BookmarkPlus, Copy, FolderSearch, RotateCcw, Star, Trash2 } from 'lucide-react';
import type {
  DashboardRecentFileDto,
  SavedItemDto,
  SavedSearchDto,
  SearchUrlPrivacyMode,
} from '@amic-vault/shared';
import { SavedItemsSection } from '@/components/saved-item/saved-items-section';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { privateSavedSearchUrl, savedSearchSummary } from './search-save-panel';

export type SearchRecentFilesState =
  | { status: 'loading' }
  | { status: 'ready'; items: DashboardRecentFileDto[] }
  | { status: 'empty' }
  | { status: 'unavailable' };

export interface SearchWorkbenchRailProps {
  busy: boolean;
  onDelete: (savedSearchId: string) => void;
  onOpen: (savedSearch: SavedSearchDto) => void;
  onSave: () => void;
  onToggleSavedSearch?: (savedSearch: SavedSearchDto) => void;
  privacyMode: SearchUrlPrivacyMode;
  recentFiles: SearchRecentFilesState;
  savedItemError?: string | null;
  savedItems?: readonly SavedItemDto[];
  savedItemsLoading?: boolean;
  savedSearchIsFavorite?: (savedSearchId: string) => boolean;
  savedSearchToggleBusy?: (savedSearchId: string) => boolean;
  savedSearchError: string | null;
  savedSearches: SavedSearchDto[];
}

const scopeLabels = {
  personal: '개인',
  'matter-team': 'Matter 팀',
  'admin-shared': '조직과 공유',
} as const;

export function SearchWorkbenchRail({
  busy,
  onDelete,
  onOpen,
  onSave,
  onToggleSavedSearch,
  privacyMode,
  recentFiles,
  savedItemError = null,
  savedItems = [],
  savedItemsLoading = false,
  savedSearchIsFavorite = () => false,
  savedSearchToggleBusy = () => false,
  savedSearchError,
  savedSearches,
}: SearchWorkbenchRailProps) {
  return (
    <nav className="flex h-full min-h-[32rem] flex-col" aria-label="검색 워크벤치 탐색">
      <div className="border-b p-3">
        <Button className="w-full justify-start" onClick={onSave} size="sm" type="button">
          <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
          검색 조건 저장
        </Button>
        <Button
          asChild
          className="mt-2 w-full justify-start"
          size="sm"
          type="button"
          variant="ghost"
        >
          <Link href="/search/folders">
            <FolderSearch className="h-4 w-4" aria-hidden="true" />
            검색 폴더 관리
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 pb-3">
          <SavedItemsSection
            error={savedItemError}
            items={savedItems}
            loading={savedItemsLoading}
          />
        </div>
        {(['personal', 'matter-team', 'admin-shared'] as const).map((scope) => {
          const items = savedSearches.filter((savedSearch) => savedSearch.scope === scope);
          return (
            <section className="border-b px-3 py-3" key={scope}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-muted-foreground">
                  {scopeLabels[scope]}
                </h2>
                {items.length > 0 ? <StatusBadge tone="neutral">{items.length}</StatusBadge> : null}
              </div>
              {items.length > 0 ? (
                <ul className="mt-2 divide-y">
                  {items.map((savedSearch) => (
                    <li className="py-2.5" key={savedSearch.savedSearchId}>
                      <button
                        className="w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={busy}
                        onClick={() => onOpen(savedSearch)}
                        type="button"
                      >
                        <span className="block truncate text-sm font-semibold">
                          {savedSearch.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {savedSearchSummary(savedSearch.query)}
                        </span>
                      </button>
                      <div className="mt-2 flex items-center gap-1">
                        {scope === 'personal' && onToggleSavedSearch ? (
                          <Button
                            aria-label={`${savedSearch.name} ${
                              savedSearchIsFavorite(savedSearch.savedSearchId)
                                ? '즐겨찾기 해제'
                                : '즐겨찾기 추가'
                            }`}
                            aria-pressed={savedSearchIsFavorite(savedSearch.savedSearchId)}
                            disabled={busy || savedSearchToggleBusy(savedSearch.savedSearchId)}
                            onClick={() => onToggleSavedSearch(savedSearch)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Star
                              aria-hidden="true"
                              className={
                                savedSearchIsFavorite(savedSearch.savedSearchId)
                                  ? 'h-3.5 w-3.5 fill-current text-primary'
                                  : 'h-3.5 w-3.5'
                              }
                            />
                          </Button>
                        ) : null}
                        <Button
                          aria-label={`${savedSearch.name} 열기`}
                          disabled={busy}
                          onClick={() => onOpen(savedSearch)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        {privacyMode === 'private_saved_ref' ? (
                          <Button
                            aria-label={`${savedSearch.name} 비공개 링크 복사`}
                            disabled={busy}
                            onClick={() => void copyReference(savedSearch.savedSearchId)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        ) : null}
                        <Button
                          aria-label={`${savedSearch.name} 해제`}
                          disabled={busy || !savedSearch.canRevoke}
                          onClick={() => onDelete(savedSearch.savedSearchId)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">저장된 검색 없음</p>
              )}
            </section>
          );
        })}
        {savedSearchError ? (
          <p className="border-b px-3 py-3 text-xs text-destructive" role="alert">
            {savedSearchError}
          </p>
        ) : null}
        <RecentFiles state={recentFiles} />
      </div>
    </nav>
  );
}

function RecentFiles({ state }: { state: SearchRecentFilesState }) {
  return (
    <section className="px-3 py-3">
      <h2 className="text-xs font-semibold text-muted-foreground">최근 문서</h2>
      {state.status === 'loading' ? (
        <p className="mt-2 text-xs text-muted-foreground">불러오는 중</p>
      ) : null}
      {state.status === 'empty' ? (
        <p className="mt-2 text-xs text-muted-foreground">최근 문서 없음</p>
      ) : null}
      {state.status === 'unavailable' ? (
        <p className="mt-2 text-xs text-muted-foreground">일부 데이터를 표시할 수 없습니다.</p>
      ) : null}
      {state.status === 'ready' ? (
        <ul className="mt-2 divide-y">
          {state.items.map((item, index) => (
            <li className="py-2" key={`${item.title}-${item.updatedAt ?? index}`}>
              <p className="truncate text-sm font-medium">{item.title}</p>
              {item.matterLabel ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.matterLabel}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline"
        href="/files"
      >
        문서함 열기
      </Link>
    </section>
  );
}

async function copyReference(savedSearchId: string) {
  if (!navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(privateSavedSearchUrl(savedSearchId));
}
