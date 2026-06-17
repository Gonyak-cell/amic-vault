'use client';

import React, { useState } from 'react';
import { Building2, Database, KeyRound, LockKeyhole, ShieldCheck, UploadCloud } from 'lucide-react';
import type {
  EnterpriseBackupSnapshotListResponseDto,
  EnterpriseComplianceEvidenceListResponseDto,
  EnterpriseKeyReferenceListResponseDto,
  EnterpriseReadinessSummaryDto,
  EnterpriseSiemExportListResponseDto,
  EnterpriseSsoProviderListResponseDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
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
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

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
      {rows ? <Rows empty={empty} rows={rows} /> : <Unavailable copy={unavailableCopy} />}
    </SectionCard>
  );
}

function Rows({ empty, rows }: { empty: string; rows: Row[] }) {
  if (rows.length === 0) {
    return <EmptyState variant="no-data" title={empty} />;
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full table-fixed text-sm">
        <tbody>
          {rows.slice(0, 8).map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="border-b last:border-b-0">
              <td className="truncate px-3 py-2 font-medium">{row[0]}</td>
              <td className="truncate px-3 py-2 text-muted-foreground">{row[1]}</td>
              <td className="truncate px-3 py-2 text-muted-foreground">{row[2] ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
