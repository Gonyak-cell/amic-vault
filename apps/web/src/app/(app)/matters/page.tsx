'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MatterDto } from '@amic-vault/shared';
import { FolderKanban, FolderPlus, Search } from 'lucide-react';
import { listMatters } from '@/lib/api-client';
import { MatterListTable } from '@/components/matter/matter-list-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
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
    listSearch: string;
    listSearchPlaceholder: string;
    searchAction: string;
  }
> = {
  ko: {
    title: 'Matter 목록',
    matter: 'Matter',
    client: '고객',
    status: '상태',
    actions: '작업',
    empty: '표시할 Matter가 없습니다.',
    emptyDescription: '새 Matter를 등록하거나 검색 조건을 바꿔 보세요.',
    fileCabinet: '파일함',
    searchMatter: '검색',
    moreActions: '추가 작업',
    owner: '담당자',
    ownerUnassigned: '미지정',
    recentUpdate: '최근 변경',
    newMatter: '새 Matter',
    clientFilterActive: '선택한 고객의 Matter만 표시합니다.',
    clearFilter: '전체 Matter 보기',
    listSearch: 'Matter 목록 검색',
    listSearchPlaceholder: 'Matter 코드, 이름 또는 고객',
    searchAction: '검색',
  },
  en: {
    title: 'Matter list',
    matter: 'Matter',
    client: 'Client',
    status: 'Status',
    actions: 'Actions',
    empty: 'No matters to show.',
    emptyDescription: 'Create a matter or change the current filters.',
    fileCabinet: 'Files',
    searchMatter: 'Search',
    moreActions: 'More actions',
    owner: 'Owner',
    ownerUnassigned: 'Unassigned',
    recentUpdate: 'Updated',
    newMatter: 'New Matter',
    clientFilterActive: 'Showing matters for the selected client.',
    clearFilter: 'View all matters',
    listSearch: 'Search Matter list',
    listSearchPlaceholder: 'Matter code, name, or client',
    searchAction: 'Search',
  },
};

export default function MattersPage({ searchParams = {} }: { searchParams?: MatterSearchParams }) {
  const { language, t } = useI18n();
  const copy = mattersCopy[language];
  const [matters, setMatters] = useState<MatterDto[]>([]);
  const [loadState, setLoadState] = useState<MatterLoadState>('loading');
  const listQuery = listMatterQueryFromSearchParams(searchParams);
  const clientIdFilter = listQuery.clientId;
  const searchQuery = listQuery.q;
  const clientFilterActive = Boolean(clientIdFilter);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    listMatters({
      pageSize: 20,
      ...(clientIdFilter ? { clientId: clientIdFilter } : {}),
      ...(searchQuery ? { q: searchQuery } : {}),
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
  }, [clientIdFilter, searchQuery]);

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
              <Link
                href={searchQuery ? `/matters?q=${encodeURIComponent(searchQuery)}` : '/matters'}
              >
                {copy.clearFilter}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <SectionCard icon={<FolderKanban className="h-4 w-4" />} title={copy.title}>
        <form
          action="/matters"
          className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
          method="get"
          role="search"
          aria-label={copy.listSearch}
        >
          <label className="sr-only" htmlFor="matter-list-search">
            {copy.listSearch}
          </label>
          <Input
            id="matter-list-search"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={searchQuery}
            placeholder={copy.listSearchPlaceholder}
          />
          {clientIdFilter ? <input name="clientId" type="hidden" value={clientIdFilter} /> : null}
          <Button className="w-full sm:w-auto" type="submit" variant="outline" size="sm">
            <Search className="h-4 w-4" aria-hidden="true" />
            {copy.searchAction}
          </Button>
        </form>
        <MatterListTable copy={copy} matters={matters} />
        {loadState === 'loading' ? (
          <EmptyState variant="loading" title={t('dataState.loading')} className="m-5" />
        ) : null}
        {loadState === 'empty' ? (
          <EmptyState title={copy.empty} description={copy.emptyDescription} className="m-5" />
        ) : null}
        {loadState === 'error' ? (
          <EmptyState variant="api-error" title={t('dataState.error')} className="m-5" />
        ) : null}
        {loadState === 'forbidden' ? (
          <EmptyState variant="no-access" title={t('dataState.forbidden')} className="m-5" />
        ) : null}
        {loadState === 'blocked' ? (
          <EmptyState variant="policy-blocked" title={t('dataState.blocked')} className="m-5" />
        ) : null}
      </SectionCard>
    </PageShell>
  );
}

function matterLoadStateForError(error: unknown): MatterLoadState {
  return dataStateStatusForApiError(error);
}
