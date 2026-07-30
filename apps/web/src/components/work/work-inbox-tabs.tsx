import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type WorkInboxView = 'mine' | 'notifications';

const workInboxViews = [
  { value: 'mine', label: '내 업무', href: '/work?view=mine' },
  { value: 'notifications', label: '알림', href: '/work?view=notifications' },
] as const satisfies readonly {
  value: WorkInboxView;
  label: string;
  href: string;
}[];

export function resolveWorkInboxView(
  value: string | string[] | undefined,
): WorkInboxView {
  return value === 'notifications' ? 'notifications' : 'mine';
}

export function WorkInboxTabs({ activeView }: { activeView: WorkInboxView }) {
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
                href={view.href}
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
