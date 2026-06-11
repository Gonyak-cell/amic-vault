import React from 'react';
import type { MatterStatus } from '@amic-vault/shared';
import { cn } from '../../lib/utils';

const statusTone: Record<MatterStatus, string> = {
  proposed: 'border-slate-300 bg-slate-50 text-slate-700',
  open: 'border-cyan-300 bg-cyan-50 text-cyan-800',
  active: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  closing: 'border-amber-300 bg-amber-50 text-amber-800',
  closed: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  archived: 'border-stone-300 bg-stone-100 text-stone-700',
  disposal_review: 'border-rose-300 bg-rose-50 text-rose-800',
  disposed: 'border-neutral-400 bg-neutral-200 text-neutral-800',
};

const statusLabel: Record<MatterStatus, string> = {
  proposed: 'Proposed',
  open: 'Open',
  active: 'Active',
  closing: 'Closing',
  closed: 'Closed',
  archived: 'Archived',
  disposal_review: 'Disposal Review',
  disposed: 'Disposed',
};

export function MatterStatusBadge({ status }: { status: string }) {
  const knownStatus = status in statusTone ? (status as MatterStatus) : undefined;
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-normal',
        knownStatus ? statusTone[knownStatus] : 'border-slate-300 bg-white text-slate-600',
      )}
    >
      {knownStatus ? statusLabel[knownStatus] : 'Unknown'}
    </span>
  );
}
