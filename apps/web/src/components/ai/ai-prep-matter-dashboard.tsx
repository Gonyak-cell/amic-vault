'use client';

import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import type { AiPrepMatterReadinessDto } from '@amic-vault/shared';
import { retryMatterAiPrep } from '@/lib/api/ai-prep';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/data-table';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';

interface AiPrepMatterDashboardProps {
  readiness: AiPrepMatterReadinessDto;
  onRetryComplete?: () => void;
}

const readinessStatusLabel: Record<
  AiPrepMatterReadinessDto['documents'][number]['readinessStatus'],
  string
> = {
  not_ready: '준비 전',
  pending: '정리 중',
  ready: '정리됨',
  partial: '일부 정리됨',
  blocked: '정책 차단',
  failed: '실패',
  rejected: '폐기됨',
  stale: '재정리 필요',
};

function readinessTone(
  status: AiPrepMatterReadinessDto['documents'][number]['readinessStatus'],
): StatusBadgeTone {
  if (status === 'ready') return 'success';
  if (status === 'partial' || status === 'pending' || status === 'stale') return 'warning';
  if (status === 'blocked' || status === 'failed' || status === 'rejected') return 'blocked';
  return 'neutral';
}

export function AiPrepMatterDashboard({ readiness, onRetryComplete }: AiPrepMatterDashboardProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);
  const [retryError, setRetryError] = useState(false);

  async function retry() {
    setRetrying(true);
    setRetryResult(null);
    setRetryError(false);
    try {
      const result = await retryMatterAiPrep(readiness.matterId);
      setRetryResult(`파일 ${result.documentCount}건의 정리를 다시 요청했습니다.`);
      onRetryComplete?.();
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section aria-label="사건 파일 정리 상태" className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">파일 정리 상태</h2>
          <p className="text-sm text-muted-foreground">
            권한이 확인된 파일의 정리 상태만 표시됩니다.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={retry}
          disabled={retrying}
          aria-label="파일 정리 다시 실행"
          title="파일 정리 다시 실행"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <DataTable caption="사건 파일 정리 목록" minWidthClassName="min-w-[640px]">
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>파일</DataTableHead>
            <DataTableHead>상태</DataTableHead>
            <DataTableHead className="text-right">정리 항목</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          {readiness.documents.length > 0 ? (
            readiness.documents.map((document) => (
              <DataTableRow key={document.documentId}>
                <DataTableCell className="max-w-[360px] truncate font-medium">
                  {document.title || '표시 가능한 제목 없음'}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge tone={readinessTone(document.readinessStatus)}>
                    {readinessStatusLabel[document.readinessStatus]}
                  </StatusBadge>
                </DataTableCell>
                <DataTableCell className="text-right text-xs text-muted-foreground">
                  {document.completedArtifactCount}/{document.totalArtifactCount}
                  {document.fallbackArtifactCount > 0
                    ? ` / 추가 확인 ${document.fallbackArtifactCount}`
                    : ''}
                </DataTableCell>
              </DataTableRow>
            ))
          ) : (
            <DataTableEmptyRow colSpan={3}>표시할 파일이 없습니다.</DataTableEmptyRow>
          )}
        </DataTableBody>
      </DataTable>

      {retryResult ? <p className="text-sm text-muted-foreground">{retryResult}</p> : null}
      {retryError ? (
        <p className="text-sm text-muted-foreground">다시 실행할 수 없습니다.</p>
      ) : null}
    </section>
  );
}
