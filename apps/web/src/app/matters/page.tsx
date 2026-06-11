'use client';

import { useEffect, useState } from 'react';
import type { MatterDto } from '@amic-vault/shared';
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
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-6 py-6">
      <section className="flex items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Matters</h1>
          <p className="text-sm text-muted-foreground">Tenant-scoped matter registry</p>
        </div>
      </section>
      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {matters.map((matter) => (
              <tr key={matter.matterId} className="border-t">
                <td className="px-4 py-3 font-medium">{matter.matterCode}</td>
                <td className="px-4 py-3">{matter.matterName}</td>
                <td className="px-4 py-3">{matter.matterType}</td>
                <td className="px-4 py-3">
                  <MatterStatusBadge status={matter.status} />
                </td>
              </tr>
            ))}
            {loaded && matters.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>
                  No matters
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
