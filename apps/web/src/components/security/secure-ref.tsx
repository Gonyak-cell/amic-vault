import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SecureRefProps extends React.HTMLAttributes<HTMLDivElement> {
  emptyText?: string;
  hiddenText?: string;
  label: string;
  reveal?: boolean;
  value?: string | null;
}

export function maskInternalReference(value?: string | null): string {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (!normalizedValue) return '';
  const suffix = normalizedValue.replace(/[^A-Za-z0-9]/g, '').slice(-8);
  return suffix ? `참조 ••••${suffix}` : '참조값 있음';
}

export function SecureRef({
  className,
  emptyText = '확인 정보 없음',
  hiddenText = '확인 정보 숨김',
  label,
  reveal = false,
  value,
  ...props
}: SecureRefProps) {
  const normalizedValue = typeof value === 'string' && value.trim() ? value.trim() : null;

  return (
    <div className={cn('min-w-0', className)} {...props}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">
        {reveal && normalizedValue ? (
          <code className="break-all rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {maskInternalReference(normalizedValue)}
          </code>
        ) : (
          <span className="text-muted-foreground">{normalizedValue ? hiddenText : emptyText}</span>
        )}
      </dd>
    </div>
  );
}
