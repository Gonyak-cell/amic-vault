'use client';

import React, { useState } from 'react';
import { Archive, FileClock, ListTree, Scale, ShieldCheck, Trash2 } from 'lucide-react';
import type {
  DisposalCertificateDto,
  DisposalRequestDto,
  LegalHoldListResponseDto,
  LegalHoldScope,
  RecordsArchiveDto,
  RetentionPolicyListResponseDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  approveDisposalRequest,
  archiveDocument,
  createDisposalRequest,
  createLegalHold,
  createRetentionPolicy,
  executeDisposalRequest,
  getDisposalCertificate,
  listLegalHolds,
  listRetentionPolicies,
  releaseLegalHold,
} from '@/lib/api/records';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

export function RecordsGovernanceClient() {
  const [matterId, setMatterId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [policyCode, setPolicyCode] = useState('RET-INDEFINITE');
  const [policyLabel, setPolicyLabel] = useState('Indefinite retention');
  const [retentionDays, setRetentionDays] = useState('');
  const [reasonCode, setReasonCode] = useState('CLIENT_RECORDS');
  const [legalHoldId, setLegalHoldId] = useState('');
  const [disposalRequestId, setDisposalRequestId] = useState('');
  const [policies, setPolicies] = useState<RetentionPolicyListResponseDto | null>(null);
  const [holds, setHolds] = useState<LegalHoldListResponseDto | null>(null);
  const [archive, setArchive] = useState<RecordsArchiveDto | null>(null);
  const [disposal, setDisposal] = useState<DisposalRequestDto | null>(null);
  const [certificate, setCertificate] = useState<DisposalCertificateDto | null>(null);
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
  const trimmedReason = reasonCode.trim();
  const activeDisposalRequestId =
    disposalRequestId.trim() || disposal?.disposalRequestId || certificate?.disposalRequestId || '';
  const activeLegalHoldId = legalHoldId.trim() || holds?.holds[0]?.legalHoldId || '';

  async function refreshAll() {
    const [nextPolicies, nextHolds] = await Promise.all([
      run(() => listRetentionPolicies()),
      run(() => listLegalHolds(trimmedMatterId ? { matterId: trimmedMatterId } : {})),
    ]);
    if (nextPolicies) setPolicies(nextPolicies);
    if (nextHolds) setHolds(nextHolds);
  }

  async function savePolicy() {
    const result = await run(() =>
      createRetentionPolicy({
        policyCode: policyCode.trim(),
        label: policyLabel.trim(),
        retentionDays: retentionDays.trim() ? Number(retentionDays.trim()) : null,
      }),
    );
    if (result) await refreshAll();
  }

  async function saveHold(holdScope: LegalHoldScope) {
    const result = await run(() =>
      createLegalHold({
        matterId: trimmedMatterId,
        documentId: holdScope === 'document' ? trimmedDocumentId : undefined,
        holdScope,
        reasonCode: trimmedReason,
      }),
    );
    if (result) {
      setLegalHoldId(result.legalHoldId);
      await refreshAll();
    }
  }

  async function releaseHold() {
    const result = await run(() => releaseLegalHold(activeLegalHoldId));
    if (result) await refreshAll();
  }

  async function saveArchive() {
    const result = await run(() =>
      archiveDocument({ documentId: trimmedDocumentId, reasonCode: trimmedReason }),
    );
    if (result) setArchive(result);
  }

  async function requestDisposal() {
    const result = await run(() =>
      createDisposalRequest({ documentId: trimmedDocumentId, reasonCode: trimmedReason }),
    );
    if (result) {
      setDisposal(result);
      setDisposalRequestId(result.disposalRequestId);
    }
  }

  async function approveDisposal() {
    const result = await run(() => approveDisposalRequest(activeDisposalRequestId));
    if (result) setDisposal(result);
  }

  async function executeDisposal() {
    const result = await run(() => executeDisposalRequest(activeDisposalRequestId));
    if (result) setCertificate(result);
  }

  async function loadCertificate() {
    const result = await run(() => getDisposalCertificate(activeDisposalRequestId));
    if (result) setCertificate(result);
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Matter ID" value={matterId} onChange={setMatterId} />
          <Field label="Document ID" value={documentId} onChange={setDocumentId} />
          <Button onClick={refreshAll} disabled={busy} title="Refresh records data">
            <ListTree className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<FileClock className="h-4 w-4" />} label="Records Governance" />
          <Field label="Policy code" value={policyCode} onChange={setPolicyCode} />
          <Field label="Policy label" value={policyLabel} onChange={setPolicyLabel} />
          <Field label="Retention days" value={retentionDays} onChange={setRetentionDays} />
          <Button onClick={savePolicy} disabled={busy || !policyCode.trim() || !policyLabel.trim()}>
            <Scale className="h-4 w-4" />
            Save Policy
          </Button>

          <div className="border-t pt-3" />
          <Field label="Reason code" value={reasonCode} onChange={setReasonCode} />
          <Button onClick={() => saveHold('matter')} disabled={busy || !trimmedMatterId || !trimmedReason}>
            <ShieldCheck className="h-4 w-4" />
            Matter Hold
          </Button>
          <Button
            onClick={() => saveHold('document')}
            disabled={busy || !trimmedMatterId || !trimmedDocumentId || !trimmedReason}
          >
            <ShieldCheck className="h-4 w-4" />
            Document Hold
          </Button>
          <Field label="Legal hold ID" value={legalHoldId} onChange={setLegalHoldId} />
          <Button onClick={releaseHold} disabled={busy || !activeLegalHoldId}>
            <ShieldCheck className="h-4 w-4" />
            Release Hold
          </Button>

          <div className="border-t pt-3" />
          <Button onClick={saveArchive} disabled={busy || !trimmedDocumentId || !trimmedReason}>
            <Archive className="h-4 w-4" />
            Archive
          </Button>
          <Button onClick={requestDisposal} disabled={busy || !trimmedDocumentId || !trimmedReason}>
            <Trash2 className="h-4 w-4" />
            Request Disposal
          </Button>
          <Field
            label="Disposal request ID"
            value={disposalRequestId}
            onChange={setDisposalRequestId}
          />
          <Button onClick={approveDisposal} disabled={busy || !activeDisposalRequestId}>
            <ShieldCheck className="h-4 w-4" />
            Approve
          </Button>
          <Button onClick={executeDisposal} disabled={busy || !activeDisposalRequestId}>
            <Trash2 className="h-4 w-4" />
            Execute
          </Button>
          <Button onClick={loadCertificate} disabled={busy || !activeDisposalRequestId}>
            <FileClock className="h-4 w-4" />
            Certificate
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryPanel
            title="Policies"
            rows={policies?.policies.map((item) => [
              item.policyCode,
              item.retentionDays === null ? 'indefinite' : `${item.retentionDays} days`,
              item.status,
            ])}
          />
          <SummaryPanel
            title="Legal Holds"
            rows={holds?.holds.map((item) => [
              item.reasonCode,
              item.holdScope,
              item.status,
              item.documentId ?? item.matterId,
            ])}
          />
          <SummaryPanel
            title="Archive"
            rows={
              archive
                ? [[archive.documentId, archive.previousStatus, archive.archiveStatus]]
                : undefined
            }
          />
          <SummaryPanel
            title="Disposal"
            rows={
              disposal
                ? [[disposal.disposalRequestId, disposal.status, disposal.documentId]]
                : undefined
            }
          />
          <div className="rounded-md border p-4 lg:col-span-2">
            <PanelTitle icon={<FileClock className="h-4 w-4" />} label="Certificate" />
            {certificate ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <Value label="Certificate ID" value={certificate.certificateId} />
                <Value label="Request ID" value={certificate.disposalRequestId} />
                <Value label="Document hash" value={certificate.documentHash} />
                <Value label="Certificate hash" value={certificate.certificateHash} />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No certificate loaded</p>
            )}
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
    <label className="flex min-w-72 flex-1 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
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
      <PanelTitle icon={<ListTree className="h-4 w-4" />} label={title} />
      <div className="mt-3 overflow-hidden rounded-md border">
        <table className="w-full table-fixed text-sm">
          <tbody>
            {(rows ?? []).slice(0, 8).map((row, index) => (
              <tr key={`${title}-${index}`} className="border-b last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${index}-${cellIndex}`} className="truncate px-3 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {!rows?.length ? (
              <tr>
                <td className="px-3 py-2 text-muted-foreground">No rows</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs">{value}</dd>
    </div>
  );
}
