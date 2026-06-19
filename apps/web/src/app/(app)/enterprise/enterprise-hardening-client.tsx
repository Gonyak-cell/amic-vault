'use client';

import React, { useState } from 'react';
import {
  Building2,
  Database,
  FileCog,
  FolderKanban,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import type {
  EnterpriseBackupSnapshotListResponseDto,
  EnterpriseComplianceEvidenceListResponseDto,
  EnterpriseKeyReferenceListResponseDto,
  EnterpriseReadinessSummaryDto,
  EnterpriseSiemExportListResponseDto,
  EnterpriseSsoProviderListResponseDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableRow,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  getEnterpriseReadiness,
  listEnterpriseBackupSnapshots,
  listEnterpriseComplianceEvidence,
  listEnterpriseKeyReferences,
  listEnterpriseSiemExports,
  listEnterpriseSsoProviders,
} from '@/lib/api/enterprise';
import {
  requestTenantSearchReindex,
  type TenantSearchReindexResult,
} from '@/lib/api/search-admin';
import { useI18n, type Language } from '@/lib/i18n';

type Row = [string, string, string?];

const enterpriseCopy: Record<
  Language,
  {
    pageTitle: string;
    pageDescription: string;
    refreshTitle: string;
    refresh: string;
    readiness: string;
    readinessMeta: string;
    sso: string;
    ssoMeta: string;
    mfa: string;
    mfaMeta: string;
    byok: string;
    byokMeta: string;
    siem: string;
    siemMeta: string;
    backup: string;
    backupMeta: string;
    compliance: string;
    complianceMeta: string;
    dmsConfiguration: string;
    dmsConfigurationMeta: string;
    taxonomy: string;
    taxonomyMeta: string;
    templates: string;
    templatesMeta: string;
    refiners: string;
    refinersMeta: string;
    searchOps: string;
    searchOpsMeta: string;
    reindexTenant: string;
    reindexBusy: string;
    reindexAudit: string;
    reindexAccepted: string;
    reindexReady: string;
    contractRequired: string;
    governedByBackend: string;
    apiUnavailableTitle: string;
    apiUnavailableDescription: string;
    noRecords: string;
    active: string;
    inactive: string;
    pass: string;
    notPassed: string;
    count: string;
    events: string;
    tables: string;
    ssoProviders: string;
    keyReferences: string;
    siemExports: string;
    backupSnapshots: string;
    complianceGaps: string;
    technicalCheck: string;
  }
> = {
  ko: {
    pageTitle: '관리자 설정',
    pageDescription:
      'SSO, MFA, 고객 관리 키, 감사 내보내기, 백업, 컴플라이언스 상태를 운영 데이터 기준으로 확인합니다.',
    refreshTitle: '관리자 설정 새로고침',
    refresh: '새로고침',
    readiness: '준비 상태',
    readinessMeta: 'API 성공 시에만 수치 표시',
    sso: 'SSO',
    ssoMeta: '인증 제공자 상태',
    mfa: 'MFA',
    mfaMeta: '세션 보안 정책',
    byok: '고객 관리 키',
    byokMeta: '키 참조 검증 상태',
    siem: 'SIEM',
    siemMeta: '감사 이벤트 내보내기',
    backup: '백업',
    backupMeta: '운영 백업 스냅샷',
    compliance: '컴플라이언스',
    complianceMeta: '컴플라이언스 증빙 상태',
    dmsConfiguration: 'DMS 구성',
    dmsConfigurationMeta: 'Taxonomy, 템플릿, 검색 refiner 승인 상태',
    taxonomy: '문서 taxonomy',
    taxonomyMeta: '문서 유형, 세부 유형, 필수 메타데이터',
    templates: 'Matter 템플릿',
    templatesMeta: '업무 유형별 기본 문서 세트',
    refiners: '검색 refiner',
    refinersMeta: '검색 가능한 메타데이터 필드',
    searchOps: '검색 인덱스 운영',
    searchOpsMeta: '재색인 요청 및 감사 기록',
    reindexTenant: '전체 재색인 요청',
    reindexBusy: '요청 중',
    reindexAudit: '감사 기록 대상',
    reindexAccepted: '재색인 큐 등록',
    reindexReady: '요청 전',
    contractRequired: '계약 필요',
    governedByBackend: '저장 API 승인 전 읽기 전용',
    apiUnavailableTitle: '운영 데이터가 아직 연결되지 않았습니다.',
    apiUnavailableDescription: 'API 응답이 확인되면 이 섹션에 실제 설정 상태만 표시됩니다.',
    noRecords: '표시할 기록이 없습니다.',
    active: '활성',
    inactive: '비활성',
    pass: '통과',
    notPassed: '미통과',
    count: '건',
    events: '이벤트',
    tables: '테이블',
    ssoProviders: 'SSO 제공자',
    keyReferences: '키 참조',
    siemExports: '내보내기',
    backupSnapshots: '스냅샷',
    complianceGaps: '미충족 항목',
    technicalCheck: '시스템 점검',
  },
  en: {
    pageTitle: 'Admin settings',
    pageDescription:
      'Review SSO, MFA, customer-managed keys, audit exports, backups, and compliance from operational data.',
    refreshTitle: 'Refresh admin settings',
    refresh: 'Refresh',
    readiness: 'Readiness',
    readinessMeta: 'Counts render only after API success',
    sso: 'SSO',
    ssoMeta: 'Identity provider status',
    mfa: 'MFA',
    mfaMeta: 'Session security policy',
    byok: 'Customer-managed keys',
    byokMeta: 'Key reference verification',
    siem: 'SIEM',
    siemMeta: 'Audit event exports',
    backup: 'Backup',
    backupMeta: 'Operational backup snapshots',
    compliance: 'Compliance',
    complianceMeta: 'Control evidence status',
    dmsConfiguration: 'DMS configuration',
    dmsConfigurationMeta: 'Taxonomy, templates, and search refiner approval status',
    taxonomy: 'Document taxonomy',
    taxonomyMeta: 'Document types, subtypes, and required metadata',
    templates: 'Matter templates',
    templatesMeta: 'Default document sets by matter type',
    refiners: 'Search refiners',
    refinersMeta: 'Queryable metadata fields',
    searchOps: 'Search index operations',
    searchOpsMeta: 'Reindex request and audit trail',
    reindexTenant: 'Request tenant reindex',
    reindexBusy: 'Requesting',
    reindexAudit: 'Audited operation',
    reindexAccepted: 'Reindex queued',
    reindexReady: 'Ready',
    contractRequired: 'Contract required',
    governedByBackend: 'Read-only until save APIs are approved',
    apiUnavailableTitle: 'Operational data is not connected yet.',
    apiUnavailableDescription:
      'Only real settings returned by the API will appear in this section.',
    noRecords: 'No records to show.',
    active: 'Active',
    inactive: 'Inactive',
    pass: 'Pass',
    notPassed: 'Not passed',
    count: 'items',
    events: 'events',
    tables: 'tables',
    ssoProviders: 'SSO providers',
    keyReferences: 'Key references',
    siemExports: 'Exports',
    backupSnapshots: 'Snapshots',
    complianceGaps: 'Gaps',
    technicalCheck: 'Technical check',
  },
};

export function EnterpriseHardeningClient() {
  const { language } = useI18n();
  const copy = enterpriseCopy[language];
  const [providers, setProviders] = useState<EnterpriseSsoProviderListResponseDto | null>(null);
  const [keys, setKeys] = useState<EnterpriseKeyReferenceListResponseDto | null>(null);
  const [exports, setExports] = useState<EnterpriseSiemExportListResponseDto | null>(null);
  const [snapshots, setSnapshots] = useState<EnterpriseBackupSnapshotListResponseDto | null>(null);
  const [evidence, setEvidence] = useState<EnterpriseComplianceEvidenceListResponseDto | null>(
    null,
  );
  const [readiness, setReadiness] = useState<EnterpriseReadinessSummaryDto | null>(null);
  const [reindexResult, setReindexResult] = useState<TenantSearchReindexResult | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [reindexBusy, setReindexBusy] = useState(false);
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

  async function refreshAll() {
    const [nextProviders, nextKeys, nextExports, nextSnapshots, nextEvidence, nextReadiness] =
      await Promise.all([
        run(() => listEnterpriseSsoProviders()),
        run(() => listEnterpriseKeyReferences()),
        run(() => listEnterpriseSiemExports()),
        run(() => listEnterpriseBackupSnapshots()),
        run(() => listEnterpriseComplianceEvidence()),
        run(() => getEnterpriseReadiness()),
      ]);
    if (nextProviders) setProviders(nextProviders);
    if (nextKeys) setKeys(nextKeys);
    if (nextExports) setExports(nextExports);
    if (nextSnapshots) setSnapshots(nextSnapshots);
    if (nextEvidence) setEvidence(nextEvidence);
    if (nextReadiness) setReadiness(nextReadiness);
  }

  async function requestReindex() {
    setReindexBusy(true);
    setReindexError(null);
    try {
      setReindexResult(await requestTenantSearchReindex());
    } catch (caught) {
      setReindexError(safeApiErrorMessage(caught));
    } finally {
      setReindexBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={copy.pageTitle}
        description={copy.pageDescription}
        actions={
          <Button onClick={refreshAll} disabled={busy} title={copy.refreshTitle} type="button">
            <Building2 className="h-4 w-4" />
            {copy.refresh}
          </Button>
        }
      />
      {error ? <EmptyState variant="api-error" title={error} className="items-start text-left" /> : null}

      <AdminDmsConfigurationPanel copy={copy} />
      <AdminSearchOperationsPanel
        busy={reindexBusy}
        copy={copy}
        error={reindexError}
        onRequest={() => void requestReindex()}
        result={reindexResult}
      />

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <SectionCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title={copy.readiness}
          meta={copy.readinessMeta}
        >
          {readiness ? (
            <dl className="grid gap-3 text-sm">
              <Value
                label={copy.ssoProviders}
                value={`${readiness.activeSsoProviderCount} ${copy.count}`}
              />
              <Value
                label={copy.keyReferences}
                value={`${readiness.activeKeyReferenceCount} ${copy.count}`}
              />
              <Value
                label={copy.siemExports}
                value={`${readiness.siemExportCount} ${copy.count}`}
              />
              <Value
                label={copy.backupSnapshots}
                value={`${readiness.backupSnapshotCount} ${copy.count}`}
              />
              <Value
                label={copy.complianceGaps}
                value={`${readiness.complianceGapCount} ${copy.count}`}
              />
              <div className="min-w-0">
                <dt className="text-muted-foreground">{copy.technicalCheck}</dt>
                <dd className="mt-1">
                  <StatusBadge tone={readiness.technicalPass ? 'success' : 'warning'}>
                    {readiness.technicalPass ? copy.pass : copy.notPassed}
                  </StatusBadge>
                </dd>
              </div>
            </dl>
          ) : (
            <Unavailable copy={copy} />
          )}
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <SettingsPanel
            empty={copy.noRecords}
            icon={<LockKeyhole className="h-4 w-4" />}
            meta={copy.ssoMeta}
            rows={providers?.providers.map((item) => [
              item.displayName,
              item.status === 'active' ? copy.active : copy.inactive,
              item.enforcementMode,
            ])}
            title={copy.sso}
            unavailableCopy={copy}
          />
          <SectionCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title={copy.mfa}
            meta={copy.mfaMeta}
          >
            <Unavailable copy={copy} />
          </SectionCard>
          <SettingsPanel
            empty={copy.noRecords}
            icon={<KeyRound className="h-4 w-4" />}
            meta={copy.byokMeta}
            rows={keys?.keys.map((item) => [
              item.keyProvider,
              item.status === 'active' ? copy.active : item.status,
              item.lastVerifiedAt ?? copy.notPassed,
            ])}
            title={copy.byok}
            unavailableCopy={copy}
          />
          <SettingsPanel
            empty={copy.noRecords}
            icon={<UploadCloud className="h-4 w-4" />}
            meta={copy.siemMeta}
            rows={exports?.exports.map((item) => [
              item.sinkType,
              `${item.eventCount} ${copy.events}`,
              item.createdAt,
            ])}
            title={copy.siem}
            unavailableCopy={copy}
          />
          <SettingsPanel
            empty={copy.noRecords}
            icon={<Database className="h-4 w-4" />}
            meta={copy.backupMeta}
            rows={snapshots?.snapshots.map((item) => [
              item.scope,
              `${item.tableCount} ${copy.tables}`,
              item.createdAt,
            ])}
            title={copy.backup}
            unavailableCopy={copy}
          />
          <SettingsPanel
            empty={copy.noRecords}
            icon={<ShieldCheck className="h-4 w-4" />}
            meta={copy.complianceMeta}
            rows={evidence?.evidence.map((item) => [item.framework, item.controlId, item.status])}
            title={copy.compliance}
            unavailableCopy={copy}
          />
        </div>
      </section>
    </PageShell>
  );
}

function AdminSearchOperationsPanel({
  busy,
  copy,
  error,
  onRequest,
  result,
}: {
  busy: boolean;
  copy: (typeof enterpriseCopy)[Language];
  error: string | null;
  onRequest: () => void;
  result: TenantSearchReindexResult | null;
}) {
  return (
    <SectionCard
      icon={<SearchCheck className="h-4 w-4" />}
      title={copy.searchOps}
      meta={copy.searchOpsMeta}
      actions={
        <StatusBadge tone={result ? 'success' : 'neutral'}>
          {result ? copy.reindexAccepted : copy.reindexReady}
        </StatusBadge>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-sm leading-6 text-muted-foreground">
            권한이 있는 운영자만 전체 검색 인덱스 재처리를 요청할 수 있습니다. 요청은 감사 기록과 큐 등록 수로만 확인합니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge>{copy.reindexAudit}</StatusBadge>
            {result ? (
              <StatusBadge tone="success">
                {result.enqueuedJobCount} {copy.count}
              </StatusBadge>
            ) : null}
          </div>
          {error ? (
            <p className="mt-3 text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="button" onClick={onRequest} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          {busy ? copy.reindexBusy : copy.reindexTenant}
        </Button>
      </div>
    </SectionCard>
  );
}

function AdminDmsConfigurationPanel({ copy }: { copy: (typeof enterpriseCopy)[Language] }) {
  const cards = [
    {
      title: copy.taxonomy,
      meta: copy.taxonomyMeta,
      icon: <FileCog className="h-4 w-4" />,
    },
    {
      title: copy.templates,
      meta: copy.templatesMeta,
      icon: <FolderKanban className="h-4 w-4" />,
    },
    {
      title: copy.refiners,
      meta: copy.refinersMeta,
      icon: <SearchCheck className="h-4 w-4" />,
    },
  ];
  return (
    <SectionCard
      icon={<FileCog className="h-4 w-4" />}
      title={copy.dmsConfiguration}
      meta={copy.dmsConfigurationMeta}
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.title} className="rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {card.icon}
                <span className="truncate text-sm font-semibold text-foreground">{card.title}</span>
              </div>
              <StatusBadge tone="warning">{copy.contractRequired}</StatusBadge>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{card.meta}</p>
            <p className="mt-3 text-[12px] font-medium text-muted-foreground">
              {copy.governedByBackend}
            </p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SettingsPanel({
  empty,
  icon,
  meta,
  rows,
  title,
  unavailableCopy,
}: {
  empty: string;
  icon: React.ReactNode;
  meta: string;
  rows?: Row[] | undefined;
  title: string;
  unavailableCopy: (typeof enterpriseCopy)[Language];
}) {
  return (
    <SectionCard icon={icon} title={title} meta={meta}>
      {rows ? <Rows caption={title} empty={empty} rows={rows} /> : <Unavailable copy={unavailableCopy} />}
    </SectionCard>
  );
}

function Rows({ caption, empty, rows }: { caption: string; empty: string; rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState variant="no-data" title={empty} />;
  }
  return (
    <DataTable caption={caption} minWidthClassName="min-w-[520px]">
      <DataTableBody>
        {rows.slice(0, 8).map((row, index) => (
          <DataTableRow key={`${row[0]}-${index}`}>
            <DataTableCell className="truncate font-medium">{row[0]}</DataTableCell>
            <DataTableCell className="truncate text-muted-foreground">{row[1]}</DataTableCell>
            <DataTableCell className="truncate text-muted-foreground">{row[2] ?? ''}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

function Unavailable({ copy }: { copy: (typeof enterpriseCopy)[Language] }) {
  return (
    <EmptyState
      variant="api-unavailable"
      title={copy.apiUnavailableTitle}
      description={copy.apiUnavailableDescription}
    />
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
