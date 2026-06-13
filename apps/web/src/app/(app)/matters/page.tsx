'use client';

import { useEffect, useState } from 'react';
import type { MatterDto } from '@amic-vault/shared';
import { FileSearch, FolderKanban } from 'lucide-react';
import { listMatters } from '@/lib/api-client';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';

export default function MattersPage() {
  const [matters, setMatters] = useState<MatterDto[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    listMatters({ pageSize: 20 })
      .then((result) => {
        if (active) setMatters(result.items);
      })
      .catch(() => {
        if (active) setMatters([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">default / Matter Spaces</p>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-normal">Matter Index</h1>
        </div>
        <div className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-4 text-sm font-semibold">
          <FileSearch className="h-4 w-4" />
          Tenant scoped
        </div>
      </section>

      <section className="rounded-md border bg-card">
        <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_140px_140px_120px] items-center gap-4 border-b px-5 py-4 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          <span>Matter</span>
          <span>Type</span>
          <span>Status</span>
          <span className="text-right">Security</span>
        </div>
        {matters.map((matter) => (
          <div
            key={matter.matterId}
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
            <span className="text-right text-muted-foreground">RLS</span>
          </div>
        ))}
        {loaded && matters.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">No matters</div>
        ) : null}
      </section>
    </main>
  );
}
