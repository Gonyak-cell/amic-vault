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

export interface DocumentWorkbenchFocusable {
  focus: () => void;
}

export interface DocumentWorkbenchKeyboardEvent {
  key: string;
  preventDefault: () => void;
  shiftKey: boolean;
}

export interface DocumentWorkbenchDrawerControllerOptions {
  getActiveElement: () => DocumentWorkbenchFocusable | null;
  getFocusableElements: () => readonly DocumentWorkbenchFocusable[];
  focusInitial: () => void;
  onClose: () => void;
  returnFocus: () => void;
  scheduleFocus?: ((callback: () => void) => void) | undefined;
}

export interface DocumentWorkbenchDrawerController {
  close: () => void;
  focusInitial: () => void;
  onKeyDown: (event: DocumentWorkbenchKeyboardEvent) => void;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

export function createDocumentWorkbenchDrawerController({
  getActiveElement,
  getFocusableElements,
  focusInitial,
  onClose,
  returnFocus,
  scheduleFocus = (callback) => window.setTimeout(callback, 0),
}: DocumentWorkbenchDrawerControllerOptions): DocumentWorkbenchDrawerController {
  function close() {
    onClose();
    scheduleFocus(returnFocus);
  }

  function onKeyDown(event: DocumentWorkbenchKeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = getFocusableElements();
    if (elements.length === 0) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && getActiveElement() === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && getActiveElement() === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { close, focusInitial, onKeyDown };
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
  const onCloseRef = React.useRef(onClose);
  const returnFocusRefRef = React.useRef(returnFocusRef);
  const wasOpenRef = React.useRef(false);
  onCloseRef.current = onClose;
  returnFocusRefRef.current = returnFocusRef;
  const drawerController = React.useMemo(
    () =>
      createDocumentWorkbenchDrawerController({
        getActiveElement: () =>
          document.activeElement instanceof HTMLElement ? document.activeElement : null,
        getFocusableElements: () => (panelRef.current ? focusableElements(panelRef.current) : []),
        focusInitial: () => closeButtonRef.current?.focus(),
        onClose: () => onCloseRef.current(),
        returnFocus: () => returnFocusRefRef.current?.current?.focus(),
      }),
    [],
  );

  React.useEffect(() => {
    if (open && !wasOpenRef.current) drawerController.focusInitial();
    wasOpenRef.current = open;
  }, [drawerController, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" aria-labelledby={titleId} aria-modal="true" role="dialog">
      <button
        aria-label={`${title} 닫기`}
        className="absolute inset-0 bg-foreground/30"
        onClick={drawerController.close}
        type="button"
      />
      <aside
        ref={panelRef}
        className={cn(
          'absolute top-0 flex h-full min-w-0 w-[min(24rem,calc(100vw-1rem))] flex-col border bg-background shadow-xl',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        )}
        onKeyDown={drawerController.onKeyDown}
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
          <h2 className="truncate text-sm font-semibold text-foreground" id={titleId}>
            {title}
          </h2>
          <Button
            ref={closeButtonRef}
            aria-label={`${title} 닫기`}
            onClick={drawerController.close}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto p-3">{children}</div>
      </aside>
    </div>
  );
}
