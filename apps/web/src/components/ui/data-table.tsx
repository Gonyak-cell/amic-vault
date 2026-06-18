import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DataTableProps extends React.HTMLAttributes<HTMLDivElement> {
  caption: string;
  minWidthClassName?: string;
  children: React.ReactNode;
}

export function DataTable({
  caption,
  children,
  className,
  minWidthClassName = 'min-w-[720px]',
  ...props
}: DataTableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-md border bg-card', className)} {...props}>
      <table className={cn('w-full border-collapse text-sm', minWidthClassName)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function DataTableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-muted/60 text-left text-xs uppercase text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DataTableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function DataTableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-4 py-3 font-medium', className)} {...props} />;
}

export interface DataTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  onSelect?: (() => void) | undefined;
  selected?: boolean | undefined;
}

export function DataTableRow({
  className,
  onClick,
  onKeyDown,
  onSelect,
  selected,
  ...props
}: DataTableRowProps) {
  const selectable = Boolean(onSelect);
  return (
    <tr
      aria-selected={selected}
      className={cn(
        'border-t transition-colors',
        selectable ? 'cursor-pointer hover:bg-muted/50 aria-selected:bg-primary/5' : null,
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect?.();
      }}
      onKeyDown={(keyboardEvent) => {
        onKeyDown?.(keyboardEvent);
        if (keyboardEvent.defaultPrevented || !onSelect) return;
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          onSelect();
        }
      }}
      tabIndex={selectable ? 0 : undefined}
      {...props}
    />
  );
}

export function DataTableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3', className)} {...props} />;
}

export interface DataTableEmptyRowProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  colSpan: number;
  children: React.ReactNode;
}

export function DataTableEmptyRow({
  children,
  className,
  colSpan,
  ...props
}: DataTableEmptyRowProps) {
  return (
    <tr>
      <td
        className={cn('px-4 py-6 text-sm text-muted-foreground', className)}
        colSpan={colSpan}
        {...props}
      >
        {children}
      </td>
    </tr>
  );
}
