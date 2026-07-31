import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  breadcrumbs?: readonly string[];
  title: string;
  actions?: React.ReactNode;
  navigation?: React.ReactNode;
}

export function PageHeader({
  actions,
  breadcrumbs = ['문서 보관'],
  className,
  navigation,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <section className={cn('border-b pb-4', className)} {...props}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="이동 경로"
            className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground"
          >
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb}-${index}`}>
                {index > 0 ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
                <span
                  aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
                  className={
                    index === breadcrumbs.length - 1 ? 'font-semibold text-foreground' : undefined
                  }
                >
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </nav>
          <h1 className="mt-2 max-w-full truncate text-xl font-semibold leading-[1.35] tracking-normal text-foreground">
            {title}
          </h1>
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-1 xl:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {navigation ? <div className="mt-5 min-w-0">{navigation}</div> : null}
    </section>
  );
}
