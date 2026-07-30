'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, FolderKanban, RefreshCw } from 'lucide-react';
import type { ClientDto, MatterDto } from '@amic-vault/shared';
import { MatterListTable, type MatterListTableCopy } from '@/components/matter/matter-list-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import {
  clientConfidentialityLabels as clientConfidentialityLabelsByLanguage,
  clientStatusLabels as clientStatusLabelsByLanguage,
  clientTypeLabels as clientTypeLabelsByLanguage,
  clientUnknownLabels,
} from '@/lib/i18n';
import type { ClientResourceLoadState } from '../client-load-state';

export type ClientDetailLoadState = ClientResourceLoadState;
export type ClientPortfolioLoadState = ClientResourceLoadState;

const clientTypeLabels: Readonly<Record<string, string>> = clientTypeLabelsByLanguage.ko;
const confidentialityLabels: Readonly<Record<string, string>> =
  clientConfidentialityLabelsByLanguage.ko;
const statusLabels: Readonly<Record<string, string>> = clientStatusLabelsByLanguage.ko;

const matterListCopy = {
  actions: '작업',
  client: '고객',
  fileCabinet: '파일함',
  matter: 'Matter',
  moreActions: '추가 작업',
  owner: '담당자',
  ownerUnassigned: '미지정',
  recentUpdate: '최근 변경',
  searchMatter: '검색',
  status: '상태',
} satisfies MatterListTableCopy;

export function clientMatterFilterPath(clientId: string): string {
  return `/matters?clientId=${encodeURIComponent(clientId)}`;
}

