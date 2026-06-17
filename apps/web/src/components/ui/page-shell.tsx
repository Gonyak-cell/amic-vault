import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageShell({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <main className={cn('mx-auto flex w-full max-w-[1480px] flex-col gap-4', className)} {...props} />;
}
