'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { auditActions, type AuditAction } from '@amic-vault/shared';
import { AuditEventInspector } from '@/components/audit/audit-event-inspector';
import { AuditEventTable } from '@/components/audit/audit-event-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { exportAuditEventsCsv, listAuditEvents } from '@/lib/api/audit';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { useI18n } from '@/lib/i18n';

interface FilterState {
  actorId: string;
  action: string;
  result: string;
  targetType: string;
  targetId: string;
  matterId: string;
  from: string;
  to: string;
}

const emptyFilters: FilterState = {
  actorId: '',
  action: '',
  result: '',
  targetType: '',
  targetId: '',
  matterId: '',
  from: '',
  to: '',
};

export function AuditConsoleClient() {
  const { language } = useI18n();
  const copy =
    language === 'ko'
      ? {
          title: '활동 기록',
          description:
            '권한이 확인된 감사 이벤트만 조회합니다. 내부 참조 필터는 고급 영역에서만 사용합니다.',
          filterTitle: '활동 기록 필터',
          filterMeta: '운영 데이터 기준',
          advancedFilters: '고급 참조 필터',
          actor: '수행자 참조',
          actorPlaceholder: '수행자 참조',
          action: '활동',
          allActions: '모든 활동',
          result: '결과',
          allResults: '모든 결과',
          success: '성공',
          denied: '접근 제한',
          failure: '실패',
          targetType: '대상 유형',
          targetId: '대상 참조',
          matterId: '사건 참조',
          from: '시작일',
          to: '종료일',
          search: '검색',
          export: 'CSV 내보내기',
          more: '더 보기',
        }
      : {
          title: 'Activity log',
          description:
            'Only permission-checked audit events are displayed. Internal reference filters stay in the advanced area.',
          filterTitle: 'Activity filters',
          filterMeta: 'Operational data',
          advancedFilters: 'Advanced reference filters',
          actor: 'Actor ref',
          actorPlaceholder: 'Actor ref',
          action: 'Activity',
          allActions: 'All activity',
          result: 'Result',
          allResults: 'All results',
          success: 'Success',
          denied: 'Access restricted',
          failure: 'Failure',
          targetType: 'Target type',
          targetId: 'Target ref',
          matterId: 'Matter ref',
          from: 'From',
          to: 'To',
          search: 'Search activity',
          export: 'Export CSV',
          more: 'More',
        };
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof listAuditEvents>>['items']>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      } catch (caught) {
        setEvents([]);
        setSelectedEventId(null);
        setNextCursor(null);
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  async function exportCsv() {
    setBusy(true);
    setError(null);
    try {
      const csv = await exportAuditEventsCsv({ ...queryFromFilters(filters), limit: 1000 });
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
      <SectionCard
        icon={<Search className="h-4 w-4" />}
        title={copy.filterTitle}
        meta={copy.filterMeta}
      >
        <form className="grid gap-3 lg:grid-cols-4" onSubmit={submit}>
          <select
            aria-label={copy.action}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
          >
            <option value="">{copy.allActions}</option>
            {auditActions.map((action) => (
              <option key={action} value={action}>
                {formatAction(action)}
              </option>
            ))}
          </select>
          <select
            aria-label={copy.result}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.result}
            onChange={(event) => setFilters({ ...filters, result: event.target.value })}
          >
            <option value="">{copy.allResults}</option>
            <option value="success">{copy.success}</option>
            <option value="denied">{copy.denied}</option>
            <option value="failure">{copy.failure}</option>
          </select>
          <Input
            aria-label={copy.targetType}
            placeholder={copy.targetType}
            value={filters.targetType}
            onChange={(event) => setFilters({ ...filters, targetType: event.target.value })}
          />
          <Input
            aria-label={copy.from}
            placeholder={copy.from}
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
          <Input
            aria-label={copy.to}
            placeholder={copy.to}
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
          <details className="rounded-md border bg-muted/20 p-3 lg:col-span-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              {copy.advancedFilters}
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <Input
                aria-label={copy.actor}
                placeholder={copy.actorPlaceholder}
                value={filters.actorId}
                onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}
              />
              <Input
                aria-label={copy.targetId}
                placeholder={copy.targetId}
                value={filters.targetId}
                onChange={(event) => setFilters({ ...filters, targetId: event.target.value })}
              />
              <Input
                aria-label={copy.matterId}
                placeholder={copy.matterId}
                value={filters.matterId}
                onChange={(event) => setFilters({ ...filters, matterId: event.target.value })}
              />
            </div>
          </details>
          <div className="flex flex-wrap gap-2 lg:col-span-4">
            <Button aria-label={copy.search} title={copy.search} type="submit" disabled={busy}>
              <Search className="h-4 w-4" />
              {copy.search}
            </Button>
            <Button
              aria-label={copy.export}
              title={copy.export}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              {copy.export}
            </Button>
          </div>
        </form>
      </SectionCard>
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

function formatAction(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function queryFromFilters(filters: FilterState) {
  return {
    actorId: filters.actorId.trim() || undefined,
    action: (filters.action.trim() as AuditAction) || undefined,
    result: (filters.result.trim() as 'success' | 'denied' | 'failure') || undefined,
    targetType: filters.targetType.trim() || undefined,
    targetId: filters.targetId.trim() || undefined,
    matterId: filters.matterId.trim() || undefined,
    from: filters.from.trim() || undefined,
    to: filters.to.trim() || undefined,
  };
}
