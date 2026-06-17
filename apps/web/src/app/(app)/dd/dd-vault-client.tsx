'use client';

import React, { useState } from 'react';
import {
  ClipboardCheck,
  ClipboardList,
  FileSymlink,
  ListTree,
  ShieldAlert,
} from 'lucide-react';
import type {
  DdDataRoomMappingListResponseDto,
  DdIssueListResponseDto,
  DdIssueSeverity,
  DdMappingStatus,
  DdPriority,
  DdRfiListResponseDto,
  DdRiskListResponseDto,
  DdRiskLikelihood,
  DdTraceabilityResponseDto,
} from '@amic-vault/shared';
import {
  ddIssueSeverities,
  ddMappingStatuses,
  ddPriorities,
  ddRiskLikelihoods,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createDdIssue,
  createDdMapping,
  createDdRfi,
  createDdRisk,
  listDdIssues,
  listDdMappings,
  listDdRfis,
  listDdRisks,
  loadDdTraceability,
} from '@/lib/api/dd';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { useI18n, type Language } from '@/lib/i18n';

const ddCopy: Record<
  Language,
  {
    matterRef: string;
    refreshTitle: string;
    refresh: string;
    title: string;
    rfiCode: string;
    rfiTitle: string;
    priority: string;
    saveRfi: string;
    documentRef: string;
    section: string;
    mappingStatus: string;
    saveMapping: string;
    issueCode: string;
    issueTitle: string;
    severity: string;
    saveIssue: string;
    riskCode: string;
    likelihood: string;
    saveRisk: string;
    traceability: string;
    rfis: string;
    mappings: string;
    issues: string;
    risks: string;
    traces: string;
    code: string;
    status: string;
    due: string;
    sectionHeader: string;
    rfi: string;
    document: string;
    refs: string;
  }
> = {
  ko: {
    matterRef: 'Matter ID',
    refreshTitle: '실사 자료 새로고침',
    refresh: '새로고침',
    title: '실사 자료',
    rfiCode: '요청 ID',
    rfiTitle: '요청 제목',
    priority: '우선순위',
    saveRfi: '요청 저장',
    documentRef: '파일 ID',
    section: '자료 위치',
    mappingStatus: '매핑 상태',
    saveMapping: '매핑 저장',
    issueCode: '이슈 ID',
    issueTitle: '이슈 제목',
    severity: '중요도',
    saveIssue: '이슈 저장',
    riskCode: '리스크 ID',
    likelihood: '발생 가능성',
    saveRisk: '리스크 저장',
    traceability: '연결 현황',
    rfis: '자료 요청',
    mappings: '자료 매핑',
    issues: '이슈',
    risks: '리스크',
    traces: '연결',
    code: 'ID',
    status: '상태',
    due: '기한',
    sectionHeader: '위치',
    rfi: '요청',
    document: '파일',
    refs: 'ID',
  },
  en: {
    matterRef: 'Matter ref',
    refreshTitle: 'Refresh diligence data',
    refresh: 'Refresh',
    title: 'Diligence materials',
    rfiCode: 'Request ref',
    rfiTitle: 'Request title',
    priority: 'Priority',
    saveRfi: 'Save request',
    documentRef: 'File ref',
    section: 'Folder path',
    mappingStatus: 'Mapping status',
    saveMapping: 'Save mapping',
    issueCode: 'Issue ref',
    issueTitle: 'Issue title',
    severity: 'Severity',
    saveIssue: 'Save issue',
    riskCode: 'Risk ref',
    likelihood: 'Likelihood',
    saveRisk: 'Save risk',
    traceability: 'Traceability',
    rfis: 'Requests',
    mappings: 'Material mapping',
    issues: 'Issues',
    risks: 'Risks',
    traces: 'Trace links',
    code: 'Ref',
    status: 'Status',
    due: 'Due',
    sectionHeader: 'Location',
    rfi: 'Request',
    document: 'File',
    refs: 'Refs',
  },
};

