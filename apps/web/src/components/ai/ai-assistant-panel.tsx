'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ExternalLink, FileSearch, Send, ThumbsUp } from 'lucide-react';
import type {
  AiCitationVerificationWarningDto,
  AiSessionChunkDetailDto,
  AiSessionDetailDto,
  AiSummaryResponseDto,
  AiSummaryWarningCode,
} from '@amic-vault/shared';
import {
  aiAssistantErrorMessage,
  askMatterQuestion,
  getAiAssistantSession,
  recordAiAssistantFeedback,
} from '@/lib/api/ai-assistant';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';

interface AiAssistantPanelProps {
  matterId: string;
  initialQuery?: string;
  initialResponse?: AiSummaryResponseDto;
  initialSessionDetail?: AiSessionDetailDto;
}

const warningLabels: Record<AiSummaryWarningCode, string> = {
  EVIDENCE_ONLY_DEGRADED: '근거 제한',
  GRAPH_FACTS_UNAVAILABLE_BEFORE_R7: '그래프 보강 전',
  HUMAN_REVIEW_REQUIRED: '변호사 검토 필요',
  NO_DENIED_SOURCES_INCLUDED: '차단 자료 제외',
  RULE_FINDINGS_UNAVAILABLE_BEFORE_R8: '규칙 보강 전',
};

const citationWarningLabels: Record<AiCitationVerificationWarningDto['code'], string> = {
  LEGAL_CONCLUSION_REQUIRES_REVIEW: '법률 판단 검토 필요',
  UNCITED_CLAIM: '근거 없는 주장',
  UNKNOWN_CITATION: '확인 불가 인용',
};

const reasonLabels: Record<AiSessionChunkDetailDto['reasonCode'], string> = {
  ai_policy_blocked: 'AI 정책 차단',
  dlp_redacted: 'DLP 제한',
  ethical_wall_blocked: '정보 차단',
  included: '인용 후보',
  missing_source: '근거 없음',
  permission_denied: '권한 제한',
  unsupported_scope: '범위 외',
  window_omitted: '검색 범위 밖',
};

interface CitationView {
  citation: AiSummaryResponseDto['citations'][number];
  ordinal: number;
}

