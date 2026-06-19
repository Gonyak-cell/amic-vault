'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { DocumentDto } from '@amic-vault/shared';
import { listDocuments } from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';

const pageSize = 25;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function matterLabel(document: DocumentDto): string {
  const code = document.matterDisplayCode?.trim();
  const name = document.matterDisplayName?.trim();
  if (code && name) return `${code} · ${name}`;
  if (code) return code;
  if (name) return name;
  return 'Matter 표시명 없음';
}

export function DocumentVaultList() {
  const [documents, setDocuments] = React.useState<DocumentDto[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    listDocuments({ page, pageSize })
      .then((response) => {
        if (!active) return;
        setDocuments(response.items);
        setTotalCount(response.totalCount);
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
  }, [page]);

  if (errorMessage) {
    return (
      <EmptyState
        variant="api-error"
        title="전체 문서를 표시할 수 없습니다."
        description={errorMessage}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        전체 문서를 확인하는 중입니다.
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title="표시할 문서가 없습니다."
        description="접근 권한이 확인된 문서만 이 문서함에 표시됩니다."
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b bg-muted/30 px-3 text-sm">
        <span className="font-medium text-foreground">권한 내 문서</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{totalCount}건</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            이전
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            다음
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] divide-y divide-border text-sm">
          <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">문서</th>
              <th className="px-3 py-2 text-left">Matter</th>
              <th className="px-3 py-2 text-left">유형</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">보안</th>
              <th className="px-3 py-2 text-left">정리</th>
              <th className="px-3 py-2 text-left">업데이트</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {documents.map((document) => (
              <tr key={document.documentId}>
                <td className="max-w-[20rem] truncate px-3 py-2 font-medium text-foreground">
                  <Link
                    href={`/documents/${document.documentId}`}
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    {document.title}
                  </Link>
                </td>
                <td className="max-w-[18rem] truncate px-3 py-2 text-muted-foreground">
                  {matterLabel(document)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{document.documentType}</td>
                <td className="px-3 py-2 text-muted-foreground">{document.status}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {document.confidentialityLevel}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge tone={document.aiAllowed ? 'success' : 'neutral'}>
                    {document.aiAllowed ? '정리 준비' : '제외'}
                  </StatusBadge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(document.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { formatDate as formatVaultDocumentDate, matterLabel as documentVaultMatterLabel };
