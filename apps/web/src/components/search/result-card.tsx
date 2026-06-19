'use client';

import Link from 'next/link';
import React, { type ReactNode } from 'react';
import { ExternalLink, Eye, FileSearch } from 'lucide-react';
import type { SearchHighlightDto, SearchResultDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { documentPreviewUrl } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';

interface ResultCardProps {
  result: SearchResultDto;
}

export function ResultCard({ result }: ResultCardProps) {
  const { t } = useI18n();
  const title = result.displayName || result.title || t('search.result.hiddenTitle');
  const context = [matterLabel(result), result.clientDisplayName, result.documentType, formatDate(result.updatedAt)]
    .filter(Boolean)
    .join(' · ');
  const documentHref = `/documents/${result.documentId}`;
  const fileCabinetHref = fileCabinetUrlForSearchResult(result);
  return (
    <article className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="block truncate text-base font-semibold tracking-normal hover:underline"
            href={documentHref}
          >
            {title}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {context}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={documentHref}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              문서 열기
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={documentPreviewUrl(result.documentId)} target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" aria-hidden="true" />
              미리보기
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={fileCabinetHref}>
              <FileSearch className="h-4 w-4" aria-hidden="true" />
              문서함
            </Link>
          </Button>
        </div>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">
        {highlightSnippet(result.snippet, result.highlights)}
      </p>
    </article>
  );
}

function matterLabel(result: SearchResultDto): string | undefined {
  const code = result.matterDisplayCode?.trim();
  const name = result.matterDisplayName?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || undefined;
}

export function fileCabinetUrlForSearchResult(result: SearchResultDto): string {
  const params = new URLSearchParams();
  const matterCode = result.matterDisplayCode?.trim();
  const title = (result.title || result.displayName || '').trim();
  if (matterCode) params.set('matterCode', matterCode);
  if (title) params.set('title', title);
  const queryString = params.toString();
  return queryString ? `/files?${queryString}` : '/files';
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
