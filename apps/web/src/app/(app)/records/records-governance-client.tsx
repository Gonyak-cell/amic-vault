'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Archive,
  CheckCircle2,
  FileClock,
  ListChecks,
  ListTree,
  Scale,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  DisposalCertificateDto,
  DisposalRequestDto,
  LegalHoldListResponseDto,
  LegalHoldScope,
  RecordsArchiveDto,
  RetentionPolicyListResponseDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableRow,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, FilterField } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
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
    contextPanelTitle: string;
    contextPanelMeta: string;
    contextReady: string;
    contextActionTarget: string;
    openAction: string;
    holdActionTitle: string;
    holdActionDescription: string;
    archiveActionTitle: string;
    archiveActionDescription: string;
    disposalActionTitle: string;
    disposalActionDescription: string;
    certificateActionTitle: string;
    certificateActionDescription: string;
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
    matterRef: '사건 참조',
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
    matterHold: '사건 삭제 금지',
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
    targetMatter: '대상 사건',
    requestReady: '삭제 요청 연결됨',
    contextPanelTitle: '보존 작업 준비',
    contextPanelMeta: '문서와 사건 표시명을 기준으로 작업을 선택합니다.',
    contextReady: '준비됨',
    contextActionTarget: '작업 대상',
    openAction: '열기',
    holdActionTitle: '삭제 금지 검토',
    holdActionDescription: '파일 또는 사건에 보존 조치를 적용합니다.',
    archiveActionTitle: '보관 처리 준비',
    archiveActionDescription: '권한과 감사 기록을 통과한 파일에 보관 처리를 요청합니다.',
    disposalActionTitle: '삭제 요청 준비',
    disposalActionDescription: '보존 정책 확인 후 단계별 승인 절차로 연결합니다.',
    certificateActionTitle: '증명서 확인',
    certificateActionDescription: '실행된 삭제 요청의 감사 증명 상태를 확인합니다.',
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
    contextPanelTitle: 'Records action readiness',
    contextPanelMeta: 'Choose actions from the displayed file and matter context.',
    contextReady: 'Ready',
    contextActionTarget: 'Action target',
    openAction: 'Open',
    holdActionTitle: 'Review legal hold',
    holdActionDescription: 'Apply retention protection to the file or matter.',
    archiveActionTitle: 'Prepare archive',
    archiveActionDescription: 'Request archive after permission and audit checks.',
    disposalActionTitle: 'Prepare disposal request',
    disposalActionDescription: 'Continue through retention review and staged approval.',
    certificateActionTitle: 'Check certificate',
    certificateActionDescription: 'Review audit evidence for an executed disposal request.',
  },
};

