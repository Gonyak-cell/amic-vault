'use client';

import * as React from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import type { DocumentDto } from '@amic-vault/shared';
import { listMatterDocuments } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';

export interface MatterDocumentPickerProps {
  disabled?: boolean;
  initialDocuments?: readonly DocumentDto[];
  matterId: string;
  onDocumentSelected: (document: DocumentDto) => void;
  selectedDocumentId?: string | null;
}

export function MatterDocumentPicker({
  disabled = false,
  initialDocuments = [],
  matterId,
  onDocumentSelected,
  selectedDocumentId = null,
}: MatterDocumentPickerProps) {
  const [query, setQuery] = React.useState('');
  const [appliedQuery, setAppliedQuery] = React.useState('');
  const [documents, setDocuments] = React.useState<DocumentDto[]>([...initialDocuments]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasLoadError, setHasLoadError] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    setHasLoadError(false);
    listMatterDocuments(matterId, {
      pageSize: 12,
      sortBy: 'updated_desc',
      ...(appliedQuery ? { title: appliedQuery } : {}),
    })
      .then((response) => {
        if (active) setDocuments(response.items);
      })
      .catch(() => {
        if (active) {
          setDocuments([]);
          setHasLoadError(true);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedQuery, matterId]);

  return (
    <section className="grid gap-3" aria-label="Matter 문서 선택">
      <form
        className="flex min-w-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedQuery(query.trim());
        }}
      >
        <Input
          aria-label="문서명 검색"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="문서명 검색"
          value={query}
        />
        <Button disabled={disabled || isLoading} type="submit" variant="outline">
          <Search className="h-4 w-4" aria-hidden="true" />
          검색
        </Button>
      </form>

      {hasLoadError ? (
        <EmptyState
          variant="api-error"
          title="문서 목록을 불러올 수 없습니다."
          description="잠시 후 다시 검색해 주세요."
        />
      ) : null}
      {isLoading ? (
        <div className="flex min-h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          문서를 불러오는 중입니다.
        </div>
      ) : null}
      {!isLoading && !hasLoadError && documents.length === 0 ? (
        <EmptyState
          variant="no-data"
          title={appliedQuery ? '검색 조건에 맞는 문서가 없습니다.' : '선택할 문서가 없습니다.'}
        />
      ) : null}
      {!isLoading && !hasLoadError && documents.length > 0 ? (
        <div className="grid gap-2" role="listbox" aria-label="Matter 문서 목록">
          {documents.map((document) => {
            const selected = selectedDocumentId === document.documentId;
            return (
              <button
                aria-selected={selected}
                className={cn(
                  'flex min-h-14 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected && 'border-primary bg-primary/5',
                )}
                disabled={disabled}
                key={document.documentId}
                onClick={() => onDocumentSelected(document)}
                role="option"
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {document.safeLabel || document.displayName || document.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {document.matterDisplayCode ?? 'Matter 문서'}
                  </span>
                </span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
