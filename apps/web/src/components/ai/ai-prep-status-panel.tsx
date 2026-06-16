'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, Clock, RotateCcw, ThumbsUp } from 'lucide-react';
import type {
  AiPrepArtifactKind,
  AiPrepArtifactSummaryDto,
  AiPrepDocumentReadinessStatus,
  AiPrepDocumentStatusDto,
  AiPrepFeedbackKind,
  AiPrepFeedbackReasonCode,
  AiPrepStatus,
} from '@amic-vault/shared';
import { recordAiPrepFeedback } from '@/lib/api/ai-prep';

const statusLabel: Record<AiPrepDocumentReadinessStatus, string> = {
  not_ready: 'Not ready',
  pending: 'Preparing',
  ready: 'Prepared',
  partial: 'Partial',
  blocked: 'Blocked',
  failed: 'Failed',
  rejected: 'Discarded',
  stale: 'Stale',
};

const statusHelp: Record<AiPrepDocumentReadinessStatus, string> = {
  not_ready: 'Local prep is unavailable for this version.',
  pending: 'Queued for local file organization prep.',
  ready: 'Prepared file organization cards are available.',
  partial: 'Some file organization cards are prepared.',
  blocked: 'Policy or permission guard blocked prep.',
  failed: 'Retry is required for file organization prep.',
  rejected: 'Generated output was discarded; no file card is shown.',
  stale: 'Source or permission changes require a rebuild.',
};

const artifactStatusLabel: Record<AiPrepStatus, string> = {
  pending: 'Preparing',
  completed: 'Prepared',
  blocked: 'Blocked',
  failed: 'Failed',
  rejected: 'Discarded',
  stale: 'Stale',
};

const artifactKindLabel: Record<AiPrepArtifactKind, string> = {
  document_profile: 'Document profile',
  key_fields: 'Key fields',
  date_facts: 'Date facts',
  people_organizations: 'People and organizations',
  keyword_tags: 'Keyword tags',
  filing_suggestions: 'Filing suggestions',
  source_outline: 'Source outline',
  retrieval_hints: 'Retrieval hints',
};

function primaryText(artifact: AiPrepArtifactSummaryDto): {
  heading: string;
  text: string;
  sourceRefs: readonly string[];
} | null {
  if (artifact.status !== 'completed' || artifact.isStale) return null;
  const section = artifact.payload?.sections[0];
  if (!section) return null;
  return {
    heading: section.heading,
    text: section.text,
    sourceRefs: section.source_refs,
  };
}

function hasFallbackWarning(artifact: AiPrepArtifactSummaryDto): boolean {
  return (
    artifact.status === 'completed' &&
    !artifact.isStale &&
    artifact.payload?.warnings?.some((warning) => warning.includes('_FALLBACK')) === true
  );
}

function feedbackKey(
  artifactId: string,
  feedbackKind: AiPrepFeedbackKind,
  reasonCode: AiPrepFeedbackReasonCode,
): string {
  return `${artifactId}:${feedbackKind}:${reasonCode}`;
}

function unavailableText(artifact: AiPrepArtifactSummaryDto): string {
  if (artifact.isStale || artifact.status === 'stale') return 'Rebuild needed.';
  if (artifact.status === 'rejected') return 'Generated output discarded.';
  if (artifact.status === 'blocked') return 'Policy or permission block.';
  if (artifact.status === 'failed') return 'Retry required.';
  return 'File card pending.';
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
    const key = feedbackKey(artifactId, feedbackKind, reasonCode);
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
    <section aria-label="File organization prep status" className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">File organization prep</h2>
          <p className="text-sm text-muted-foreground">{status.versionId ?? status.documentId}</p>
          <p className="mt-1 text-sm text-muted-foreground">{statusHelp[status.readinessStatus]}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {statusLabel[status.readinessStatus]}
        </span>
      </div>

      {status.artifacts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">File prep is queued.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {status.artifacts.map((artifact) => {
            const content = primaryText(artifact);
            const artifactLabel = artifactKindLabel[artifact.artifactKind];
            return (
              <article key={artifact.artifactId} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{artifactLabel}</span>
                    <span className="rounded border px-2 py-0.5 text-xs">
                      {artifactStatusLabel[artifact.status]}
                    </span>
                    {artifact.isStale ? (
                      <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                        Rebuild
                      </span>
                    ) : null}
                    {artifact.status === 'rejected' ? (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-900">
                        Discarded
                      </span>
                    ) : null}
                    {hasFallbackWarning(artifact) ? (
                      <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-900">
                        Fallback
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
                  <p className="mt-3 text-sm text-muted-foreground">{unavailableText(artifact)}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Mark ${artifactLabel} useful`}
                    title={`Mark ${artifactLabel} useful`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() => sendFeedback(artifact.artifactId, 'useful', 'useful')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${artifactLabel} incorrect field`}
                    title={`Mark ${artifactLabel} incorrect field`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() =>
                      sendFeedback(artifact.artifactId, 'incorrect', 'incorrect_fields')
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${artifactLabel} missing source ref`}
                    title={`Mark ${artifactLabel} missing source ref`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() =>
                      sendFeedback(artifact.artifactId, 'incorrect', 'missing_source_ref')
                    }
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    Ref
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${artifactLabel} incorrect tag`}
                    title={`Mark ${artifactLabel} incorrect tag`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() => sendFeedback(artifact.artifactId, 'incorrect', 'incorrect_tags')}
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    Tag
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${artifactLabel} incorrect filing suggestion`}
                    title={`Mark ${artifactLabel} incorrect filing suggestion`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() =>
                      sendFeedback(artifact.artifactId, 'incorrect', 'incorrect_filing_suggestion')
                    }
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    Filing
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${artifactLabel} stale`}
                    title={`Mark ${artifactLabel} stale`}
                    disabled={busyKey !== null}
                    onClick={() => sendFeedback(artifact.artifactId, 'stale', 'stale_artifact')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  {artifact.status === 'rejected' ? (
                    <button
                      type="button"
                      aria-label={`Mark ${artifactLabel} rejected output`}
                      title={`Mark ${artifactLabel} rejected output`}
                      disabled={busyKey !== null}
                      onClick={() =>
                        sendFeedback(artifact.artifactId, 'incorrect', 'rejected_output')
                      }
                      className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                    >
                      Discarded
                    </button>
                  ) : null}
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
