import * as React from 'react';
import { AlertCircle, Ban, Database, FileQuestion, Search, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateVariant =
  | 'no-data'
  | 'pre-search'
  | 'no-access'
  | 'policy-blocked'
  | 'api-unavailable'
  | 'api-error'
  | 'ai-prep-none'
  | 'integrations-none';

const emptyStateCopy = {
  'no-data': '표시할 항목이 없습니다.',
  'pre-search': '검색어를 입력하면 접근 권한이 확인된 파일만 표시됩니다.',
  'no-access': '이 항목을 볼 권한이 없습니다.',
  'policy-blocked': '정보 차단 또는 권한 정책으로 표시할 수 없습니다.',
  'api-unavailable': '이 영역은 아직 운영 데이터와 연결되지 않았습니다.',
  'api-error': '데이터를 표시할 수 없습니다. 권한 또는 연결 상태를 확인해 주세요.',
  'ai-prep-none': '파일 정리 준비 상태가 없습니다.',
  'integrations-none': '연결된 통합이 없습니다.',
} as const satisfies Record<EmptyStateVariant, string>;

const emptyStateIcons = {
  'no-data': FileQuestion,
  'pre-search': Search,
  'no-access': ShieldAlert,
  'policy-blocked': Ban,
  'api-unavailable': Database,
  'api-error': AlertCircle,
  'ai-prep-none': FileQuestion,
  'integrations-none': Database,
} as const;

const alertVariants = new Set<EmptyStateVariant>([
  'api-error',
  'no-access',
  'policy-blocked',
]);

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
  title = '표시할 항목이 없습니다.',
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
        {title}
      </p>
      <p id={descriptionId} className="mt-1 max-w-[38rem] text-sm leading-6 text-muted-foreground">
        {resolvedDescription}
      </p>
      {actions ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export { emptyStateCopy };
