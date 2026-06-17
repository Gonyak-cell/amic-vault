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
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
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
import { cn } from '@/lib/utils';

type RecordsTab = 'policies' | 'holds' | 'archive' | 'disposal' | 'certificates';

const recordsCopy: Record<
  Language,
  {
    tabs: Record<RecordsTab, string>;
    matterRef: string;
    documentRef: string;
    refreshTitle: string;
    refresh: string;
    pageTitle: string;
    pageDescription: string;
    title: string;
    policyMeta: string;
    holdMeta: string;
    archiveMeta: string;
    disposalMeta: string;
    certificateMeta: string;
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
    certificateEvidence: string;
    noCertificate: string;
    noPolicies: string;
    noHolds: string;
    noArchive: string;
    noDisposal: string;
    noRows: string;
    indefinite: string;
    days: string;
    advancedRefs: string;
    certificateReady: string;
    evidencePreserved: string;
    targetDocument: string;
    targetMatter: string;
    requestReady: string;
  }
> = {
  ko: {
    tabs: {
      policies: '보존 정책',
      holds: '삭제 금지',
      archive: '보관',
      disposal: '삭제 요청',
      certificates: '증명서',
    },
    matterRef: 'Matter 참조',
    documentRef: '파일 참조',
    refreshTitle: '보존 정보 새로고침',
    refresh: '새로고침',
    pageTitle: '기록 보존',
    pageDescription: '보존 정책, 삭제 금지, 보관·삭제 처리를 운영 데이터 기준으로 관리합니다.',
    title: '보존 관리',
    policyMeta: '승인된 정책 값만 저장합니다.',
    holdMeta: '표시명 선택 API 연결 전에는 고급 영역에서만 처리합니다.',
    archiveMeta: '보관 처리는 권한과 감사 기록을 통과한 파일에만 적용됩니다.',
    disposalMeta: '삭제 요청, 승인, 실행은 단계별 감사 기록과 함께 처리됩니다.',
    certificateMeta: '증명서 상태만 표시하고 내부 검증 참조는 기본 화면에 노출하지 않습니다.',
    policyCode: '정책 코드',
    policyLabel: '정책 이름',
    retentionDays: '보존 기간',
    savePolicy: '정책 저장',
    reason: '사유',
    matterHold: 'Matter 삭제 금지',
    documentHold: '파일 삭제 금지',
    holdRef: '삭제 금지 참조',
    releaseHold: '삭제 금지 해제',
    archive: '보관 처리',
    requestDisposal: '삭제 요청',
    disposalRef: '삭제 요청 참조',
    approve: '승인',
    execute: '실행',
    certificate: '증명서',
    policies: '보존 정책',
    holds: '삭제 금지',
    archivePanel: '보관 상태',
    disposal: '삭제 요청',
    certificateRef: '증명서',
    requestRef: '삭제 요청',
    certificateEvidence: '감사 증명 보존',
    noCertificate: '불러온 증명서가 없습니다.',
    noPolicies: '등록된 보존 정책이 없습니다.',
    noHolds: '적용된 삭제 금지가 없습니다.',
    noArchive: '보관 처리 결과가 없습니다.',
    noDisposal: '연결된 삭제 요청이 없습니다.',
    noRows: '표시할 항목이 없습니다.',
    indefinite: '무기한',
    days: '일',
    advancedRefs: '고급 참조 입력',
    certificateReady: '증명서 생성됨',
    evidencePreserved: '감사 저장소에 보존됨',
    targetDocument: '대상 파일',
    targetMatter: '대상 Matter',
    requestReady: '삭제 요청 연결됨',
  },
  en: {
    tabs: {
      policies: 'Policies',
      holds: 'Legal holds',
      archive: 'Archive',
      disposal: 'Disposal',
      certificates: 'Certificates',
    },
    matterRef: 'Matter ref',
    documentRef: 'File ref',
    refreshTitle: 'Refresh retention data',
    refresh: 'Refresh',
    pageTitle: 'Records governance',
    pageDescription:
      'Manage retention policies, legal holds, archive, and disposal operations from approved data.',
    title: 'Retention settings',
    policyMeta: 'Save approved policy values only.',
    holdMeta: 'Use the advanced area only until display-name picker APIs are connected.',
    archiveMeta: 'Archive actions apply only after permission and audit checks.',
    disposalMeta: 'Request, approve, and execute disposal through audited stages.',
    certificateMeta: 'Show certificate status without exposing internal verification references.',
    policyCode: 'Policy code',
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
    certificateEvidence: 'Audit evidence preserved',
    noCertificate: 'No certificate loaded.',
    noPolicies: 'No retention policies are registered.',
    noHolds: 'No legal holds are applied.',
    noArchive: 'No archive result is available.',
    noDisposal: 'No disposal request is linked.',
    noRows: 'No items to show.',
    indefinite: 'indefinite',
    days: 'days',
    advancedRefs: 'Advanced reference input',
    certificateReady: 'Certificate generated',
    evidencePreserved: 'Preserved in audit storage',
    targetDocument: 'Target file',
    targetMatter: 'Target matter',
    requestReady: 'Disposal request linked',
  },
};