export function DdVaultClient() {
  const { language } = useI18n();
  const copy = ddCopy[language];
  const [matterId, setMatterId] = useState('');
  const [rfiCode, setRfiCode] = useState('');
  const [rfiTitle, setRfiTitle] = useState('');
  const [priority, setPriority] = useState<DdPriority>('medium');
  const [documentId, setDocumentId] = useState('');
  const [sectionPath, setSectionPath] = useState('');
  const [mappingStatus, setMappingStatus] = useState<DdMappingStatus>('mapped');
  const [issueCode, setIssueCode] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [severity, setSeverity] = useState<DdIssueSeverity>('high');
  const [riskCode, setRiskCode] = useState('');
  const [likelihood, setLikelihood] = useState<DdRiskLikelihood>('medium');
  const [rfis, setRfis] = useState<DdRfiListResponseDto | null>(null);
  const [mappings, setMappings] = useState<DdDataRoomMappingListResponseDto | null>(null);
  const [issues, setIssues] = useState<DdIssueListResponseDto | null>(null);
  const [risks, setRisks] = useState<DdRiskListResponseDto | null>(null);
  const [trace, setTrace] = useState<DdTraceabilityResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(task: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const trimmedMatterId = matterId.trim();
  const activeRfiId = rfis?.rfis[0]?.rfiId;
  const activeIssueId = issues?.issues[0]?.issueId;

  async function refreshAll() {
    if (!trimmedMatterId) return;
    const [nextRfis, nextMappings, nextIssues, nextRisks, nextTrace] = await Promise.all([
      run(() => listDdRfis({ matterId: trimmedMatterId, limit: 50 })),
      run(() => listDdMappings({ matterId: trimmedMatterId, limit: 50 })),
      run(() => listDdIssues({ matterId: trimmedMatterId, limit: 50 })),
      run(() => listDdRisks({ matterId: trimmedMatterId, limit: 50 })),
      run(() => loadDdTraceability({ matterId: trimmedMatterId, limit: 100 })),
    ]);
    if (nextRfis) setRfis(nextRfis);
    if (nextMappings) setMappings(nextMappings);
    if (nextIssues) setIssues(nextIssues);
    if (nextRisks) setRisks(nextRisks);
    if (nextTrace) setTrace(nextTrace);
  }

  async function saveRfi() {
    const result = await run(() =>
      createDdRfi({
        matterId: trimmedMatterId,
        rfiCode: rfiCode.trim(),
        category: 'general',
        title: rfiTitle.trim(),
        status: 'requested',
        priority,
      }),
    );
    if (result) await refreshAll();
  }

  async function saveMapping() {
    const doc = documentId.trim();
    const result = await run(() =>
      createDdMapping({
        matterId: trimmedMatterId,
        rfiId: activeRfiId,
        documentId: mappingStatus === 'mapped' ? doc : undefined,
        internalLabel: sectionPath.trim(),
        sectionPath: sectionPath.trim(),
        mappingStatus,
      }),
    );
    if (result) await refreshAll();
  }

  async function saveIssue() {
    const doc = documentId.trim();
    const result = await run(() =>
      createDdIssue({
        matterId: trimmedMatterId,
        rfiId: activeRfiId,
        documentId: doc || undefined,
        issueCode: issueCode.trim(),
        title: issueTitle.trim(),
        severity,
        status: 'open',
        citationRefs: doc ? [`document:${doc}`] : [],
        reportInclusion: true,
      }),
    );
    if (result) await refreshAll();
  }

  async function saveRisk() {
    const result = await run(() =>
      createDdRisk({
        matterId: trimmedMatterId,
        issueId: activeIssueId,
        riskCode: riskCode.trim(),
        category: 'legal',
        severity,
        likelihood,
        status: 'open',
        citationRefs: activeIssueId ? [`issue:${activeIssueId}`] : [],
      }),
    );
    if (result) await refreshAll();
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={copy.matterRef} value={matterId} onChange={setMatterId} />
          <Button onClick={refreshAll} disabled={busy || !trimmedMatterId} title={copy.refreshTitle}>
            <ListTree className="h-4 w-4" />
            {copy.refresh}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<ClipboardList className="h-4 w-4" />} label={copy.title} />
          <Field label={copy.rfiCode} value={rfiCode} onChange={setRfiCode} />
          <Field label={copy.rfiTitle} value={rfiTitle} onChange={setRfiTitle} />
          <SelectField
            label={copy.priority}
            value={priority}
            values={ddPriorities}
            language={language}
            onChange={(value) => setPriority(value as DdPriority)}
          />
          <Button onClick={saveRfi} disabled={busy || !trimmedMatterId || !rfiTitle.trim()}>
            <ClipboardCheck className="h-4 w-4" />
            {copy.saveRfi}
          </Button>

          <div className="border-t pt-3" />
          <Field label={copy.documentRef} value={documentId} onChange={setDocumentId} />
          <Field label={copy.section} value={sectionPath} onChange={setSectionPath} />
          <SelectField
            label={copy.mappingStatus}
            value={mappingStatus}
            values={ddMappingStatuses}
            language={language}
            onChange={(value) => setMappingStatus(value as DdMappingStatus)}
          />
          <Button onClick={saveMapping} disabled={busy || !trimmedMatterId || !sectionPath.trim()}>
            <FileSymlink className="h-4 w-4" />
            {copy.saveMapping}
          </Button>

          <div className="border-t pt-3" />
          <Field label={copy.issueCode} value={issueCode} onChange={setIssueCode} />
          <Field label={copy.issueTitle} value={issueTitle} onChange={setIssueTitle} />
          <SelectField
            label={copy.severity}
            value={severity}
            values={ddIssueSeverities}
            language={language}
            onChange={(value) => setSeverity(value as DdIssueSeverity)}
          />
          <Button onClick={saveIssue} disabled={busy || !trimmedMatterId || !issueTitle.trim()}>
            <ShieldAlert className="h-4 w-4" />
            {copy.saveIssue}
          </Button>

          <div className="border-t pt-3" />
          <Field label={copy.riskCode} value={riskCode} onChange={setRiskCode} />
          <SelectField
            label={copy.likelihood}
            value={likelihood}
            values={ddRiskLikelihoods}
            language={language}
            onChange={(value) => setLikelihood(value as DdRiskLikelihood)}
          />
          <Button onClick={saveRisk} disabled={busy || !trimmedMatterId || !riskCode.trim()}>
            <ShieldAlert className="h-4 w-4" />
            {copy.saveRisk}
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <Metrics trace={trace} copy={copy} />
          <RfiTable rfis={rfis} copy={copy} language={language} />
          <MappingTable mappings={mappings} copy={copy} language={language} />
          <IssueTable issues={issues} copy={copy} language={language} />
          <RiskTable risks={risks} copy={copy} language={language} />
          <TraceTable trace={trace} copy={copy} />
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-72 flex-1 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  values,
  language,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  language: Language;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {values.map((entry) => (
          <option key={entry} value={entry}>
            {formatDdValue(entry, language)}
          </option>
        ))}
      </select>
    </label>
  );
}

function PanelTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h1 className="text-lg font-semibold tracking-normal">{label}</h1>
    </div>
  );
}

function Metrics({
  trace,
  copy,
}: {
  trace: DdTraceabilityResponseDto | null;
  copy: (typeof ddCopy)[Language];
}) {
  if (!trace) return null;
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">{copy.traceability}</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-5">
        <Metric label={copy.rfis} value={trace.rfiCount} />
        <Metric label={copy.mappings} value={trace.mappingCount} />
        <Metric label={copy.issues} value={trace.issueCount} />
        <Metric label={copy.risks} value={trace.riskCount} />
        <Metric label={copy.traces} value={trace.traces.length} />
      </dl>
    </section>
  );
}

function RfiTable({
  rfis,
  copy,
  language,
}: {
  rfis: DdRfiListResponseDto | null;
  copy: (typeof ddCopy)[Language];
  language: Language;
}) {
  return (
    <Table title={copy.rfis} headers={[copy.code, copy.status, copy.priority, copy.due]}>
      {(rfis?.rfis ?? []).map((rfi) => (
        <tr key={rfi.rfiId} className="border-t">
          <Cell>{rfi.rfiCode}</Cell>
          <Cell>{formatDdValue(rfi.status, language)}</Cell>
          <Cell>{formatDdValue(rfi.priority, language)}</Cell>
          <Cell>{rfi.dueDate ?? '-'}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function MappingTable({
  mappings,
  copy,
  language,
}: {
  mappings: DdDataRoomMappingListResponseDto | null;
  copy: (typeof ddCopy)[Language];
  language: Language;
}) {
  return (
    <Table title={copy.mappings} headers={[copy.sectionHeader, copy.status, copy.rfi, copy.document]}>
      {(mappings?.mappings ?? []).map((mapping) => (
        <tr key={mapping.mappingId} className="border-t">
          <Cell>{mapping.sectionPath}</Cell>
          <Cell>{formatDdValue(mapping.mappingStatus, language)}</Cell>
          <Cell mono>{shortId(mapping.rfiId)}</Cell>
          <Cell mono>{shortId(mapping.documentId)}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function IssueTable({
  issues,
  copy,
  language,
}: {
  issues: DdIssueListResponseDto | null;
  copy: (typeof ddCopy)[Language];
  language: Language;
}) {
  return (
    <Table title={copy.issues} headers={[copy.code, copy.status, copy.severity, copy.document]}>
      {(issues?.issues ?? []).map((issue) => (
        <tr key={issue.issueId} className="border-t">
          <Cell>{issue.issueCode}</Cell>
          <Cell>{formatDdValue(issue.status, language)}</Cell>
          <Cell>{formatDdValue(issue.severity, language)}</Cell>
          <Cell mono>{shortId(issue.documentId)}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function RiskTable({
  risks,
  copy,
  language,
}: {
  risks: DdRiskListResponseDto | null;
  copy: (typeof ddCopy)[Language];
  language: Language;
}) {
  return (
    <Table title={copy.risks} headers={[copy.code, copy.status, copy.severity, copy.likelihood]}>
      {(risks?.risks ?? []).map((risk) => (
        <tr key={risk.riskId} className="border-t">
          <Cell>{risk.riskCode}</Cell>
          <Cell>{formatDdValue(risk.status, language)}</Cell>
          <Cell>{formatDdValue(risk.severity, language)}</Cell>
          <Cell>{formatDdValue(risk.likelihood, language)}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function TraceTable({
  trace,
  copy,
}: {
  trace: DdTraceabilityResponseDto | null;
  copy: (typeof ddCopy)[Language];
}) {
  return (
    <Table title={copy.traces} headers={[copy.rfi, copy.mappings, copy.issues, copy.risks, copy.refs]}>
      {(trace?.traces ?? []).map((item, index) => (
        <tr key={`${item.rfiId ?? 'rfi'}:${item.issueId ?? 'issue'}:${item.riskId ?? index}`} className="border-t">
          <Cell mono>{shortId(item.rfiId)}</Cell>
          <Cell mono>{shortId(item.mappingId)}</Cell>
          <Cell mono>{shortId(item.issueId)}</Cell>
          <Cell mono>{shortId(item.riskId)}</Cell>
          <Cell mono>{item.statusRefs.join(', ')}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function Table({
  title,
  headers,
  children,
}: {
  title: string;
  headers: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              {headers.map((header) => (
                <th key={header} className="py-2 pr-4">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={mono ? 'py-2 pr-4 font-mono text-xs' : 'py-2 pr-4'}>{children}</td>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function shortId(value: string | null | undefined): string {
  return value ? `${value.slice(0, 8)}...` : '-';
}

function formatDdValue(value: string, language: Language): string {
  if (language === 'en') {
    return value.replaceAll('_', ' ');
  }
  const labels: Record<string, string> = {
    low: '낮음',
    medium: '보통',
    high: '높음',
    critical: '매우 중요',
    info: '참고',
    mapped: '연결됨',
    missing: '누락',
    supplement_requested: '보완 요청',
    requested: '요청됨',
    open: '열림',
    closed: '종료',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}
