'use client';

import React, { useState } from 'react';
import { FileCog, ListFilter, Play, ShieldCheck } from 'lucide-react';
import type {
  ContractClauseBankResponseDto,
  ContractRuleFindingsResponseDto,
  ContractProcessResponseDto,
  PlaybookRuleType,
  PlaybookRuleSeverity,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createContractPlaybookRule,
  listContractClauseBank,
  listContractRuleFindings,
  processContractDocument,
} from '@/lib/api/contract-intel';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { useI18n, type Language } from '@/lib/i18n';

const ruleTypes: PlaybookRuleType[] = ['required_clause', 'prohibited_term', 'threshold'];
const severities: PlaybookRuleSeverity[] = ['info', 'warning', 'critical'];

const contractCopy: Record<
  Language,
  {
    matterRef: string;
    documentRef: string;
    processTitle: string;
    process: string;
    clauses: string;
    findings: string;
    title: string;
    ruleKey: string;
    ruleType: string;
    severity: string;
    expression: string;
    saveRule: string;
    result: string;
    type: string;
    clauseCount: string;
    terms: string;
    redlines: string;
    clauseBank: string;
    clause: string;
    kind: string;
    citation: string;
    hash: string;
    ruleFindings: string;
    rule: string;
    status: string;
    finding: string;
    evidence: string;
    ruleTypes: Record<PlaybookRuleType, string>;
    severities: Record<PlaybookRuleSeverity, string>;
  }
> = {
  ko: {
    matterRef: 'Matter ID',
    documentRef: '파일 ID',
    processTitle: '파일 검토 실행',
    process: '검토 실행',
    clauses: '조항 보기',
    findings: '결과 보기',
    title: '계약 검토',
    ruleKey: '규칙 ID',
    ruleType: '규칙 유형',
    severity: '중요도',
    expression: '규칙 조건',
    saveRule: '규칙 저장',
    result: '검토 결과',
    type: '유형',
    clauseCount: '조항',
    terms: '정의어',
    redlines: '변경점',
    clauseBank: '조항 목록',
    clause: '조항',
    kind: '분류',
    citation: '근거 자료',
    hash: '해시',
    ruleFindings: '규칙 검토 결과',
    rule: '규칙',
    status: '상태',
    finding: '결과',
    evidence: '근거 자료',
    ruleTypes: {
      required_clause: '필수 조항',
      prohibited_term: '금지 표현',
      threshold: '기준값',
    },
    severities: {
      info: '참고',
      warning: '주의',
      critical: '중요',
    },
  },
  en: {
    matterRef: 'Matter ref',
    documentRef: 'File ref',
    processTitle: 'Run file review',
    process: 'Run review',
    clauses: 'View clauses',
    findings: 'View findings',
    title: 'Contract review',
    ruleKey: 'Rule ref',
    ruleType: 'Rule type',
    severity: 'Severity',
    expression: 'Rule condition',
    saveRule: 'Save rule',
    result: 'Review result',
    type: 'Type',
    clauseCount: 'Clauses',
    terms: 'Terms',
    redlines: 'Redlines',
    clauseBank: 'Clause list',
    clause: 'Clause',
    kind: 'Kind',
    citation: 'Evidence',
    hash: 'Hash',
    ruleFindings: 'Rule findings',
    rule: 'Rule',
    status: 'Status',
    finding: 'Finding',
    evidence: 'Evidence',
    ruleTypes: {
      required_clause: 'Required clause',
      prohibited_term: 'Prohibited term',
      threshold: 'Threshold',
    },
    severities: {
      info: 'Info',
      warning: 'Warning',
      critical: 'Critical',
    },
  },
};

