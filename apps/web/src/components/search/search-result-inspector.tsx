'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, ExternalLink } from 'lucide-react';
import type { SearchResultDto, SearchTarget } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import {
  DetailInspector,
  DetailInspectorField,
  DetailInspectorSection,
} from '@/components/ui/detail-inspector';
import { StatusBadge } from '@/components/ui/status-badge';
import { documentSearchHitUrlForSearchResult } from './result-card';

export interface SearchResultInspectorProps {
  onOpen: () => void;
  onPreview: (result: SearchResultDto) => void;
  previewTriggerRef?: React.RefObject<HTMLButtonElement>;
  result: SearchResultDto | null;
  target: SearchTarget;
}

export function SearchResultInspector({
  onOpen,
  onPreview,
  previewTriggerRef,
  result,
  target,
}: SearchResultInspectorProps) {
  if (!result) {
    return (
      <DetailInspector
        className="h-full rounded-none border-0"
        empty={
          <p className="text-sm leading-6 text-muted-foreground">
            결과를 선택하면 권한이 확인된 요약 정보와 명시적 작업을 표시합니다.
          </p>
        }
        title="검색 결과 정보"
      />
    );
  }

  const authority = String(result.resultKind) === 'authority' || Boolean(result.authorityId);
  const title = result.displayName || result.title || '제목을 표시할 수 없습니다.';
  const matterMeta = matterLabel(result);
  const documentHref = authority ? result.sourceUrl : documentSearchHitUrlForSearchResult(result, target);
  return (
    <DetailInspector
      actions={
        <>
          {!authority && result.documentId ? (
            <Button
              onClick={() => onPreview(result)}
              ref={previewTriggerRef}
              size="sm"
              type="button"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              미리보기
            </Button>
          ) : null}
          {documentHref ? (
            <Button asChild size="sm" type="button" variant="outline">
              {authority ? (
                <a href={documentHref} rel="noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  원문 열기
                </a>
              ) : (
                <Link href={documentHref} onClick={onOpen}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  문서 열기
                </Link>
              )}
            </Button>
          ) : null}
        </>
      }
      className="h-full rounded-none border-0"
      status={<StatusBadge tone={authority ? 'neutral' : 'success'}>{authority ? '공개자료' : '선택됨'}</StatusBadge>}
      title={title}
      {...(matterMeta ? { meta: matterMeta } : {})}
    >
      <dl className="space-y-4">
        <DetailInspectorSection title="요약">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <DetailInspectorField label="Matter" value={matterLabel(result) ?? '표시 정보 없음'} />
            <DetailInspectorField label="고객" value={result.clientDisplayName ?? '표시 정보 없음'} />
            <DetailInspectorField label="유형" value={result.documentType ?? (authority ? '판례·법령' : '표시 정보 없음')} />
            <DetailInspectorField label="업데이트" value={formatDate(result.updatedAt)} />
          </div>
        </DetailInspectorSection>
        <DetailInspectorSection title="검색 문맥">
          <p className="break-words text-sm leading-6 text-muted-foreground">
            {result.snippet || result.citation || '표시할 검색 문맥이 없습니다.'}
          </p>
        </DetailInspectorSection>
        {!authority ? (
          <DetailInspectorSection title="정책">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="neutral">{result.permissionBadges.confidentiality}</StatusBadge>
              {result.permissionBadges.privilege !== 'none' ? (
                <StatusBadge tone="warning">{result.permissionBadges.privilege}</StatusBadge>
              ) : null}
              <StatusBadge tone={result.aiAllowed ? 'success' : 'neutral'}>
                {result.aiAllowed ? 'AI 가능' : 'AI 불가'}
              </StatusBadge>
            </div>
          </DetailInspectorSection>
        ) : null}
      </dl>
    </DetailInspector>
  );
}

function matterLabel(result: SearchResultDto): string | undefined {
  const code = result.matterDisplayCode?.trim();
  const name = result.matterDisplayName?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || undefined;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '표시 정보 없음'
    : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date);
}
