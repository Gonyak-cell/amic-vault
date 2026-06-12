'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { auditActions, type AuditAction } from '@amic-vault/shared';
import { AuditEventTable } from '@/components/audit/audit-event-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportAuditEventsCsv, listAuditEvents } from '@/lib/api/audit';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

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
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof listAuditEvents>>['items']>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => queryFromFilters(appliedFilters), [appliedFilters]);

  const load = useCallback(
    async (cursor?: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const result = await listAuditEvents({ ...query, cursor: cursor ?? undefined, limit: 50 });
        setEvents((current) => (cursor ? [...current, ...result.items] : result.items));
        setNextCursor(result.nextCursor);
      } catch (caught) {
        setEvents([]);
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
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-normal">Audit</h1>
        <form className="grid gap-3 lg:grid-cols-4" onSubmit={submit}>
          <Input
            aria-label="Actor ID"
            placeholder="Actor UUID"
            value={filters.actorId}
            onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}
          />
          <select
            aria-label="Action"
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
          >
            <option value="">Action</option>
            {auditActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
          <select
            aria-label="Result"
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.result}
            onChange={(event) => setFilters({ ...filters, result: event.target.value })}
          >
            <option value="">Result</option>
            <option value="success">success</option>
            <option value="denied">denied</option>
            <option value="failure">failure</option>
          </select>
          <Input
            aria-label="Target type"
            placeholder="Target type"
            value={filters.targetType}
            onChange={(event) => setFilters({ ...filters, targetType: event.target.value })}
          />
          <Input
            aria-label="Target ID"
            placeholder="Target UUID"
            value={filters.targetId}
            onChange={(event) => setFilters({ ...filters, targetId: event.target.value })}
          />
          <Input
            aria-label="Matter ID"
            placeholder="Matter UUID"
            value={filters.matterId}
            onChange={(event) => setFilters({ ...filters, matterId: event.target.value })}
          />
          <Input
            aria-label="From"
            placeholder="From ISO"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
          <Input
            aria-label="To"
            placeholder="To ISO"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
          <div className="flex gap-2 lg:col-span-4">
            <Button
              aria-label="Search audit events"
              title="Search audit events"
              type="submit"
              disabled={busy}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              aria-label="Export audit CSV"
              title="Export audit CSV"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </section>
      <AuditEventTable events={events} busy={busy} error={error} />
      {nextCursor ? (
        <Button
          aria-label="Load more audit events"
          title="Load more audit events"
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => load(nextCursor)}
        >
          More
        </Button>
      ) : null}
    </main>
  );
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
