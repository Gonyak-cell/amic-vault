'use client';

import { useEffect, useState } from 'react';
import type { AiPrepDocumentStatusDto } from '@amic-vault/shared';
import { AiPrepStatusPanel } from '@/components/ai/ai-prep-status-panel';
import type { DocumentPermissionSummary } from '@/lib/api/document-permissions';
import { getDocumentPermissionSummary } from '@/lib/api/document-permissions';
import { getDocumentAiPrepStatus } from '@/lib/api/ai-prep';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { DocumentPermissionPanel } from '@/components/document/document-permission-panel';

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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-6 py-6">
      <section className="border-b pb-4">
        <p className="text-sm font-medium text-muted-foreground">{params.id}</p>
        <h1 className="text-2xl font-semibold tracking-normal">{summary?.title ?? '파일'}</h1>
      </section>
      {summary ? <DocumentPermissionPanel summary={summary} /> : null}
      {prepStatus ? <AiPrepStatusPanel status={prepStatus} /> : null}
      {prepError ? <p className="text-sm text-muted-foreground">{prepError}</p> : null}
      {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
    </main>
  );
}
