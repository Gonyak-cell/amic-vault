import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusBadgeTone = 'neutral' | 'success' | 'warning' | 'blocked';

const toneClassName = {
  neutral: 'border-border bg-muted text-foreground',
  success: 'border-primary/20 bg-primary/10 text-primary',
  warning: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  blocked: 'border-destructive/20 bg-destructive/10 text-destructive',
} as const satisfies Record<StatusBadgeTone, string>;

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusBadgeTone;
}

export function StatusBadge({ className, tone = 'neutral', ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center justify-center rounded-md border px-2.5 text-xs font-semibold',
        toneClassName[tone],
        className,
      )}
      {...props}
    />
  );
}
