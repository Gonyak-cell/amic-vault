import * as React from 'react';
import type { ContractAiReviewFindingDto, ContractRuleFindingDto } from '@amic-vault/shared';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { maskInternalReference } from '@/components/security/secure-ref';

const taskLabels = {
  clause_analysis: '조항 분석',
  risk_extraction: '리스크 추출',
} as const satisfies Record<ContractAiReviewFindingDto['task'], string>;

const reviewStatusLabels = {
  pending: '검토 대기',
  accepted: '검토 완료',
} as const satisfies Record<ContractAiReviewFindingDto['status'], string>;

const severityLabels = {
  info: '참고',
  warning: '주의',
  critical: '중요',
} as const satisfies Record<ContractAiReviewFindingDto['severity'], string>;

export interface ContractAiReviewPanelProps {
  ruleFindings: ContractRuleFindingDto[];
  aiReviewFindings: ContractAiReviewFindingDto[];
  acceptingFindingId?: string | null | undefined;
  onAcceptFinding?: ((findingId: string) => void) | undefined;
}

export function ContractAiReviewPanel({
  acceptingFindingId = null,
  aiReviewFindings,
  onAcceptFinding,
  ruleFindings,
}: ContractAiReviewPanelProps) {
  const failedRuleFindings = ruleFindings.filter((finding) => finding.status === 'fail');

  return (
    <SectionCard
      title="계약 1차 검토"
      meta={`기준 위반 ${failedRuleFindings.length}건 · AI 소견 ${aiReviewFindings.length}건`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-label="기준 위반" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">기준 위반</h3>
            <StatusBadge tone={failedRuleFindings.length > 0 ? 'warning' : 'success'}>
              {failedRuleFindings.length}
            </StatusBadge>
          </div>
          {failedRuleFindings.length > 0 ? (
            <div className="grid gap-2">
              {failedRuleFindings.map((finding) => (
                <RuleViolationRow key={finding.findingId} finding={finding} />
              ))}
            </div>
          ) : (
            <EmptyState title="표시할 기준 위반이 없습니다." />
          )}
        </section>

        <section aria-label="AI 소견" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">AI 소견</h3>
            <StatusBadge tone={aiReviewFindings.length > 0 ? 'neutral' : 'success'}>
              {aiReviewFindings.length}
            </StatusBadge>
          </div>
          {aiReviewFindings.length > 0 ? (
            <div className="grid gap-2">
              {aiReviewFindings.map((finding) => (
                <AiOpinionRow
                  key={finding.findingId}
                  finding={finding}
                  isAccepting={acceptingFindingId === finding.findingId}
                  onAcceptFinding={onAcceptFinding}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="AI 소견이 없습니다." />
          )}
        </section>
      </div>
    </SectionCard>
  );
}

function RuleViolationRow({ finding }: { finding: ContractRuleFindingDto }) {
  return (
    <article className="grid gap-2 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{finding.findingCode}</p>
          <p className="truncate text-xs text-muted-foreground">
            {finding.ruleKey} v{finding.ruleVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={severityTone(finding.severity)}>
            {severityLabels[finding.severity]}
          </StatusBadge>
          <StatusBadge tone="warning">위반</StatusBadge>
        </div>
      </div>
      <InlineRefs refs={finding.evidenceRefs} />
    </article>
  );
}

function AiOpinionRow({
  finding,
  isAccepting,
  onAcceptFinding,
}: {
  finding: ContractAiReviewFindingDto;
  isAccepting: boolean;
  onAcceptFinding?: ((findingId: string) => void) | undefined;
}) {
  const accepted = finding.status === 'accepted';
  const disabled = accepted || isAccepting || !onAcceptFinding;

  return (
    <article className="grid gap-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={severityTone(finding.severity)}>
              {severityLabels[finding.severity]}
            </StatusBadge>
            <StatusBadge tone={accepted ? 'success' : 'neutral'}>
              {reviewStatusLabels[finding.status]}
            </StatusBadge>
            <span className="text-xs text-muted-foreground">{taskLabels[finding.task]}</span>
          </div>
          <p className="mt-2 text-sm font-medium">{finding.findingCode}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onAcceptFinding?.(finding.findingId)}
        >
          {isAccepting ? (
            <Loader2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          {accepted ? '완료됨' : '검토 완료'}
        </Button>
      </div>
      <p className="text-sm leading-6">{finding.findingText}</p>
      <InlineRefs refs={finding.citationRefs} />
    </article>
  );
}

function InlineRefs({ refs }: { refs: readonly string[] }) {
  if (refs.length === 0) return <span className="text-muted-foreground">-</span>;

  return (
    <span className="flex max-w-[28rem] flex-wrap gap-1">
      {refs.map((ref) => (
        <span
          key={ref}
          className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {maskInternalReference(ref)}
        </span>
      ))}
    </span>
  );
}

function severityTone(value: ContractAiReviewFindingDto['severity']): StatusBadgeTone {
  if (value === 'critical') return 'blocked';
  if (value === 'warning') return 'warning';
  return 'neutral';
}
