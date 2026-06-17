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
import { useI18n, type Language } from '@/lib/i18n';

const litigationCopy: Record<
  Language,
  {
    matterRef: string;
    refreshTitle: string;
    refresh: string;
    title: string;
    documentRef: string;
    evidenceCode: string;
    exhibitLabel: string;
    custody: string;
    admitted: string;
    saveEvidence: string;
    factCode: string;
    factSummary: string;
    materiality: string;
    saveFact: string;
    issueCode: string;
    issueLabel: string;
    saveIssue: string;
    pleadingCode: string;
    pleadingStatus: string;
    savePleading: string;
    evidence: string;
    facts: string;
    issues: string;
    pleadings: string;
    caseMap: string;
    empty: string;
    evidencePending: string;
    factPending: string;
    issuePending: string;
    pleadingPending: string;
    noDocument: string;
  }
> = {
  ko: {
    matterRef: 'Matter ID',
    refreshTitle: '소송 자료 새로고침',
    refresh: '새로고침',
    title: '소송 자료',
    documentRef: '파일 ID',
    evidenceCode: '증거 ID',
    exhibitLabel: '증거 표시',
    custody: '보관 상태',
    admitted: '제출 상태',
    saveEvidence: '증거 저장',
    factCode: '사실 ID',
    factSummary: '사실 요약',
    materiality: '중요도',
    saveFact: '사실 저장',
    issueCode: '쟁점 ID',
    issueLabel: '쟁점 이름',
    saveIssue: '쟁점 저장',
    pleadingCode: '서면 ID',
    pleadingStatus: '서면 상태',
    savePleading: '서면 저장',
    evidence: '증거',
    facts: '사실',
    issues: '쟁점',
    pleadings: '서면',
    caseMap: 'Matter Map',
    empty: '표시할 항목이 없습니다.',
    evidencePending: '증거 연결 대기',
    factPending: '사실 연결 대기',
    issuePending: '쟁점 연결 대기',
    pleadingPending: '서면 연결 대기',
    noDocument: '파일 없음',
  },
  en: {
    matterRef: 'Matter ref',
    refreshTitle: 'Refresh litigation data',
    refresh: 'Refresh',
    title: 'Litigation materials',
    documentRef: 'File ref',
    evidenceCode: 'Evidence ref',
    exhibitLabel: 'Exhibit label',
    custody: 'Custody',
    admitted: 'Admission status',
    saveEvidence: 'Save evidence',
    factCode: 'Fact ref',
    factSummary: 'Fact summary',
    materiality: 'Materiality',
    saveFact: 'Save fact',
    issueCode: 'Issue ref',
    issueLabel: 'Issue name',
    saveIssue: 'Save issue',
    pleadingCode: 'Pleading ref',
    pleadingStatus: 'Pleading status',
    savePleading: 'Save pleading',
    evidence: 'Evidence',
    facts: 'Facts',
    issues: 'Issues',
    pleadings: 'Pleadings',
    caseMap: 'Case map',
    empty: 'No items to show.',
    evidencePending: 'Evidence pending',
    factPending: 'Fact pending',
    issuePending: 'Issue pending',
    pleadingPending: 'Pleading pending',
    noDocument: 'No file',
  },
};

