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
import { useI18n, type Language } from '@/lib/i18n';

const recordsCopy: Record<
  Language,
  {
    matterRef: string;
    documentRef: string;
    refreshTitle: string;
    refresh: string;
    title: string;
    policyCode: string;
    policyLabel: string;
    retentionDays: string;
    savePolicy: string;
    reason: string;
    matterHold: string;
    documentHold: string;
    holdRef: string;
    releaseHold: string;
    archive: string;
    requestDisposal: string;
    disposalRef: string;
    approve: string;
    execute: string;
    certificate: string;
    policies: string;
    holds: string;
    archivePanel: string;
    disposal: string;
    certificateRef: string;
    requestRef: string;
    documentHash: string;
    certificateHash: string;
    noCertificate: string;
    noRows: string;
    indefinite: string;
    days: string;
  }
> = {
  ko: {
    matterRef: 'Matter ID',
    documentRef: '파일 ID',
    refreshTitle: '보존 정보 새로고침',
    refresh: '새로고침',
    title: '보존 관리',
    policyCode: '정책 ID',
    policyLabel: '정책 이름',
    retentionDays: '보존 기간',
    savePolicy: '정책 저장',
    reason: '사유',
    matterHold: 'Matter 삭제 금지',
    documentHold: '파일 삭제 금지',
    holdRef: '삭제 금지 ID',
    releaseHold: '삭제 금지 해제',
    archive: '보관 처리',
    requestDisposal: '삭제 요청',
    disposalRef: '삭제 요청 ID',
    approve: '승인',
    execute: '실행',
    certificate: '증명서',
    policies: '보존 정책',
    holds: '삭제 금지',
    archivePanel: '보관 상태',
    disposal: '삭제 요청',
    certificateRef: '증명서 ID',
    requestRef: '요청 ID',
    documentHash: '파일 해시',
    certificateHash: '증명서 해시',
    noCertificate: '불러온 증명서가 없습니다.',
    noRows: '표시할 항목이 없습니다.',
    indefinite: '무기한',
    days: '일',
  },
  en: {
    matterRef: 'Matter ref',
    documentRef: 'File ref',
    refreshTitle: 'Refresh retention data',
    refresh: 'Refresh',
    title: 'Retention settings',
    policyCode: 'Policy ref',
    policyLabel: 'Policy name',
    retentionDays: 'Retention days',
    savePolicy: 'Save policy',
    reason: 'Reason',
    matterHold: 'Hold matter',
    documentHold: 'Hold file',
    holdRef: 'Hold ref',
    releaseHold: 'Release hold',
    archive: 'Archive',
    requestDisposal: 'Request disposal',
    disposalRef: 'Disposal request ref',
    approve: 'Approve',
    execute: 'Execute',
    certificate: 'Certificate',
    policies: 'Retention policies',
    holds: 'Legal holds',
    archivePanel: 'Archive status',
    disposal: 'Disposal requests',
    certificateRef: 'Certificate ref',
    requestRef: 'Request ref',
    documentHash: 'File hash',
    certificateHash: 'Certificate hash',
    noCertificate: 'No certificate loaded.',
    noRows: 'No items to show.',
    indefinite: 'indefinite',
    days: 'days',
  },
};

