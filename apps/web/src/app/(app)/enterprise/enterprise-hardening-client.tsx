'use client';

import React, { useState } from 'react';
import {
  Activity,
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
import {
  documentTypes,
  enterpriseDmsSearchRefinerFieldKeys,
  matterTypes,
  type DocumentType,
  type EnterpriseBackupSnapshotListResponseDto,
  type EnterpriseComplianceEvidenceListResponseDto,
  type EnterpriseDmsMatterTemplateDto,
  type EnterpriseDmsMatterTemplateListResponseDto,
  type EnterpriseDmsSearchRefinerDto,
  type EnterpriseDmsSearchRefinerListResponseDto,
  type EnterpriseDmsTaxonomyDto,
  type EnterpriseDmsTaxonomyListResponseDto,
  type EnterpriseKeyReferenceListResponseDto,
  type EnterpriseReadinessSummaryDto,
  type EnterpriseSiemExportListResponseDto,
  type EnterpriseSsoProviderListResponseDto,
  type LocalAiOpsHealthDto,
  type LocalAiOpsMetricsDto,
  type MatterType,
  type SearchAdminHealthDto,
  type UpsertEnterpriseDmsMatterTemplateRequestDto,
  type UpsertEnterpriseDmsSearchRefinerRequestDto,
  type UpsertEnterpriseDmsTaxonomyRequestDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { DataTable, DataTableBody, DataTableCell, DataTableRow } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { getLocalAiOpsHealth, getLocalAiOpsMetrics } from '@/lib/api/ai-ops';
import {
  getEnterpriseReadiness,
  disableEnterpriseDmsMatterTemplate,
  disableEnterpriseDmsSearchRefiner,
  disableEnterpriseDmsTaxonomy,
  listEnterpriseDmsMatterTemplates,
  listEnterpriseDmsSearchRefiners,
  listEnterpriseDmsTaxonomies,
  listEnterpriseBackupSnapshots,
  listEnterpriseComplianceEvidence,
  listEnterpriseKeyReferences,
  listEnterpriseSiemExports,
  listEnterpriseSsoProviders,
  upsertEnterpriseDmsMatterTemplate,
  upsertEnterpriseDmsSearchRefiner,
  upsertEnterpriseDmsTaxonomy,
} from '@/lib/api/enterprise';
import {
  getSearchAdminHealth,
  requestTenantSearchReindex,
  type TenantSearchReindexResult,
} from '@/lib/api/search-admin';
import { useI18n, type Language } from '@/lib/i18n';

type Row = [string, string, string?];

const dmsConfigurationCardClassName = 'flex min-w-0 flex-col rounded-md border bg-background p-3';
const dmsConfigurationIntroClassName = 'min-h-[6.75rem]';
const dmsConfigurationRowsClassName = 'mt-3 flex min-h-[14rem] flex-1 flex-col';

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
    taxonomySave: string;
    templateSave: string;
    refinerSave: string;
    matterType: string;
    disable: string;
    documentTypeCode: string;
    documentTypeCodes: string;
    displayName: string;
    descriptionLabel: string;
    documentSets: string;
    subtypeCodes: string;
    metadataFields: string;
    fieldKey: string;
    fieldType: string;
    refinerSource: string;
    sortOrder: string;
    configurationSaved: string;
    activeConfiguration: string;
    templateGate: string;
    searchOps: string;
    searchOpsMeta: string;
    searchHealth: string;
    searchHealthMeta: string;
    currentVersions: string;
    indexedVersions: string;
    missingIndex: string;
    staleIndex: string;
    extractionReady: string;
    extractionPending: string;
    ocrPending: string;
    extractionFailed: string;
    staleChunks: string;
    staleEmbeddings: string;
    queryAudit24h: string;
    noResultQueries24h: string;
    p95SearchDuration: string;
    noResultRefs: string;
    queryHash: string;
    category: string;
    reindexTenant: string;
    reindexBusy: string;
    reindexAudit: string;
    reindexAccepted: string;
    reindexReady: string;
    contractRequired: string;
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
    opsHealth: string;
    opsHealthMeta: string;
    opsHealthScope: string;
    opsRuntime: string;
    opsMetrics: string;
    opsReady: string;
    opsDegraded: string;
    opsBlocked: string;
    queueBacklog: string;
    blockedPrep: string;
    p95Latency: string;
    endpointClass: string;
    endpointLoopback: string;
    endpointPrivate: string;
    endpointBlocked: string;
    prepCompleted: string;
    prepFailed: string;
    prepStale: string;
    prepRejected: string;
    prepFallback: string;
    staleRebuild: string;
    invalidOutput: string;
    citationExcluded: string;
    milliseconds: string;
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
    templatesMeta: 'Matter 유형별 승인된 문서 세트 계약',
    refiners: '검색 refiner',
    refinersMeta: '검색 가능한 메타데이터 필드',
    taxonomySave: 'Taxonomy 저장',
    templateSave: '템플릿 저장',
    refinerSave: 'Refiner 저장',
    matterType: 'Matter 유형',
    disable: '비활성화',
    documentTypeCode: '문서 유형 코드',
    documentTypeCodes: '문서 유형 코드',
    displayName: '표시 이름',
    descriptionLabel: '설명',
    documentSets: '문서 세트 키',
    subtypeCodes: '세부 유형 코드',
    metadataFields: '필수 메타데이터 필드',
    fieldKey: '필드 키',
    fieldType: '필드 유형',
    refinerSource: '출처',
    sortOrder: '정렬',
    configurationSaved: '구성 저장됨',
    activeConfiguration: '활성 구성',
    templateGate: '승인된 문서 세트 계약만 Matter 화면에 표시',
    searchOps: '검색 인덱스 운영',
    searchOpsMeta: '재색인 요청 및 감사 기록',
    searchHealth: '검색 헬스',
    searchHealthMeta: '인덱스, 추출/OCR, 검색 감사 집계',
    currentVersions: '현재 버전',
    indexedVersions: '색인됨',
    missingIndex: '인덱스 누락',
    staleIndex: '인덱스 재처리 필요',
    extractionReady: '본문 검색 가능',
    extractionPending: '추출 대기',
    ocrPending: 'OCR 대기',
    extractionFailed: '추출 실패',
    staleChunks: '재생성 필요 청크',
    staleEmbeddings: '재생성 필요 임베딩',
    queryAudit24h: '24시간 검색',
    noResultQueries24h: '24시간 무결과',
    p95SearchDuration: '검색 P95',
    noResultRefs: '무결과 해시 참조',
    queryHash: '해시 참조',
    category: '분류',
    reindexTenant: '전체 재색인 요청',
    reindexBusy: '요청 중',
    reindexAudit: '감사 기록 대상',
    reindexAccepted: '재색인 큐 등록',
    reindexReady: '요청 전',
    contractRequired: '계약 필요',
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
    opsHealth: '운영 헬스',
    opsHealthMeta: '검색, 감사, 파일 정리 준비 상태',
    opsHealthScope: '표시 범위는 업로드 후 파일 정리 준비 전용 상태와 운영 신호로 제한됩니다.',
    opsRuntime: '파일 정리 준비 런타임',
    opsMetrics: '파일 정리 준비 지표',
    opsReady: '정상',
    opsDegraded: '주의 필요',
    opsBlocked: '차단',
    queueBacklog: '대기열',
    blockedPrep: '차단/실패',
    p95Latency: 'P95 처리 시간',
    endpointClass: '실행 위치',
    endpointLoopback: '서버 내부',
    endpointPrivate: '사설망',
    endpointBlocked: '차단됨',
    prepCompleted: '정리됨',
    prepFailed: '실패',
    prepStale: '재정리 필요',
    prepRejected: '폐기됨',
    prepFallback: '대체 정리',
    staleRebuild: '재정리 대기',
    invalidOutput: '검증 실패',
    citationExcluded: '참조 제외',
    milliseconds: 'ms',
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
    templatesMeta: 'Approved document-set contracts by Matter type',
    refiners: 'Search refiners',
    refinersMeta: 'Queryable metadata fields',
    taxonomySave: 'Save taxonomy',
    templateSave: 'Save template',
    refinerSave: 'Save refiner',
    matterType: 'Matter type',
    disable: 'Disable',
    documentTypeCode: 'Document type code',
    documentTypeCodes: 'Document type codes',
    displayName: 'Display name',
    descriptionLabel: 'Description',
    documentSets: 'Document set keys',
    subtypeCodes: 'Subtype codes',
    metadataFields: 'Required metadata fields',
    fieldKey: 'Field key',
    fieldType: 'Field type',
    refinerSource: 'Source',
    sortOrder: 'Sort',
    configurationSaved: 'Configuration saved',
    activeConfiguration: 'Active configuration',
    templateGate: 'Only approved document-set contracts appear on Matter screens',
    searchOps: 'Search index operations',
    searchOpsMeta: 'Reindex request and audit trail',
    searchHealth: 'Search health',
    searchHealthMeta: 'Index, extraction/OCR, and search audit aggregates',
    currentVersions: 'Current versions',
    indexedVersions: 'Indexed',
    missingIndex: 'Missing index',
    staleIndex: 'Needs reindex',
    extractionReady: 'Body searchable',
    extractionPending: 'Extraction pending',
    ocrPending: 'OCR pending',
    extractionFailed: 'Extraction failed',
    staleChunks: 'Stale chunks',
    staleEmbeddings: 'Stale embeddings',
    queryAudit24h: '24h searches',
    noResultQueries24h: '24h no results',
    p95SearchDuration: 'Search P95',
    noResultRefs: 'No-result hash refs',
    queryHash: 'Hash ref',
    category: 'Category',
    reindexTenant: 'Request tenant reindex',
    reindexBusy: 'Requesting',
    reindexAudit: 'Audited operation',
    reindexAccepted: 'Reindex queued',
    reindexReady: 'Ready',
    contractRequired: 'Contract required',
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
    opsHealth: 'Operations health',
    opsHealthMeta: 'Search, audit, and file organization prep status',
    opsHealthScope:
      'This surface is limited to post-upload file organization prep status and operational signals.',
    opsRuntime: 'File organization prep runtime',
    opsMetrics: 'File organization prep metrics',
    opsReady: 'Ready',
    opsDegraded: 'Needs attention',
    opsBlocked: 'Blocked',
    queueBacklog: 'Queue backlog',
    blockedPrep: 'Blocked or failed',
    p95Latency: 'P95 processing time',
    endpointClass: 'Execution location',
    endpointLoopback: 'Server-local',
    endpointPrivate: 'Private network',
    endpointBlocked: 'Blocked',
    prepCompleted: 'Prepared',
    prepFailed: 'Failed',
    prepStale: 'Needs refresh',
    prepRejected: 'Discarded',
    prepFallback: 'Fallback prep',
    staleRebuild: 'Refresh queued',
    invalidOutput: 'Validation failed',
    citationExcluded: 'Reference excluded',
    milliseconds: 'ms',
  },
};