export function LitigationVaultClient() {
  const { language } = useI18n();
  const copy = litigationCopy[language];
  const [matterId, setMatterId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [evidenceCode, setEvidenceCode] = useState('');
  const [exhibitLabel, setExhibitLabel] = useState('');
  const [custodyStatus, setCustodyStatus] =
    useState<LitigationCustodyStatus>('collected');
  const [admittedStatus, setAdmittedStatus] =
    useState<LitigationAdmittedStatus>('unknown');
  const [factCode, setFactCode] = useState('');
  const [factSummary, setFactSummary] = useState('');
  const [materiality, setMateriality] = useState<LitigationMateriality>('high');
  const [issueCode, setIssueCode] = useState('');
  const [issueLabel, setIssueLabel] = useState('');
  const [pleadingCode, setPleadingCode] = useState('');
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
          <Field label={copy.matterRef} value={matterId} onChange={setMatterId} />
          <Button
            onClick={refreshAll}
            disabled={busy || !trimmedMatterId}
            title={copy.refreshTitle}
          >
            <ListTree className="h-4 w-4" />
            {copy.refresh}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<Gavel className="h-4 w-4" />} label={copy.title} />
          <Field label={copy.documentRef} value={documentId} onChange={setDocumentId} />
          <Field label={copy.evidenceCode} value={evidenceCode} onChange={setEvidenceCode} />
          <Field label={copy.exhibitLabel} value={exhibitLabel} onChange={setExhibitLabel} />
          <SelectField
            label={copy.custody}
            value={custodyStatus}
            values={litigationCustodyStatuses}
            language={language}
            onChange={(value) => setCustodyStatus(value as LitigationCustodyStatus)}
          />
          <SelectField
            label={copy.admitted}
            value={admittedStatus}
            values={litigationAdmittedStatuses}
            language={language}
            onChange={(value) => setAdmittedStatus(value as LitigationAdmittedStatus)}
          />
          <Button onClick={saveEvidence} disabled={busy || !trimmedMatterId}>
            <FileStack className="h-4 w-4" />
            {copy.saveEvidence}
          </Button>

          <div className="border-t pt-3" />
          <Field label={copy.factCode} value={factCode} onChange={setFactCode} />
          <Field label={copy.factSummary} value={factSummary} onChange={setFactSummary} />
          <SelectField
            label={copy.materiality}
            value={materiality}
            values={litigationMaterialities}
            language={language}
            onChange={(value) => setMateriality(value as LitigationMateriality)}
          />
          <Button onClick={saveFact} disabled={busy || !trimmedMatterId || !factSummary.trim()}>
            <BookOpenCheck className="h-4 w-4" />
            {copy.saveFact}
          </Button>

          <div className="border-t pt-3" />
          <Field label={copy.issueCode} value={issueCode} onChange={setIssueCode} />
          <Field label={copy.issueLabel} value={issueLabel} onChange={setIssueLabel} />
          <Button onClick={saveIssue} disabled={busy || !trimmedMatterId || !issueLabel.trim()}>
            <Network className="h-4 w-4" />
            {copy.saveIssue}
          </Button>

          <div className="border-t pt-3" />
          <Field label={copy.pleadingCode} value={pleadingCode} onChange={setPleadingCode} />
          <SelectField
            label={copy.pleadingStatus}
            value={pleadingStatus}
            values={litigationPleadingStatuses}
            language={language}
            onChange={(value) => setPleadingStatus(value as LitigationPleadingStatus)}
          />
          <Button onClick={savePleading} disabled={busy || !trimmedMatterId}>
            <Gavel className="h-4 w-4" />
            {copy.savePleading}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryPanel
            title={copy.evidence}
            empty={copy.empty}
            language={language}
            rows={evidence?.evidence.map((item) => [
              item.evidenceCode,
              item.custodyStatus,
              item.documentId ? shortRef(item.documentId) : copy.noDocument,
            ])}
          />
          <SummaryPanel
            title={copy.facts}
            empty={copy.empty}
            language={language}
            rows={facts?.facts.map((item) => [item.factCode, item.materiality, item.status])}
          />
          <SummaryPanel
            title={copy.issues}
            empty={copy.empty}
            language={language}
            rows={issues?.issues.map((item) => [item.issueCode, item.issueType, item.status])}
          />
          <SummaryPanel
            title={copy.pleadings}
            empty={copy.empty}
            language={language}
            rows={pleadings?.pleadings.map((item) => [
              item.pleadingCode,
              item.pleadingType,
              item.filingStatus,
            ])}
          />
          <div className="rounded-md border p-4 lg:col-span-2">
            <PanelTitle icon={<ListTree className="h-4 w-4" />} label={copy.caseMap} />
            <div className="mt-3 overflow-hidden rounded-md border">
              {(caseMap?.caseMap ?? []).slice(0, 8).map((item, index) => (
                <div
                  key={`${item.evidenceId ?? 'none'}-${item.factId ?? index}`}
                  className="grid gap-2 border-b px-3 py-2 text-sm last:border-b-0 md:grid-cols-4"
                >
                  <span>{item.evidenceId ? shortRef(item.evidenceId) : copy.evidencePending}</span>
                  <span>{item.factId ? shortRef(item.factId) : copy.factPending}</span>
                  <span>{item.issueId ? shortRef(item.issueId) : copy.issuePending}</span>
                  <span>{item.pleadingId ? shortRef(item.pleadingId) : copy.pleadingPending}</span>
                </div>
              ))}
              {caseMap && caseMap.caseMap.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{copy.empty}</p>
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
        {values.map((item) => (
          <option key={item} value={item}>
            {formatLitigationValue(item, language)}
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

function SummaryPanel({
  title,
  rows,
  empty,
  language,
}: {
  title: string;
  rows: string[][] | undefined;
  empty: string;
  language: Language;
}) {
  return (
    <div className="rounded-md border p-4">
      <PanelTitle icon={<FileStack className="h-4 w-4" />} label={title} />
      <div className="mt-3 flex flex-col overflow-hidden rounded-md border">
        {(rows ?? []).slice(0, 6).map((row) => (
          <div key={row.join(':')} className="grid gap-2 border-b px-3 py-2 text-sm last:border-b-0">
            {row.map((cell) => (
              <span key={cell} className="truncate">
                {formatLitigationValue(cell, language)}
              </span>
            ))}
          </div>
        ))}
        {rows && rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">{empty}</p>
        ) : null}
      </div>
    </div>
  );
}

function shortRef(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}

function formatLitigationValue(value: string, language: Language): string {
  if (language === 'en') {
    return value.replaceAll('_', ' ');
  }
  const labels: Record<string, string> = {
    collected: '수집됨',
    produced: '제출됨',
    challenged: '이의 제기',
    excluded: '제외됨',
    unknown: '확인 필요',
    draft: '초안',
    verified: '확인됨',
    disputed: '다툼 있음',
    withdrawn: '철회됨',
    low: '낮음',
    medium: '보통',
    high: '높음',
    critical: '매우 중요',
    argument: '주장',
    open: '열림',
    brief: '준비서면',
    internal_draft: '내부 초안',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}
