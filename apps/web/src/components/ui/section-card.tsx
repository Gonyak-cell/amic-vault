import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SectionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function SectionCard({
  actions,
  children,
  className,
  icon,
  meta,
  title,
  ...props
}: SectionCardProps) {
  return (
    <Card className={cn('overflow-hidden shadow-none', className)} {...props}>
      <CardHeader className="min-h-16 flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3.5 sm:px-[18px]">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? <span className="text-primary">{icon}</span> : null}
          <div className="min-w-0">
            <CardTitle className="truncate text-[15px] font-semibold tracking-normal">{title}</CardTitle>
            {meta ? <p className="truncate text-[11px] text-muted-foreground">{meta}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="p-4 sm:p-[18px]">{children}</CardContent>
    </Card>
  );
}
