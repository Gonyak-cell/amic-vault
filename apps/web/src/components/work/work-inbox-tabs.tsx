import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  workQueueUrl,
  workQueueUrlStateFromParams,
  type WorkQueueUrlState,
} from '@/lib/api/work-ops';

export type WorkInboxView = 'mine' | 'notifications';

const workInboxViews = [
  { value: 'mine', label: '내 업무' },
  { value: 'notifications', label: '알림' },
] as const satisfies readonly {
  value: WorkInboxView;
  label: string;
}[];

export function resolveWorkInboxView(value: string | string[] | undefined): WorkInboxView {
  return workQueueUrlStateFromParams(value === undefined ? {} : { view: value }).view;
}

export function WorkInboxTabs({
  activeView,
  urlState = workQueueUrlStateFromParams(),
}: {
  activeView: WorkInboxView;
  urlState?: WorkQueueUrlState;
}) {
  return (
    <nav aria-label="업무 보기" className="border-b">
      <ul className="-mb-px flex gap-5">
        {workInboxViews.map((view) => {
          const isActive = view.value === activeView;
          return (
            <li key={view.value}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
                href={workQueueUrl({ ...urlState, view: view.value })}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