export function ClientDetailView({
  clientId,
  client,
  loadState,
  matterLoadState,
  matters,
  matterPage,
  matterTotalCount,
  onRefresh,
}: {
  clientId?: string;
  client: ClientDto | null;
  loadState: ClientDetailLoadState;
  matterLoadState?: ClientPortfolioLoadState;
  matters: MatterDto[];
  matterPage?: number | undefined;
  matterTotalCount?: number | undefined;
  onRefresh?: () => void;
}) {
  const aliases = client && Array.isArray(client.aliases) ? client.aliases : [];
  const title = client?.displayName || client?.name || '고객 상세';
  const resolvedMatterLoadState =
    matterLoadState ??
    (typeof matterTotalCount === 'number' ? (matterTotalCount === 0 ? 'empty' : 'ready') : 'ready');
  const resolvedClientId = client?.clientId ?? clientId;
  const showMatterSection = matterLoadState
    ? loadState !== 'loading' || resolvedMatterLoadState !== 'loading'
    : loadState === 'ready' && client !== null;
  const hasExactMatterTotal = typeof matterTotalCount === 'number' && matterTotalCount >= 0;
  const hasPartialMatterList =
    resolvedMatterLoadState === 'ready' &&
    typeof matterTotalCount === 'number' &&
    matterTotalCount >= 0 &&
    matterTotalCount > matters.length;
  const matterMeta = matterMetaLabel({
    matterPage,
    matterTotalCount: hasExactMatterTotal ? matterTotalCount : undefined,
    visibleCount: matters.length,
  });

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', '고객', title]}
        title={title}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/clients">
                <ArrowLeft className="h-4 w-4" />
                고객 목록
              </Link>
            </Button>
            {onRefresh ? (
              <Button type="button" variant="outline" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
                새로고침
              </Button>
            ) : null}
          </>
        }
      />

      {loadState === 'loading' ? <EmptyState variant="loading" /> : null}
      {loadState === 'unavailable' ? <EmptyState variant="api-unavailable" /> : null}
      {loadState === 'error' ? <EmptyState variant="api-error" /> : null}
      {loadState === 'forbidden' ? <EmptyState variant="no-access" /> : null}
      {loadState === 'blocked' ? <EmptyState variant="policy-blocked" /> : null}
      {loadState === 'empty' ? <EmptyState variant="no-data" /> : null}

      {loadState === 'ready' && client ? (
        <SectionCard icon={<Building2 className="h-4 w-4" />} title="고객 정보" meta="기본 정보">
          <dl className="grid gap-0 border-t text-sm sm:grid-cols-2 lg:grid-cols-4">
            <DetailField
              label="고객 유형"
              value={clientTypeLabels[client.clientType] ?? clientUnknownLabels.ko.type}
            />
            <DetailField
              label="상태"
              value={statusLabels[client.status] ?? clientUnknownLabels.ko.status}
            />
            <DetailField
              label="기밀도"
              value={
                confidentialityLabels[client.confidentialityLevel] ??
                clientUnknownLabels.ko.confidentiality
              }
            />
            <DetailField label="등록명" value={client.name} />
          </dl>
          <div className="border-t px-5 py-4">
            <p className="text-xs font-semibold text-muted-foreground">구명칭·별칭</p>
            <p className="mt-2 text-sm text-foreground">
              {aliases.length > 0 ? aliases.join(', ') : '등록된 별칭 없음'}
            </p>
          </div>
        </SectionCard>
      ) : null}

      {showMatterSection ? (
        <SectionCard
          icon={<FolderKanban className="h-4 w-4" />}
          title="고객 Matter"
          meta={matterMeta}
          actions={
            resolvedClientId ? (
              <Button asChild variant="outline" size="sm">
                <Link href={clientMatterFilterPath(resolvedClientId)}>Matter 목록 필터</Link>
              </Button>
            ) : null
          }
        >
          {resolvedMatterLoadState === 'loading' ? (
            <EmptyState variant="loading" title="Matter를 불러오는 중입니다." className="m-5" />
          ) : null}
          {resolvedMatterLoadState === 'unavailable' ? (
            <EmptyState
              variant="api-unavailable"
              title="Matter 목록 연결을 확인할 수 없습니다."
              className="m-5"
            />
          ) : null}
          {resolvedMatterLoadState === 'error' ? (
            <EmptyState
              variant="api-error"
              title="Matter 목록을 표시하지 못했습니다."
              description="잠시 후 다시 시도해 주세요."
              className="m-5"
            />
          ) : null}
          {resolvedMatterLoadState === 'forbidden' ? (
            <EmptyState variant="no-access" title="Matter를 볼 권한이 없습니다." className="m-5" />
          ) : null}
          {resolvedMatterLoadState === 'blocked' ? (
            <EmptyState
              variant="policy-blocked"
              title="Matter가 정책에 따라 표시되지 않습니다."
              className="m-5"
            />
          ) : null}
          {resolvedMatterLoadState === 'empty' ? (
            <EmptyState title="이 고객의 Matter가 없습니다." className="m-5" />
          ) : null}
          {resolvedMatterLoadState === 'ready' && matters.length > 0 ? (
            <MatterListTable copy={matterListCopy} matters={matters} />
          ) : null}
          {hasPartialMatterList ? (
            <p className="border-t px-5 py-3 text-sm text-muted-foreground" role="status">
              전체 {matterTotalCount}건 중 현재 페이지 {matters.length}건만 표시합니다. Matter
              목록에서 전체를 확인할 수 있습니다.
            </p>
          ) : null}
        </SectionCard>
      ) : null}
    </PageShell>
  );
}

function matterMetaLabel({
  matterPage,
  matterTotalCount,
  visibleCount,
}: {
  matterPage?: number | undefined;
  matterTotalCount?: number | undefined;
  visibleCount: number;
}): string {
  if (typeof matterTotalCount !== 'number') return '접근 가능한 Matter';
  if (matterTotalCount > visibleCount) {
    const pageLabel =
      typeof matterPage === 'number' && matterPage > 1 ? `${matterPage}페이지 ` : '';
    return `전체 ${matterTotalCount}건 · ${pageLabel}현재 페이지 ${visibleCount}건 표시`;
  }
  return `총 ${matterTotalCount}건`;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b px-5 py-4 lg:border-b-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-2 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
