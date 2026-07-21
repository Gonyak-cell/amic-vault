import React from 'react';
import Link from 'next/link';
import { BriefcaseBusiness, FileSearch, Network, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MatterWorkstreamKey = 'contracts' | 'dd' | 'knowledge' | 'litigation';

const matterWorkstreamTabs = [
  {
    key: 'contracts',
    label: '계약',
    meta: '조항 · Rule findings',
    icon: BriefcaseBusiness,
  },
  {
    key: 'dd',
    label: 'DD',
    meta: 'RFI · Traceability',
    icon: FileSearch,
  },
  {
    key: 'litigation',
    label: '송무',
    meta: 'Fact Ledger · Case map',
    icon: Scale,
  },
  {
    key: 'knowledge',
    label: '지식',
    meta: 'Graph · Issue · Citation',
    icon: Network,
  },
] as const satisfies readonly {
  key: MatterWorkstreamKey;
  label: string;
  meta: string;
  icon: typeof BriefcaseBusiness;
}[];

export function MatterWorkstreamTabs({
  active,
  matterId,
}: {
  active?: MatterWorkstreamKey;
  matterId: string;
}) {
  const encodedMatterId = encodeURIComponent(matterId);

  return (
    <nav aria-label="Matter 업무 탭" className="grid gap-2 sm:grid-cols-3">
      {matterWorkstreamTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;

        return (
          <Link
            key={tab.key}
            href={
              tab.key === 'knowledge'
                ? `/matters/${encodedMatterId}#matter-knowledge`
                : `/matters/${encodedMatterId}/${tab.key}`
            }
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-16 items-center gap-3 rounded-md border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5',
              isActive ? 'border-primary/30 bg-primary/10 text-primary' : 'text-foreground',
            )}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{tab.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{tab.meta}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
