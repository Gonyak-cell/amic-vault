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
import { maskInternalReference } from '@/components/security/secure-ref';
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
          { label: '규칙 검토', value: data.findings.length },
          { label: '위반', value: failedFindings },
          { label: 'AI 검토 의견', value: data.aiReviewFindings.length },
          { label: '미지원 규칙', value: data.unsupportedRuleCount },
          { label: '협상 쟁점', value: data.issues.length },
          { label: '문서', value: data.documents.length },
          { label: '조항', value: data.clauses.length },
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

      <SectionCard title="규칙 검토 결과" meta="계약 검토 기준">
        {data.findings.length > 0 ? (
          <TableShell caption="계약 규칙 검토 결과 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>검토 항목</TableHeader>
                <TableHeader>규칙</TableHeader>
                <TableHeader>중요도</TableHeader>
                <TableHeader>상태</TableHeader>
                <TableHeader>근거</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.findings.map((finding) => (
                <tr key={finding.findingId} className="border-t">
                  <TableCell className="font-medium">{finding.findingCode}</TableCell>
                  <TableCell>
                    {finding.ruleKey}
                    <span className="ml-2 text-xs text-muted-foreground">
                      v{finding.ruleVersion}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={severityTone(finding.severity)}>
                      {displayDomainValue(finding.severity)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(finding.status)}>
                      {displayDomainValue(finding.status)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <InlineRefs refs={finding.evidenceRefs} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="규칙 검토 결과가 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="조항 라이브러리" meta="문서 조항 색인">
        {data.clauses.length > 0 ? (
          <TableShell caption="계약 조항 은행">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>조항</TableHeader>
                <TableHeader>유형</TableHeader>
                <TableHeader>정의어</TableHeader>
                <TableHeader>충돌</TableHeader>
                <TableHeader>수정안</TableHeader>
                <TableHeader>인용 근거</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.clauses.map((clause) => (
                <tr key={clause.clauseId} className="border-t">
                  <TableCell className="font-medium">{clause.clauseNumber}</TableCell>
                  <TableCell>{displayDomainValue(clause.clauseKind)}</TableCell>
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
          { label: '자료 연결', value: data.traceability.mappingCount },
          { label: '쟁점', value: data.traceability.issueCount },
          { label: '위험', value: data.traceability.riskCount },
        ]}
      />

      <SectionCard title="RFI" meta="요청 항목">
        {data.rfis.length > 0 ? (
          <TableShell caption="DD RFI 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>코드</TableHeader>
                <TableHeader>제목</TableHeader>
                <TableHeader>분류</TableHeader>
                <TableHeader>상태</TableHeader>
                <TableHeader>우선순위</TableHeader>
                <TableHeader>기한</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.rfis.map((rfi) => (
                <tr key={rfi.rfiId} className="border-t">
                  <TableCell className="font-medium">{rfi.rfiCode}</TableCell>
                  <TableCell>{rfi.title}</TableCell>
                  <TableCell>{displayDomainValue(rfi.category)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(rfi.status)}>
                      {displayDomainValue(rfi.status)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={severityTone(rfi.priority)}>
                      {displayDomainValue(rfi.priority)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{rfi.dueDate ?? (rfi.overdue ? '기한 지남' : '-')}</TableCell>
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
                <TableHeader>표시명</TableHeader>
                <TableHeader>구역</TableHeader>
                <TableHeader>상태</TableHeader>
                <TableHeader>문서</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.mappings.map((mapping) => (
                <tr key={mapping.mappingId} className="border-t">
                  <TableCell className="font-medium">{mapping.internalLabel}</TableCell>
                  <TableCell>{mapping.sectionPath}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(mapping.mappingStatus)}>
                      {displayDomainValue(mapping.mappingStatus)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {mapping.documentId ? maskInternalReference(mapping.documentId) : '-'}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="자료실 매핑이 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="추적 관계" meta="RFI · 쟁점 · 위험 연결">
        {data.traceability.traces.length > 0 ? (
          <TableShell caption="DD 추적 관계 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>RFI</TableHeader>
                <TableHeader>자료 연결</TableHeader>
                <TableHeader>쟁점</TableHeader>
                <TableHeader>위험</TableHeader>
                <TableHeader>연결 상태</TableHeader>
                <TableHeader>인용 근거</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.traceability.traces.map((trace, index) => (
                <tr
                  key={`${trace.rfiId ?? 'rfi'}:${trace.mappingId ?? 'mapping'}:${index}`}
                  className="border-t"
                >
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
          <EmptyState title="추적 관계가 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="쟁점 · 위험" meta="검토 항목">
        {data.issues.length + data.risks.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <RecordList
              caption="DD 쟁점 목록"
              emptyTitle="쟁점이 없습니다."
              items={data.issues.map((issue) => ({
                id: issue.issueId,
                label: issue.issueCode,
                title: issue.title,
                status: displayDomainValue(issue.status),
                tone: severityTone(issue.severity),
                refs: issue.citationRefs,
              }))}
            />
            <RecordList
              caption="DD 위험 목록"
              emptyTitle="위험이 없습니다."
              items={data.risks.map((risk) => ({
                id: risk.riskId,
                label: risk.riskCode,
                title: displayDomainValue(risk.category),
                status: displayDomainValue(risk.status),
                tone: severityTone(risk.severity),
                refs: risk.citationRefs,
              }))}
            />
          </div>
        ) : (
          <EmptyState title="쟁점 또는 위험이 없습니다." />
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
          { label: '증거', value: data.caseMap.evidenceCount },
          { label: '사실관계', value: data.caseMap.factCount },
          { label: '쟁점', value: data.caseMap.issueCount },
          { label: '기일', value: data.hearings.length },
        ]}
      />

      <SectionCard title="사실관계 원장" meta="주장 사실">
        {data.facts.length > 0 ? (
          <TableShell caption="송무 사실관계 원장">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>사실관계</TableHeader>
                <TableHeader>요약</TableHeader>
                <TableHeader>일자</TableHeader>
                <TableHeader>상태</TableHeader>
                <TableHeader>중요도</TableHeader>
                <TableHeader>인용 근거</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.facts.map((fact) => (
                <tr key={fact.factId} className="border-t">
                  <TableCell className="font-medium">{fact.factCode}</TableCell>
                  <TableCell>{fact.factSummary}</TableCell>
                  <TableCell>{fact.factDate ?? '-'}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(fact.status)}>
                      {displayDomainValue(fact.status)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={severityTone(fact.materiality)}>
                      {displayDomainValue(fact.materiality)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <InlineRefs refs={fact.citationRefs} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="사실관계가 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="사건 관계도" meta="증거 · 사실관계 · 쟁점 · 서면 연결">
        {data.caseMap.caseMap.length > 0 ? (
          <TableShell caption="송무 사건 관계도">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>증거</TableHeader>
                <TableHeader>사실관계</TableHeader>
                <TableHeader>쟁점</TableHeader>
                <TableHeader>소송서면</TableHeader>
                <TableHeader>연결 상태</TableHeader>
                <TableHeader>인용 근거</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.caseMap.caseMap.map((item, index) => (
                <tr
                  key={`${item.evidenceId ?? 'evidence'}:${item.factId ?? 'fact'}:${index}`}
                  className="border-t"
                >
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
          <EmptyState title="사건 관계가 없습니다." />
        )}
      </SectionCard>

      <SectionCard title="증거 · 소송서면" meta="증거와 내부 서면">
        <div className="grid gap-3 lg:grid-cols-2">
          <RecordList
            caption="송무 증거 목록"
            emptyTitle="증거가 없습니다."
            items={data.evidence.map((item) => ({
              id: item.evidenceId,
              label: item.evidenceCode,
              title: item.exhibitLabel ?? item.evidenceType,
              status: displayDomainValue(item.custodyStatus),
              tone: statusTone(item.admittedStatus),
              refs: item.documentId ? [`document:${item.documentId}`] : [],
            }))}
          />
          <RecordList
            caption="송무 소송서면 목록"
            emptyTitle="소송서면이 없습니다."
            items={data.pleadings.map((item) => ({
              id: item.pleadingId,
              label: item.pleadingCode,
              title: displayDomainValue(item.pleadingType),
              status: displayDomainValue(item.filingStatus),
              tone: statusTone(item.filingStatus),
              refs: item.citationRefs,
            }))}
          />
        </div>
      </SectionCard>

      <SectionCard title="기일" meta="기일과 내부 마감">
        <RecordList
          caption="송무 기일 목록"
          emptyTitle="기일이 없습니다."
          items={data.hearings.map((item) => ({
            id: item.hearingId,
            label: item.title,
            title: item.internalDeadline
              ? `${item.scheduledAt.slice(0, 10)} · 내부 ${item.internalDeadline}`
              : item.scheduledAt.slice(0, 10),
            status: displayDomainValue(item.status),
            tone: statusTone(item.status),
            refs: item.pleadingId ? [`pleading:${item.pleadingId}`] : [],
          }))}
        />
      </SectionCard>

      <SectionCard title="쟁점" meta="쟁점 구조">
        {data.issues.length > 0 ? (
          <TableShell caption="송무 쟁점 목록">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <TableHeader>쟁점</TableHeader>
                <TableHeader>표시명</TableHeader>
                <TableHeader>유형</TableHeader>
                <TableHeader>상태</TableHeader>
                <TableHeader>입장</TableHeader>
              </tr>
            </thead>
            <tbody>
              {data.issues.map((issue) => (
                <tr key={issue.issueId} className="border-t">
                  <TableCell className="font-medium">{issue.issueCode}</TableCell>
                  <TableCell>{issue.label}</TableCell>
                  <TableCell>{displayDomainValue(issue.issueType)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(issue.status)}>
                      {displayDomainValue(issue.status)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{issue.position}</TableCell>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title="쟁점이 없습니다." />
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

function TableShell({ caption, children }: { caption: string; children: React.ReactNode }) {
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

function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={['px-4 py-3 align-top', className].filter(Boolean).join(' ')}>{children}</td>
  );
}

function InlineRefs({ refs }: { refs: readonly string[] }) {
  if (refs.length === 0) return <span className="text-muted-foreground">-</span>;

  return (
    <span className="flex max-w-[28rem] flex-wrap gap-1">
      {refs.map((ref) => (
        <code
          key={ref}
          className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {maskInternalReference(ref)}
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
  return maskInternalReference(value);
}

const domainValueLabels: Readonly<Record<string, string>> = {
  admitted: '채택',
  archived: '보관됨',
  challenged: '다툼 있음',
  closed: '종결',
  collected: '수집됨',
  complete: '완료',
  critical: '매우 높음',
  disputed: '다툼 있음',
  excluded: '제외',
  fail: '위반',
  filed: '제출됨',
  filed_recorded: '제출 기록됨',
  final: '최종',
  high: '높음',
  info: '안내',
  low: '낮음',
  mapped: '연결됨',
  medium: '보통',
  mitigated: '조치됨',
  missing: '누락',
  open: '진행 중',
  pass: '충족',
  pending: '대기',
  pending_approval: '승인 대기',
  required: '필수',
  supported: '지원',
  supplement_requested: '보완 요청',
  unknown: '미확인',
  verified: '확인됨',
  warning: '주의',
  weak: '근거 부족',
};

function displayDomainValue(value: string): string {
  return domainValueLabels[value] ?? '기타';
}
