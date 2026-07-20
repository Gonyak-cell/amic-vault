'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Building2, CircleAlert, Plus, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import {
  clientConfidentialityLevels,
  clientTypes,
  type ClientConfidentialityLevel,
  type ClientDto,
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
  const [form, setForm] = useState<NewClientFormState>(initialForm);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<unknown>(null);

  const refreshClients = useCallback(() => {
    setLoadState('loading');
    listClients({ pageSize: 100 })
      .then((result) => {
        setClients(result.items);
        setLoadState(result.items.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: unknown) => {
        setClients([]);
        setLoadState(dataStateStatusForApiError(error));
      });
  }, []);

  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

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
      const client = await createClient(input);
      setClients((current) => [
        client,
        ...current.filter((item) => item.clientId !== client.clientId),
      ]);
      setLoadState('ready');
      setForm(initialForm);
      setSubmitState('idle');
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
        description="Matter 생성 고객 원장"
        actions={
          <Button type="button" variant="outline" onClick={refreshClients}>
            <RefreshCw className="h-4 w-4" />
            새로고침
          </Button>
        }
      />

      <div className="rounded-md border bg-card px-4 py-3">
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">운영 기준</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              활성 고객 기준으로 Matter intake 목록을 구성합니다.
            </p>
          </div>
        </div>
      </div>

      <SectionCard icon={<Plus className="h-4 w-4" />} title="고객 등록" meta="Matter intake">
        <form className="grid gap-4" onSubmit={submit}>
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
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
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
      </SectionCard>

      <SectionCard icon={<Building2 className="h-4 w-4" />} title="고객 목록" meta="권한 확인">
        <ClientListTable clients={clients} />
        {loadState === 'loading' ? (
          <EmptyState
            variant="api-unavailable"
            title="고객 목록을 불러오는 중입니다."
            className="m-5"
          />
        ) : null}
        {loadState === 'empty' ? (
          <EmptyState title="등록된 고객이 없습니다." className="m-5" />
        ) : null}
        {loadState === 'error' ? (
          <EmptyState variant="api-error" title="고객 목록을 표시할 수 없습니다." className="m-5" />
        ) : null}
        {loadState === 'forbidden' ? (
          <EmptyState variant="no-access" title="고객 목록을 볼 권한이 없습니다." className="m-5" />
        ) : null}
        {loadState === 'blocked' ? (
          <EmptyState
            variant="policy-blocked"
            title="권한 정책으로 고객 목록을 표시할 수 없습니다."
            className="m-5"
          />
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
