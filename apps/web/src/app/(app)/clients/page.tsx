'use client';

import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Building2, Plus, RefreshCw, Search } from 'lucide-react';
import { type ClientDto, type ClientListDto } from '@amic-vault/shared';
import { ApiClientError, createClient, listClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import {
  buildCreateClientInput,
  prependCreatedClient,
  type NewClientFormState,
} from './client-create-contract';
import { ClientCreateDialog, closeClientCreateDialog } from './client-create-dialog';
import { ClientListTable } from './client-list-table';
import {
  cancelPendingClientListRequest,
  loadClientList,
  type ClientListLoadUpdate,
  type ClientResourceLoadState,
} from './client-load-state';

type ClientLoadState = ClientResourceLoadState;
type SubmitState = 'idle' | 'submitting' | 'invalid' | 'error';

const initialForm: NewClientFormState = {
  aliasesText: '',
  clientType: 'corporation',
  confidentialityLevel: 'standard',
  name: '',
};

function submitErrorMessage(error: unknown, submitState: SubmitState): string | null {
  if (submitState === 'invalid') return '고객명과 입력값을 확인해 주세요.';
  if (submitState !== 'error') return null;
  if (error instanceof ApiClientError) {
    if (error.code === 'PERMISSION_DENIED' || error.code === 'AUTH_REQUIRED') {
      return '고객을 등록할 권한이 없습니다.';
    }
  }
  return '고객을 등록하지 못했습니다.';
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [loadState, setLoadState] = useState<ClientLoadState>('loading');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [listMeta, setListMeta] = useState<Pick<
    ClientListDto,
    'totalCount' | 'page' | 'pageSize'
  > | null>(null);
  const [form, setForm] = useState<NewClientFormState>(initialForm);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelClientListRequestRef = useRef<(() => void) | null>(null);

  const invalidateClientList = useCallback(() => {
    cancelPendingClientListRequest(cancelClientListRequestRef);
    setClients([]);
    setListMeta(null);
    setLoadState('loading');
  }, []);

  const refreshClients = useCallback(() => {
    invalidateClientList();
    cancelClientListRequestRef.current = loadClientList(
      {
        pageSize: 100,
        ...(activeSearchQuery ? { q: activeSearchQuery } : {}),
      },
      (update: ClientListLoadUpdate) => {
        setClients(update.clients);
        setListMeta(update.listMeta);
        setLoadState(update.loadState);
      },
      listClients,
    );
  }, [activeSearchQuery, invalidateClientList]);

  useEffect(() => {
    refreshClients();
    return () => {
      cancelPendingClientListRequest(cancelClientListRequestRef);
    };
  }, [refreshClients]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearchQuery = searchQuery.trim();
    invalidateClientList();
    if (nextSearchQuery === activeSearchQuery) {
      refreshClients();
      return;
    }
    setActiveSearchQuery(nextSearchQuery);
  }

  function openCreateDialog() {
    setSubmitError(null);
    setSubmitState('idle');
    setCreateDialogOpen(true);
  }

  function closeCreateDialog(): boolean {
    if (submitState === 'submitting') return false;
    setCreateDialogOpen(false);
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    setSubmitError(null);
    let input: ReturnType<typeof buildCreateClientInput>;
    try {
      input = buildCreateClientInput(form);
    } catch (error) {
      setSubmitError(error);
      setSubmitState('invalid');
      return false;
    }

    setSubmitState('submitting');
    try {
      const client = await createClient(input);
      cancelPendingClientListRequest(cancelClientListRequestRef);
      setForm(initialForm);
      setSubmitState('idle');
      setSearchQuery('');
      if (activeSearchQuery) {
        setActiveSearchQuery('');
        return true;
      }
      setClients((current) => prependCreatedClient(current, client));
      setListMeta((current) =>
        current
          ? { ...current, totalCount: current.totalCount + 1 }
          : { page: 1, pageSize: 100, totalCount: 1 },
      );
      setLoadState('ready');
      return true;
    } catch (error) {
      setSubmitError(error);
      setSubmitState('error');
      return false;
    }
  }

  const errorMessage = submitErrorMessage(submitError, submitState);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', '고객']}
        title="고객"
        actions={
          <Button type="button" variant="outline" onClick={refreshClients}>
            <RefreshCw className="h-4 w-4" />
            새로고침
          </Button>
        }
      />

      <SectionCard
        icon={<Building2 className="h-4 w-4" />}
        title="고객 목록"
        meta={clientListMetaLabel(listMeta, activeSearchQuery, clients.length)}
        actions={
          <>
            <Button
              ref={createTriggerRef}
              aria-expanded={createDialogOpen}
              aria-haspopup="dialog"
              className="shrink-0"
              type="button"
              variant="outline"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              고객 등록
            </Button>
            <form
              className="flex min-w-0 flex-1 items-center gap-2"
              onSubmit={submitSearch}
              role="search"
              aria-label="고객 목록 검색"
            >
              <label className="sr-only" htmlFor="client-search">
                고객 검색
              </label>
              <Input
                id="client-search"
                name="q"
                placeholder="고객 검색"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="min-w-0"
              />
              <Button className="shrink-0" type="submit" variant="outline" size="sm">
                <Search className="h-4 w-4" aria-hidden="true" />
                검색
              </Button>
            </form>
          </>
        }
      >
        <ClientListTable clients={clients} />
        {loadState === 'loading' ? <EmptyState variant="loading" className="m-5" /> : null}
        {loadState === 'unavailable' ? (
          <EmptyState variant="api-unavailable" className="m-5" />
        ) : null}
        {loadState === 'empty' ? (
          <EmptyState
            title={activeSearchQuery ? '검색 결과가 없습니다.' : '등록된 고객이 없습니다.'}
            className="m-5"
          />
        ) : null}
        {loadState === 'ready' && clients.length === 0 ? (
          <EmptyState
            title="현재 페이지에 표시할 고객이 없습니다."
            description="전체 고객 수는 목록 상단의 서버 집계를 따릅니다."
            className="m-5"
          />
        ) : null}
        {loadState === 'error' ? <EmptyState variant="api-error" className="m-5" /> : null}
        {loadState === 'forbidden' ? <EmptyState variant="no-access" className="m-5" /> : null}
        {loadState === 'blocked' ? <EmptyState variant="policy-blocked" className="m-5" /> : null}
      </SectionCard>
      <ClientCreateDialog
        errorMessage={errorMessage}
        form={form}
        onChange={setForm}
        onClose={closeCreateDialog}
        onSubmit={async (event) => {
          if (await submit(event)) closeClientCreateDialog(closeCreateDialog, createTriggerRef);
        }}
        open={createDialogOpen}
        returnFocusRef={createTriggerRef}
        submitState={submitState}
      />
    </PageShell>
  );
}

function clientListMetaLabel(
  meta: Pick<ClientListDto, 'totalCount' | 'page' | 'pageSize'> | null,
  query: string,
  visibleCount: number,
): string {
  if (!meta) return query ? '검색 결과' : '접근 가능한 고객';
  if (meta.totalCount > visibleCount) {
    return query
      ? `검색 결과 ${meta.totalCount}건 · 현재 ${visibleCount}건 표시`
      : `전체 ${meta.totalCount}건 · 현재 ${visibleCount}건 표시`;
  }
  return query ? `검색 결과 ${meta.totalCount}건` : `총 ${meta.totalCount}건`;
}
