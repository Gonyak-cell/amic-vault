'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, Clock, RotateCcw, ThumbsUp } from 'lucide-react';
import type {
  AiPrepArtifactSummaryDto,
  AiPrepDocumentReadinessStatus,
  AiPrepDocumentStatusDto,
  AiPrepFeedbackKind,
  AiPrepFeedbackReasonCode,
} from '@amic-vault/shared';
import { recordAiPrepFeedback } from '@/lib/api/ai-prep';

const statusLabel: Record<AiPrepDocumentReadinessStatus, string> = {
  not_ready: 'Not ready',
  pending: 'Pending',
  ready: 'Ready',
  partial: 'Partial',
  blocked: 'Blocked',
  failed: 'Failed',
  rejected: 'Rejected',
  stale: 'Stale',
};

function primaryText(artifact: AiPrepArtifactSummaryDto): {
  heading: string;
  text: string;
  sourceRefs: readonly string[];
} | null {
  const section = artifact.payload?.sections[0];
  if (!section) return null;
  return {
    heading: section.heading,
    text: section.text,
    sourceRefs: section.source_refs,
  };
}

function feedbackKey(artifactId: string, feedbackKind: AiPrepFeedbackKind): string {
  return `${artifactId}:${feedbackKind}`;
}

export function AiPrepStatusPanel({ status }: { status: AiPrepDocumentStatusDto }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  async function sendFeedback(
    artifactId: string,
    feedbackKind: AiPrepFeedbackKind,
    reasonCode: AiPrepFeedbackReasonCode,
  ) {
    const key = feedbackKey(artifactId, feedbackKind);
    setBusyKey(key);
    setError(false);
    try {
      await recordAiPrepFeedback({ artifactId, feedbackKind, reasonCode });
      setRecorded((current) => ({ ...current, [key]: reasonCode }));
    } catch {
      setError(true);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section aria-label="AI prep status" className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">AI prep</h2>
          <p className="text-sm text-muted-foreground">{status.versionId ?? status.documentId}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {statusLabel[status.readinessStatus]}
        </span>
      </div>

      {status.artifacts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Preparation is pending.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {status.artifacts.map((artifact) => {
            const content = primaryText(artifact);
            return (
              <article key={artifact.artifactId} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{artifact.artifactKind}</span>
                    <span className="rounded border px-2 py-0.5 text-xs">{artifact.status}</span>
                    {artifact.isStale ? (
                      <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                        stale
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {artifact.sourceChunkCount} refs
                  </span>
                </div>

                {content ? (
                  <div className="mt-3 space-y-2">
                    <h3 className="text-sm font-semibold tracking-normal">{content.heading}</h3>
                    <p className="text-sm text-muted-foreground">{content.text}</p>
                    <div className="flex flex-wrap gap-1">
                      {content.sourceRefs.map((ref) => (
                        <span key={ref} className="rounded bg-muted px-2 py-1 font-mono text-xs">
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Artifact unavailable.</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Mark ${artifact.artifactKind} useful`}
                    title={`Mark ${artifact.artifactKind} useful`}
                    disabled={busyKey !== null || artifact.status !== 'completed'}
                    onClick={() => sendFeedback(artifact.artifactId, 'useful', 'useful')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${artifact.artifactKind} incorrect`}
                    title={`Mark ${artifact.artifactKind} incorrect`}
                    disabled={busyKey !== null || artifact.status !== 'completed'}
                    onClick={() =>
                      sendFeedback(artifact.artifactId, 'incorrect', 'missing_citation')
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${artifact.artifactKind} stale`}
                    title={`Mark ${artifact.artifactKind} stale`}
                    disabled={busyKey !== null}
                    onClick={() => sendFeedback(artifact.artifactId, 'stale', 'stale_artifact')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  {Object.keys(recorded).some((key) => key.startsWith(artifact.artifactId)) ? (
                    <span className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs text-emerald-900">
                      <Check className="h-3 w-3" />
                      recorded
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Feedback unavailable
        </p>
      ) : null}
    </section>
  );
}