export function AiAssistantPanel({
  initialQuery = '',
  initialResponse,
  initialSessionDetail,
  matterId,
}: AiAssistantPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [response, setResponse] = useState<AiSummaryResponseDto | null>(initialResponse ?? null);
  const [sessionDetail, setSessionDetail] = useState<AiSessionDetailDto | null>(
    initialSessionDetail ?? null,
  );
  const [auditOpen, setAuditOpen] = useState(Boolean(initialSessionDetail));
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const citationsByRef = useMemo(() => citationMap(response), [response]);

  async function submitQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setFeedbackMessage(null);
    try {
      const nextResponse = await askMatterQuestion({ matterId, query: trimmed });
      setResponse(nextResponse);
      setSessionDetail(null);
      setAuditOpen(false);
    } catch (caught) {
      setError(aiAssistantErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function toggleAudit() {
    const nextOpen = !auditOpen;
    setAuditOpen(nextOpen);
    if (!nextOpen || !response || sessionDetail || auditLoading) return;
    setAuditLoading(true);
    setError(null);
    try {
      setSessionDetail(await getAiAssistantSession(response.sessionId));
    } catch (caught) {
      setError(aiAssistantErrorMessage(caught));
    } finally {
      setAuditLoading(false);
    }
  }

  async function sendFeedback(helpful: boolean) {
    if (!response || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackMessage(null);
    try {
      await recordAiAssistantFeedback({
        sessionId: response.sessionId,
        rating: helpful ? 5 : 2,
        helpful,
        correctionType: 'none',
        errorTypes: helpful ? [] : ['not_useful'],
        editDistance: 0,
      });
      setFeedbackMessage(helpful ? '도움됨으로 기록했습니다.' : '오류 의견을 기록했습니다.');
    } catch {
      setFeedbackMessage('피드백을 기록할 수 없습니다.');
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <SectionCard
      aria-label="Matter AI 질의"
      icon={<FileSearch className="h-4 w-4" />}
      title="Matter AI 질의"
      meta="접근 가능한 근거만 사용"
      actions={
        response?.escalationRequired ? (
          <StatusBadge tone="warning">변호사 검토 필요</StatusBadge>
        ) : null
      }
    >
      <form onSubmit={submitQuestion} className="space-y-3">
        <label htmlFor="matter-ai-question" className="sr-only">
          질문
        </label>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <textarea
            id="matter-ai-question"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="min-h-20 resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={2000}
            placeholder="계약 상대방, 주요 기한, 송부본 상태"
          />
          <Button type="submit" disabled={loading || query.trim().length === 0}>
            <Send className="h-4 w-4" />
            질의
          </Button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-muted-foreground">{error}</p> : null}

      {response ? (
        <div className="mt-4 space-y-4">
          <AiStructuredAnswerPanel response={response} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAudit}
              disabled={auditLoading}
              aria-expanded={auditOpen}
            >
              <ChevronDown className="h-4 w-4" />
              검색·인용·제외 내역
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => sendFeedback(true)}
              disabled={feedbackBusy}
              aria-label="AI 답변 도움됨 기록"
              title="AI 답변 도움됨 기록"
            >
              <ThumbsUp className="h-4 w-4" />
              도움됨
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => sendFeedback(false)}
              disabled={feedbackBusy}
              aria-label="AI 답변 오류 기록"
              title="AI 답변 오류 기록"
            >
              <AlertTriangle className="h-4 w-4" />
              오류 있음
            </Button>
          </div>
          {feedbackMessage ? (
            <p className="text-sm text-muted-foreground">{feedbackMessage}</p>
          ) : null}
          {auditOpen ? (
            <AuditDetails
              citations={[...citationsByRef.values()]}
              loading={auditLoading}
              sessionDetail={sessionDetail}
            />
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

export function AiStructuredAnswerPanel({ response }: { response: AiSummaryResponseDto }) {
  const citationsByRef = useMemo(() => citationMap(response), [response]);

  return (
    <>
      <StructuredAnswer response={response} />
      <AnswerSections response={response} citationsByRef={citationsByRef} />
      <Warnings response={response} />
    </>
  );
}

function StructuredAnswer({ response }: { response: AiSummaryResponseDto }) {
  const additionalEvidence = [
    ...response.openQuestions.map((question) => question.neededEvidence),
    ...(response.excludedSourcesNotice.count > 0
      ? [`권한 또는 컨텍스트 제한으로 제외된 자료 ${response.excludedSourcesNotice.count}건`]
      : []),
  ];
  return (
    <div className="space-y-3">
      <StructuredBlock title="결론">
        <p>{response.conclusion}</p>
      </StructuredBlock>
      <StructuredBlock title="불확실한 부분">
        <StructuredList
          emptyText="현재 응답에서 식별된 불확실한 부분이 없습니다."
          items={response.openQuestions.map((question) => question.question)}
        />
      </StructuredBlock>
      <StructuredBlock title="추가 확인 자료">
        <StructuredList
          emptyText="현재 응답에서 요청된 추가 확인 자료가 없습니다."
          items={additionalEvidence}
        />
      </StructuredBlock>
      <StructuredBlock title="권장 조치">
        {response.recommendedActions.length > 0 ? (
          <ul className="space-y-2">
            {response.recommendedActions.map((action) => (
              <li key={action.action} className="flex flex-wrap items-center gap-2">
                <span>{action.action}</span>
                {action.reviewRequired ? <StatusBadge tone="warning">검토 필요</StatusBadge> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>현재 응답에서 권장 조치가 없습니다.</p>
        )}
      </StructuredBlock>
    </div>
  );
}

function StructuredBlock({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="border-t pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold tracking-normal">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function StructuredList({ emptyText, items }: { emptyText: string; items: string[] }) {
  if (items.length === 0) return <p>{emptyText}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function AnswerSections({
  citationsByRef,
  response,
}: {
  citationsByRef: Map<string, CitationView>;
  response: AiSummaryResponseDto;
}) {
  return (
    <div className="space-y-3">
      {response.sections.map((section) => (
        <article key={section.sectionId} className="border-t pt-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold tracking-normal">{section.heading}</h3>
            {section.escalationRequired ? (
              <StatusBadge tone="warning">변호사 검토 필요</StatusBadge>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {section.citationRefs.map((citationRef) => {
              const citation = citationsByRef.get(citationRef);
              return citation ? (
                <Button
                  key={citationRef}
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  title={`인용 ${citation.ordinal} 문서 열기`}
                >
                  <Link href={citationHref(citation)}>
                    인용 {citation.ordinal}
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <StatusBadge key={citationRef} tone="warning">
                  인용 확인 필요
                </StatusBadge>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

function Warnings({ response }: { response: AiSummaryResponseDto }) {
  if (response.warnings.length === 0 && response.citationWarnings.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {response.warnings.map((warning) => (
        <StatusBadge key={warning} tone="warning">
          {warningLabels[warning]}
        </StatusBadge>
      ))}
      {response.citationWarnings.map((warning) => (
        <StatusBadge
          key={`${warning.code}:${warning.claimId}:${warning.citationRef ?? ''}`}
          tone="warning"
        >
          {citationWarningLabels[warning.code]}
        </StatusBadge>
      ))}
    </div>
  );
}

function AuditDetails({
  citations,
  loading,
  sessionDetail,
}: {
  citations: CitationView[];
  loading: boolean;
  sessionDetail: AiSessionDetailDto | null;
}) {
  const includedChunks = sessionDetail?.chunks.filter((chunk) => chunk.included) ?? [];
  const excludedChunks = sessionDetail?.chunks.filter((chunk) => !chunk.included) ?? [];
  const citedChunkIds = new Set(citations.map(({ citation }) => citation.chunkId));

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      {loading ? <p className="text-sm text-muted-foreground">내역을 불러오는 중입니다.</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <AuditColumn title="인용" emptyText="표시할 인용이 없습니다.">
          {citations.map((item) => (
            <li key={item.citation.citationRef}>
              <Link className="font-medium text-primary" href={citationHref(item)}>
                인용 {item.ordinal}
              </Link>
              <span className="ml-2 text-muted-foreground">
                파일 {shortId(item.citation.documentId)}
              </span>
            </li>
          ))}
        </AuditColumn>
        <AuditColumn title="검색" emptyText="표시할 검색 항목이 없습니다.">
          {includedChunks.map((chunk) => (
            <li key={chunk.chunkId}>
              <span className="font-medium">
                {citedChunkIds.has(chunk.chunkId) ? '인용됨' : '검색됨'}
              </span>
              <span className="ml-2 text-muted-foreground">
                파일 {shortId(chunk.documentId)}
                {typeof chunk.rankIndex === 'number' ? ` · 순위 ${chunk.rankIndex + 1}` : ''}
              </span>
            </li>
          ))}
        </AuditColumn>
        <AuditColumn title="제외" emptyText="표시할 제외 항목이 없습니다.">
          {excludedChunks.map((chunk) => (
            <li key={chunk.chunkId}>
              <span className="font-medium">{reasonLabels[chunk.reasonCode]}</span>
              <span className="ml-2 text-muted-foreground">파일 {shortId(chunk.documentId)}</span>
            </li>
          ))}
          {sessionDetail && sessionDetail.hiddenSourceCount > 0 ? (
            <li>
              <span className="font-medium">권한 제한으로 숨김</span>
              <span className="ml-2 text-muted-foreground">
                {sessionDetail.hiddenSourceCount}건
              </span>
            </li>
          ) : null}
        </AuditColumn>
      </div>
    </div>
  );
}

function AuditColumn({
  children,
  emptyText,
  title,
}: {
  children: React.ReactNode;
  emptyText: string;
  title: string;
}) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h4>
      {hasChildren ? (
        <ul className="mt-2 space-y-2 text-sm">{children}</ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

function citationMap(response: AiSummaryResponseDto | null): Map<string, CitationView> {
  return new Map(
    response?.citations.map((citation, index) => [
      citation.citationRef,
      { citation, ordinal: index + 1 },
    ]) ?? [],
  );
}

function citationHref({ citation, ordinal }: CitationView): string {
  return `/documents/${encodeURIComponent(citation.documentId)}?chunk=${ordinal}`;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}
