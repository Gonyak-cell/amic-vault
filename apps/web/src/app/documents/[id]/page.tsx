'use client';

import { useEffect, useState } from 'react';
import type { DocumentPermissionSummary } from '@/lib/api/document-permissions';
import { getDocumentPermissionSummary } from '@/lib/api/document-permissions';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { DocumentPermissionPanel } from '@/components/document/document-permission-panel';

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const [summary, setSummary] = useState<DocumentPermissionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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
    return () => {
      active = false;
    };
  }, [params.id]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-6 py-6">
      <section className="border-b pb-4">
        <p className="text-sm font-medium text-muted-foreground">{params.id}</p>
        <h1 className="text-2xl font-semibold tracking-normal">{summary?.title ?? 'Document'}</h1>
      </section>
      {summary ? <DocumentPermissionPanel summary={summary} /> : null}
      {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
    </main>
  );
}