export function ContractIntelClient() {
  const { language } = useI18n();
  const copy = contractCopy[language];
  const [matterId, setMatterId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [ruleKey, setRuleKey] = useState('nda.section.required');
  const [ruleType, setRuleType] = useState<PlaybookRuleType>('required_clause');
  const [severity, setSeverity] = useState<PlaybookRuleSeverity>('critical');
  const [expression, setExpression] = useState('{"requiredClauseKind":"section","minCount":1}');
  const [processing, setProcessing] = useState<ContractProcessResponseDto | null>(null);
  const [clauseBank, setClauseBank] = useState<ContractClauseBankResponseDto | null>(null);
  const [findings, setFindings] = useState<ContractRuleFindingsResponseDto | null>(null);
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

  async function processDocument() {
    const result = await run(() => processContractDocument({ documentId: documentId.trim() }));
    if (result) setProcessing(result);
  }

  async function loadClauses() {
    const result = await run(() =>
      listContractClauseBank({
        matterId: matterId.trim(),
        documentId: documentId.trim() || undefined,
        limit: 50,
      }),
    );
    if (result) setClauseBank(result);
  }

  async function loadFindings() {
    const result = await run(() =>
      listContractRuleFindings({
        matterId: matterId.trim(),
        documentId: documentId.trim() || undefined,
        limit: 20,
      }),
    );
    if (result) setFindings(result);
  }

  async function saveRule() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(expression) as Record<string, unknown>;
    } catch {
      setError('VALIDATION_FAILED');
      return;
    }
    const result = await run(() =>
      createContractPlaybookRule({
        ruleKey: ruleKey.trim(),
        ruleType,
        severity,
        expression: parsed,
        matterId: matterId.trim() || null,
      }),
    );
    if (result) await loadFindings();
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={copy.matterRef} value={matterId} onChange={setMatterId} />
          <Field label={copy.documentRef} value={documentId} onChange={setDocumentId} />
          <Button onClick={processDocument} disabled={busy || !documentId.trim()} title={copy.processTitle}>
            <Play className="h-4 w-4" />
            {copy.process}
          </Button>
          <Button onClick={loadClauses} disabled={busy || !matterId.trim()} variant="outline" title={copy.clauses}>
            <ListFilter className="h-4 w-4" />
            {copy.clauses}
          </Button>
          <Button onClick={loadFindings} disabled={busy || !matterId.trim()} variant="outline" title={copy.findings}>
            <ShieldCheck className="h-4 w-4" />
            {copy.findings}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex items-center gap-2">
            <FileCog className="h-4 w-4" />
            <h1 className="text-lg font-semibold tracking-normal">{copy.title}</h1>
          </div>
          <Field label={copy.ruleKey} value={ruleKey} onChange={setRuleKey} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{copy.ruleType}</span>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={ruleType}
              onChange={(event) => setRuleType(event.target.value as PlaybookRuleType)}
            >
              {ruleTypes.map((value) => (
                <option key={value} value={value}>
                  {copy.ruleTypes[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{copy.severity}</span>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as PlaybookRuleSeverity)}
            >
              {severities.map((value) => (
                <option key={value} value={value}>
                  {copy.severities[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{copy.expression}</span>
            <textarea
              className="min-h-28 rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
            />
          </label>
          <Button onClick={saveRule} disabled={busy || !ruleKey.trim()} title={copy.saveRule}>
            <ShieldCheck className="h-4 w-4" />
            {copy.saveRule}
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <StatusPanel processing={processing} copy={copy} />
          <ClauseBankTable clauseBank={clauseBank} copy={copy} />
          <RuleFindingTable findings={findings} copy={copy} />
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

function StatusPanel({
  processing,
  copy,
}: {
  processing: ContractProcessResponseDto | null;
  copy: (typeof contractCopy)[Language];
}) {
  if (!processing) return null;
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">{copy.result}</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <Metric label={copy.type} value={processing.classification.contractType} />
        <Metric label={copy.clauseCount} value={processing.clauseCount} />
        <Metric label={copy.terms} value={processing.definedTermCount} />
        <Metric label={copy.redlines} value={processing.redlineChangeCount} />
      </dl>
    </section>
  );
}

function ClauseBankTable({
  clauseBank,
  copy,
}: {
  clauseBank: ContractClauseBankResponseDto | null;
  copy: (typeof contractCopy)[Language];
}) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">{copy.clauseBank}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">{copy.clause}</th>
              <th className="py-2 pr-4">{copy.kind}</th>
              <th className="py-2 pr-4">{copy.terms}</th>
              <th className="py-2 pr-4">{copy.redlines}</th>
              <th className="py-2 pr-4">{copy.citation}</th>
              <th className="py-2 pr-4">{copy.hash}</th>
            </tr>
          </thead>
          <tbody>
            {(clauseBank?.clauses ?? []).map((clause) => (
              <tr key={clause.clauseId} className="border-t">
                <td className="py-2 pr-4">{clause.clauseNumber}</td>
                <td className="py-2 pr-4">{clause.clauseKind}</td>
                <td className="py-2 pr-4">{clause.definedTermCount}</td>
                <td className="py-2 pr-4">{clause.redlineChangeCount}</td>
                <td className="py-2 pr-4 font-mono text-xs">{clause.citationRef}</td>
                <td className="py-2 pr-4 font-mono text-xs">{shortHash(clause.textHash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RuleFindingTable({
  findings,
  copy,
}: {
  findings: ContractRuleFindingsResponseDto | null;
  copy: (typeof contractCopy)[Language];
}) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">{copy.ruleFindings}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">{copy.rule}</th>
              <th className="py-2 pr-4">{copy.status}</th>
              <th className="py-2 pr-4">{copy.severity}</th>
              <th className="py-2 pr-4">{copy.finding}</th>
              <th className="py-2 pr-4">{copy.evidence}</th>
              <th className="py-2 pr-4">{copy.hash}</th>
            </tr>
          </thead>
          <tbody>
            {(findings?.findings ?? []).map((finding) => (
              <tr key={finding.findingId} className="border-t">
                <td className="py-2 pr-4">{finding.ruleKey}</td>
                <td className="py-2 pr-4">{finding.status}</td>
                <td className="py-2 pr-4">{finding.severity}</td>
                <td className="py-2 pr-4">{finding.findingCode}</td>
                <td className="py-2 pr-4 font-mono text-xs">{finding.evidenceRefs.join(', ')}</td>
                <td className="py-2 pr-4 font-mono text-xs">{shortHash(finding.findingHash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...`;
}
