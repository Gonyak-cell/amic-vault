'use client';

import React, { useState } from 'react';
import { BookOpenCheck, FileStack, Gavel, ListTree, Network } from 'lucide-react';
import type {
  LitigationAdmittedStatus,
  LitigationCaseMapResponseDto,
  LitigationCustodyStatus,
  LitigationEvidenceListResponseDto,
  LitigationFactListResponseDto,
  LitigationIssueListResponseDto,
  LitigationMateriality,
  LitigationPleadingListResponseDto,
  LitigationPleadingStatus,
} from '@amic-vault/shared';
import {
  litigationAdmittedStatuses,
  litigationCustodyStatuses,
  litigationMaterialities,
  litigationPleadingStatuses,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createLitigationEvidence,
  createLitigationFact,
  createLitigationIssue,
  createLitigationPleading,
  listLitigationEvidence,
  listLitigationFacts,
  listLitigationIssues,
  listLitigationPleadings,
  loadLitigationCaseMap,
} from '@/lib/api/litigation';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

export function LitigationVaultClient() {
  const [matterId, setMatterId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [evidenceCode, setEvidenceCode] = useState('EV-001');
  const [exhibitLabel, setExhibitLabel] = useState('Exhibit A');
  const [custodyStatus, setCustodyStatus] =
    useState<LitigationCustodyStatus>('collected');
  const [admittedStatus, setAdmittedStatus] =
    useState<LitigationAdmittedStatus>('unknown');
  const [factCode, setFactCode] = useState('FACT-001');
  const [factSummary, setFactSummary] = useState('Witness timeline aligns with exhibit date.');
  const [materiality, setMateriality] = useState<LitigationMateriality>('high');
  const [issueCode, setIssueCode] = useState('ISSUE-001');
  const [issueLabel, setIssueLabel] = useState('Breach element');
  const [pleadingCode, setPleadingCode] = useState('PLD-001');
  const [pleadingStatus, setPleadingStatus] =
    useState<LitigationPleadingStatus>('internal_draft');
  const [evidence, setEvidence] = useState<LitigationEvidenceListResponseDto | null>(null);
  const [facts, setFacts] = useState<LitigationFactListResponseDto | null>(null);
  const [issues, setIssues] = useState<LitigationIssueListResponseDto | null>(null);
  const [pleadings, setPleadings] =
    useState<LitigationPleadingListResponseDto | null>(null);
  const [caseMap, setCaseMap] = useState<LitigationCaseMapResponseDto | null>(null);
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
  const trimmedDocumentId = documentId.trim();
  const activeEvidenceId = evidence?.evidence[0]?.evidenceId;
  const activeIssueId = issues?.issues[0]?.issueId;

  async function refreshAll() {
    if (!trimmedMatterId) return;
    const [nextEvidence, nextFacts, nextIssues, nextPleadings, nextCaseMap] =
      await Promise.all([
        run(() => listLitigationEvidence({ matterId: trimmedMatterId, limit: 50 })),
        run(() => listLitigationFacts({ matterId: trimmedMatterId, limit: 50 })),
        run(() => listLitigationIssues({ matterId: trimmedMatterId, limit: 50 })),
        run(() => listLitigationPleadings({ matterId: trimmedMatterId, limit: 50 })),
        run(() => loadLitigationCaseMap({ matterId: trimmedMatterId, limit: 100 })),
      ]);
    if (nextEvidence) setEvidence(nextEvidence);
    if (nextFacts) setFacts(nextFacts);
    if (nextIssues) setIssues(nextIssues);
    if (nextPleadings) setPleadings(nextPleadings);
    if (nextCaseMap) setCaseMap(nextCaseMap);
  }

  async function saveEvidence() {
    const result = await run(() =>
      createLitigationEvidence({
        matterId: trimmedMatterId,
        documentId: trimmedDocumentId || undefined,
        evidenceCode: evidenceCode.trim(),
        evidenceType: 'document',
        exhibitLabel: exhibitLabel.trim() || undefined,
        custodyStatus,
        admittedStatus,
      }),
    );
    if (result) await refreshAll();
  }

  async function saveFact() {
    const result = await run(() =>
      createLitigationFact({
        matterId: trimmedMatterId,
        evidenceId: activeEvidenceId,
        factCode: factCode.trim(),
        factSummary: factSummary.trim(),
        status: 'draft',
        materiality,
        citationRefs: activeEvidenceId ? [`evidence:${activeEvidenceId}`] : [],
      }),
    );
    if (result) await refreshAll();
  }

  async function saveIssue() {
    const result = await run(() =>
      createLitigationIssue({
        matterId: trimmedMatterId,
        parentIssueId: activeIssueId,
        issueCode: issueCode.trim(),
        label: issueLabel.trim(),
        issueType: 'argument',
        status: 'open',
        position: 0,
      }),
    );
    if (result) await refreshAll();
  }

  async function savePleading() {
    const result = await run(() =>
      createLitigationPleading({
        matterId: trimmedMatterId,
        documentId: trimmedDocumentId || undefined,
        pleadingCode: pleadingCode.trim(),
        pleadingType: 'brief',
        filingStatus: pleadingStatus,
        citationRefs: trimmedDocumentId ? [`document:${trimmedDocumentId}`] : [],
      }),
    );
    if (result) await refreshAll();
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Matter ID" value={matterId} onChange={setMatterId} />
          <Button
            onClick={refreshAll}
            disabled={busy || !trimmedMatterId}
            title="Refresh litigation data"
          >
            <ListTree className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<Gavel className="h-4 w-4" />} label="Litigation Vault" />
          <Field label="Document ID" value={documentId} onChange={setDocumentId} />
          <Field label="Evidence code" value={evidenceCode} onChange={setEvidenceCode} />
          <Field label="Exhibit label" value={exhibitLabel} onChange={setExhibitLabel} />
          <SelectField
            label="Custody"
            value={custodyStatus}
            values={litigationCustodyStatuses}
            onChange={(value) => setCustodyStatus(value as LitigationCustodyStatus)}
          />
          <SelectField
            label="Admitted"
            value={admittedStatus}
            values={litigationAdmittedStatuses}
            onChange={(value) => setAdmittedStatus(value as LitigationAdmittedStatus)}
          />
          <Button onClick={saveEvidence} disabled={busy || !trimmedMatterId}>
            <FileStack className="h-4 w-4" />
            Save Evidence
          </Button>

          <div className="border-t pt-3" />
          <Field label="Fact code" value={factCode} onChange={setFactCode} />
          <Field label="Fact summary" value={factSummary} onChange={setFactSummary} />
          <SelectField
            label="Materiality"
            value={materiality}
            values={litigationMaterialities}
            onChange={(value) => setMateriality(value as LitigationMateriality)}
          />
          <Button onClick={saveFact} disabled={busy || !trimmedMatterId || !factSummary.trim()}>
            <BookOpenCheck className="h-4 w-4" />
            Save Fact
          </Button>

          <div className="border-t pt-3" />
          <Field label="Issue code" value={issueCode} onChange={setIssueCode} />
          <Field label="Issue label" value={issueLabel} onChange={setIssueLabel} />
          <Button onClick={saveIssue} disabled={busy || !trimmedMatterId || !issueLabel.trim()}>
            <Network className="h-4 w-4" />
            Save Issue
          </Button>

          <div className="border-t pt-3" />
          <Field label="Pleading code" value={pleadingCode} onChange={setPleadingCode} />
          <SelectField
            label="Pleading status"
            value={pleadingStatus}
            values={litigationPleadingStatuses}
            onChange={(value) => setPleadingStatus(value as LitigationPleadingStatus)}
          />
          <Button onClick={savePleading} disabled={busy || !trimmedMatterId}>
            <Gavel className="h-4 w-4" />
            Save Pleading
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryPanel
            title="Evidence"
            rows={evidence?.evidence.map((item) => [
              item.evidenceCode,
              item.custodyStatus,
              item.documentId ?? 'no document',
            ])}
          />
          <SummaryPanel
            title="Facts"
            rows={facts?.facts.map((item) => [item.factCode, item.materiality, item.status])}
          />
          <SummaryPanel
            title="Issues"
            rows={issues?.issues.map((item) => [item.issueCode, item.issueType, item.status])}
          />
          <SummaryPanel
            title="Pleadings"
            rows={pleadings?.pleadings.map((item) => [
              item.pleadingCode,
              item.pleadingType,
              item.filingStatus,
            ])}
          />
          <div className="rounded-md border p-4 lg:col-span-2">
            <PanelTitle icon={<ListTree className="h-4 w-4" />} label="Case Map" />
            <div className="mt-3 overflow-hidden rounded-md border">
              {(caseMap?.caseMap ?? []).slice(0, 8).map((item, index) => (
                <div
                  key={`${item.evidenceId ?? 'none'}-${item.factId ?? index}`}
                  className="grid gap-2 border-b px-3 py-2 text-sm last:border-b-0 md:grid-cols-4"
                >
                  <span>{item.evidenceId ?? 'evidence pending'}</span>
                  <span>{item.factId ?? 'fact pending'}</span>
                  <span>{item.issueId ?? 'issue pending'}</span>
                  <span>{item.pleadingId ?? 'pleading pending'}</span>
                </div>
              ))}
              {caseMap && caseMap.caseMap.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No rows</p>
              ) : null}
            </div>
          </div>
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
    <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
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
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function PanelTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function SummaryPanel({ title, rows }: { title: string; rows: string[][] | undefined }) {
  return (
    <div className="rounded-md border p-4">
      <PanelTitle icon={<FileStack className="h-4 w-4" />} label={title} />
      <div className="mt-3 flex flex-col overflow-hidden rounded-md border">
        {(rows ?? []).slice(0, 6).map((row) => (
          <div key={row.join(':')} className="grid gap-2 border-b px-3 py-2 text-sm last:border-b-0">
            {row.map((cell) => (
              <span key={cell} className="truncate">
                {cell}
              </span>
            ))}
          </div>
        ))}
        {rows && rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No rows</p>
        ) : null}
      </div>
    </div>
  );
}
