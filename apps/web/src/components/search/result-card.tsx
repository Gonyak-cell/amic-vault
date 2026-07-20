'use client';

import Link from 'next/link';
import React, { type ReactNode } from 'react';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileSearch,
  UserRound,
} from 'lucide-react';
import type {
  SearchHighlightDto,
  SearchMode,
  SearchResultDto,
  SearchTarget,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { documentPreviewUrl } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n';

interface ResultCardProps {
  mode?: SearchMode;
  result: SearchResultDto;
  target?: SearchTarget;
}

export function ResultCard({ mode = 'keyword', result, target = 'all' }: ResultCardProps) {
  const { t } = useI18n();
  if (isAuthorityResult(result)) {
    return <AuthorityResultCard result={result} />;
  }
  const isClauseResult = result.resultKind === 'clause' || (target === 'clause' && !!result.clauseId);
  const clauseDisplay = isClauseResult ? clauseLabel(result) : undefined;
  const title = result.displayName || result.title || t('search.result.hiddenTitle');
  const showsSemanticContext = mode === 'semantic' || mode === 'hybrid';
  const context = [
    clauseDisplay,
    matterLabel(result),
    result.clientDisplayName,
    result.documentType,
    formatDate(result.updatedAt),
  ]
    .filter(Boolean)
    .join(' · ');
  const documentHref = documentSearchHitUrlForSearchResult(result, target);
  const previewHref =
    result.highlights.length > 0
      ? documentPreviewUrl(result.documentId ?? '', {
          searchHit: {
            ...(result.highlights[0]?.anchorId ? { anchorId: result.highlights[0].anchorId } : {}),
            hitCount: result.highlights.length,
            hitIndex: 1,
            target,
          },
        })
      : documentPreviewUrl(result.documentId ?? '');
  const fileCabinetHref = fileCabinetUrlForSearchResult(result);
  const authorLabel = result.author?.displayName?.trim();
  const permissionBadges = result.permissionBadges;
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
          <p className="mt-1 text-xs text-muted-foreground">{context}</p>
          {authorLabel ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              <span>작성자 {authorLabel}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={documentHref}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {isClauseResult ? '원문 열기' : '문서 열기'}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={previewHref} target="_blank" rel="noreferrer">
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge tone={confidentialityTone(permissionBadges.confidentiality)}>
          {confidentialityLabel(permissionBadges.confidentiality)}
        </StatusBadge>
        {clauseDisplay ? <StatusBadge tone="neutral">{clauseDisplay}</StatusBadge> : null}
        {permissionBadges.privilege !== 'none' ? (
          <StatusBadge tone="warning">{privilegeLabel(permissionBadges.privilege)}</StatusBadge>
        ) : null}
        {permissionBadges.legalHold !== 'no_hold' ? (
          <StatusBadge tone="blocked">{legalHoldLabel(permissionBadges.legalHold)}</StatusBadge>
        ) : null}
        <StatusBadge tone={result.aiAllowed ? 'success' : 'neutral'}>
          <Bot className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {result.aiAllowed ? 'AI 가능' : 'AI 불가'}
        </StatusBadge>
        {result.contentTruncated ? <StatusBadge tone="warning">부분 인덱스</StatusBadge> : null}
        {result.prevVersionId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={documentVersionUrlForSearchResult(result, result.prevVersionId)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              이전 버전
            </Link>
          </Button>
        ) : null}
        {result.nextVersionId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={documentVersionUrlForSearchResult(result, result.nextVersionId)}>
              다음 버전
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">
        {showsSemanticContext ? (
          <span className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{formatSimilarity(result.score)}</StatusBadge>
            <span className="text-xs font-medium text-muted-foreground">일치 문맥</span>
          </span>
        ) : null}
        {highlightSnippet(result.snippet, result.highlights)}
      </p>
      {result.extractionStatus && result.extractionStatus !== 'ready' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge tone={result.extractionStatus === 'failed' ? 'blocked' : 'warning'}>
            {extractionStatusLabel(result.extractionStatus)}
          </StatusBadge>
          <span>본문 검색 품질이 제한될 수 있습니다.</span>
        </div>
      ) : null}
    </article>
  );
}

function AuthorityResultCard({ result }: { result: SearchResultDto }) {
  const context = [
    result.citation,
    authoritySourceLabel(result.sourceType),
    result.externalRef ? `참조 ${result.externalRef}` : undefined,
    formatDate(result.updatedAt),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <article className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {result.sourceUrl ? (
            <a
              className="block truncate text-base font-semibold tracking-normal hover:underline"
              href={result.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {result.title}
            </a>
          ) : (
            <h2 className="truncate text-base font-semibold tracking-normal">{result.title}</h2>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{context}</p>
        </div>
        {result.sourceUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={result.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              원문 보기
            </a>
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge tone="neutral">외부 공개자료</StatusBadge>
        <StatusBadge tone="neutral">{authoritySourceLabel(result.sourceType)}</StatusBadge>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">
        {highlightSnippet(result.snippet || result.citation || '', result.highlights)}
      </p>
    </article>
  );
}

function isAuthorityResult(result: SearchResultDto): boolean {
  return String(result.resultKind) === 'authority' || !!result.authorityId;
}

function authoritySourceLabel(value: string | undefined): string {
  if (value === 'law_statute') return '법령';
  return '판례·법령';
}

function formatSimilarity(score: number): string {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  return `유사도 ${Math.round(bounded * 100)}%`;
}

function matterLabel(result: SearchResultDto): string | undefined {
  const code = result.matterDisplayCode?.trim();
  const name = result.matterDisplayName?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || undefined;
}

function clauseLabel(result: SearchResultDto): string | undefined {
  const kind = clauseKindLabel(result.clauseKind);
  const number = result.clauseNumber?.trim();
  if (number) return `${kind} ${number}`;
  return kind;
}

function clauseKindLabel(value: string | null | undefined): string {
  if (value === 'article') return '조항';
  if (value === 'section') return '항';
  if (value === 'paragraph') return '문단';
  if (value === 'definition') return '정의';
  return '조항';
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

export function documentSearchHitUrlForSearchResult(
  result: SearchResultDto,
  target: SearchTarget = 'all',
): string {
  const params = new URLSearchParams();
  params.set('from', 'search');
  params.set('target', target);
  const hitCount = result.highlights.length;
  if (hitCount > 0) {
    const anchorId = result.highlights[0]?.anchorId;
    params.set('hit', '1');
    params.set('hitCount', String(hitCount));
    if (anchorId) params.set('anchor', anchorId);
  }
  return `/documents/${encodeURIComponent(result.documentId ?? '')}?${params.toString()}`;
}

export function documentVersionUrlForSearchResult(
  result: SearchResultDto,
  versionId: string,
): string {
  const params = new URLSearchParams();
  params.set('versionId', versionId);
  return `/documents/${encodeURIComponent(result.documentId ?? '')}?${params.toString()}`;
}

function highlightSnippet(snippet: string, highlights: readonly SearchHighlightDto[]): ReactNode {
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
        <mark
          key={`h-${index}`}
          className="rounded-sm bg-secondary px-0.5 text-secondary-foreground"
        >
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

function extractionStatusLabel(status: NonNullable<SearchResultDto['extractionStatus']>): string {
  if (status === 'failed') return '추출 실패';
  if (status === 'ocr_pending') return 'OCR 필요';
  if (status === 'pending') return '추출 대기';
  return '본문 검색 가능';
}

function confidentialityTone(
  value: SearchResultDto['permissionBadges']['confidentiality'],
): StatusBadgeTone {
  if (value === 'restricted') return 'blocked';
  if (value === 'high') return 'warning';
  return 'neutral';
}

function confidentialityLabel(
  value: SearchResultDto['permissionBadges']['confidentiality'],
): string {
  if (value === 'restricted') return '비밀등급 제한';
  if (value === 'high') return '비밀등급 높음';
  return '비밀등급 일반';
}

function privilegeLabel(value: SearchResultDto['permissionBadges']['privilege']): string {
  if (value === 'work_product') return '업무 산출물 특권';
  if (value === 'joint_privilege') return '공동 특권';
  return '특권';
}

function legalHoldLabel(value: SearchResultDto['permissionBadges']['legalHold']): string {
  if (value === 'matter_hold') return '매터 보존';
  return '문서 보존';
}
