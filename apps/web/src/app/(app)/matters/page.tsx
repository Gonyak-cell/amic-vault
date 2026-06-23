'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MatterDto } from '@amic-vault/shared';
import { FileSearch, FolderKanban, FolderPlus, ShieldCheck } from 'lucide-react';
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

type MatterLoadState = DataState<MatterDto[]>['status'];

const mattersCopy: Record<
  Language,
  {
    title: string;
    description: string;
    scoped: string;
    matter: string;
    type: string;
    status: string;
    security: string;
    actions: string;
    protected: string;
    empty: string;
    emptyDescription: string;
    openMatter: string;
    fileCabinet: string;
    searchMatter: string;
    prepTitle: string;
    prepDescription: string;
    newMatter: string;
    loading: string;
    apiError: string;
    noAccess: string;
    policyBlocked: string;
  }
> = {
  ko: {
    title: 'Matter 목록',
    description: 'Matter app에서 동기화되고 접근 권한이 확인된 Matter만 표시됩니다.',
    scoped: '권한으로 보호됨',
    matter: 'Matter',
    type: '유형',
    status: '상태',
    security: '보안',
    actions: '작업',
    protected: '보호됨',
    empty: '표시할 Matter가 없습니다.',
    emptyDescription:
      'Matter app에서 신규 Matter를 만들거나 Matter Code 동기화가 완료되면 Vault에 표시됩니다.',
    openMatter: '열기',
    fileCabinet: '파일함',
    searchMatter: '검색',
    prepTitle: 'Matter app 연동 기준',
    prepDescription:
      'Vault는 Matter app에서 확정된 Matter Code를 받아 문서함, 검색, 권한 흐름에 연결합니다.',
    newMatter: 'New Matter',
    loading: 'Matter 목록을 불러오는 중입니다.',
    apiError: '데이터를 표시할 수 없습니다.',
    noAccess: '이 항목을 볼 권한이 없습니다.',
    policyBlocked: '정보 차단 또는 권한 정책으로 표시할 수 없습니다.',
  },
  en: {
    title: 'Matter list',
    description: 'Only matters confirmed by access permissions are shown.',
    scoped: 'Workspace permissions applied',
    matter: 'Matter',
    type: 'Type',
    status: 'Status',
    security: 'Security',
    actions: 'Actions',
    protected: 'Protected',
    empty: 'No matters to show.',
    emptyDescription:
      'Create a matter in the Matter app or sync Matter Codes, then Vault will show the authorized Matter here.',
    openMatter: 'Open',
    fileCabinet: 'Files',
    searchMatter: 'Search',
    prepTitle: 'Matter app source of truth',
    prepDescription:
      'Vault receives confirmed Matter Codes from the Matter app and connects them to the document vault, search, and permission flows.',
    newMatter: 'New Matter',
    loading: 'Loading matters.',
    apiError: 'Unable to display data.',
    noAccess: 'You do not have permission to view this item.',
    policyBlocked: 'Information barrier or permission policy prevents display.',
  },
};

export default function MattersPage() {
  const { language } = useI18n();
  const copy = mattersCopy[language];
  const [matters, setMatters] = useState<MatterDto[]>([]);
  const [loadState, setLoadState] = useState<MatterLoadState>('loading');

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    listMatters({ pageSize: 20 })
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
  }, []);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', copy.matter]}
        title={copy.title}
        description={copy.description}
        actions={
          <>
            <Button asChild>
              <Link href="/integrations/matter-app">
                <FolderPlus className="h-4 w-4" />
                {copy.newMatter}
              </Link>
            </Button>
            <div className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-4 text-sm font-semibold">
              <FileSearch className="h-4 w-4" />
              {copy.scoped}
            </div>
          </>
        }
      />

      <div className="rounded-md border bg-card px-4 py-3">
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{copy.prepTitle}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.prepDescription}</p>
          </div>
        </div>
      </div>

      <SectionCard icon={<FolderKanban className="h-4 w-4" />} title={copy.title} meta={copy.scoped}>
        <MatterListTable copy={copy} matters={matters} />
        {loadState === 'loading' ? (
          <EmptyState variant="api-unavailable" title={copy.loading} className="m-5" />
        ) : null}
        {loadState === 'empty' ? (
          <EmptyState
            title={copy.empty}
            description={copy.emptyDescription}
            className="m-5"
          />
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
