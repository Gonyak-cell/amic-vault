'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { auditActions, type AuditAction } from '@amic-vault/shared';
import { AuditEventInspector } from '@/components/audit/audit-event-inspector';
import { AuditEventTable } from '@/components/audit/audit-event-table';
import { Button } from '@/components/ui/button';
import { FilterBar, FilterField } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { exportAuditEventsCsv, getAuditAnchorStatus, listAuditEvents } from '@/lib/api/audit';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { auditActionLabel } from '@/lib/audit-labels';
import { useI18n } from '@/lib/i18n';

interface FilterState {
  action: string;
  result: string;
  from: string;
  to: string;
}

const emptyFilters: FilterState = {
  action: '',
  result: '',
  from: '',
  to: '',
};

export function AuditConsoleClient() {
  const { language } = useI18n();
  const copy =
    language === 'ko'
      ? {
          title: '활동 기록',
          description: '접근 가능한 활동 기록을 기간, 활동, 결과 기준으로 조회합니다.',
          filterTitle: '활동 기록 필터',
          filterMeta: '운영 데이터 기준',
          action: '활동',
          allActions: '모든 활동',
          result: '결과',
          allResults: '모든 결과',
          success: '성공',
          denied: '접근 제한',
          failure: '실패',
          from: '시작일',
          to: '종료일',
          search: '검색',
          export: 'CSV 내보내기',
          more: '더 보기',
          anchorTitle: '감사 무결성',
          anchorChecking: '확인 중',
          anchorVerified: '검증됨',
          anchorMissing: '앵커 없음',
          anchorMismatch: '불일치',
          anchorUnavailable: '확인 실패',
          latestAnchor: '최근 앵커',
          anchoredEvents: '이벤트',
          sequenceRange: '기록 순번',
          storageReceipt: '보관 확인',
          stored: '있음',
          notStored: '없음',
        }
      : {
          title: 'Activity log',
          description: 'Review accessible activity by date, activity, and result.',
          filterTitle: 'Activity filters',
          filterMeta: 'Operational data',
          action: 'Activity',
          allActions: 'All activity',
          result: 'Result',
          allResults: 'All results',
          success: 'Success',
          denied: 'Access restricted',
          failure: 'Failure',
          from: 'From',
          to: 'To',
          search: 'Search activity',
          export: 'Export CSV',
          more: 'More',
          anchorTitle: 'Audit integrity',
          anchorChecking: 'Checking',
          anchorVerified: 'Verified',
          anchorMissing: 'No anchor',
          anchorMismatch: 'Mismatch',
          anchorUnavailable: 'Unavailable',
          latestAnchor: 'Latest anchor',
          anchoredEvents: 'Events',
          sequenceRange: 'Seq',
          storageReceipt: 'Object receipt',
          stored: 'Recorded',
          notStored: 'Missing',
        };
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof listAuditEvents>>['items']>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [auditReady, setAuditReady] = useState(false);
  const [anchorStatus, setAnchorStatus] = useState<Awaited<
    ReturnType<typeof getAuditAnchorStatus>
  > | null>(null);
  const [anchorStatusFailed, setAnchorStatusFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => queryFromFilters(appliedFilters), [appliedFilters]);
  const selectedEvent = useMemo(
    () => events.find((event) => event.eventId === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const load = useCallback(
    async (cursor?: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const result = await listAuditEvents({ ...query, cursor: cursor ?? undefined, limit: 50 });
        setEvents((current) => (cursor ? [...current, ...result.items] : result.items));
        if (!cursor) setSelectedEventId(result.items[0]?.eventId ?? null);
        setNextCursor(result.nextCursor);
        setAuditReady(true);
      } catch (caught) {
        setEvents([]);
        setSelectedEventId(null);
        setNextCursor(null);
        setAuditReady(false);
        setError(safeApiErrorMessage(caught));
      } finally {
        setBusy(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    let active = true;
    void getAuditAnchorStatus()
      .then((status) => {
        if (!active) return;
        setAnchorStatus(status);
        setAnchorStatusFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setAnchorStatus(null);
        setAnchorStatusFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  async function exportCsv() {
    setBusy(true);
    setError(null);
    try {
      const csv = await exportAuditEventsCsv({ ...query, limit: 1000 });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'amic-vault-audit-events.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader title={copy.title} description={copy.description} />
      <form onSubmit={submit}>
        <FilterBar
          actions={
            <>
              <Button aria-label={copy.search} title={copy.search} type="submit" disabled={busy}>
                <Search className="h-4 w-4" />
                {copy.search}
              </Button>
              <Button
                aria-label={copy.export}
                title={copy.export}
                type="button"
                variant="outline"
                disabled={busy || !auditReady}
                onClick={exportCsv}
              >
                <Download className="h-4 w-4" />
                {copy.export}
              </Button>
            </>
          }
          label={copy.filterTitle}
          title={copy.filterTitle}
          description={copy.filterMeta}
        >
          <FilterField htmlFor="audit-action-filter" label={copy.action}>
            <select
              id="audit-action-filter"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filters.action}
              onChange={(event) => setFilters({ ...filters, action: event.target.value })}
            >
              <option value="">{copy.allActions}</option>
              {auditActions.map((action) => (
                <option key={action} value={action}>
                  {auditActionLabel(action, language)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField htmlFor="audit-result-filter" label={copy.result}>
            <select
              id="audit-result-filter"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filters.result}
              onChange={(event) => setFilters({ ...filters, result: event.target.value })}
            >
              <option value="">{copy.allResults}</option>
              <option value="success">{copy.success}</option>
              <option value="denied">{copy.denied}</option>
              <option value="failure">{copy.failure}</option>
            </select>
          </FilterField>

          <FilterField htmlFor="audit-from-filter" label={copy.from}>
            <Input
              id="audit-from-filter"
              type="date"
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
          </FilterField>

          <FilterField htmlFor="audit-to-filter" label={copy.to}>
            <Input
              id="audit-to-filter"
              type="date"
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
          </FilterField>
        </FilterBar>
      </form>
      <AuditAnchorPanel
        status={anchorStatus}
        failed={anchorStatusFailed}
        copy={{
          title: copy.anchorTitle,
          checking: copy.anchorChecking,
          verified: copy.anchorVerified,
          missing: copy.anchorMissing,
          mismatch: copy.anchorMismatch,
          unavailable: copy.anchorUnavailable,
          latestAnchor: copy.latestAnchor,
          anchoredEvents: copy.anchoredEvents,
          sequenceRange: copy.sequenceRange,
          storageReceipt: copy.storageReceipt,
          stored: copy.stored,
          notStored: copy.notStored,
        }}
      />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <AuditEventTable
          events={events}
          busy={busy}
          error={error}
          onSelectEvent={(event) => setSelectedEventId(event.eventId)}
          selectedEventId={selectedEventId}
        />
        <AuditEventInspector event={selectedEvent} />
      </section>
      {nextCursor ? (
        <Button
          aria-label={copy.more}
          title={copy.more}
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => load(nextCursor)}
        >
          {copy.more}
        </Button>
      ) : null}
    </PageShell>
  );
}

function AuditAnchorPanel({
  status,
  failed,
  copy,
}: {
  status: Awaited<ReturnType<typeof getAuditAnchorStatus>> | null;
  failed: boolean;
  copy: {
    title: string;
    checking: string;
    verified: string;
    missing: string;
    mismatch: string;
    unavailable: string;
    latestAnchor: string;
    anchoredEvents: string;
    sequenceRange: string;
    storageReceipt: string;
    stored: string;
    notStored: string;
  };
}) {
  const state = failed ? 'unavailable' : (status?.status ?? 'checking');
  const label =
    state === 'verified'
      ? copy.verified
      : state === 'missing'
        ? copy.missing
        : state === 'mismatch'
          ? copy.mismatch
          : state === 'unavailable'
            ? copy.unavailable
            : copy.checking;
  const ok = state === 'verified';
  const latest = status?.latest ?? null;

  return (
    <section className="flex flex-col gap-3 rounded-md border bg-background p-3 text-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        {ok ? (
          <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />
        )}
        <div>
          <div className="font-medium text-foreground">{copy.title}</div>
          <div className="text-muted-foreground">{label}</div>
        </div>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4 md:min-w-[36rem]">
        <AuditAnchorFact label={copy.latestAnchor} value={latest?.anchorDate ?? '-'} />
        <AuditAnchorFact label={copy.anchoredEvents} value={String(latest?.eventCount ?? '-')} />
        <AuditAnchorFact
          label={copy.sequenceRange}
          value={latest?.seqStart && latest.seqEnd ? `${latest.seqStart}-${latest.seqEnd}` : '-'}
        />
        <AuditAnchorFact
          label={copy.storageReceipt}
          value={latest?.storageRecorded ? copy.stored : copy.notStored}
        />
      </div>
    </section>
  );
}

function AuditAnchorFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div>{label}</div>
      <div className="truncate font-mono text-foreground">{value}</div>
    </div>
  );
}

function queryFromFilters(filters: FilterState) {
  return {
    action: (filters.action.trim() as AuditAction) || undefined,
    result: (filters.result.trim() as 'success' | 'denied' | 'failure') || undefined,
    from: filters.from.trim() || undefined,
    to: filters.to.trim() || undefined,
  };
}