export function RecordsGovernanceClient() {
  const { language } = useI18n();
  const copy = recordsCopy[language];
  const [matterId, setMatterId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [policyCode, setPolicyCode] = useState('');
  const [policyLabel, setPolicyLabel] = useState('');
  const [retentionDays, setRetentionDays] = useState('');
  const [reasonCode, setReasonCode] = useState('');
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
          <Field label={copy.matterRef} value={matterId} onChange={setMatterId} />
          <Field label={copy.documentRef} value={documentId} onChange={setDocumentId} />
          <Button onClick={refreshAll} disabled={busy} title={copy.refreshTitle}>
            <ListTree className="h-4 w-4" />
            {copy.refresh}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<FileClock className="h-4 w-4" />} label={copy.title} />
          <Field label={copy.policyCode} value={policyCode} onChange={setPolicyCode} />
          <Field label={copy.policyLabel} value={policyLabel} onChange={setPolicyLabel} />
          <Field label={copy.retentionDays} value={retentionDays} onChange={setRetentionDays} />
          <Button onClick={savePolicy} disabled={busy || !policyCode.trim() || !policyLabel.trim()}>
            <Scale className="h-4 w-4" />
            {copy.savePolicy}
          </Button>

          <div className="border-t pt-3" />
          <Field label={copy.reason} value={reasonCode} onChange={setReasonCode} />
          <Button onClick={() => saveHold('matter')} disabled={busy || !trimmedMatterId || !trimmedReason}>
            <ShieldCheck className="h-4 w-4" />
            {copy.matterHold}
          </Button>
          <Button
            onClick={() => saveHold('document')}
            disabled={busy || !trimmedMatterId || !trimmedDocumentId || !trimmedReason}
          >
            <ShieldCheck className="h-4 w-4" />
            {copy.documentHold}
          </Button>
          <Field label={copy.holdRef} value={legalHoldId} onChange={setLegalHoldId} />
          <Button onClick={releaseHold} disabled={busy || !activeLegalHoldId}>
            <ShieldCheck className="h-4 w-4" />
            {copy.releaseHold}
          </Button>

          <div className="border-t pt-3" />
          <Button onClick={saveArchive} disabled={busy || !trimmedDocumentId || !trimmedReason}>
            <Archive className="h-4 w-4" />
            {copy.archive}
          </Button>
          <Button onClick={requestDisposal} disabled={busy || !trimmedDocumentId || !trimmedReason}>
            <Trash2 className="h-4 w-4" />
            {copy.requestDisposal}
          </Button>
          <Field
            label={copy.disposalRef}
            value={disposalRequestId}
            onChange={setDisposalRequestId}
          />
          <Button onClick={approveDisposal} disabled={busy || !activeDisposalRequestId}>
            <ShieldCheck className="h-4 w-4" />
            {copy.approve}
          </Button>
          <Button onClick={executeDisposal} disabled={busy || !activeDisposalRequestId}>
            <Trash2 className="h-4 w-4" />
            {copy.execute}
          </Button>
          <Button onClick={loadCertificate} disabled={busy || !activeDisposalRequestId}>
            <FileClock className="h-4 w-4" />
            {copy.certificate}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryPanel
            title={copy.policies}
            empty={copy.noRows}
            rows={policies?.policies.map((item) => [
              item.policyCode,
              item.retentionDays === null
                ? copy.indefinite
                : `${item.retentionDays} ${copy.days}`,
              item.status,
            ])}
          />
          <SummaryPanel
            title={copy.holds}
            empty={copy.noRows}
            rows={holds?.holds.map((item) => [
              item.reasonCode,
              item.holdScope,
              item.status,
              formatRef(item.documentId ?? item.matterId),
            ])}
          />
          <SummaryPanel
            title={copy.archivePanel}
            empty={copy.noRows}
            rows={
              archive
                ? [[formatRef(archive.documentId), archive.previousStatus, archive.archiveStatus]]
                : undefined
            }
          />
          <SummaryPanel
            title={copy.disposal}
            empty={copy.noRows}
            rows={
              disposal
                ? [[formatRef(disposal.disposalRequestId), disposal.status, formatRef(disposal.documentId)]]
                : undefined
            }
          />
          <div className="rounded-md border p-4 lg:col-span-2">
            <PanelTitle icon={<FileClock className="h-4 w-4" />} label={copy.certificate} />
            {certificate ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <Value label={copy.certificateRef} value={certificate.certificateId} />
                <Value label={copy.requestRef} value={certificate.disposalRequestId} />
                <Value label={copy.documentHash} value={certificate.documentHash} />
                <Value label={copy.certificateHash} value={certificate.certificateHash} />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{copy.noCertificate}</p>
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

function SummaryPanel({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: string[][] | undefined;
  empty: string;
}) {
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
                <td className="px-3 py-2 text-muted-foreground">{empty}</td>
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

function formatRef(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}
