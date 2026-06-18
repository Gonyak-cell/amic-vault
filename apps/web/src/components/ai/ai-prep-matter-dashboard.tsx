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
      setRetryResult(
        `문서 ${result.documentCount}건 / 작업 ${result.enqueuedJobCount}건 대기열 등록`,
      );
      onRetryComplete?.();
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section aria-label="사건 파일 정리 준비 상태" className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">파일 정리 준비 상태</h2>
          <p className="text-sm text-muted-foreground">
            권한이 확인된 파일 정리 준비 상태만 표시됩니다.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={retry}
          disabled={retrying}
          aria-label="파일 정리 준비 다시 실행"
          title="파일 정리 준비 다시 실행"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="파일" value={readiness.documentCount} />
        <Metric label="정리됨" value={readiness.readyDocumentCount} />
        <Metric
          label="진행 중"
          value={readiness.pendingDocumentCount + readiness.partialDocumentCount}
        />
        <Metric label="재정리" value={readiness.staleDocumentCount} />
        <Metric label="정책 차단" value={readiness.blockedDocumentCount} />
        <Metric label="실패" value={readiness.failedDocumentCount} />
        <Metric label="폐기" value={readiness.rejectedDocumentCount} />
        <Metric label="작업 대기" value={readiness.pendingJobCount} />
        <Metric label="재정리 항목" value={readiness.staleArtifactCount} />
        <Metric label="폐기 항목" value={readiness.rejectedArtifactCount} />
        <Metric label="대체 정리 항목" value={readiness.fallbackArtifactCount} />
      </dl>

      <DataTable caption="사건 파일 정리 준비 목록" minWidthClassName="min-w-[640px]">
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>파일</DataTableHead>
            <DataTableHead>상태</DataTableHead>
            <DataTableHead className="text-right">정리 카드</DataTableHead>
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
                    ? ` / 대체 ${document.fallbackArtifactCount}`
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
