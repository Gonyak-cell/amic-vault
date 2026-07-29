import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  breadcrumbs?: readonly string[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  navigation?: React.ReactNode;
}

export function PageHeader({
  actions,
  breadcrumbs = ['문서 보관'],
  className,
  description,
  navigation,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <section className={cn('border-b pb-4', className)} {...props}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
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
          <div className="mt-2 flex min-w-0 items-baseline gap-x-3 overflow-hidden">
            <h1 className="max-w-full shrink-0 truncate text-xl font-semibold leading-[1.35] tracking-normal text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="min-w-0 flex-1 truncate whitespace-nowrap text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {navigation ? <div className="mt-5 min-w-0">{navigation}</div> : null}
    </section>
  );
}
