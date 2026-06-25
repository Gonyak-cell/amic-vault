'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, Clock, FileText, RotateCcw, ThumbsUp } from 'lucide-react';
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
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';

const statusLabel: Record<AiPrepDocumentReadinessStatus, string> = {
  not_ready: '준비 전',
  pending: '정리 중',
  ready: '정리됨',
  partial: '일부 정리됨',
  blocked: '정책 차단',
  failed: '재시도 필요',
  rejected: '폐기됨',
  stale: '재정리 필요',
};

const statusHelp: Record<AiPrepDocumentReadinessStatus, string> = {
  not_ready: '이 버전은 아직 파일 정리가 시작되지 않았습니다.',
  pending: '권한 확인 후 파일 정리가 진행 중입니다.',
  ready: '파일 정리 결과가 준비되었습니다.',
  partial: '일부 파일 정리 결과만 준비되었습니다.',
  blocked: '권한 또는 정보 차단 정책으로 파일 정리가 제한되었습니다.',
  failed: '파일 정리를 다시 시도해야 합니다.',
  rejected: '검수에서 폐기된 정리 결과는 표시하지 않습니다.',
  stale: '파일 또는 권한 변경으로 다시 정리해야 합니다.',
};

const artifactStatusLabel: Record<AiPrepStatus, string> = {
  pending: '정리 중',
  completed: '정리됨',
  blocked: '정책 차단',
  failed: '실패',
  rejected: '폐기됨',
  stale: '재정리 필요',
};

const artifactKindLabel: Record<AiPrepArtifactKind, string> = {
  document_profile: '파일 개요',
  key_fields: '주요 정보',
  date_facts: '날짜 정보',
  people_organizations: '사람 및 기관',
  keyword_tags: '키워드',
  filing_suggestions: '보관 위치 제안',
  source_outline: '문서 구조',
  retrieval_hints: '검색 힌트',
};

function documentStatusTone(status: AiPrepDocumentReadinessStatus): StatusBadgeTone {
  if (status === 'ready') return 'success';
  if (status === 'partial' || status === 'pending' || status === 'stale') return 'warning';
  if (status === 'blocked' || status === 'failed' || status === 'rejected') return 'blocked';
  return 'neutral';
}

function artifactStatusTone(status: AiPrepStatus, isStale: boolean): StatusBadgeTone {
  if (isStale || status === 'stale' || status === 'pending') return 'warning';
  if (status === 'completed') return 'success';
  if (status === 'blocked' || status === 'failed' || status === 'rejected') return 'blocked';
  return 'neutral';
}

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
  if (artifact.isStale || artifact.status === 'stale') return '다시 정리해야 합니다.';
  if (artifact.status === 'rejected') return '폐기된 정리 결과는 표시하지 않습니다.';
  if (artifact.status === 'blocked') return '권한 또는 정보 차단 정책으로 표시할 수 없습니다.';
  if (artifact.status === 'failed') return '파일 정리를 다시 시도해야 합니다.';
  return '파일 정리 결과를 확인 중입니다.';
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
    <SectionCard
      aria-label="파일 정리 상태"
      icon={<FileText className="h-4 w-4" />}
      title="파일 정리"
      meta="권한 확인된 파일 정보만 표시"
      actions={
        <StatusBadge tone={documentStatusTone(status.readinessStatus)}>
          {statusLabel[status.readinessStatus]}
        </StatusBadge>
      }
    >
      <p className="text-sm text-muted-foreground">{statusHelp[status.readinessStatus]}</p>

      {status.artifacts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">파일 정리가 대기 중입니다.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {status.artifacts.map((artifact) => {
            const content = primaryText(artifact);
            const artifactLabel = artifactKindLabel[artifact.artifactKind];
            return (
              <article
                key={artifact.artifactId}
                className="border-t pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{artifactLabel}</span>
                    <StatusBadge tone={artifactStatusTone(artifact.status, artifact.isStale)}>
                      {artifactStatusLabel[artifact.status]}
                    </StatusBadge>
                    {artifact.isStale ? <StatusBadge tone="warning">재정리</StatusBadge> : null}
                    {artifact.status === 'rejected' ? (
                      <StatusBadge tone="blocked">폐기됨</StatusBadge>
                    ) : null}
                    {hasFallbackWarning(artifact) ? (
                      <StatusBadge tone="neutral">추가 확인</StatusBadge>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {artifact.sourceChunkCount > 0 ? '참조 확인됨' : '참조 없음'}
                  </span>
                </div>

                {content ? (
                  <div className="mt-3 space-y-2">
                    <h3 className="text-sm font-semibold tracking-normal">{content.heading}</h3>
                    <p className="text-sm text-muted-foreground">{content.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {content.sourceRefs.length > 0
                        ? '권한 확인된 파일 정보로 정리됨'
                        : '표시 가능한 참조 없음'}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{unavailableText(artifact)}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`${artifactLabel} 유용함 표시`}
                    title={`${artifactLabel} 유용함 표시`}
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
                    aria-label={`${artifactLabel} 주요 정보 오류 표시`}
                    title={`${artifactLabel} 주요 정보 오류 표시`}
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
                    aria-label={`${artifactLabel} 참조 부족 표시`}
                    title={`${artifactLabel} 참조 부족 표시`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() =>
                      sendFeedback(artifact.artifactId, 'incorrect', 'missing_source_ref')
                    }
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    참조
                  </button>
                  <button
                    type="button"
                    aria-label={`${artifactLabel} 태그 오류 표시`}
                    title={`${artifactLabel} 태그 오류 표시`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() => sendFeedback(artifact.artifactId, 'incorrect', 'incorrect_tags')}
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    태그
                  </button>
                  <button
                    type="button"
                    aria-label={`${artifactLabel} 보관 위치 제안 오류 표시`}
                    title={`${artifactLabel} 보관 위치 제안 오류 표시`}
                    disabled={
                      busyKey !== null || artifact.status !== 'completed' || artifact.isStale
                    }
                    onClick={() =>
                      sendFeedback(artifact.artifactId, 'incorrect', 'incorrect_filing_suggestion')
                    }
                    className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    분류
                  </button>
                  <button
                    type="button"
                    aria-label={`${artifactLabel} 재정리 필요 표시`}
                    title={`${artifactLabel} 재정리 필요 표시`}
                    disabled={busyKey !== null}
                    onClick={() => sendFeedback(artifact.artifactId, 'stale', 'stale_artifact')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  {artifact.status === 'rejected' ? (
                    <button
                      type="button"
                      aria-label={`${artifactLabel} 폐기 결과 표시`}
                      title={`${artifactLabel} 폐기 결과 표시`}
                      disabled={busyKey !== null}
                      onClick={() =>
                        sendFeedback(artifact.artifactId, 'incorrect', 'rejected_output')
                      }
                      className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                    >
                      폐기됨
                    </button>
                  ) : null}
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
    </SectionCard>
  );
}
