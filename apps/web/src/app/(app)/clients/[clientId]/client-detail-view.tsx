'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, FolderKanban, RefreshCw, ShieldCheck } from 'lucide-react';
import type {
  ClientConfidentialityLevel,
  ClientDto,
  ClientStatus,
  ClientType,
  MatterDto,
} from '@amic-vault/shared';
import { MatterListTable, type MatterListTableCopy } from '@/components/matter/matter-list-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';

export type ClientDetailLoadState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'forbidden'
  | 'blocked';

const clientTypeLabels = {
  corporation: '법인',
  fund: '펀드',
  government: '공공기관',
  individual: '개인',
  npo: '비영리',
  other: '기타',
} satisfies Record<ClientType, string>;

const confidentialityLabels = {
  high: '높음',
  restricted: '제한',
  standard: '표준',
} satisfies Record<ClientConfidentialityLevel, string>;

const statusLabels = {
  active: '활성',
  closed: '종료',
  dormant: '휴면',
} satisfies Record<ClientStatus, string>;

const matterListCopy = {
  actions: '작업',
  client: '고객',
  fileCabinet: '파일함',
  matter: 'Matter',
  openMatter: '열기',
  protected: '보호됨',
  searchMatter: '검색',
  security: '보안',
  status: '상태',
  type: '유형',
} satisfies MatterListTableCopy;

export function clientMatterFilterPath(clientId: string): string {
  return `/matters?clientId=${encodeURIComponent(clientId)}`;
}

export function ClientDetailView({
  client,
  loadState,
  matters,
  onRefresh,
}: {
  client: ClientDto | null;
  loadState: ClientDetailLoadState;
  matters: MatterDto[];
  onRefresh?: () => void;
}) {
  const aliases = client && Array.isArray(client.aliases) ? client.aliases : [];
  const title = client?.displayName || client?.name || '고객 상세';

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', '고객', title]}
        title={title}
        description="고객 원장과 관련 Matter"
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

      {loadState === 'loading' ? (
        <EmptyState variant="api-unavailable" title="고객 정보를 불러오는 중입니다." />
      ) : null}
      {loadState === 'error' ? (
        <EmptyState variant="api-error" title="고객 정보를 표시할 수 없습니다." />
      ) : null}
      {loadState === 'forbidden' ? (
        <EmptyState variant="no-access" title="고객 정보를 볼 권한이 없습니다." />
      ) : null}
      {loadState === 'blocked' ? (
        <EmptyState
          variant="policy-blocked"
          title="권한 정책으로 고객 정보를 표시할 수 없습니다."
        />
      ) : null}

      {loadState === 'ready' && client ? (
        <>
          <SectionCard
            icon={<Building2 className="h-4 w-4" />}
            title="고객 정보"
            meta="Client master"
          >
            <dl className="grid gap-0 border-t text-sm sm:grid-cols-2 lg:grid-cols-4">
              <DetailField label="고객 ID" value={client.clientId} />
              <DetailField
                label="고객 유형"
                value={clientTypeLabels[client.clientType as ClientType] ?? client.clientType}
              />
              <DetailField
                label="상태"
                value={statusLabels[client.status as ClientStatus] ?? client.status}
              />
              <DetailField
                label="기밀도"
                value={
                  confidentialityLabels[
                    client.confidentialityLevel as ClientConfidentialityLevel
                  ] ?? client.confidentialityLevel
                }
              />
            </dl>
            <div className="border-t px-5 py-4">
              <p className="text-xs font-semibold text-muted-foreground">구명칭·별칭</p>
              <p className="mt-2 text-sm text-foreground">
                {aliases.length > 0 ? aliases.join(', ') : '등록된 별칭 없음'}
              </p>
            </div>
          </SectionCard>

          <div className="rounded-md border bg-card px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="min-w-0 text-sm font-medium leading-6 text-foreground">
                  이 고객 기준으로 Matter intake와 검색 범위를 확인합니다.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={clientMatterFilterPath(client.clientId)}>Matter 목록 필터</Link>
              </Button>
            </div>
          </div>

          <SectionCard
            icon={<FolderKanban className="h-4 w-4" />}
            title="고객 Matter"
            meta={`${matters.length}건`}
          >
            {matters.length > 0 ? (
              <MatterListTable copy={matterListCopy} matters={matters} />
            ) : (
              <EmptyState title="이 고객의 Matter가 없습니다." className="m-5" />
            )}
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b px-5 py-4 lg:border-b-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-2 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
