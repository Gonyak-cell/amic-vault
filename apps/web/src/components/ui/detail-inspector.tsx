import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DetailInspectorProps extends React.HTMLAttributes<HTMLElement> {
  actions?: React.ReactNode;
  description?: string;
  empty?: React.ReactNode;
  meta?: string;
  status?: React.ReactNode;
  title: string;
}

export function DetailInspector({
  actions,
  children,
  className,
  description,
  empty,
  meta,
  status,
  title,
  ...props
}: DetailInspectorProps) {
  const titleId = React.useId();
  const body = children ?? empty;

  return (
    <aside
      aria-labelledby={titleId}
      className={cn(
        'overflow-hidden rounded-lg border bg-card text-card-foreground shadow-none',
        className,
      )}
      {...props}
    >
      <div className="flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-[18px]">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2
              className="truncate text-[15px] font-semibold tracking-normal text-foreground"
              id={titleId}
            >
              {title}
            </h2>
            {status ? <div className="shrink-0">{status}</div> : null}
          </div>
          {meta ? <p className="truncate text-[11px] text-muted-foreground">{meta}</p> : null}
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {body ? <div className="p-4 sm:p-[18px]">{body}</div> : null}
    </aside>
  );
}

export interface DetailInspectorSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
  description?: string;
  title?: string;
}

export function DetailInspectorSection({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: DetailInspectorSectionProps) {
  return (
    <section
      className={cn('space-y-3 border-t pt-4 first:border-t-0 first:pt-0', className)}
      {...props}
    >
      {title || description || actions ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-sm font-semibold tracking-normal text-foreground">{title}</h3>
            ) : null}
            {description ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface DetailInspectorFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value?: React.ReactNode;
}

export function DetailInspectorField({
  children,
  className,
  label,
  value,
  ...props
}: DetailInspectorFieldProps) {
  return (
    <div className={cn('min-w-0', className)} {...props}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">{value ?? children}</dd>
    </div>
  );
}
