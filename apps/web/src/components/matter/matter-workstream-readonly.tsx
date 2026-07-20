import React from 'react';
import type {
  ContractAiReviewFindingDto,
  ContractClauseBankItemDto,
  ContractRuleFindingDto,
  DocumentDto,
  DocumentStatus,
  NegotiationIssueDto,
  NegotiationIssueStatus,
  DdDataRoomMappingDto,
  DdIssueDto,
  DdRfiDto,
  DdRiskDto,
  DdTraceabilityResponseDto,
  LitigationCaseMapResponseDto,
  LitigationEvidenceDto,
  LitigationFactDto,
  LitigationHearingDto,
  LitigationIssueDto,
  LitigationPleadingDto,
} from '@amic-vault/shared';
import { BadgeCheck, FileCheck2, Handshake, Inbox, Loader2, Send } from 'lucide-react';
import { ContractAiReviewPanel } from '@/components/contract/contract-ai-review-panel';
import { NegotiationIssuesTable } from '@/components/contract/negotiation-issues-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import {
  documentStatusLabels,
  documentStatusTransitionTargets,
} from '@/lib/document-status-transitions';

export interface ContractMatterReadOnlyData {
  aiReviewFindings: ContractAiReviewFindingDto[];
  clauses: ContractClauseBankItemDto[];
  documents: DocumentDto[];
  findings: ContractRuleFindingDto[];
  issues: NegotiationIssueDto[];
  unsupportedRuleCount: number;
}

export interface DdMatterReadOnlyData {
  issues: DdIssueDto[];
  mappings: DdDataRoomMappingDto[];
  risks: DdRiskDto[];
  rfis: DdRfiDto[];
  traceability: DdTraceabilityResponseDto;
}

export interface LitigationMatterReadOnlyData {
  caseMap: LitigationCaseMapResponseDto;
  evidence: LitigationEvidenceDto[];
  facts: LitigationFactDto[];
  hearings: LitigationHearingDto[];
  issues: LitigationIssueDto[];
  pleadings: LitigationPleadingDto[];
}

