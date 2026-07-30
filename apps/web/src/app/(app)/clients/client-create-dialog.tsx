'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { CircleAlert, Save, X } from 'lucide-react';
import {
  clientConfidentialityLevels,
  clientTypes,
  type ClientConfidentialityLevel,
  type ClientType,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NewClientFormState } from './client-create-contract';

export type ClientCreateSubmitState = 'idle' | 'submitting' | 'invalid' | 'error';

const clientTypeLabels = {
  corporation: '법인',
  fund: '펀드',
  government: '공공기관',
  individual: '개인',
  npo: '비영리',
  other: '기타',
} satisfies Record<ClientType, string>;

const confidentialityLabels = {
  high: '높음',
  restricted: '제한',
  standard: '표준',
} satisfies Record<ClientConfidentialityLevel, string>;

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FocusReturnRef {
  current: { focus: () => void } | null;
}

export function clientDialogFocusTarget(
  activeIndex: number,
  focusableCount: number,
  shiftKey: boolean,
): number | null {
  if (focusableCount === 0) return null;
  if (activeIndex < 0) return shiftKey ? focusableCount - 1 : 0;
  if (shiftKey && activeIndex === 0) return focusableCount - 1;
  if (!shiftKey && activeIndex === focusableCount - 1) return 0;
  return null;
}

export function closeClientCreateDialog(
  onClose: () => boolean | void,
  returnFocusRef: FocusReturnRef,
  scheduleFocusReturn: (callback: () => void) => void = (callback) =>
    window.requestAnimationFrame(callback),
): boolean {
  if (onClose() === false) return false;
  scheduleFocusReturn(() => returnFocusRef.current?.focus());
  return true;
}

export interface ClientCreateDialogProps {
  errorMessage: string | null;
  form: NewClientFormState;
  onChange: (form: NewClientFormState) => void;
  onClose: () => boolean | void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
  returnFocusRef: React.RefObject<HTMLButtonElement>;
  submitState: ClientCreateSubmitState;
}

export function ClientCreateDialog({
  errorMessage,
  form,
  onChange,
  onClose,
  onSubmit,
  open,
  returnFocusRef,
  submitState,
}: ClientCreateDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const disabled = submitState === 'submitting';

  const close = useCallback(() => {
    return closeClientCreateDialog(onClose, returnFocusRef);
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => nameInputRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;

    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const targetIndex = clientDialogFocusTarget(activeIndex, focusable.length, event.shiftKey);
    if (targetIndex !== null) {
      event.preventDefault();
      focusable[targetIndex]?.focus();
    }
  }

  function closeFromBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !close()) event.preventDefault();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4"
      onMouseDown={closeFromBackdrop}
    >
      <div
        ref={panelRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-md border bg-background shadow-xl"
        onKeyDown={trapFocus}
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b px-4 py-3.5 sm:px-[18px]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground" id={titleId}>
              고객 등록
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground" id={descriptionId}>
              고객 목록은 그대로 유지하고, 새 고객 정보만 입력합니다.
            </p>
          </div>
          <Button
            aria-label="고객 등록 닫기"
            disabled={disabled}
            onClick={close}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </header>

        <form className="grid gap-4 p-4 sm:p-[18px]" onSubmit={onSubmit}>
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_180px_180px]">
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="client-create-name">
              고객명
              <Input
                ref={nameInputRef}
                id="client-create-name"
                required
                autoComplete="off"
                disabled={disabled}
                maxLength={1000}
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="client-create-type">
              고객 유형
              <select
                id="client-create-type"
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={disabled}
                value={form.clientType}
                onChange={(event) =>
                  onChange({ ...form, clientType: event.target.value as ClientType })
                }
              >
                {clientTypes.map((type) => (
                  <option key={type} value={type}>
                    {clientTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="grid gap-1.5 text-sm font-medium"
              htmlFor="client-create-confidentiality"
            >
              기밀도
              <select
                id="client-create-confidentiality"
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={disabled}
                value={form.confidentialityLevel}
                onChange={(event) =>
                  onChange({
                    ...form,
                    confidentialityLevel: event.target.value as ClientConfidentialityLevel,
                  })
                }
              >
                {clientConfidentialityLevels.map((level) => (
                  <option key={level} value={level}>
                    {confidentialityLabels[level]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="client-create-aliases">
            별칭
            <textarea
              id="client-create-aliases"
              className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              maxLength={4000}
              placeholder="구명칭, 약칭"
              value={form.aliasesText}
              onChange={(event) => onChange({ ...form, aliasesText: event.target.value })}
            />
          </label>
          {errorMessage ? (
            <p
              className="flex items-center gap-2 text-sm font-medium text-destructive"
              role="alert"
            >
              <CircleAlert className="h-4 w-4" aria-hidden="true" />
              {errorMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={close}>
              취소
            </Button>
            <Button type="submit" disabled={disabled}>
              <Save className="h-4 w-4" />
              고객 등록
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
