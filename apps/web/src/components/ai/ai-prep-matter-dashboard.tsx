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
      setRetryResult(`${result.documentCount} docs / ${result.enqueuedJobCount} jobs`);
      onRetryComplete?.();
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section
      aria-label="Matter file organization readiness"
      className="space-y-3 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">File organization readiness</h2>
          <p className="text-sm text-muted-foreground">{readiness.matterId}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={retry}
          disabled={retrying}
          aria-label="Reprocess file organization prep"
          title="Reprocess file organization prep"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="Documents" value={readiness.documentCount} />
        <Metric label="Ready" value={readiness.readyDocumentCount} />
        <Metric
          label="Pending"
          value={readiness.pendingDocumentCount + readiness.partialDocumentCount}
        />
        <Metric label="Stale" value={readiness.staleDocumentCount} />
        <Metric label="Blocked" value={readiness.blockedDocumentCount} />
        <Metric label="Failed" value={readiness.failedDocumentCount} />
        <Metric label="Rejected" value={readiness.rejectedDocumentCount} />
        <Metric label="Jobs" value={readiness.pendingJobCount} />
        <Metric label="Stale refs" value={readiness.staleArtifactCount} />
        <Metric label="Rejected refs" value={readiness.rejectedArtifactCount} />
        <Metric label="Fallback refs" value={readiness.fallbackArtifactCount} />
      </dl>

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Document</span>
          <span>Status</span>
          <span>Prepared</span>
        </div>
        {readiness.documents.length > 0 ? (
          readiness.documents.map((document) => (
            <div
              key={document.documentId}
              className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">{document.title}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">
                {document.readinessStatus}
              </span>
              <span className="text-xs text-muted-foreground">
                {document.completedArtifactCount}/{document.totalArtifactCount}
                {document.fallbackArtifactCount > 0
                  ? ` / ${document.fallbackArtifactCount} fallback`
                  : ''}
              </span>
            </div>
          ))
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">No documents</p>
        )}
      </div>

      {retryResult ? <p className="text-sm text-muted-foreground">{retryResult}</p> : null}
      {retryError ? <p className="text-sm text-muted-foreground">Retry unavailable</p> : null}
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
