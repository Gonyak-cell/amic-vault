'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import type { MatterDto } from '@amic-vault/shared';
import { getMatter } from '@/lib/api-client';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';
import { Button } from '@/components/ui/button';

export default function MatterDetailPage({ params }: { params: { matterId: string } }) {
  const [matter, setMatter] = useState<MatterDto | null>(null);

  useEffect(() => {
    let active = true;
    getMatter(params.matterId)
      .then((result) => {
        if (active) setMatter(result);
      })
      .catch(() => {
        if (active) setMatter(null);
      });
    return () => {
      active = false;
    };
  }, [params.matterId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-6 py-6">
      <section className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {matter?.matterCode ?? params.matterId}
          </p>
          <h1 className="text-2xl font-semibold tracking-normal">
            {matter?.matterName ?? 'Matter'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link
              aria-label="Open matter team"
              title="Open matter team"
              href={`/matters/${params.matterId}/team`}
            >
              <Users className="h-4 w-4" />
            </Link>
          </Button>
          <MatterStatusBadge status={matter?.status ?? 'unknown'} />
        </div>
      </section>
      {matter ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <dt className="text-xs uppercase text-muted-foreground">Type</dt>
            <dd className="mt-1 font-medium">{matter.matterType}</dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-xs uppercase text-muted-foreground">Client</dt>
            <dd className="mt-1 font-medium">{matter.clientId}</dd>
          </div>
        </dl>
      ) : null}
    </main>
  );
}
