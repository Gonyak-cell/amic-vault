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
  not_ready: '준비 전',
  pending: '대기 중',
  ready: '준비 완료',
  partial: '일부 준비',
  blocked: '차단됨',
  failed: '실패',
  stale: '오래됨',
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
    <section aria-label="AI 준비 상태" className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">AI 준비</h2>
          <p className="text-sm text-muted-foreground">{status.versionId ?? status.documentId}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {statusLabel[status.readinessStatus]}
        </span>
      </div>

      {status.artifacts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">준비 작업 대기 중입니다.</p>
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
                        오래됨
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    출처 {artifact.sourceChunkCount}개
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
                  <p className="mt-3 text-sm text-muted-foreground">준비 결과를 사용할 수 없습니다.</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`${artifact.artifactKind} 유용함 표시`}
                    title={`${artifact.artifactKind} 유용함 표시`}
                    disabled={busyKey !== null || artifact.status !== 'completed'}
                    onClick={() => sendFeedback(artifact.artifactId, 'useful', 'useful')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${artifact.artifactKind} 부정확함 표시`}
                    title={`${artifact.artifactKind} 부정확함 표시`}
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
                    aria-label={`${artifact.artifactKind} 오래됨 표시`}
                    title={`${artifact.artifactKind} 오래됨 표시`}
                    disabled={busyKey !== null}
                    onClick={() => sendFeedback(artifact.artifactId, 'stale', 'stale_artifact')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  {Object.keys(recorded).some((key) => key.startsWith(artifact.artifactId)) ? (
                    <span className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs text-emerald-900">
                      <Check className="h-3 w-3" />
                      기록됨
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
          피드백을 기록할 수 없습니다.
        </p>
      ) : null}
    </section>
  );
}
