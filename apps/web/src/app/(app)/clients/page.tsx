'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Building2, CircleAlert, Plus, RefreshCw, Save, Search } from 'lucide-react';
import {
  clientConfidentialityLevels,
  clientTypes,
  type ClientConfidentialityLevel,
  type ClientDto,
  type ClientListDto,
  type ClientType,
} from '@amic-vault/shared';
import { ApiClientError, createClient, listClients } from '@/lib/api-client';
import { dataStateStatusForApiError } from '@/lib/api/error-messages';
import type { DataState } from '@/lib/data-state';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { buildCreateClientInput, type NewClientFormState } from './client-create-contract';
import { ClientListTable } from './client-list-table';

type ClientLoadState = DataState<ClientDto[]>['status'];
type SubmitState = 'idle' | 'submitting' | 'invalid' | 'error';

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
  const [listMeta, setListMeta] = useState<Pick<ClientListDto, 'totalCount' | 'page' | 'pageSize'> | null>(
    null,
  );
  const [form, setForm] = useState<NewClientFormState>(initialForm);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<unknown>(null);

  const refreshClients = useCallback(() => {
    setLoadState('loading');
    listClients({
      pageSize: 100,
      ...(activeSearchQuery ? { q: activeSearchQuery } : {}),
    })
      .then((result) => {
        setClients(result.items);
        setListMeta({
          page: result.page,
          pageSize: result.pageSize,
          totalCount: result.totalCount,
        });
        setLoadState(result.items.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: unknown) => {
        setClients([]);
        setListMeta(null);
        setLoadState(dataStateStatusForApiError(error));
      });
  }, [activeSearchQuery]);

  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveSearchQuery(searchQuery.trim());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    let input: ReturnType<typeof buildCreateClientInput>;
    try {
      input = buildCreateClientInput(form);
    } catch (error) {
      setSubmitError(error);
      setSubmitState('invalid');
      return;
    }

    setSubmitState('submitting');
    try {
      await createClient(input);
      setForm(initialForm);
      setSubmitState('idle');
      setSearchQuery('');
      setActiveSearchQuery('');
    } catch (error) {
      setSubmitError(error);
      setSubmitState('error');
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
          <form
            className="flex min-w-0 items-center gap-2"
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
            />
            <Button type="submit" variant="outline" size="sm">
              <Search className="h-4 w-4" aria-hidden="true" />
              검색
            </Button>
          </form>
        }
      >
        <ClientListTable clients={clients} />
        {loadState === 'loading' ? (
          <EmptyState variant="api-unavailable" className="m-5" />
        ) : null}
        {loadState === 'empty' ? (
          <EmptyState
            title={activeSearchQuery ? '검색 결과가 없습니다.' : '등록된 고객이 없습니다.'}
            className="m-5"
          />
        ) : null}
        {loadState === 'error' ? <EmptyState variant="api-error" className="m-5" /> : null}
        {loadState === 'forbidden' ? <EmptyState variant="no-access" className="m-5" /> : null}
        {loadState === 'blocked' ? (
          <EmptyState variant="policy-blocked" className="m-5" />
        ) : null}
      </SectionCard>

      <details className="rounded-md border bg-card" id="client-create">
        <summary
          aria-controls="client-create-form"
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-[18px]"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>고객 등록</span>
          </span>
          <span className="text-xs font-normal text-muted-foreground">등록 양식 열기</span>
        </summary>
        <div className="border-t p-4 sm:p-[18px]">
          <form className="grid gap-4" id="client-create-form" onSubmit={submit}>
            <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_180px_180px]">
              <label className="grid gap-1.5 text-sm font-medium">
                고객명
                <Input
                  required
                  aria-label="고객명"
                  autoComplete="off"
                  disabled={submitState === 'submitting'}
                  maxLength={1000}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                고객 유형
                <select
                  aria-label="고객 유형"
                  className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={submitState === 'submitting'}
                  value={form.clientType}
                  onChange={(event) =>
                    setForm({ ...form, clientType: event.target.value as ClientType })
                  }
                >
                  {clientTypes.map((type) => (
                    <option key={type} value={type}>
                      {clientTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                기밀도
                <select
                  aria-label="기밀도"
                  className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={submitState === 'submitting'}
                  value={form.confidentialityLevel}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      confidentialityLevel: event.target.value as ClientConfidentialityLevel,
                    })
                  }
                >
                  {clientConfidentialityLevels.map((level) => (
                    <option key={level} value={level}>
                      {confidentialityLabels[level]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              별칭
              <textarea
                aria-label="별칭"
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitState === 'submitting'}
                maxLength={4000}
                placeholder="구명칭, 약칭"
                value={form.aliasesText}
                onChange={(event) => setForm({ ...form, aliasesText: event.target.value })}
              />
            </label>
            {errorMessage ? (
              <p className="flex items-center gap-2 text-sm font-medium text-destructive" role="alert">
                <CircleAlert className="h-4 w-4" aria-hidden="true" />
                {errorMessage}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={submitState === 'submitting'}>
                <Save className="h-4 w-4" />
                고객 등록
              </Button>
            </div>
          </form>
        </div>
      </details>
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
