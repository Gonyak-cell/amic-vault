import * as React from 'react';
import {
  AlertCircle,
  Ban,
  Database,
  FileQuestion,
  LoaderCircle,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateVariant =
  | 'no-data'
  | 'pre-search'
  | 'loading'
  | 'no-access'
  | 'policy-blocked'
  | 'api-unavailable'
  | 'api-error'
  | 'ai-prep-none'
  | 'integrations-none';

const emptyStateCopy = {
  'no-data': '표시할 항목이 없습니다.',
  'pre-search': '검색어를 입력하면 접근 가능한 문서만 표시됩니다.',
  loading: '요청한 데이터를 준비하고 있습니다.',
  'no-access': '이 항목을 볼 권한이 없습니다.',
  'policy-blocked': '정보 차단 정책에 따라 표시할 수 없습니다.',
  'api-unavailable': '데이터 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  'api-error': '요청한 데이터를 표시할 수 없습니다.',
  'ai-prep-none': '파일 정리 준비 상태가 없습니다.',
  'integrations-none': '연결된 외부 서비스가 없습니다.',
} as const satisfies Record<EmptyStateVariant, string>;

const emptyStateIcons = {
  'no-data': FileQuestion,
  'pre-search': Search,
  loading: LoaderCircle,
  'no-access': ShieldAlert,
  'policy-blocked': Ban,
  'api-unavailable': Database,
  'api-error': AlertCircle,
  'ai-prep-none': FileQuestion,
  'integrations-none': Database,
} as const;

const alertVariants = new Set<EmptyStateVariant>(['api-error', 'no-access', 'policy-blocked']);

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export function EmptyState({
  actions,
  className,
  description,
  title,
  variant = 'no-data',
  role,
  'aria-atomic': ariaAtomic,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
  'aria-live': ariaLive,
  ...props
}: EmptyStateProps) {
  const Icon = emptyStateIcons[variant];
  const titleId = React.useId();
  const descriptionId = React.useId();
  const resolvedTitle =
    title ?? (variant === 'loading' ? '불러오는 중입니다.' : '표시할 항목이 없습니다.');
  const resolvedDescription = description ?? emptyStateCopy[variant];
  const resolvedRole = role ?? (alertVariants.has(variant) ? 'alert' : 'status');
  const resolvedLive = ariaLive ?? (resolvedRole === 'alert' ? 'assertive' : 'polite');

  return (
    <div
      className={cn(
        'flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center',
        className,
      )}
      role={resolvedRole}
      aria-atomic={ariaAtomic ?? true}
      aria-describedby={ariaDescribedBy ?? descriptionId}
      aria-labelledby={ariaLabelledBy ?? titleId}
      aria-live={resolvedLive}
      {...props}
    >
      <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p id={titleId} className="text-[15px] font-semibold text-foreground">
        {resolvedTitle}
      </p>
      <p id={descriptionId} className="mt-1 max-w-[38rem] text-sm leading-6 text-muted-foreground">
        {resolvedDescription}
      </p>
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export { emptyStateCopy };
