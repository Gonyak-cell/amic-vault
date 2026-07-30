'use client';

import * as React from 'react';
import Link from 'next/link';
import { FolderKanban, FolderOpen, Search } from 'lucide-react';
import type { MatterDto } from '@amic-vault/shared';
import { matterFileCabinetUrl, matterSearchUrl } from '@/components/matter/matter-dms-links';
import { MatterStatusBadge } from '@/components/matter/matter-status-badge';

export interface MatterListTableCopy {
  actions: string;
  client: string;
  fileCabinet: string;
  matter: string;
  moreActions: string;
  owner: string;
  ownerUnassigned: string;
  recentUpdate: string;
  searchMatter: string;
  status: string;
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
      <div className="min-w-[900px]">
        <div className="grid min-h-14 grid-cols-[minmax(240px,1fr)_180px_160px_110px_120px_48px] items-center gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          <span>{copy.matter}</span>
          <span>{copy.client}</span>
          <span>{copy.owner}</span>
          <span>{copy.status}</span>
          <span>{copy.recentUpdate}</span>
          <span className="sr-only">{copy.actions}</span>
        </div>
        {matters.map((matter) => (
          <div
            key={matter.matterId}
            className="grid grid-cols-[minmax(240px,1fr)_180px_160px_110px_120px_48px] items-center gap-4 border-b px-5 py-3 text-sm last:border-b-0"
          >
            <Link
              href={`/matters/${matter.matterId}`}
              className="flex min-w-0 items-center gap-3 rounded-md underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-primary">
                <FolderKanban className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{matter.matterName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {matter.matterCode}
                </span>
              </span>
            </Link>
            <span className="truncate text-muted-foreground">
              {matter.clientDisplayName ?? '고객 표시명 없음'}
            </span>
            <span className="truncate text-muted-foreground">
              {matter.leadLawyerDisplayName ??
                matter.leadPartnerDisplayName ??
                matter.leadAssociateDisplayName ??
                copy.ownerUnassigned}
            </span>
            <span>
              <MatterStatusBadge status={matter.status} />
            </span>
            <span className="text-xs text-muted-foreground">
              {formatMatterDate(matter.updatedAt)}
            </span>
            <MatterRowActions copy={copy} matter={matter} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MatterRowActions({ copy, matter }: { copy: MatterListTableCopy; matter: MatterDto }) {
  return (
    <span
      aria-label={`${matter.matterName} ${copy.moreActions}`}
      className="flex justify-self-end"
      role="group"
    >
      <Link
        aria-label={`${matter.matterName} ${copy.fileCabinet}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={matterFileCabinetUrl(matter)}
      >
        <FolderOpen className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{copy.fileCabinet}</span>
      </Link>
      <Link
        aria-label={`${matter.matterName} ${copy.searchMatter}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={matterSearchUrl(matter)}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{copy.searchMatter}</span>
      </Link>
    </span>
  );
}

function formatMatterDate(value: string): string {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date.replaceAll('-', '.') : value;
}