export function RecordsGovernanceClient() {
  const { language } = useI18n();
  const copy = recordsCopy[language];
  const params = useSearchParams();
  const documentContextLabel = params.get('documentTitle')?.trim() ?? '';
  const matterContextLabel = params.get('matterCode')?.trim() ?? '';
  const [activeTab, setActiveTab] = useState<RecordsTab>(() => parseRecordsTab(params.get('tab')));
  const [matterId, setMatterId] = useState(() => params.get('matterId')?.trim() ?? '');
  const [documentId, setDocumentId] = useState(() => params.get('documentId')?.trim() ?? '');
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
      {error ? <EmptyState variant="api-error" title={error} className="items-start text-left" /> : null}

      {documentContextLabel || matterContextLabel ? (
        <RecordsActionContextPanel
          activeTab={activeTab}
          copy={copy}
          documentContextLabel={documentContextLabel}
          matterContextLabel={matterContextLabel}
          onSelectTab={setActiveTab}
        />
      ) : null}

      <TabBar activeTab={activeTab} labels={copy.tabs} onChange={setActiveTab} />

      {activeTab === 'policies' ? (
        <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !policyCode.trim() || !policyLabel.trim()) return;
              void savePolicy();
            }}
          >
            <FilterBar
              actions={
                <Button
                  aria-label={copy.savePolicy}
                  disabled={busy || !policyCode.trim() || !policyLabel.trim()}
                  title={copy.savePolicy}
                  type="submit"
                >
                  <Scale className="h-4 w-4" />
                  {copy.savePolicy}
                </Button>
              }
              label={copy.title}
              title={copy.title}
              description={copy.policyMeta}
            >
              <Field
                id="records-policy-code"
                label={copy.policyCode}
                value={policyCode}
                onChange={setPolicyCode}
              />
              <Field
                id="records-policy-label"
                label={copy.policyLabel}
                value={policyLabel}
                onChange={setPolicyLabel}
              />
              <Field
                id="records-retention-days"
                label={copy.retentionDays}
                type="number"
                value={retentionDays}
                onChange={setRetentionDays}
              />
            </FilterBar>
          </form>
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
            {matterContextLabel ? (
              <ContextTarget label={copy.matterRef} value={matterContextLabel} />
            ) : (
              <Field
                id="records-hold-matter-ref"
                label={copy.matterRef}
                value={matterId}
                onChange={setMatterId}
              />
            )}
            {documentContextLabel ? (
              <ContextTarget label={copy.documentRef} value={documentContextLabel} />
            ) : (
              <Field
                id="records-hold-document-ref"
                label={copy.documentRef}
                value={documentId}
                onChange={setDocumentId}
              />
            )}
            <Field
              id="records-hold-reason"
              label={copy.reason}
              value={reasonCode}
              onChange={setReasonCode}
            />
            <Button
              onClick={() => saveHold('matter')}
              disabled={busy || !trimmedMatterId || !trimmedReason}
              type="button"
            >
              <ShieldCheck className="h-4 w-4" />
              {copy.matterHold}
            </Button>
            <Button
              onClick={() => saveHold('document')}
              disabled={busy || !trimmedMatterId || !trimmedDocumentId || !trimmedReason}
              type="button"
            >
              <ShieldCheck className="h-4 w-4" />
              {copy.documentHold}
            </Button>
            <div className="border-t pt-3 sm:col-span-full" />
            <Field
              id="records-hold-ref"
              label={copy.holdRef}
              value={legalHoldId}
              onChange={setLegalHoldId}
            />
            <Button
              onClick={releaseHold}
              disabled={busy || !activeLegalHoldId}
              type="button"
            >
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
            {documentContextLabel ? (
              <ContextTarget label={copy.documentRef} value={documentContextLabel} />
            ) : (
              <Field
                id="records-archive-document-ref"
                label={copy.documentRef}
                value={documentId}
                onChange={setDocumentId}
              />
            )}
            <Field
              id="records-archive-reason"
              label={copy.reason}
              value={reasonCode}
              onChange={setReasonCode}
            />
            <Button
              onClick={saveArchive}
              disabled={busy || !trimmedDocumentId || !trimmedReason}
              type="button"
            >
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
            {documentContextLabel ? (
              <ContextTarget label={copy.documentRef} value={documentContextLabel} />
            ) : (
              <Field
                id="records-disposal-document-ref"
                label={copy.documentRef}
                value={documentId}
                onChange={setDocumentId}
              />
            )}
            <Field
              id="records-disposal-reason"
              label={copy.reason}
              value={reasonCode}
              onChange={setReasonCode}
            />
            <Button
              onClick={requestDisposal}
              disabled={busy || !trimmedDocumentId || !trimmedReason}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              {copy.requestDisposal}
            </Button>
            <div className="border-t pt-3 sm:col-span-full" />
            <Field
              id="records-disposal-request-ref"
              label={copy.disposalRef}
              value={disposalRequestId}
              onChange={setDisposalRequestId}
            />
            <Button
              onClick={approveDisposal}
              disabled={busy || !activeDisposalRequestId}
              type="button"
            >
              <ShieldCheck className="h-4 w-4" />
              {copy.approve}
            </Button>
            <Button
              onClick={executeDisposal}
              disabled={busy || !activeDisposalRequestId}
              type="button"
            >
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
              id="records-certificate-disposal-ref"
              label={copy.disposalRef}
              value={disposalRequestId}
              onChange={setDisposalRequestId}
            />
            <Button
              onClick={loadCertificate}
              disabled={busy || !activeDisposalRequestId}
              type="button"
            >
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

