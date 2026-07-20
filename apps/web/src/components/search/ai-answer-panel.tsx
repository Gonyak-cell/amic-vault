'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Send } from 'lucide-react';
import type { AiCitationDto, AiSummaryResponseDto } from '@amic-vault/shared';
import { AiStructuredAnswerPanel } from '@/components/ai/ai-assistant-panel';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { aiAssistantErrorMessage, askMatterQuestion } from '@/lib/api/ai-assistant';

interface AiAnswerPanelProps {
  seedQuery: string;
  matterId?: string | undefined;
  matterLabel?: string | undefined;
  initialResponse?: AiSummaryResponseDto | undefined;
  initialError?: string | undefined;
}

export interface CitationView {
  citation: AiCitationDto;
  ordinal: number;
}

export function AiAnswerPanel({
  initialError,
  initialResponse,
  matterId,
  matterLabel,
  seedQuery,
}: AiAnswerPanelProps) {
  const [query, setQuery] = useState(seedQuery);
  const [response, setResponse] = useState<AiSummaryResponseDto | null>(initialResponse ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const citations = useMemo(() => citationViews(response), [response]);
  const disabled = !matterId || loading || query.trim().length === 0;

  useEffect(() => {
    setQuery(seedQuery);
  }, [seedQuery]);

  async function submitQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!matterId || !trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResponse(await askMatterQuestion({ matterId, query: trimmed }));
    } catch (caught) {
      setResponse(null);
      setError(aiAssistantErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-label="AI에게 질문">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-normal">AI에게 질문</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {matterLabel ?? 'Matter 범위를 선택하면 권한 확인된 근거만 사용합니다.'}
          </p>
        </div>
        {response?.escalationRequired ? (
          <StatusBadge tone="warning">변호사 검토 필요</StatusBadge>
        ) : null}
      </div>

      <form className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitQuestion}>
        <label htmlFor="search-ai-question" className="sr-only">
          AI 질문
        </label>
        <textarea
          id="search-ai-question"
          className="min-h-20 resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={query}
          maxLength={2000}
          disabled={!matterId || loading}
          placeholder="검색어를 질문으로 바꿔 입력"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Button type="submit" disabled={disabled}>
          <Send className="h-4 w-4" aria-hidden="true" />
          질의
        </Button>
      </form>

      {!matterId ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Matter 하나를 필터로 선택하거나 단일 Matter 결과에서 실행하세요.
        </p>
      ) : null}
      {loading ? <p className="mt-3 text-sm text-muted-foreground">답변을 생성하고 있습니다.</p> : null}
      {error ? <p className="mt-3 text-sm text-muted-foreground">{error}</p> : null}

      {response ? (
        <div className="mt-4 space-y-4">
          <AiStructuredAnswerPanel response={response} />
          <CitationCards citations={citations} />
        </div>
      ) : null}
    </section>
  );
}

function CitationCards({ citations }: { citations: CitationView[] }) {
  if (citations.length === 0) return null;
  return (
    <section className="border-t pt-3">
      <h3 className="text-sm font-semibold tracking-normal">인용 문서</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {citations.map((citation) => (
          <Button
            key={citation.citation.citationRef}
            asChild
            type="button"
            variant="outline"
            size="sm"
          >
            <Link href={citationDocumentUrl(citation)}>
              인용 {citation.ordinal}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ))}
      </div>
    </section>
  );
}

function citationViews(response: AiSummaryResponseDto | null): CitationView[] {
  return response?.citations.map((citation, index) => ({ citation, ordinal: index + 1 })) ?? [];
}

export function citationDocumentUrl({ citation, ordinal }: CitationView): string {
  return `/documents/${encodeURIComponent(citation.documentId)}?chunk=${ordinal}`;
}
