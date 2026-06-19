import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  breadcrumbs?: readonly string[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  actions,
  breadcrumbs = ['Vault'],
  className,
  description,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <section className={cn('border-b pb-4', className)} {...props}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav aria-label="이동 경로" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb}-${index}`}>
                {index > 0 ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
                <span
                  aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
                  className={index === breadcrumbs.length - 1 ? 'font-semibold text-foreground' : undefined}
                >
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </nav>
          <h1 className="mt-2 text-xl font-semibold leading-[1.35] tracking-normal text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-[860px] text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
