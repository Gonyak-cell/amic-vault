'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MatterDto } from '@amic-vault/shared';
import { FolderKanban, FolderPlus } from 'lucide-react';
import { listMatters } from '@/lib/api-client';
import { MatterListTable } from '@/components/matter/matter-list-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { dataStateStatusForApiError } from '@/lib/api/error-messages';
import type { DataState } from '@/lib/data-state';
import { useI18n, type Language } from '@/lib/i18n';
import { listMatterQueryFromSearchParams, type MatterSearchParams } from './matter-list-query';

type MatterLoadState = DataState<MatterDto[]>['status'];

const mattersCopy: Record<
  Language,
  {
    title: string;
    matter: string;
    client: string;
    status: string;
    actions: string;
    empty: string;
    emptyDescription: string;
    fileCabinet: string;
    searchMatter: string;
    moreActions: string;
    owner: string;
    ownerUnassigned: string;
    recentUpdate: string;
    newMatter: string;
    clientFilterActive: string;
    clearFilter: string;
    loading: string;
    apiError: string;
    noAccess: string;
    policyBlocked: string;
  }
> = {
  ko: {
    title: 'Matter 목록',
    matter: 'Matter',
    client: '고객',
    status: '상태',
    actions: '작업',
    empty: '표시할 Matter가 없습니다.',
    emptyDescription:
      'Matter 관리 시스템에서 신규 Matter를 만들거나 Matter 코드 동기화가 완료되면 문서 보관함에 표시됩니다.',
    fileCabinet: '파일함',
    searchMatter: '검색',
    moreActions: '추가 작업',
    owner: '담당자',
    ownerUnassigned: '미지정',
    recentUpdate: '최근 변경',
    newMatter: '새 Matter',
    clientFilterActive: '선택한 고객의 Matter만 표시합니다.',
    clearFilter: '전체 Matter 보기',
    loading: 'Matter 목록을 불러오는 중입니다.',
    apiError: '데이터를 표시할 수 없습니다.',
    noAccess: '이 항목을 볼 권한이 없습니다.',
    policyBlocked: '정보 차단 또는 권한 정책으로 표시할 수 없습니다.',
  },
  en: {
    title: 'Matter list',
    matter: 'Matter',
    client: 'Client',
    status: 'Status',
    actions: 'Actions',
    empty: 'No matters to show.',
    emptyDescription:
      'Create a matter in the Matter app or sync Matter codes, then Vault will show the authorized Matter here.',
    fileCabinet: 'Files',
    searchMatter: 'Search',
    moreActions: 'More actions',
    owner: 'Owner',
    ownerUnassigned: 'Unassigned',
    recentUpdate: 'Updated',
    newMatter: 'New Matter',
    clientFilterActive: 'Showing matters for the selected client.',
    clearFilter: 'View all matters',
    loading: 'Loading matters.',
    apiError: 'Unable to display data.',
    noAccess: 'You do not have permission to view this item.',
    policyBlocked: 'Information barrier or permission policy prevents display.',
  },
};

export default function MattersPage({ searchParams = {} }: { searchParams?: MatterSearchParams }) {
  const { language } = useI18n();
  const copy = mattersCopy[language];
  const [matters, setMatters] = useState<MatterDto[]>([]);
  const [loadState, setLoadState] = useState<MatterLoadState>('loading');
  const clientIdFilter = listMatterQueryFromSearchParams(searchParams).clientId;
  const clientFilterActive = Boolean(clientIdFilter);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    listMatters({
      pageSize: 20,
      ...(clientIdFilter ? { clientId: clientIdFilter } : {}),
    })
      .then((result) => {
        if (!active) return;
        setMatters(result.items);
        setLoadState(result.items.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMatters([]);
        setLoadState(matterLoadStateForError(error));
      });
    return () => {
      active = false;
    };
  }, [clientIdFilter]);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', copy.matter]}
        title={copy.title}
        actions={
          <Button asChild>
            <Link href="/matters/new">
              <FolderPlus className="h-4 w-4" />
              {copy.newMatter}
            </Link>
          </Button>
        }
      />

      {clientFilterActive ? (
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FolderKanban className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="min-w-0 text-sm font-medium leading-6 text-foreground">
                {copy.clientFilterActive}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/matters">{copy.clearFilter}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <SectionCard icon={<FolderKanban className="h-4 w-4" />} title={copy.title}>
        <MatterListTable copy={copy} matters={matters} />
        {loadState === 'loading' ? (
          <EmptyState variant="api-unavailable" title={copy.loading} className="m-5" />
        ) : null}
        {loadState === 'empty' ? (
          <EmptyState title={copy.empty} description={copy.emptyDescription} className="m-5" />
        ) : null}
        {loadState === 'error' ? (
          <EmptyState variant="api-error" title={copy.apiError} className="m-5" />
        ) : null}
        {loadState === 'forbidden' ? (
          <EmptyState variant="no-access" title={copy.noAccess} className="m-5" />
        ) : null}
        {loadState === 'blocked' ? (
          <EmptyState variant="policy-blocked" title={copy.policyBlocked} className="m-5" />
        ) : null}
      </SectionCard>
    </PageShell>
  );
}

function matterLoadStateForError(error: unknown): MatterLoadState {
  return dataStateStatusForApiError(error);
}