export function ContractMatterReadOnlyView({
  data,
  acceptingAiFindingId,
  onAiReviewFindingAccept,
  onDocumentStatusChange,
  onNegotiationIssueStatusChange,
  updatingDocumentId,
  updatingIssueId,
}: {
  data: ContractMatterReadOnlyData;
  acceptingAiFindingId?: string | null | undefined;
  onAiReviewFindingAccept?: ((findingId: string) => void) | undefined;
  onDocumentStatusChange?: ((documentId: string, status: DocumentStatus) => void) | undefined;
  onNegotiationIssueStatusChange?: (issueId: string, status: NegotiationIssueStatus) => void;
  updatingDocumentId?: string | null | undefined;
  updatingIssueId?: string | null | undefined;
}) {
  const failedFindings = data.findings.filter((finding) => finding.status === 'fail').length;

  return (
    <div className="grid gap-4">
      <MetricStrip
        items={[
          { label: 'Rule findings', value: data.findings.length },
          { label: 'Fail', value: failedFindings },
          { label: 'AI opinions', value: data.aiReviewFindings.length },
          { label: 'Unsupported', value: data.unsupportedRuleCount },
          { label: 'Issues', value: data.issues.length },
          { label: 'Documents', value: data.documents.length },
          { label: 'Clauses', value: data.clauses.length },
        ]}
      />

      <ContractWorkflowPanel
        documents={data.documents}
        onStatusChange={onDocumentStatusChange}
        updatingDocumentId={updatingDocumentId}
      />

      <ContractAiReviewPanel
        aiReviewFindings={data.aiReviewFindings}
        acceptingFindingId={acceptingAiFindingId}
        onAcceptFinding={onAiReviewFindingAccept}
        ruleFindings={data.findings}
      />

      <NegotiationIssuesTable
        issues={data.issues}
        onStatusChange={onNegotiationIssueStatusChange}
        updatingIssueId={updatingIssueId}
      />

      <SectionCard title="Rule findings" meta="계약 playbook 결과">
        {data.findings.length > 0 ? (
          <TableShell caption="계약 rule finding 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>Finding</TableHeader>
                <TableHeader>Rule</TableHeader>
                <TableHeader>Severity</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Evidence</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.findings.map((finding) => (
                <tr key={finding.findingId} className="border-t">
                  <TableCell className="font-medium">{finding.findingCode}</TableCell>
                  <TableCell>
                    {finding.ruleKey}
                    <span className="ml-2 text-xs text-muted-foreground">v{finding.ruleVersion}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={severityTone(finding.severity)}>{finding.severity}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(finding.status)}>{finding.status}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <InlineRefs refs={finding.evidenceRefs} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="Rule finding이 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="Clause bank" meta="문서 조항 색인">
        {data.clauses.length > 0 ? (
          <TableShell caption="계약 조항 은행">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>Clause</TableHeader>
                <TableHeader>Kind</TableHeader>
                <TableHeader>Defined terms</TableHeader>
                <TableHeader>Conflicts</TableHeader>
                <TableHeader>Redline</TableHeader>
                <TableHeader>Citation</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.clauses.map((clause) => (
                <tr key={clause.clauseId} className="border-t">
                  <TableCell className="font-medium">{clause.clauseNumber}</TableCell>
                  <TableCell>{clause.clauseKind}</TableCell>
                  <TableCell>{clause.definedTermCount}</TableCell>
                  <TableCell>{clause.conflictCount}</TableCell>
                  <TableCell>{clause.redlineChangeCount}</TableCell>
                  <TableCell>
                    <InlineRefs refs={[clause.citationRef]} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="표시할 조항이 없습니다." />
        )}
      </SectionCard>
    </div>
  );
}

const contractWorkflowStatuses = [
  'client_sent',
  'counterparty_sent',
  'markup_received',
  'negotiation',
  'final',
  'executed',
] as const satisfies readonly DocumentStatus[];

type ContractWorkflowStatus = (typeof contractWorkflowStatuses)[number];

const contractWorkflowStatusIcons = {
  client_sent: Send,
  counterparty_sent: Send,
  markup_received: Inbox,
  negotiation: Handshake,
  final: FileCheck2,
  executed: BadgeCheck,
} as const satisfies Record<ContractWorkflowStatus, typeof Send>;

const contractWorkflowStatusSet = new Set<DocumentStatus>(contractWorkflowStatuses);

function isContractWorkflowStatus(status: DocumentStatus): status is ContractWorkflowStatus {
  return contractWorkflowStatusSet.has(status);
}

function ContractWorkflowPanel({
  documents,
  onStatusChange,
  updatingDocumentId = null,
}: {
  documents: DocumentDto[];
  onStatusChange?: ((documentId: string, status: DocumentStatus) => void) | undefined;
  updatingDocumentId?: string | null | undefined;
}) {
  return (
    <SectionCard title="계약 진행" meta="문서 상태">
      {documents.length > 0 ? (
        <div className="grid gap-3">
          {documents.map((document) => (
            <ContractWorkflowDocumentRow
              key={document.documentId}
              document={document}
              onStatusChange={onStatusChange}
              updatingDocumentId={updatingDocumentId}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="계약 문서가 없습니다." />
      )}
    </SectionCard>
  );
}

function ContractWorkflowDocumentRow({
  document,
  onStatusChange,
  updatingDocumentId,
}: {
  document: DocumentDto;
  onStatusChange?: ((documentId: string, status: DocumentStatus) => void) | undefined;
  updatingDocumentId: string | null;
}) {
  const targets = documentStatusTransitionTargets(document).filter(isContractWorkflowStatus);
  const busy = updatingDocumentId === document.documentId;

  return (
    <div className="grid gap-2 rounded-md border px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{document.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge tone={statusTone(document.status)}>
            {documentStatusLabels[document.status]}
          </StatusBadge>
          <span className="font-mono">{document.documentId.slice(0, 8)}</span>
          {document.legalHold ? <StatusBadge tone="warning">보존</StatusBadge> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {targets.length > 0 ? (
          targets.map((status) => {
            const Icon = contractWorkflowStatusIcons[status];
            return (
              <Button
                key={status}
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || !onStatusChange}
                onClick={() => onStatusChange?.(document.documentId, status)}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden="true" />
                )}
                {documentStatusLabels[status]}
              </Button>
            );
          })
        ) : (
          <span className="text-sm text-muted-foreground">전이 없음</span>
        )}
      </div>
    </div>
  );
}

export function DdMatterReadOnlyView({ data }: { data: DdMatterReadOnlyData }) {
  return (
    <div className="grid gap-4">
      <MetricStrip
        items={[
          { label: 'RFI', value: data.traceability.rfiCount },
          { label: 'Mappings', value: data.traceability.mappingCount },
          { label: 'Issues', value: data.traceability.issueCount },
          { label: 'Risks', value: data.traceability.riskCount },
        ]}
      />

      <SectionCard title="RFI" meta="요청 항목">
        {data.rfis.length > 0 ? (
          <TableShell caption="DD RFI 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>Code</TableHeader>
                <TableHeader>Title</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Due</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.rfis.map((rfi) => (
                <tr key={rfi.rfiId} className="border-t">
                  <TableCell className="font-medium">{rfi.rfiCode}</TableCell>
                  <TableCell>{rfi.title}</TableCell>
                  <TableCell>{rfi.category}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(rfi.status)}>{rfi.status}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={severityTone(rfi.priority)}>{rfi.priority}</StatusBadge>
                  </TableCell>
                  <TableCell>{rfi.dueDate ?? (rfi.overdue ? 'overdue' : '-')}</TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="RFI가 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="자료실 매핑" meta="RFI 연결 상태">
        {data.mappings.length > 0 ? (
          <TableShell caption="DD 자료실 매핑">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>Label</TableHeader>
                <TableHeader>Section</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Document</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.mappings.map((mapping) => (
                <tr key={mapping.mappingId} className="border-t">
                  <TableCell className="font-medium">{mapping.internalLabel}</TableCell>
                  <TableCell>{mapping.sectionPath}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(mapping.mappingStatus)}>
                      {mapping.mappingStatus}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{mapping.documentId ?? '-'}</TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="자료실 매핑이 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="Traceability" meta="RFI · issue · risk 연결">
        {data.traceability.traces.length > 0 ? (
          <TableShell caption="DD traceability 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>RFI</TableHeader>
                <TableHeader>Mapping</TableHeader>
                <TableHeader>Issue</TableHeader>
                <TableHeader>Risk</TableHeader>
                <TableHeader>Status refs</TableHeader>
                <TableHeader>Citations</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.traceability.traces.map((trace, index) => (
                <tr key={`${trace.rfiId ?? 'rfi'}:${trace.mappingId ?? 'mapping'}:${index}`} className="border-t">
                  <TableCell>{shortId(trace.rfiId)}</TableCell>
                  <TableCell>{shortId(trace.mappingId)}</TableCell>
                  <TableCell>{shortId(trace.issueId)}</TableCell>
                  <TableCell>{shortId(trace.riskId)}</TableCell>
                  <TableCell>
                    <InlineRefs refs={trace.statusRefs} />
                  </TableCell>
                  <TableCell>
                    <InlineRefs refs={trace.citationRefs} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="Traceability 항목이 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="Issue · Risk" meta="보고 항목">
        {data.issues.length + data.risks.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <RecordList
              caption="DD issue 목록"
              emptyTitle="Issue가 없습니다."
              items={data.issues.map((issue) => ({
                id: issue.issueId,
                label: issue.issueCode,
                title: issue.title,
                status: issue.status,
                tone: severityTone(issue.severity),
                refs: issue.citationRefs,
              }))}
            />
            <RecordList
              caption="DD risk 목록"
              emptyTitle="Risk가 없습니다."
              items={data.risks.map((risk) => ({
                id: risk.riskId,
                label: risk.riskCode,
                title: risk.category,
                status: risk.status,
                tone: severityTone(risk.severity),
                refs: risk.citationRefs,
              }))}
            />
          </div>
        ) : (
          <EmptyState title="Issue 또는 Risk가 없습니다." />
        )}
      </SectionCard>
    </div>
  );
}

export function LitigationMatterReadOnlyView({ data }: { data: LitigationMatterReadOnlyData }) {
  return (
    <div className="grid gap-4">
      <MetricStrip
        items={[
          { label: 'Evidence', value: data.caseMap.evidenceCount },
          { label: 'Facts', value: data.caseMap.factCount },
          { label: 'Issues', value: data.caseMap.issueCount },
          { label: 'Hearings', value: data.hearings.length },
        ]}
      />

      <SectionCard title="Fact Ledger" meta="주장 사실">
        {data.facts.length > 0 ? (
          <TableShell caption="송무 Fact Ledger">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>Fact</TableHeader>
                <TableHeader>Summary</TableHeader>
                <TableHeader>Date</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Materiality</TableHeader>
                <TableHeader>Citations</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.facts.map((fact) => (
                <tr key={fact.factId} className="border-t">
                  <TableCell className="font-medium">{fact.factCode}</TableCell>
                  <TableCell>{fact.factSummary}</TableCell>
                  <TableCell>{fact.factDate ?? '-'}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(fact.status)}>{fact.status}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={severityTone(fact.materiality)}>{fact.materiality}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <InlineRefs refs={fact.citationRefs} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="Fact Ledger 항목이 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="Case map" meta="증거 · Fact · 쟁점 · 서면 연결">
        {data.caseMap.caseMap.length > 0 ? (
          <TableShell caption="송무 case map">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>Evidence</TableHeader>
                <TableHeader>Fact</TableHeader>
                <TableHeader>Issue</TableHeader>
                <TableHeader>Pleading</TableHeader>
                <TableHeader>Status refs</TableHeader>
                <TableHeader>Citations</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.caseMap.caseMap.map((item, index) => (
                <tr key={`${item.evidenceId ?? 'evidence'}:${item.factId ?? 'fact'}:${index}`} className="border-t">
                  <TableCell>{shortId(item.evidenceId)}</TableCell>
                  <TableCell>{shortId(item.factId)}</TableCell>
                  <TableCell>{shortId(item.issueId)}</TableCell>
                  <TableCell>{shortId(item.pleadingId)}</TableCell>
                  <TableCell>
                    <InlineRefs refs={item.statusRefs} />
                  </TableCell>
                  <TableCell>
                    <InlineRefs refs={item.citationRefs} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="Case map 항목이 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="Evidence · Pleadings" meta="증거와 내부 서면">
        <div className="grid gap-3 lg:grid-cols-2">
          <RecordList
            caption="송무 evidence 목록"
            emptyTitle="Evidence가 없습니다."
            items={data.evidence.map((item) => ({
              id: item.evidenceId,
              label: item.evidenceCode,
              title: item.exhibitLabel ?? item.evidenceType,
              status: item.custodyStatus,
              tone: statusTone(item.admittedStatus),
              refs: item.documentId ? [`document:${item.documentId}`] : [],
            }))}
          />
          <RecordList
            caption="송무 pleading 목록"
            emptyTitle="Pleading이 없습니다."
            items={data.pleadings.map((item) => ({
              id: item.pleadingId,
              label: item.pleadingCode,
              title: item.pleadingType,
              status: item.filingStatus,
              tone: statusTone(item.filingStatus),
              refs: item.citationRefs,
            }))}
          />
        </div>
      </SectionCard>

      <SectionCard title="Hearings" meta="기일과 내부 마감">
        <RecordList
          caption="송무 hearing 목록"
          emptyTitle="기일이 없습니다."
          items={data.hearings.map((item) => ({
            id: item.hearingId,
            label: item.title,
            title: item.internalDeadline
              ? `${item.scheduledAt.slice(0, 10)} · 내부 ${item.internalDeadline}`
              : item.scheduledAt.slice(0, 10),
            status: item.status,
            tone: statusTone(item.status),
            refs: item.pleadingId ? [`pleading:${item.pleadingId}`] : [],
          }))}
        />
      </SectionCard>

      <SectionCard title="Issues" meta="쟁점 구조">
        {data.issues.length > 0 ? (
          <TableShell caption="송무 issue 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>Issue</TableHeader>
                <TableHeader>Label</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Position</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.issues.map((issue) => (
                <tr key={issue.issueId} className="border-t">
                  <TableCell className="font-medium">{issue.issueCode}</TableCell>
                  <TableCell>{issue.label}</TableCell>
                  <TableCell>{issue.issueType}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(issue.status)}>{issue.status}</StatusBadge>
                  </TableCell>
                  <TableCell>{issue.position}</TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="Issue가 없습니다." />
        )}
      </SectionCard>
    </div>
  );
}

function MetricStrip({ items }: { items: readonly { label: string; value: number }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-card p-3">
          <dt className="text-xs font-medium uppercase text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TableShell({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function TableCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={['px-4 py-3 align-top', className].filter(Boolean).join(' ')}>{children}</td>;
}

function InlineRefs({ refs }: { refs: readonly string[] }) {
  if (refs.length === 0) return <span className="text-muted-foreground">-</span>;

  return (
    <span className="flex max-w-[28rem] flex-wrap gap-1">
      {refs.map((ref) => (
        <code key={ref} className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {ref}
        </code>
      ))}
    </span>
  );
}

function RecordList({
  caption,
  emptyTitle,
  items,
}: {
  caption: string;
  emptyTitle: string;
  items: readonly {
    id: string;
    label: string;
    refs: readonly string[];
    status: string;
    title: string;
    tone: StatusBadgeTone;
  }[];
}) {
  if (items.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="rounded-md border" role="table" aria-label={caption}>
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 border-t px-3 py-3 first:border-t-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.label}</p>
              <p className="truncate text-xs text-muted-foreground">{item.title}</p>
            </div>
            <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
          </div>
          <InlineRefs refs={item.refs} />
        </div>
      ))}
    </div>
  );
}

function severityTone(value: string): StatusBadgeTone {
  if (value === 'critical') return 'blocked';
  if (value === 'high' || value === 'warning') return 'warning';
  if (value === 'low' || value === 'info') return 'neutral';
  return 'neutral';
}

function statusTone(value: string): StatusBadgeTone {
  if (
    value === 'pass' ||
    value === 'complete' ||
    value === 'closed' ||
    value === 'verified' ||
    value === 'supported' ||
    value === 'mapped' ||
    value === 'mitigated' ||
    value === 'admitted' ||
    value === 'filed_recorded'
  ) {
    return 'success';
  }
  if (
    value === 'fail' ||
    value === 'missing' ||
    value === 'supplement_requested' ||
    value === 'critical' ||
    value === 'disputed' ||
    value === 'challenged' ||
    value === 'weak' ||
    value === 'excluded'
  ) {
    return 'warning';
  }
  return 'neutral';
}

function shortId(value: string | null): string {
  if (!value) return '-';
  return value.length > 12 ? value.slice(0, 8) : value;
}