function parseRecordsTab(value: string | null): RecordsTab {
  return value === 'holds' ||
    value === 'archive' ||
    value === 'disposal' ||
    value === 'certificates'
    ? value
    : 'policies';
}

function ContextTarget({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function RecordsActionContextPanel({
  activeTab,
  copy,
  documentContextLabel,
  matterContextLabel,
  onSelectTab,
}: {
  activeTab: RecordsTab;
  copy: (typeof recordsCopy)[Language];
  documentContextLabel: string;
  matterContextLabel: string;
  onSelectTab: (tab: RecordsTab) => void;
}) {
  const actions: Array<{
    tab: RecordsTab;
    title: string;
    description: string;
    icon: React.ReactNode;
    requiresDocument?: boolean;
  }> = [
    {
      tab: 'holds',
      title: copy.holdActionTitle,
      description: copy.holdActionDescription,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      tab: 'archive',
      title: copy.archiveActionTitle,
      description: copy.archiveActionDescription,
      icon: <Archive className="h-4 w-4" />,
      requiresDocument: true,
    },
    {
      tab: 'disposal',
      title: copy.disposalActionTitle,
      description: copy.disposalActionDescription,
      icon: <Trash2 className="h-4 w-4" />,
      requiresDocument: true,
    },
    {
      tab: 'certificates',
      title: copy.certificateActionTitle,
      description: copy.certificateActionDescription,
      icon: <FileClock className="h-4 w-4" />,
      requiresDocument: true,
    },
  ];
  const visibleActions = actions.filter((action) => !action.requiresDocument || documentContextLabel);

  return (
    <SectionCard
      actions={<StatusBadge tone="success">{copy.contextReady}</StatusBadge>}
      icon={<ListChecks className="h-4 w-4" />}
      title={copy.contextPanelTitle}
      meta={copy.contextPanelMeta}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            {copy.contextActionTarget}
          </p>
          <dl className="mt-3 grid gap-3">
            {documentContextLabel ? (
              <ContextTarget label={copy.documentRef} value={documentContextLabel} />
            ) : null}
            {matterContextLabel ? (
              <ContextTarget label={copy.matterRef} value={matterContextLabel} />
            ) : null}
          </dl>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleActions.map((action) => (
            <button
              aria-current={activeTab === action.tab ? 'step' : undefined}
              className={cn(
                'group flex min-h-[112px] flex-col rounded-md border bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeTab === action.tab
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/40 hover:bg-muted/30',
              )}
              key={action.tab}
              onClick={() => onSelectTab(action.tab)}
              type="button"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="text-primary">{action.icon}</span>
                  <span className="truncate">{action.title}</span>
                </span>
                {activeTab === action.tab ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                ) : null}
              </span>
              <span className="mt-2 text-xs leading-5 text-muted-foreground">
                {action.description}
              </span>
              <span className="mt-auto pt-3 text-xs font-semibold text-primary">
                {copy.openAction}
              </span>
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
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
    <FilterBar label={title} title={title} description={meta}>
      <details className="rounded-md border bg-muted/20 p-3 sm:col-span-full">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{title}</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          {children}
        </div>
      </details>
    </FilterBar>
  );
}

function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterField htmlFor={id} label={label}>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </FilterField>
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
      <div className="mt-3">
        <DataTable caption={title} minWidthClassName="min-w-[520px]">
          <DataTableBody>
            {(rows ?? []).slice(0, 8).map((row, index) => (
              <DataTableRow key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <DataTableCell key={`${title}-${index}-${cellIndex}`} className="truncate">
                    {cell}
                  </DataTableCell>
                ))}
              </DataTableRow>
            ))}
            {!rows?.length ? <DataTableEmptyRow colSpan={3}>{empty}</DataTableEmptyRow> : null}
          </DataTableBody>
        </DataTable>
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
