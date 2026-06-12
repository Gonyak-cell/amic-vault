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

export function DdVaultClient() {
  const [matterId, setMatterId] = useState('');
  const [rfiCode, setRfiCode] = useState('RFI-001');
  const [rfiTitle, setRfiTitle] = useState('Corporate charter documents');
  const [priority, setPriority] = useState<DdPriority>('medium');
  const [documentId, setDocumentId] = useState('');
  const [sectionPath, setSectionPath] = useState('01.Corporate');
  const [mappingStatus, setMappingStatus] = useState<DdMappingStatus>('mapped');
  const [issueCode, setIssueCode] = useState('DD-ISS-001');
  const [issueTitle, setIssueTitle] = useState('Missing board approval');
  const [severity, setSeverity] = useState<DdIssueSeverity>('high');
  const [riskCode, setRiskCode] = useState('DD-RISK-001');
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
          <Field label="Matter ID" value={matterId} onChange={setMatterId} />
          <Button onClick={refreshAll} disabled={busy || !trimmedMatterId} title="Refresh DD data">
            <ListTree className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<ClipboardList className="h-4 w-4" />} label="DD Vault" />
          <Field label="RFI code" value={rfiCode} onChange={setRfiCode} />
          <Field label="RFI title" value={rfiTitle} onChange={setRfiTitle} />
          <SelectField
            label="Priority"
            value={priority}
            values={ddPriorities}
            onChange={(value) => setPriority(value as DdPriority)}
          />
          <Button onClick={saveRfi} disabled={busy || !trimmedMatterId || !rfiTitle.trim()}>
            <ClipboardCheck className="h-4 w-4" />
            Save RFI
          </Button>

          <div className="border-t pt-3" />
          <Field label="Document ID" value={documentId} onChange={setDocumentId} />
          <Field label="Section path" value={sectionPath} onChange={setSectionPath} />
          <SelectField
            label="Mapping status"
            value={mappingStatus}
            values={ddMappingStatuses}
            onChange={(value) => setMappingStatus(value as DdMappingStatus)}
          />
          <Button onClick={saveMapping} disabled={busy || !trimmedMatterId || !sectionPath.trim()}>
            <FileSymlink className="h-4 w-4" />
            Save Mapping
          </Button>

          <div className="border-t pt-3" />
          <Field label="Issue code" value={issueCode} onChange={setIssueCode} />
          <Field label="Issue title" value={issueTitle} onChange={setIssueTitle} />
          <SelectField
            label="Severity"
            value={severity}
            values={ddIssueSeverities}
            onChange={(value) => setSeverity(value as DdIssueSeverity)}
          />
          <Button onClick={saveIssue} disabled={busy || !trimmedMatterId || !issueTitle.trim()}>
            <ShieldAlert className="h-4 w-4" />
            Save Issue
          </Button>

          <div className="border-t pt-3" />
          <Field label="Risk code" value={riskCode} onChange={setRiskCode} />
          <SelectField
            label="Likelihood"
            value={likelihood}
            values={ddRiskLikelihoods}
            onChange={(value) => setLikelihood(value as DdRiskLikelihood)}
          />
          <Button onClick={saveRisk} disabled={busy || !trimmedMatterId || !riskCode.trim()}>
            <ShieldAlert className="h-4 w-4" />
            Save Risk
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <Metrics trace={trace} />
          <RfiTable rfis={rfis} />
          <MappingTable mappings={mappings} />
          <IssueTable issues={issues} />
          <RiskTable risks={risks} />
          <TraceTable trace={trace} />
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
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
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
            {entry}
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

function Metrics({ trace }: { trace: DdTraceabilityResponseDto | null }) {
  if (!trace) return null;
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">Traceability</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-5">
        <Metric label="RFIs" value={trace.rfiCount} />
        <Metric label="Mappings" value={trace.mappingCount} />
        <Metric label="Issues" value={trace.issueCount} />
        <Metric label="Risks" value={trace.riskCount} />
        <Metric label="Traces" value={trace.traces.length} />
      </dl>
    </section>
  );
}

function RfiTable({ rfis }: { rfis: DdRfiListResponseDto | null }) {
  return (
    <Table title="RFIs" headers={['Code', 'Status', 'Priority', 'Due']}>
      {(rfis?.rfis ?? []).map((rfi) => (
        <tr key={rfi.rfiId} className="border-t">
          <Cell>{rfi.rfiCode}</Cell>
          <Cell>{rfi.status}</Cell>
          <Cell>{rfi.priority}</Cell>
          <Cell>{rfi.dueDate ?? '-'}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function MappingTable({ mappings }: { mappings: DdDataRoomMappingListResponseDto | null }) {
  return (
    <Table title="Data Room Mapping" headers={['Section', 'Status', 'RFI', 'Document']}>
      {(mappings?.mappings ?? []).map((mapping) => (
        <tr key={mapping.mappingId} className="border-t">
          <Cell>{mapping.sectionPath}</Cell>
          <Cell>{mapping.mappingStatus}</Cell>
          <Cell mono>{shortId(mapping.rfiId)}</Cell>
          <Cell mono>{shortId(mapping.documentId)}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function IssueTable({ issues }: { issues: DdIssueListResponseDto | null }) {
  return (
    <Table title="Issues" headers={['Code', 'Status', 'Severity', 'Document']}>
      {(issues?.issues ?? []).map((issue) => (
        <tr key={issue.issueId} className="border-t">
          <Cell>{issue.issueCode}</Cell>
          <Cell>{issue.status}</Cell>
          <Cell>{issue.severity}</Cell>
          <Cell mono>{shortId(issue.documentId)}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function RiskTable({ risks }: { risks: DdRiskListResponseDto | null }) {
  return (
    <Table title="Risks" headers={['Code', 'Status', 'Severity', 'Likelihood']}>
      {(risks?.risks ?? []).map((risk) => (
        <tr key={risk.riskId} className="border-t">
          <Cell>{risk.riskCode}</Cell>
          <Cell>{risk.status}</Cell>
          <Cell>{risk.severity}</Cell>
          <Cell>{risk.likelihood}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function TraceTable({ trace }: { trace: DdTraceabilityResponseDto | null }) {
  return (
    <Table title="Trace Links" headers={['RFI', 'Mapping', 'Issue', 'Risk', 'Refs']}>
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
