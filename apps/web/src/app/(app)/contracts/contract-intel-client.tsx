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

const ruleTypes: PlaybookRuleType[] = ['required_clause', 'prohibited_term', 'threshold'];
const severities: PlaybookRuleSeverity[] = ['info', 'warning', 'critical'];

export function ContractIntelClient() {
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
          <Field label="Matter ID" value={matterId} onChange={setMatterId} />
          <Field label="Document ID" value={documentId} onChange={setDocumentId} />
          <Button onClick={processDocument} disabled={busy || !documentId.trim()} title="Process document">
            <Play className="h-4 w-4" />
            Process
          </Button>
          <Button onClick={loadClauses} disabled={busy || !matterId.trim()} variant="outline" title="Load clauses">
            <ListFilter className="h-4 w-4" />
            Clauses
          </Button>
          <Button onClick={loadFindings} disabled={busy || !matterId.trim()} variant="outline" title="Load findings">
            <ShieldCheck className="h-4 w-4" />
            Findings
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex items-center gap-2">
            <FileCog className="h-4 w-4" />
            <h1 className="text-lg font-semibold tracking-normal">Contracts</h1>
          </div>
          <Field label="Rule key" value={ruleKey} onChange={setRuleKey} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Rule type</span>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={ruleType}
              onChange={(event) => setRuleType(event.target.value as PlaybookRuleType)}
            >
              {ruleTypes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Severity</span>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as PlaybookRuleSeverity)}
            >
              {severities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Expression JSON</span>
            <textarea
              className="min-h-28 rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
            />
          </label>
          <Button onClick={saveRule} disabled={busy || !ruleKey.trim()} title="Save playbook rule">
            <ShieldCheck className="h-4 w-4" />
            Save Rule
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <StatusPanel processing={processing} />
          <ClauseBankTable clauseBank={clauseBank} />
          <RuleFindingTable findings={findings} />
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

function StatusPanel({ processing }: { processing: ContractProcessResponseDto | null }) {
  if (!processing) return null;
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">Process Result</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <Metric label="Type" value={processing.classification.contractType} />
        <Metric label="Clauses" value={processing.clauseCount} />
        <Metric label="Terms" value={processing.definedTermCount} />
        <Metric label="Redlines" value={processing.redlineChangeCount} />
      </dl>
    </section>
  );
}

function ClauseBankTable({ clauseBank }: { clauseBank: ContractClauseBankResponseDto | null }) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">Clause Bank</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Clause</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Terms</th>
              <th className="py-2 pr-4">Redlines</th>
              <th className="py-2 pr-4">Citation</th>
              <th className="py-2 pr-4">Hash</th>
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

function RuleFindingTable({ findings }: { findings: ContractRuleFindingsResponseDto | null }) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="mb-3 text-base font-semibold tracking-normal">Rule Findings</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Rule</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Severity</th>
              <th className="py-2 pr-4">Finding</th>
              <th className="py-2 pr-4">Evidence</th>
              <th className="py-2 pr-4">Hash</th>
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
