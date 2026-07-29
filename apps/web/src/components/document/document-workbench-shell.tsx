'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DocumentWorkbenchShellProps {
  children: React.ReactNode;
  className?: string;
  inspector: React.ReactNode;
  mobileControls?: React.ReactNode;
  rail: React.ReactNode;
}

export function DocumentWorkbenchShell({
  children,
  className,
  inspector,
  mobileControls,
  rail,
}: DocumentWorkbenchShellProps) {
  return (
    <section className={cn('min-w-0 border', className)} aria-label="문서 워크벤치">
      {mobileControls ? <div className="border-b px-3 py-2 xl:hidden">{mobileControls}</div> : null}
      <div className="grid min-w-0 xl:grid-cols-[232px_minmax(520px,1fr)_360px]">
        <div className="hidden min-w-0 border-r xl:block">{rail}</div>
        <div className="min-w-0 p-3 sm:p-4">{children}</div>
        <div className="hidden min-w-0 border-l xl:block">{inspector}</div>
      </div>
    </section>
  );
}

export interface DocumentWorkbenchDrawerProps {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  returnFocusRef?: React.RefObject<HTMLButtonElement> | undefined;
  side?: 'left' | 'right';
  title: string;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

export function DocumentWorkbenchDrawer({
  children,
  onClose,
  open,
  returnFocusRef,
  side = 'left',
  title,
}: DocumentWorkbenchDrawerProps) {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function close() {
    onClose();
    window.setTimeout(() => returnFocusRef?.current?.focus(), 0);
  }

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const elements = focusableElements(panelRef.current);
    if (elements.length === 0) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50" aria-labelledby={titleId} aria-modal="true" role="dialog">
      <button
        aria-label={`${title} 닫기`}
        className="absolute inset-0 bg-foreground/30"
        onClick={close}
        type="button"
      />
      <aside
        ref={panelRef}
        className={cn(
          'absolute top-0 flex h-full w-[min(24rem,calc(100vw-1rem))] flex-col border bg-background shadow-xl',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        )}
        onKeyDown={trapFocus}
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
          <h2 className="truncate text-sm font-semibold text-foreground" id={titleId}>
            {title}
          </h2>
          <Button
            ref={closeButtonRef}
            aria-label={`${title} 닫기`}
            onClick={close}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </aside>
    </div>
  );
}
