import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FilterBarProps extends React.HTMLAttributes<HTMLElement> {
  actions?: React.ReactNode;
  controls?: React.ReactNode;
  description?: string;
  label: string;
  resultsSummary?: React.ReactNode;
  title?: string;
}

export function FilterBar({
  actions,
  children,
  className,
  controls,
  description,
  label,
  resultsSummary,
  title,
  ...props
}: FilterBarProps) {
  const hasIntro = Boolean(title || description || resultsSummary);
  const filterControls = controls ?? children;

  return (
    <section
      aria-label={label}
      className={cn('rounded-lg border bg-card p-3 shadow-none sm:p-4', className)}
      {...props}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {hasIntro ? (
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 className="text-[15px] font-semibold tracking-normal text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-xs leading-5 text-muted-foreground">{description}</p>
            ) : null}
            {resultsSummary ? (
              <div aria-live="polite" className="text-xs leading-5 text-muted-foreground">
                {resultsSummary}
              </div>
            ) : null}
          </div>
        ) : null}

        {filterControls ? (
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] lg:max-w-3xl">
            {filterControls}
          </div>
        ) : null}

        {actions ? (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export interface FilterFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  description?: string;
  htmlFor?: string;
  label: string;
}

export function FilterField({
  children,
  className,
  description,
  htmlFor,
  label,
  ...props
}: FilterFieldProps) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)} {...props}>
      {htmlFor ? (
        <label className="block text-xs font-medium text-foreground" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="block text-xs font-medium text-foreground">{label}</span>
      )}
      {children}
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