export function EnterpriseHardeningClient({ children }: { children?: React.ReactNode }) {
  const { language } = useI18n();
  const copy = enterpriseCopy[language];
  const [providers, setProviders] = useState<EnterpriseSsoProviderListResponseDto | null>(null);
  const [keys, setKeys] = useState<EnterpriseKeyReferenceListResponseDto | null>(null);
  const [exports, setExports] = useState<EnterpriseSiemExportListResponseDto | null>(null);
  const [snapshots, setSnapshots] = useState<EnterpriseBackupSnapshotListResponseDto | null>(null);
  const [evidence, setEvidence] = useState<EnterpriseComplianceEvidenceListResponseDto | null>(
    null,
  );
  const [taxonomies, setTaxonomies] = useState<EnterpriseDmsTaxonomyListResponseDto | null>(null);
  const [templates, setTemplates] = useState<EnterpriseDmsMatterTemplateListResponseDto | null>(
    null,
  );
  const [refiners, setRefiners] = useState<EnterpriseDmsSearchRefinerListResponseDto | null>(null);
  const [readiness, setReadiness] = useState<EnterpriseReadinessSummaryDto | null>(null);
  const [aiOpsHealth, setAiOpsHealth] = useState<LocalAiOpsHealthDto | null>(null);
  const [aiOpsMetrics, setAiOpsMetrics] = useState<LocalAiOpsMetricsDto | null>(null);
  const [searchHealth, setSearchHealth] = useState<SearchAdminHealthDto | null>(null);
  const [reindexResult, setReindexResult] = useState<TenantSearchReindexResult | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [reindexBusy, setReindexBusy] = useState(false);
  const [dmsConfigStatus, setDmsConfigStatus] = useState<string | null>(null);
  const [dmsConfigError, setDmsConfigError] = useState<string | null>(null);
  const [dmsConfigBusy, setDmsConfigBusy] = useState(false);
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
    const [
      nextProviders,
      nextKeys,
      nextExports,
      nextSnapshots,
      nextEvidence,
      nextTaxonomies,
      nextTemplates,
      nextRefiners,
      nextReadiness,
      nextAiOpsHealth,
      nextAiOpsMetrics,
      nextSearchHealth,
    ] = await Promise.all([
      run(() => listEnterpriseSsoProviders()),
      run(() => listEnterpriseKeyReferences()),
      run(() => listEnterpriseSiemExports()),
      run(() => listEnterpriseBackupSnapshots()),
      run(() => listEnterpriseComplianceEvidence()),
      run(() => listEnterpriseDmsTaxonomies()),
      run(() => listEnterpriseDmsMatterTemplates()),
      run(() => listEnterpriseDmsSearchRefiners()),
      run(() => getEnterpriseReadiness()),
      run(() => getLocalAiOpsHealth()),
      run(() => getLocalAiOpsMetrics()),
      run(() => getSearchAdminHealth()),
    ]);
    if (nextProviders) setProviders(nextProviders);
    if (nextKeys) setKeys(nextKeys);
    if (nextExports) setExports(nextExports);
    if (nextSnapshots) setSnapshots(nextSnapshots);
    if (nextEvidence) setEvidence(nextEvidence);
    if (nextTaxonomies) setTaxonomies(nextTaxonomies);
    if (nextTemplates) setTemplates(nextTemplates);
    if (nextRefiners) setRefiners(nextRefiners);
    if (nextReadiness) setReadiness(nextReadiness);
    if (nextAiOpsHealth) setAiOpsHealth(nextAiOpsHealth);
    if (nextAiOpsMetrics) setAiOpsMetrics(nextAiOpsMetrics);
    if (nextSearchHealth) setSearchHealth(nextSearchHealth);
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

  async function saveTaxonomy(input: UpsertEnterpriseDmsTaxonomyRequestDto) {
    setDmsConfigBusy(true);
    setDmsConfigError(null);
    setDmsConfigStatus(null);
    try {
      const saved = await upsertEnterpriseDmsTaxonomy(input);
      setTaxonomies((current) => mergeTaxonomy(current, saved));
      setDmsConfigStatus(copy.configurationSaved);
    } catch (caught) {
      setDmsConfigError(safeApiErrorMessage(caught));
    } finally {
      setDmsConfigBusy(false);
    }
  }

  async function disableTaxonomy(taxonomyId: string) {
    setDmsConfigBusy(true);
    setDmsConfigError(null);
    setDmsConfigStatus(null);
    try {
      const saved = await disableEnterpriseDmsTaxonomy(taxonomyId);
      setTaxonomies((current) => mergeTaxonomy(current, saved));
      setDmsConfigStatus(copy.configurationSaved);
    } catch (caught) {
      setDmsConfigError(safeApiErrorMessage(caught));
    } finally {
      setDmsConfigBusy(false);
    }
  }

  async function saveTemplate(input: UpsertEnterpriseDmsMatterTemplateRequestDto) {
    setDmsConfigBusy(true);
    setDmsConfigError(null);
    setDmsConfigStatus(null);
    try {
      const saved = await upsertEnterpriseDmsMatterTemplate(input);
      setTemplates((current) => mergeTemplate(current, saved));
      setDmsConfigStatus(copy.configurationSaved);
    } catch (caught) {
      setDmsConfigError(safeApiErrorMessage(caught));
    } finally {
      setDmsConfigBusy(false);
    }
  }

  async function disableTemplate(templateId: string) {
    setDmsConfigBusy(true);
    setDmsConfigError(null);
    setDmsConfigStatus(null);
    try {
      const saved = await disableEnterpriseDmsMatterTemplate(templateId);
      setTemplates((current) => mergeTemplate(current, saved));
      setDmsConfigStatus(copy.configurationSaved);
    } catch (caught) {
      setDmsConfigError(safeApiErrorMessage(caught));
    } finally {
      setDmsConfigBusy(false);
    }
  }

  async function saveRefiner(input: UpsertEnterpriseDmsSearchRefinerRequestDto) {
    setDmsConfigBusy(true);
    setDmsConfigError(null);
    setDmsConfigStatus(null);
    try {
      const saved = await upsertEnterpriseDmsSearchRefiner(input);
      setRefiners((current) => mergeRefiner(current, saved));
      setDmsConfigStatus(copy.configurationSaved);
    } catch (caught) {
      setDmsConfigError(safeApiErrorMessage(caught));
    } finally {
      setDmsConfigBusy(false);
    }
  }

  async function disableRefiner(refinerId: string) {
    setDmsConfigBusy(true);
    setDmsConfigError(null);
    setDmsConfigStatus(null);
    try {
      const saved = await disableEnterpriseDmsSearchRefiner(refinerId);
      setRefiners((current) => mergeRefiner(current, saved));
      setDmsConfigStatus(copy.configurationSaved);
    } catch (caught) {
      setDmsConfigError(safeApiErrorMessage(caught));
    } finally {
      setDmsConfigBusy(false);
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
      {error ? (
        <EmptyState variant="api-error" title={error} className="items-start text-left" />
      ) : null}

      {children}

      <AdminDmsConfigurationPanel
        busy={dmsConfigBusy}
        copy={copy}
        error={dmsConfigError}
        onDisableRefiner={(refinerId) => void disableRefiner(refinerId)}
        onDisableTemplate={(templateId) => void disableTemplate(templateId)}
        onDisableTaxonomy={(taxonomyId) => void disableTaxonomy(taxonomyId)}
        onSaveRefiner={(input) => void saveRefiner(input)}
        onSaveTemplate={(input) => void saveTemplate(input)}
        onSaveTaxonomy={(input) => void saveTaxonomy(input)}
        refiners={refiners}
        status={dmsConfigStatus}
        templates={templates}
        taxonomies={taxonomies}
      />
      <AdminSearchOperationsPanel
        busy={reindexBusy}
        copy={copy}
        error={reindexError}
        health={searchHealth}
        onRequest={() => void requestReindex()}
        result={reindexResult}
      />
      <AdminOpsHealthPanel copy={copy} health={aiOpsHealth} metrics={aiOpsMetrics} />

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

export function AdminOpsHealthPanel({
  copy,
  health,
  metrics,
}: {
  copy: (typeof enterpriseCopy)[Language];
  health: LocalAiOpsHealthDto | null;
  metrics: LocalAiOpsMetricsDto | null;
}) {
  return (
    <SectionCard
      icon={<Activity className="h-4 w-4" />}
      title={copy.opsHealth}
      meta={copy.opsHealthMeta}
      actions={
        <StatusBadge tone={health ? localAiOpsTone(health.status) : 'neutral'}>
          {health ? localAiOpsStatusLabel(copy, health.status) : copy.reindexReady}
        </StatusBadge>
      }
    >
      <p className="text-sm leading-6 text-muted-foreground">{copy.opsHealthScope}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border bg-background p-3">
          <h3 className="text-sm font-semibold tracking-normal">{copy.opsRuntime}</h3>
          {health ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Value
                label={copy.queueBacklog}
                value={`${health.queueBacklogCount} ${copy.count}`}
              />
              <Value label={copy.blockedPrep} value={`${health.blockedPrepCount} ${copy.count}`} />
              <Value label={copy.p95Latency} value={formatLatency(copy, health.p95LatencyMs)} />
              <Value
                label={copy.endpointClass}
                value={endpointClassLabel(copy, health.endpointClass)}
              />
            </dl>
          ) : (
            <Unavailable copy={copy} />
          )}
        </div>
        <div className="rounded-md border bg-background p-3">
          <h3 className="text-sm font-semibold tracking-normal">{copy.opsMetrics}</h3>
          {metrics ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Value
                label={copy.prepCompleted}
                value={`${metrics.prepCompletedCount} ${copy.count}`}
              />
              <Value label={copy.prepFailed} value={`${metrics.prepFailedCount} ${copy.count}`} />
              <Value label={copy.prepStale} value={`${metrics.prepStaleCount} ${copy.count}`} />
              <Value
                label={copy.prepRejected}
                value={`${metrics.prepRejectedCount} ${copy.count}`}
              />
              <Value
                label={copy.prepFallback}
                value={`${metrics.prepFallbackCount} ${copy.count}`}
              />
              <Value
                label={copy.staleRebuild}
                value={`${metrics.staleRebuildCount} ${copy.count}`}
              />
              <Value
                label={copy.invalidOutput}
                value={`${metrics.invalidOutputCount} ${copy.count}`}
              />
              <Value
                label={copy.citationExcluded}
                value={`${metrics.citationRejectedCount} ${copy.count}`}
              />
              <Value
                label={copy.p95Latency}
                value={formatLatency(copy, metrics.p95PrepLatencyMs)}
              />
            </dl>
          ) : (
            <Unavailable copy={copy} />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function localAiOpsTone(status: LocalAiOpsHealthDto['status']) {
  if (status === 'ready') return 'success';
  if (status === 'degraded') return 'warning';
  return 'blocked';
}

function localAiOpsStatusLabel(
  copy: (typeof enterpriseCopy)[Language],
  status: LocalAiOpsHealthDto['status'],
): string {
  if (status === 'ready') return copy.opsReady;
  if (status === 'degraded') return copy.opsDegraded;
  return copy.opsBlocked;
}

function endpointClassLabel(
  copy: (typeof enterpriseCopy)[Language],
  endpointClass: LocalAiOpsHealthDto['endpointClass'],
): string {
  if (endpointClass === 'loopback') return copy.endpointLoopback;
  if (endpointClass === 'private_network') return copy.endpointPrivate;
  return copy.endpointBlocked;
}

function formatLatency(copy: (typeof enterpriseCopy)[Language], value: number | null): string {
  return value === null ? copy.notPassed : `${value} ${copy.milliseconds}`;
}

function AdminSearchOperationsPanel({
  busy,
  copy,
  error,
  health,
  onRequest,
  result,
}: {
  busy: boolean;
  copy: (typeof enterpriseCopy)[Language];
  error: string | null;
  health: SearchAdminHealthDto | null;
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
            권한이 있는 운영자만 전체 검색 인덱스 재처리를 요청할 수 있습니다. 요청은 감사 기록과 큐
            등록 수로만 확인합니다.
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
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-md border bg-background p-3">
          <h3 className="text-sm font-semibold tracking-normal">{copy.searchHealth}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.searchHealthMeta}</p>
          {health ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Value
                label={copy.currentVersions}
                value={`${health.currentVersionCount} ${copy.count}`}
              />
              <Value
                label={copy.indexedVersions}
                value={`${health.indexedVersionCount} ${copy.count}`}
              />
              <Value
                label={copy.missingIndex}
                value={`${health.missingIndexCount} ${copy.count}`}
              />
              <Value label={copy.staleIndex} value={`${health.staleIndexCount} ${copy.count}`} />
              <Value
                label={copy.extractionReady}
                value={`${health.extractionReadyCount} ${copy.count}`}
              />
              <Value
                label={copy.extractionPending}
                value={`${health.extractionPendingCount} ${copy.count}`}
              />
              <Value label={copy.ocrPending} value={`${health.ocrPendingCount} ${copy.count}`} />
              <Value
                label={copy.extractionFailed}
                value={`${health.extractionFailedCount} ${copy.count}`}
              />
              <Value label={copy.staleChunks} value={`${health.staleChunkCount} ${copy.count}`} />
              <Value
                label={copy.staleEmbeddings}
                value={`${health.staleEmbeddingCount} ${copy.count}`}
              />
              <Value
                label={copy.queryAudit24h}
                value={`${health.queryAuditCount24h} ${copy.count}`}
              />
              <Value
                label={copy.noResultQueries24h}
                value={`${health.noResultQueryCount24h} ${copy.count}`}
              />
              <Value
                label={copy.p95SearchDuration}
                value={formatLatency(copy, health.p95DurationMs24h)}
              />
            </dl>
          ) : (
            <Unavailable copy={copy} />
          )}
        </div>
        <div className="rounded-md border bg-background p-3">
          <h3 className="text-sm font-semibold tracking-normal">{copy.noResultRefs}</h3>
          {health?.noResultQueries.length ? (
            <DataTable caption={copy.noResultRefs} minWidthClassName="min-w-[420px]">
              <DataTableBody>
                {health.noResultQueries.map((item) => (
                  <DataTableRow key={`${item.queryHash}-${item.category}`}>
                    <DataTableCell className="font-medium">{item.category}</DataTableCell>
                    <DataTableCell className="font-mono text-xs text-muted-foreground">
                      {item.queryHash.slice(0, 12)}
                    </DataTableCell>
                    <DataTableCell className="text-muted-foreground">
                      {item.count} {copy.count}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          ) : health ? (
            <EmptyState variant="no-data" title={copy.noRecords} />
          ) : (
            <Unavailable copy={copy} />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function AdminDmsConfigurationPanel({
  busy,
  copy,
  error,
  onDisableRefiner,
  onDisableTemplate,
  onDisableTaxonomy,
  onSaveRefiner,
  onSaveTemplate,
  onSaveTaxonomy,
  refiners,
  status,
  templates,
  taxonomies,
}: {
  busy: boolean;
  copy: (typeof enterpriseCopy)[Language];
  error: string | null;
  onDisableRefiner: (refinerId: string) => void;
  onDisableTemplate: (templateId: string) => void;
  onDisableTaxonomy: (taxonomyId: string) => void;
  onSaveRefiner: (input: UpsertEnterpriseDmsSearchRefinerRequestDto) => void;
  onSaveTemplate: (input: UpsertEnterpriseDmsMatterTemplateRequestDto) => void;
  onSaveTaxonomy: (input: UpsertEnterpriseDmsTaxonomyRequestDto) => void;
  refiners: EnterpriseDmsSearchRefinerListResponseDto | null;
  status: string | null;
  templates: EnterpriseDmsMatterTemplateListResponseDto | null;
  taxonomies: EnterpriseDmsTaxonomyListResponseDto | null;
}) {
  const [taxonomyTypeCode, setTaxonomyTypeCode] = useState('');
  const [taxonomyDisplayName, setTaxonomyDisplayName] = useState('');
  const [taxonomyDescription, setTaxonomyDescription] = useState('');
  const [taxonomySubtypeCodes, setTaxonomySubtypeCodes] = useState('');
  const [taxonomyMetadataFields, setTaxonomyMetadataFields] = useState('');
  const [templateMatterType, setTemplateMatterType] = useState<MatterType>('advisory');
  const [templateDisplayName, setTemplateDisplayName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateDocumentSets, setTemplateDocumentSets] = useState('');
  const [templateDocumentTypes, setTemplateDocumentTypes] = useState('contract');
  const [refinerFieldKey, setRefinerFieldKey] =
    useState<UpsertEnterpriseDmsSearchRefinerRequestDto['fieldKey']>('document_type');
  const [refinerDisplayName, setRefinerDisplayName] = useState('');
  const [refinerFieldType, setRefinerFieldType] =
    useState<UpsertEnterpriseDmsSearchRefinerRequestDto['fieldType']>('text');
  const [refinerSource, setRefinerSource] =
    useState<UpsertEnterpriseDmsSearchRefinerRequestDto['source']>('document_profile');
  const [refinerSortOrder, setRefinerSortOrder] = useState('100');

  function submitTaxonomy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveTaxonomy({
      documentTypeCode: taxonomyTypeCode,
      displayName: taxonomyDisplayName,
      description: taxonomyDescription.trim() || undefined,
      subtypes: splitInput(taxonomySubtypeCodes).map((subtypeCode) => ({
        subtypeCode,
        displayName: labelFromKey(subtypeCode),
        status: 'active',
      })),
      metadataFields: splitInput(taxonomyMetadataFields).map((fieldKey) => ({
        fieldKey: fieldKey.toLowerCase(),
        displayName: labelFromKey(fieldKey),
        fieldType: 'text',
        required: true,
        searchable: true,
        refinable: true,
      })),
    });
  }

  function submitTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const documentTypeCodes = parseDocumentTypeCodes(templateDocumentTypes);
    onSaveTemplate({
      matterType: templateMatterType,
      displayName: templateDisplayName,
      description: templateDescription.trim() || undefined,
      documentSets: splitInput(templateDocumentSets).map((setKey, index) => ({
        setKey: setKey.toLowerCase(),
        displayName: labelFromKey(setKey),
        documentTypeCodes,
        required: index === 0,
        sortOrder: (index + 1) * 10,
      })),
    });
  }

  function submitRefiner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveRefiner({
      fieldKey: refinerFieldKey,
      displayName: refinerDisplayName,
      fieldType: refinerFieldType,
      source: refinerSource,
      sortOrder: Number(refinerSortOrder || '100'),
      searchable: true,
      refinable: true,
      filterable: true,
    });
  }

  return (
    <SectionCard
      icon={<FileCog className="h-4 w-4" />}
      title={copy.dmsConfiguration}
      meta={copy.dmsConfigurationMeta}
    >
      {error ? (
        <p className="mb-3 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="mb-3 text-sm font-medium text-primary" role="status">
          {status}
        </p>
      ) : null}
      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <div className={dmsConfigurationCardClassName}>
          <div className={dmsConfigurationIntroClassName}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileCog className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-semibold text-foreground">
                  {copy.taxonomy}
                </span>
              </div>
              <StatusBadge>{copy.activeConfiguration}</StatusBadge>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{copy.taxonomyMeta}</p>
          </div>
          <form className="mt-3 grid gap-2" onSubmit={submitTaxonomy}>
            <Input
              aria-label={copy.documentTypeCode}
              placeholder={copy.documentTypeCode}
              value={taxonomyTypeCode}
              onChange={(event) => setTaxonomyTypeCode(event.target.value)}
              disabled={busy}
              required
            />
            <Input
              aria-label={copy.displayName}
              placeholder={copy.displayName}
              value={taxonomyDisplayName}
              onChange={(event) => setTaxonomyDisplayName(event.target.value)}
              disabled={busy}
              required
            />
            <Input
              aria-label={copy.descriptionLabel}
              placeholder={copy.descriptionLabel}
              value={taxonomyDescription}
              onChange={(event) => setTaxonomyDescription(event.target.value)}
              disabled={busy}
            />
            <Input
              aria-label={copy.subtypeCodes}
              placeholder={copy.subtypeCodes}
              value={taxonomySubtypeCodes}
              onChange={(event) => setTaxonomySubtypeCodes(event.target.value)}
              disabled={busy}
            />
            <Input
              aria-label={copy.metadataFields}
              placeholder={copy.metadataFields}
              value={taxonomyMetadataFields}
              onChange={(event) => setTaxonomyMetadataFields(event.target.value)}
              disabled={busy}
            />
            <Button className="w-full justify-center" type="submit" disabled={busy}>
              <FileCog className="h-4 w-4" />
              {copy.taxonomySave}
            </Button>
          </form>
          <div className={dmsConfigurationRowsClassName}>
            <DmsTaxonomyRows
              copy={copy}
              onDisable={onDisableTaxonomy}
              taxonomies={taxonomies}
              busy={busy}
            />
          </div>
        </div>
        <div className={dmsConfigurationCardClassName}>
          <div className={dmsConfigurationIntroClassName}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <FolderKanban className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-semibold text-foreground">
                  {copy.templates}
                </span>
              </div>
              <StatusBadge>{copy.activeConfiguration}</StatusBadge>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{copy.templatesMeta}</p>
            <p className="mt-2 text-[12px] font-medium leading-5 text-muted-foreground">
              {copy.templateGate}
            </p>
          </div>
          <form className="mt-3 grid gap-2" onSubmit={submitTemplate}>
            <select
              aria-label={copy.matterType}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={templateMatterType}
              onChange={(event) => setTemplateMatterType(event.target.value as MatterType)}
              disabled={busy}
            >
              {matterTypes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <Input
              aria-label={copy.displayName}
              placeholder={copy.displayName}
              value={templateDisplayName}
              onChange={(event) => setTemplateDisplayName(event.target.value)}
              disabled={busy}
              required
            />
            <Input
              aria-label={copy.descriptionLabel}
              placeholder={copy.descriptionLabel}
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              disabled={busy}
            />
            <Input
              aria-label={copy.documentSets}
              placeholder={copy.documentSets}
              value={templateDocumentSets}
              onChange={(event) => setTemplateDocumentSets(event.target.value)}
              disabled={busy}
              required
            />
            <Input
              aria-label={copy.documentTypeCodes}
              placeholder={copy.documentTypeCodes}
              value={templateDocumentTypes}
              onChange={(event) => setTemplateDocumentTypes(event.target.value)}
              disabled={busy}
              required
            />
            <Button className="w-full justify-center" type="submit" disabled={busy}>
              <FolderKanban className="h-4 w-4" />
              {copy.templateSave}
            </Button>
          </form>
          <div className={dmsConfigurationRowsClassName}>
            <DmsTemplateRows
              busy={busy}
              copy={copy}
              onDisable={onDisableTemplate}
              templates={templates}
            />
          </div>
        </div>
        <div className={dmsConfigurationCardClassName}>
          <div className={dmsConfigurationIntroClassName}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <SearchCheck className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-semibold text-foreground">
                  {copy.refiners}
                </span>
              </div>
              <StatusBadge>{copy.activeConfiguration}</StatusBadge>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{copy.refinersMeta}</p>
          </div>
          <form className="mt-3 grid gap-2" onSubmit={submitRefiner}>
            <select
              aria-label={copy.fieldKey}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={refinerFieldKey}
              onChange={(event) =>
                setRefinerFieldKey(
                  event.target.value as UpsertEnterpriseDmsSearchRefinerRequestDto['fieldKey'],
                )
              }
              disabled={busy}
              required
            >
              {enterpriseDmsSearchRefinerFieldKeys.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <Input
              aria-label={copy.displayName}
              placeholder={copy.displayName}
              value={refinerDisplayName}
              onChange={(event) => setRefinerDisplayName(event.target.value)}
              disabled={busy}
              required
            />
            <select
              aria-label={copy.fieldType}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={refinerFieldType}
              onChange={(event) =>
                setRefinerFieldType(
                  event.target.value as UpsertEnterpriseDmsSearchRefinerRequestDto['fieldType'],
                )
              }
              disabled={busy}
            >
              {['text', 'date', 'user', 'matter', 'boolean', 'number', 'select'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label={copy.refinerSource}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={refinerSource}
              onChange={(event) =>
                setRefinerSource(
                  event.target.value as UpsertEnterpriseDmsSearchRefinerRequestDto['source'],
                )
              }
              disabled={busy}
            >
              {['document_profile', 'matter_profile', 'records', 'system'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <Input
              aria-label={copy.sortOrder}
              placeholder={copy.sortOrder}
              type="number"
              min={0}
              max={999}
              value={refinerSortOrder}
              onChange={(event) => setRefinerSortOrder(event.target.value)}
              disabled={busy}
            />
            <Button className="w-full justify-center" type="submit" disabled={busy}>
              <SearchCheck className="h-4 w-4" />
              {copy.refinerSave}
            </Button>
          </form>
          <div className={dmsConfigurationRowsClassName}>
            <DmsRefinerRows
              copy={copy}
              onDisable={onDisableRefiner}
              refiners={refiners}
              busy={busy}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function DmsTaxonomyRows({
  busy,
  copy,
  onDisable,
  taxonomies,
}: {
  busy: boolean;
  copy: (typeof enterpriseCopy)[Language];
  onDisable: (taxonomyId: string) => void;
  taxonomies: EnterpriseDmsTaxonomyListResponseDto | null;
}) {
  if (!taxonomies) return <Unavailable className="flex-1" copy={copy} />;
  if (taxonomies.taxonomies.length === 0) {
    return <EmptyState variant="no-data" title={copy.noRecords} className="flex-1" />;
  }
  return (
    <DataTable caption={copy.taxonomy} minWidthClassName="min-w-[520px]">
      <DataTableBody>
        {taxonomies.taxonomies.map((item) => (
          <DataTableRow key={item.taxonomyId}>
            <DataTableCell className="font-medium">{item.documentTypeCode}</DataTableCell>
            <DataTableCell className="text-muted-foreground">{item.displayName}</DataTableCell>
            <DataTableCell className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">v{item.versionNo}</span>
              {item.lastAuditEventRef ? (
                <span className="block">{item.lastAuditEventRef}</span>
              ) : null}
            </DataTableCell>
            <DataTableCell>
              <StatusBadge tone={item.status === 'active' ? 'success' : 'neutral'}>
                {item.status === 'active' ? copy.active : copy.inactive}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell className="text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || item.status === 'disabled'}
                onClick={() => onDisable(item.taxonomyId)}
              >
                {copy.disable}
              </Button>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

function DmsTemplateRows({
  busy,
  copy,
  onDisable,
  templates,
}: {
  busy: boolean;
  copy: (typeof enterpriseCopy)[Language];
  onDisable: (templateId: string) => void;
  templates: EnterpriseDmsMatterTemplateListResponseDto | null;
}) {
  if (!templates) return <Unavailable className="flex-1" copy={copy} />;
  if (templates.templates.length === 0) {
    return <EmptyState variant="no-data" title={copy.noRecords} className="flex-1" />;
  }
  return (
    <DataTable caption={copy.templates} minWidthClassName="min-w-[520px]">
      <DataTableBody>
        {templates.templates.map((item) => (
          <DataTableRow key={item.templateId}>
            <DataTableCell className="font-medium">{item.matterType}</DataTableCell>
            <DataTableCell className="text-muted-foreground">{item.displayName}</DataTableCell>
            <DataTableCell className="text-xs text-muted-foreground">
              {item.documentSets.length} {copy.count}
            </DataTableCell>
            <DataTableCell>
              <StatusBadge tone={item.status === 'active' ? 'success' : 'neutral'}>
                {item.status === 'active' ? copy.active : copy.inactive}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell className="text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || item.status === 'disabled'}
                onClick={() => onDisable(item.templateId)}
              >
                {copy.disable}
              </Button>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

function DmsRefinerRows({
  busy,
  copy,
  onDisable,
  refiners,
}: {
  busy: boolean;
  copy: (typeof enterpriseCopy)[Language];
  onDisable: (refinerId: string) => void;
  refiners: EnterpriseDmsSearchRefinerListResponseDto | null;
}) {
  if (!refiners) return <Unavailable className="flex-1" copy={copy} />;
  if (refiners.refiners.length === 0) {
    return <EmptyState variant="no-data" title={copy.noRecords} className="flex-1" />;
  }
  return (
    <DataTable caption={copy.refiners} minWidthClassName="min-w-[520px]">
      <DataTableBody>
        {refiners.refiners.map((item) => (
          <DataTableRow key={item.refinerId}>
            <DataTableCell className="font-medium">{item.fieldKey}</DataTableCell>
            <DataTableCell className="text-muted-foreground">{item.displayName}</DataTableCell>
            <DataTableCell>
              <StatusBadge tone={item.status === 'active' ? 'success' : 'neutral'}>
                {item.status === 'active' ? copy.active : copy.inactive}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell className="text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || item.status === 'disabled'}
                onClick={() => onDisable(item.refinerId)}
              >
                {copy.disable}
              </Button>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

function mergeTaxonomy(
  current: EnterpriseDmsTaxonomyListResponseDto | null,
  saved: EnterpriseDmsTaxonomyDto,
): EnterpriseDmsTaxonomyListResponseDto {
  const existing = current?.taxonomies ?? [];
  const withoutSaved = existing.filter((item) => item.taxonomyId !== saved.taxonomyId);
  return {
    taxonomies: [...withoutSaved, saved].sort((left, right) =>
      left.documentTypeCode.localeCompare(right.documentTypeCode),
    ),
  };
}

function mergeTemplate(
  current: EnterpriseDmsMatterTemplateListResponseDto | null,
  saved: EnterpriseDmsMatterTemplateDto,
): EnterpriseDmsMatterTemplateListResponseDto {
  const existing = current?.templates ?? [];
  const withoutSaved = existing.filter((item) => item.templateId !== saved.templateId);
  return {
    templates: [...withoutSaved, saved].sort((left, right) =>
      left.matterType.localeCompare(right.matterType),
    ),
  };
}

function mergeRefiner(
  current: EnterpriseDmsSearchRefinerListResponseDto | null,
  saved: EnterpriseDmsSearchRefinerDto,
): EnterpriseDmsSearchRefinerListResponseDto {
  const existing = current?.refiners ?? [];
  const withoutSaved = existing.filter((item) => item.refinerId !== saved.refinerId);
  return {
    refiners: [...withoutSaved, saved].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.fieldKey.localeCompare(right.fieldKey);
    }),
  };
}

function splitInput(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseDocumentTypeCodes(value: string): DocumentType[] {
  const requested = splitInput(value);
  return requested.filter((item): item is DocumentType =>
    (documentTypes as readonly string[]).includes(item),
  );
}

function labelFromKey(value: string): string {
  return value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
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
      {rows ? (
        <Rows caption={title} empty={empty} rows={rows} />
      ) : (
        <Unavailable copy={unavailableCopy} />
      )}
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

function Unavailable({
  className,
  copy,
}: {
  className?: string;
  copy: (typeof enterpriseCopy)[Language];
}) {
  return (
    <EmptyState
      className={className}
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
