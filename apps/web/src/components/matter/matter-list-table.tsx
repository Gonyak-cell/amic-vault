'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileSearch, FolderKanban, Search } from 'lucide-react';
import type { MatterDto } from '@amic-vault/shared';
import { matterFileCabinetUrl, matterSearchUrl } from '@/components/matter/matter-dms-links';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';
import { Button } from '@/components/ui/button';

export interface MatterListTableCopy {
  actions: string;
  fileCabinet: string;
  matter: string;
  openMatter: string;
  protected: string;
  searchMatter: string;
  security: string;
  status: string;
  type: string;
}

export { matterFileCabinetUrl, matterSearchUrl } from '@/components/matter/matter-dms-links';

export function MatterListTable({
  copy,
  matters,
}: {
  copy: MatterListTableCopy;
  matters: MatterDto[];
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[920px]">
        <div className="grid min-h-16 grid-cols-[minmax(220px,1fr)_110px_110px_90px_250px] items-center gap-4 border-b px-5 py-4 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          <span>{copy.matter}</span>
          <span>{copy.type}</span>
          <span>{copy.status}</span>
          <span className="text-right">{copy.security}</span>
          <span className="text-right">{copy.actions}</span>
        </div>
        {matters.map((matter) => (
          <div
            key={matter.matterId}
            className="grid grid-cols-[minmax(220px,1fr)_110px_110px_90px_250px] items-center gap-4 border-b px-5 py-4 text-sm last:border-b-0"
          >
            <Link
              href={`/matters/${matter.matterId}`}
              className="flex min-w-0 items-center gap-3 rounded-md underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-primary">
                <FolderKanban className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{matter.matterName}</span>
                <span className="block truncate text-xs text-muted-foreground">{matter.matterCode}</span>
              </span>
            </Link>
            <span className="truncate text-muted-foreground">{matter.matterType}</span>
            <span>
              <MatterStatusBadge status={matter.status} />
            </span>
            <span className="text-right text-muted-foreground">{copy.protected}</span>
            <span className="flex justify-end gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/matters/${matter.matterId}`}>
                  <FolderKanban className="h-4 w-4" />
                  {copy.openMatter}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={matterFileCabinetUrl(matter)}>
                  <FileSearch className="h-4 w-4" />
                  {copy.fileCabinet}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={matterSearchUrl(matter)}>
                  <Search className="h-4 w-4" />
                  {copy.searchMatter}
                </Link>
              </Button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
