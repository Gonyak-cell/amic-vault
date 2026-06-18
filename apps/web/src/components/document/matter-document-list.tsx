'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import type { DocumentDto } from '@amic-vault/shared';
import { listMatterDocuments } from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import type { MatterCodeOption } from '@/lib/matter-app';
import { EmptyState } from '@/components/ui/empty-state';

export interface MatterDocumentListProps {
  selectedMatter: MatterCodeOption | null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function MatterDocumentList({ selectedMatter }: MatterDocumentListProps) {
  const [documents, setDocuments] = React.useState<DocumentDto[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedMatter) {
      setDocuments([]);
      setErrorMessage(null);
      return;
    }
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    listMatterDocuments(selectedMatter.matterReference, { pageSize: 25 })
      .then((response) => {
        if (active) setDocuments(response.items);
      })
      .catch((error) => {
        if (active) setErrorMessage(safeApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedMatter]);

  if (!selectedMatter) {
    return (
      <EmptyState
        variant="pre-search"
        title="Matter Code를 선택하면 파일 목록이 표시됩니다."
        description="목록은 접근 권한이 확인된 파일만 표시합니다."
      />
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        variant="api-error"
        title="파일 목록을 표시할 수 없습니다."
        description={errorMessage}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        파일 목록을 확인하는 중입니다.
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title="표시할 파일이 없습니다."
        description="선택한 Matter Code에서 접근 가능한 파일이 여기에 표시됩니다."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">파일</th>
            <th className="px-3 py-2 text-left">유형</th>
            <th className="px-3 py-2 text-left">상태</th>
            <th className="px-3 py-2 text-left">업데이트</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {documents.map((document) => (
            <tr key={document.documentId}>
              <td className="max-w-[26rem] truncate px-3 py-2 font-medium text-foreground">
                {document.title}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{document.documentType}</td>
              <td className="px-3 py-2 text-muted-foreground">{document.status}</td>
              <td className="px-3 py-2 text-muted-foreground">{formatDate(document.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { formatDate };
