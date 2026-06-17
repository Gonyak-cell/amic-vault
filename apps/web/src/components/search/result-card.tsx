'use client';

import Link from 'next/link';
import React, { type ReactNode } from 'react';
import type { SearchHighlightDto, SearchResultDto } from '@amic-vault/shared';
import { useI18n } from '@/lib/i18n';

interface ResultCardProps {
  result: SearchResultDto;
}

export function ResultCard({ result }: ResultCardProps) {
  const { language } = useI18n();
  const copy = resultCopy[language];
  const title = result.title || copy.hiddenTitle;
  return (
    <article className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="block truncate text-base font-semibold tracking-normal hover:underline"
            href={`/documents/${result.documentId}`}
          >
            {title}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.documentType} · {formatDate(result.updatedAt)}
          </p>
        </div>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">
        {highlightSnippet(result.snippet, result.highlights)}
      </p>
      <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="font-medium text-foreground">{copy.matter}</dt>
          <dd className="truncate">{safeDisplayRef(result.matterId, copy.unavailable)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium text-foreground">{copy.client}</dt>
          <dd className="truncate">{safeDisplayRef(result.clientId, copy.unavailable)}</dd>
        </div>
      </dl>
    </article>
  );
}

const resultCopy = {
  ko: { matter: 'Matter', client: '고객', hiddenTitle: '표시 가능한 제목 없음', unavailable: '표시 가능한 정보 없음' },
  en: { matter: 'Matter', client: 'Client', hiddenTitle: 'No display title available', unavailable: 'No display label available' },
} as const;

function safeDisplayRef(value: string, fallback: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) {
    return fallback;
  }
  return value;
}

function highlightSnippet(
  snippet: string,
  highlights: readonly SearchHighlightDto[],
): ReactNode {
  if (highlights.length === 0) return snippet;
  const parts: ReactNode[] = [];
  let cursor = 0;
  highlights
    .map((highlight) => ({
      start: Math.max(0, Math.min(highlight.start, snippet.length)),
      end: Math.max(0, Math.min(highlight.end, snippet.length)),
    }))
    .filter((highlight) => highlight.end > highlight.start)
    .sort((a, b) => a.start - b.start)
    .forEach((highlight, index) => {
      if (highlight.start < cursor) return;
      if (highlight.start > cursor) {
        parts.push(<span key={`t-${index}`}>{snippet.slice(cursor, highlight.start)}</span>);
      }
      parts.push(
        <mark key={`h-${index}`} className="rounded-sm bg-secondary px-0.5 text-secondary-foreground">
          {snippet.slice(highlight.start, highlight.end)}
        </mark>,
      );
      cursor = highlight.end;
    });
  if (cursor < snippet.length) parts.push(<span key="tail">{snippet.slice(cursor)}</span>);
  return parts;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}
