'use client';

import * as React from 'react';
import Link from 'next/link';
import { Clock3, FileText, FolderTree, Search } from 'lucide-react';
import type { DocumentFolderDto, SavedItemDto } from '@amic-vault/shared';
import { MatterCodePicker } from '@/components/matter/matter-code-picker';
import { SavedItemsSection } from '@/components/saved-item/saved-items-section';
import { SavedItemToggle } from '@/components/saved-item/saved-item-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MatterAppSourceMode, MatterCodeOption } from '@/lib/matter-app';

export interface DocumentWorkbenchRailProps {
  folderError?: string | null;
  folders: readonly DocumentFolderDto[];
  onFolderSelected: (folderId: string) => void;
  onMatterSelected: (matter: MatterCodeOption | null) => void;
  onShowAll: () => void;
  selectedFolderId: string;
  selectedMatter: MatterCodeOption | null;
  savedItemError?: string | null;
  savedItems?: readonly SavedItemDto[];
  savedItemsLoading?: boolean;
  matterSaved?: boolean;
  matterSavedBusy?: boolean;
  onToggleMatterSaved?: (() => void) | undefined;
  sourceMode: MatterAppSourceMode;
}

export function DocumentWorkbenchRail({
  folderError,
  folders,
  onFolderSelected,
  onMatterSelected,
  onShowAll,
  selectedFolderId,
  selectedMatter,
  savedItemError = null,
  savedItems = [],
  savedItemsLoading = false,
  matterSaved = false,
  matterSavedBusy = false,
  onToggleMatterSaved,
  sourceMode,
}: DocumentWorkbenchRailProps) {
  const sortedFolders = [...folders].sort((left, right) => left.path.localeCompare(right.path));

  return (
    <div className="flex min-h-full flex-col gap-5 p-3">
      <nav aria-label="문서 탐색" className="grid gap-1">
        <Button
          aria-pressed={!selectedMatter}
          className="justify-start"
          onClick={onShowAll}
          size="sm"
          type="button"
          variant={!selectedMatter ? 'outline' : 'ghost'}
        >
          <FileText aria-hidden="true" className="h-4 w-4" />
          전체 문서
        </Button>
        <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Clock3 aria-hidden="true" className="h-4 w-4" />
          최근 문서는 권한 범위가 준비되면 표시합니다.
        </p>
        <Button asChild className="justify-start" size="sm" type="button" variant="ghost">
          <Link href="/search">
            <Search aria-hidden="true" className="h-4 w-4" />
            저장된 검색
          </Link>
        </Button>
      </nav>

      <SavedItemsSection error={savedItemError} items={savedItems} loading={savedItemsLoading} />

      <section className="grid gap-3 border-t pt-4" aria-labelledby="workbench-matter-title">
        <div className="flex min-w-0 items-baseline gap-x-2 overflow-hidden">
          <h2
            className="shrink-0 text-sm font-semibold text-foreground"
            id="workbench-matter-title"
          >
            Matter
          </h2>
          <p className="min-w-0 truncate whitespace-nowrap text-xs leading-5 text-muted-foreground">
            접근 가능한 Matter를 선택하면 해당 폴더만 표시합니다.
          </p>
        </div>
        <MatterCodePicker
          onMatterSelected={onMatterSelected}
          selectedMatter={selectedMatter}
          sourceMode={sourceMode}
        />
        {selectedMatter && onToggleMatterSaved ? (
          <SavedItemToggle
            busy={matterSavedBusy}
            onToggle={onToggleMatterSaved}
            saved={matterSaved}
            targetLabel={`${selectedMatter.matterCode} ${selectedMatter.matterName}`}
          />
        ) : null}
      </section>

      {selectedMatter ? (
        <section className="grid gap-2 border-t pt-4" aria-labelledby="workbench-folder-title">
          <div className="flex items-center gap-2">
            <FolderTree aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground" id="workbench-folder-title">
              폴더
            </h2>
          </div>
          <Button
            aria-pressed={!selectedFolderId}
            className="justify-start"
            onClick={() => onFolderSelected('')}
            size="sm"
            type="button"
            variant={!selectedFolderId ? 'outline' : 'ghost'}
          >
            전체 폴더
          </Button>
          {folderError ? (
            <p className="text-xs leading-5 text-destructive">폴더를 표시할 수 없습니다.</p>
          ) : null}
          {!folderError && sortedFolders.length === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">표시할 폴더가 없습니다.</p>
          ) : null}
          <div className="grid max-h-72 gap-1 overflow-y-auto">
            {sortedFolders.map((folder) => {
              const depth = Math.max(0, folder.path.split('/').length - 1);
              const selected = folder.folderId === selectedFolderId;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    'min-h-8 rounded-md pr-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'bg-primary/5 text-primary',
                  )}
                  key={folder.folderId}
                  onClick={() => onFolderSelected(folder.folderId)}
                  style={{ paddingLeft: `${12 + depth * 14}px` }}
                  type="button"
                >
                  <span className="block truncate">{folder.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
