'use client';

import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import type { AiPrepMatterReadinessDto } from '@amic-vault/shared';
import { retryMatterAiPrep } from '@/lib/api/ai-prep';
import { Button } from '@/components/ui/button';

interface AiPrepMatterDashboardProps {
  readiness: AiPrepMatterReadinessDto;
  onRetryComplete?: () => void;
}

const readinessLabel: Record<AiPrepMatterReadinessDto['documents'][number]['readinessStatus'], string> = {
  not_ready: '준비 전',
  pending: '대기 중',
  ready: '준비 완료',
  partial: '일부 준비',
  blocked: '차단됨',
  failed: '실패',
  stale: '오래됨',
};

export function AiPrepMatterDashboard({
  readiness,
  onRetryComplete,
}: AiPrepMatterDashboardProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);
  const [retryError, setRetryError] = useState(false);

  async function retry() {
    setRetrying(true);
    setRetryResult(null);
    setRetryError(false);
    try {
      const result = await retryMatterAiPrep(readiness.matterId);
      setRetryResult(`파일 ${result.documentCount}개 / 작업 ${result.enqueuedJobCount}개`);
      onRetryComplete?.();
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section aria-label="사건 AI 준비 상태" className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">AI 준비 상태</h2>
          <p className="text-sm text-muted-foreground">{readiness.matterId}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={retry}
          disabled={retrying}
          aria-label="AI 준비 다시 실행"
          title="AI 준비 다시 실행"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="파일" value={readiness.documentCount} />
        <Metric label="준비 완료" value={readiness.readyDocumentCount} />
        <Metric label="대기" value={readiness.pendingDocumentCount + readiness.partialDocumentCount} />
        <Metric label="오래됨" value={readiness.staleDocumentCount} />
        <Metric label="차단" value={readiness.blockedDocumentCount} />
        <Metric label="실패" value={readiness.failedDocumentCount} />
        <Metric label="작업" value={readiness.pendingJobCount} />
        <Metric label="오래된 출처" value={readiness.staleArtifactCount} />
      </dl>

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>파일</span>
          <span>상태</span>
          <span>결과</span>
        </div>
        {readiness.documents.length > 0 ? (
          readiness.documents.map((document) => (
            <div
              key={document.documentId}
              className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">{document.title}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">
                {readinessLabel[document.readinessStatus]}
              </span>
              <span className="text-xs text-muted-foreground">
                {document.completedArtifactCount}/{document.totalArtifactCount}
              </span>
            </div>
          ))
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">표시할 파일이 없습니다.</p>
        )}
      </div>

      {retryResult ? <p className="text-sm text-muted-foreground">{retryResult}</p> : null}
      {retryError ? <p className="text-sm text-muted-foreground">다시 실행할 수 없습니다.</p> : null}
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