export function RecordsGovernanceClient() {
  const { language } = useI18n();
  const copy = recordsCopy[language];
  const [activeTab, setActiveTab] = useState<RecordsTab>('policies');
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
    <PageShell>
      <PageHeader
        title={copy.pageTitle}
        description={copy.pageDescription}
        actions={
          <Button onClick={refreshAll} disabled={busy} title={copy.refreshTitle} type="button">
            <ListTree className="h-4 w-4" />
            {copy.refresh}
          </Button>
        }
      />
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

      <TabBar activeTab={activeTab} labels={copy.tabs} onChange={setActiveTab} />

      {activeTab === 'policies' ? (
        <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <SectionCard
            icon={<FileClock className="h-4 w-4" />}
            title={copy.title}
            meta={copy.policyMeta}
          >
            <Field label={copy.policyCode} value={policyCode} onChange={setPolicyCode} />
            <Field label={copy.policyLabel} value={policyLabel} onChange={setPolicyLabel} />
            <Field label={copy.retentionDays} value={retentionDays} onChange={setRetentionDays} />
            <Button
              onClick={savePolicy}
              disabled={busy || !policyCode.trim() || !policyLabel.trim()}
            >
              <Scale className="h-4 w-4" />
              {copy.savePolicy}
            </Button>
          </SectionCard>
          <SummaryPanel
            title={copy.policies}
            empty={copy.noPolicies}
            rows={policies?.policies.map((item) => [
              item.policyCode,
              item.retentionDays === null ? copy.indefinite : `${item.retentionDays} ${copy.days}`,
              item.status,
            ])}
          />
        </section>
      ) : null}

      {activeTab === 'holds' ? (
        <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <AdvancedRefsPanel meta={copy.holdMeta} title={copy.advancedRefs}>
            <Field label={copy.matterRef} value={matterId} onChange={setMatterId} />
            <Field label={copy.documentRef} value={documentId} onChange={setDocumentId} />
            <Field label={copy.reason} value={reasonCode} onChange={setReasonCode} />
            <Button
              onClick={() => saveHold('matter')}
              disabled={busy || !trimmedMatterId || !trimmedReason}
            >
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
            <div className="border-t pt-3" />
            <Field label={copy.holdRef} value={legalHoldId} onChange={setLegalHoldId} />
            <Button onClick={releaseHold} disabled={busy || !activeLegalHoldId}>
              <ShieldCheck className="h-4 w-4" />
              {copy.releaseHold}
            </Button>
          </AdvancedRefsPanel>
          <SummaryPanel
            title={copy.holds}
            empty={copy.noHolds}
            rows={holds?.holds.map((item) => [
              item.reasonCode,
              item.holdScope === 'document' ? copy.targetDocument : copy.targetMatter,
              item.status,
            ])}
          />
        </section>
      ) : null}

      {activeTab === 'archive' ? (
        <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <AdvancedRefsPanel meta={copy.archiveMeta} title={copy.advancedRefs}>
            <Field label={copy.documentRef} value={documentId} onChange={setDocumentId} />
            <Field label={copy.reason} value={reasonCode} onChange={setReasonCode} />
            <Button onClick={saveArchive} disabled={busy || !trimmedDocumentId || !trimmedReason}>
              <Archive className="h-4 w-4" />
              {copy.archive}
            </Button>
          </AdvancedRefsPanel>
          <SummaryPanel
            title={copy.archivePanel}
            empty={copy.noArchive}
            rows={
              archive
                ? [[copy.targetDocument, archive.previousStatus, archive.archiveStatus]]
                : undefined
            }
          />
        </section>
      ) : null}

      {activeTab === 'disposal' ? (
        <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <AdvancedRefsPanel meta={copy.disposalMeta} title={copy.advancedRefs}>
            <Field label={copy.documentRef} value={documentId} onChange={setDocumentId} />
            <Field label={copy.reason} value={reasonCode} onChange={setReasonCode} />
            <Button
              onClick={requestDisposal}
              disabled={busy || !trimmedDocumentId || !trimmedReason}
            >
              <Trash2 className="h-4 w-4" />
              {copy.requestDisposal}
            </Button>
            <div className="border-t pt-3" />
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
          </AdvancedRefsPanel>
          <SummaryPanel
            title={copy.disposal}
            empty={copy.noDisposal}
            rows={
              disposal ? [[copy.requestReady, disposal.status, copy.targetDocument]] : undefined
            }
          />
        </section>
      ) : null}

      {activeTab === 'certificates' ? (
        <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <AdvancedRefsPanel meta={copy.certificateMeta} title={copy.advancedRefs}>
            <Field
              label={copy.disposalRef}
              value={disposalRequestId}
              onChange={setDisposalRequestId}
            />
            <Button onClick={loadCertificate} disabled={busy || !activeDisposalRequestId}>
              <FileClock className="h-4 w-4" />
              {copy.certificate}
            </Button>
          </AdvancedRefsPanel>
          <SectionCard
            icon={<FileClock className="h-4 w-4" />}
            title={copy.certificate}
            meta={copy.certificateMeta}
          >
            {certificate ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <Value label={copy.certificateRef} value={copy.certificateReady} />
                <Value label={copy.requestRef} value={copy.requestReady} />
                <Value label={copy.certificateEvidence} value={copy.evidencePreserved} />
              </dl>
            ) : (
              <EmptyState variant="no-data" title={copy.noCertificate} description={copy.noRows} />
            )}
          </SectionCard>
        </section>
      ) : null}
    </PageShell>
  );
}

function TabBar({
  activeTab,
  labels,
  onChange,
}: {
  activeTab: RecordsTab;
  labels: Record<RecordsTab, string>;
  onChange: (tab: RecordsTab) => void;
}) {
  const tabs: RecordsTab[] = ['policies', 'holds', 'archive', 'disposal', 'certificates'];
  return (
    <div className="flex flex-wrap gap-2 rounded-md border bg-card p-1" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={activeTab === tab}
          className={cn(
            'h-9 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === tab
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted hover:text-foreground',
          )}
          key={tab}
          onClick={() => onChange(tab)}
          role="tab"
          type="button"
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}

function AdvancedRefsPanel({
  children,
  meta,
  title,
}: {
  children: React.ReactNode;
  meta: string;
  title: string;
}) {
  return (
    <SectionCard title={title} meta={meta}>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-foreground">{title}</summary>
        <div className="mt-4 flex flex-col gap-3">{children}</div>
      </details>
    </SectionCard>
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
    <SectionCard icon={<ListTree className="h-4 w-4" />} title={title}>
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
    </SectionCard>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-xs font-medium">{value}</dd>
    </div>
  );
}
