'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MatterDto } from '@amic-vault/shared';
import { FileSearch, FolderKanban, FolderUp, ShieldCheck } from 'lucide-react';
import { listMatters } from '@/lib/api-client';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';
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
    protected: string;
    empty: string;
    emptyDescription: string;
    upload: string;
    prepTitle: string;
    prepDescription: string;
    loading: string;
    apiError: string;
    noAccess: string;
    policyBlocked: string;
  }
> = {
  ko: {
    title: '사건 목록',
    description: '접근 권한이 확인된 사건만 표시됩니다.',
    scoped: '권한으로 보호됨',
    matter: '사건',
    type: '유형',
    status: '상태',
    security: '보안',
    protected: '보호됨',
    empty: '표시할 사건이 없습니다.',
    emptyDescription: 'Matter app에서 접근 가능한 Matter Code가 확인되면 파일 업로드와 정리 준비를 시작할 수 있습니다.',
    upload: '파일 업로드',
    prepTitle: '업로드 후 파일 정리 준비',
    prepDescription:
      '파일은 Matter Code 선택 후 업로드됩니다. 업로드가 완료되면 파일 개요, 주요 정보, 키워드, 보관 위치 제안이 비동기로 준비됩니다.',
    loading: '사건 목록을 불러오는 중입니다.',
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
    protected: 'Protected',
    empty: 'No matters to show.',
    emptyDescription:
      'When authorized Matter Codes are available from Matter app, you can upload files and start file organization prep.',
    upload: 'Upload file',
    prepTitle: 'File organization prep after upload',
    prepDescription:
      'Files are uploaded after a Matter Code is selected. After upload, profile, key fields, tags, and filing suggestions are prepared asynchronously.',
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
              <Link href="/files">
                <FolderUp className="h-4 w-4" />
                {copy.upload}
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
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_140px_140px_120px] items-center gap-4 border-b px-5 py-4 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              <span>{copy.matter}</span>
              <span>{copy.type}</span>
              <span>{copy.status}</span>
              <span className="text-right">{copy.security}</span>
            </div>
            {matters.map((matter) => (
              <Link
                key={matter.matterId}
                href={`/matters/${matter.matterId}`}
                className="grid grid-cols-[minmax(0,1fr)_140px_140px_120px] items-center gap-4 border-b px-5 py-4 text-sm last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-primary">
                    <FolderKanban className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{matter.matterName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{matter.matterCode}</span>
                  </span>
                </span>
                <span className="truncate text-muted-foreground">{matter.matterType}</span>
                <span>
                  <MatterStatusBadge status={matter.status} />
                </span>
                <span className="text-right text-muted-foreground">{copy.protected}</span>
              </Link>
            ))}
          </div>
        </div>
        {loadState === 'loading' ? (
          <EmptyState variant="api-unavailable" title={copy.loading} className="m-5" />
        ) : null}
        {loadState === 'empty' ? (
          <EmptyState
            title={copy.empty}
            description={copy.emptyDescription}
            className="m-5"
            actions={
              <Button asChild>
                <Link href="/files">
                  <FolderUp className="h-4 w-4" />
                  {copy.upload}
                </Link>
              </Button>
            }
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
