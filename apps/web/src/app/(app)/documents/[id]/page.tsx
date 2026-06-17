'use client';

import { useEffect, useState } from 'react';
import type { AiPrepDocumentStatusDto } from '@amic-vault/shared';
import { AiPrepStatusPanel } from '@/components/ai/ai-prep-status-panel';
import { DocumentPermissionPanel } from '@/components/document/document-permission-panel';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { getDocumentAiPrepStatus } from '@/lib/api/ai-prep';
import type { DocumentPermissionSummary } from '@/lib/api/document-permissions';
import { getDocumentPermissionSummary } from '@/lib/api/document-permissions';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const [summary, setSummary] = useState<DocumentPermissionSummary | null>(null);
  const [prepStatus, setPrepStatus] = useState<AiPrepDocumentStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPrepStatus(null);
    setPrepError(null);
    getDocumentPermissionSummary(params.id)
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setSummary(null);
        setError(safeApiErrorMessage(caught));
      });
    getDocumentAiPrepStatus(params.id)
      .then((result) => {
        if (!active) return;
        setPrepStatus(result);
        setPrepError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setPrepStatus(null);
        setPrepError(safeApiErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [params.id]);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '파일']}
        title={summary?.title || '표시 가능한 제목 없음'}
        description="권한이 확인된 파일 정보만 표시됩니다."
      />
      {summary ? <DocumentPermissionPanel summary={summary} /> : null}
      {prepStatus ? <AiPrepStatusPanel status={prepStatus} /> : null}
      {prepError ? <p className="text-sm text-muted-foreground">{prepError}</p> : null}
      {error ? <EmptyState variant="api-error" title="파일 정보를 표시할 수 없습니다." description={error} /> : null}
    </PageShell>
  );
}
