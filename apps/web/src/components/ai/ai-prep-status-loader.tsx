'use client';

import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { AiPrepDocumentReadinessStatus, AiPrepDocumentStatusDto } from '@amic-vault/shared';
import { getDocumentAiPrepStatus } from '@/lib/api/ai-prep';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { AiPrepStatusPanel } from '@/components/ai/ai-prep-status-panel';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';

const terminalReadinessStatuses = new Set<AiPrepDocumentReadinessStatus>([
  'ready',
  'partial',
  'blocked',
  'failed',
  'rejected',
  'stale',
]);

export function AiPrepStatusLoader({ documentId }: { documentId: string }) {
  const [status, setStatus] = React.useState<AiPrepDocumentStatusDto | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    let timer: number | undefined;

    async function refresh() {
      setIsLoading(true);
      try {
        const result = await getDocumentAiPrepStatus(documentId);
        if (!active) return;
        setStatus(result);
        setErrorMessage(null);
        if (!terminalReadinessStatuses.has(result.readinessStatus)) {
          timer = window.setTimeout(refresh, 4000);
        }
      } catch (error) {
        if (!active) return;
        setStatus(null);
        setErrorMessage(safeApiErrorMessage(error));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    refresh();

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [documentId]);

  if (status) return <AiPrepStatusPanel status={status} />;

  return (
    <SectionCard
      icon={<RefreshCw className="h-4 w-4" />}
      title="파일 정리 준비"
      meta="업로드 후 비동기 처리 상태"
    >
      {errorMessage ? (
        <EmptyState
          variant="api-error"
          title="파일 정리 상태를 표시할 수 없습니다."
          description={errorMessage}
        />
      ) : (
        <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          파일 정리 준비 상태를 확인하는 중입니다.
        </div>
      )}
    </SectionCard>
  );
}
