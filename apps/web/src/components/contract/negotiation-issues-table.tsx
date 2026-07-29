import * as React from 'react';
import type { NegotiationIssueDto, NegotiationIssueStatus } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { maskInternalReference } from '@/components/security/secure-ref';

const issueStatusLabels = {
  open: '검토 중',
  agreed: '합의',
  dropped: '보류',
} as const satisfies Record<NegotiationIssueStatus, string>;

const issueStatusTones = {
  open: 'warning',
  agreed: 'success',
  dropped: 'neutral',
} as const satisfies Record<NegotiationIssueStatus, StatusBadgeTone>;

const severityTones = {
  info: 'neutral',
  warning: 'warning',
  critical: 'blocked',
} as const satisfies Record<NegotiationIssueDto['severity'], StatusBadgeTone>;

const severityLabels = {
  info: '참고',
  warning: '주의',
  critical: '중요',
} as const satisfies Record<NegotiationIssueDto['severity'], string>;

export interface NegotiationIssuesTableProps {
  issues: NegotiationIssueDto[];
  onStatusChange?: ((issueId: string, status: NegotiationIssueStatus) => void) | undefined;
  updatingIssueId?: string | null | undefined;
}

export function NegotiationIssuesTable({
  issues,
  onStatusChange,
  updatingIssueId = null,
}: NegotiationIssuesTableProps) {
  return (
    <SectionCard title="협상 쟁점표" meta="수정 제안 · 기준 위반 · 진행 상태">
      {issues.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <caption className="sr-only">계약 협상쟁점표</caption>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>검토 항목</TableHeader>
                <TableHeader>수정 제안</TableHeader>
                <TableHeader>중요도</TableHeader>
                <TableHeader>상태</TableHeader>
                <TableHeader>근거</TableHeader>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                const disabled = updatingIssueId === issue.issueId || !onStatusChange;
                return (
                  <tr key={issue.issueId} className="border-t">
                    <TableCell className="font-medium">
                      <div className="grid gap-1">
                        <span>{issue.findingCode}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {issue.ruleKey} v{issue.ruleVersion}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <span>{issue.changeType}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {maskInternalReference(issue.redlineTextHash)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={severityTones[issue.severity]}>
                        {severityLabels[issue.severity]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={issueStatusTones[issue.status]}>
                          {issueStatusLabels[issue.status]}
                        </StatusBadge>
                        <select
                          aria-label={`${issue.findingCode} 상태`}
                          className="h-9 min-w-28 rounded-md border bg-background px-2 text-sm"
                          disabled={disabled}
                          value={issue.status}
                          onChange={(event) =>
                            onStatusChange?.(
                              issue.issueId,
                              event.target.value as NegotiationIssueStatus,
                            )
                          }
                        >
                          {Object.entries(issueStatusLabels).map(([status, label]) => (
                            <option key={status} value={status}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <InlineRefs refs={issue.citationRefs} />
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="협상 쟁점이 없습니다." />
      )}
    </SectionCard>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function TableCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`.trim()}>{children}</td>;
}

function InlineRefs({ refs }: { refs: readonly string[] }) {
  if (refs.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex max-w-md flex-wrap gap-1.5">
      {refs.map((ref) => (
        <span key={ref} className="rounded bg-muted px-1.5 py-1 text-[11px]">
          {maskInternalReference(ref)}
        </span>
      ))}
    </div>
  );
}
