'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileSearch,
  FileText,
  History,
  Link2,
  Mail,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AddDocumentVersionResponseDto,
  AiPrepDocumentStatusDto,
  DocumentAuditEventDto,
  DocumentConfidentialityLevel,
  DocumentDownloadReasonCode,
  DocumentDto,
  DocumentEditPackageDto,
  DocumentEditSessionDto,
  DocumentNativeEditDraftDto,
  EnterpriseApprovedDmsTaxonomyDto,
  DocumentType,
  DocumentSubversionDto,
  DocumentSubversionReviewDecision,
  DocumentSubversionReviewDto,
  DocumentSubversionReviewerDto,
  DocumentSubversionStatus,
  DocumentSubversionVisibilityScope,
  DocumentVersionDto,
  EmailMatterFilingDto,
  OrgDirectorySubjectDto,
  SearchTarget,
} from '@amic-vault/shared';
import {
  documentConfidentialityLevels,
  documentDownloadReasonCodes,
} from '@amic-vault/shared';
import { AiPrepStatusPanel } from '@/components/ai/ai-prep-status-panel';
import { OrgSubjectPicker } from '@/components/access/org-subject-picker';
import { DocumentAuditTimeline } from '@/components/document/document-audit-timeline';
import {
  DocumentGovernanceContextPanel,
  DocumentWorkflowOpsPanel,
} from '@/components/governance/governance-context-panel';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import {
  addDocumentVersion,
  ApiClientError,
  assignDocumentSubversionReviewer,
  cancelDocumentEditSession,
  checkInDocumentEditSession,
  createDocumentEditSession,
  documentEditBaseFileUrl,
  documentDownloadUrl,
  documentPreviewUrl,
  documentSubversionFileUrl,
  getActiveDocumentEditSession,
  getDocument,
  getDocumentEditPackage,
  getNativeDocumentEditDraft,
  listDocumentVersions,
  listDocumentSubversionReviews,
  listDocumentSubversionReviewers,
  listDocumentSubversions,
  listMatterEmailTimeline,
  listMatterDocuments,
  promoteDocumentSubversion,
  revokeDocumentSubversionReviewer,
  saveDocumentSubversion,
  saveNativeDocumentEditDraft,
  submitDocumentSubversionReview,
  updateDocumentMetadata,
} from '@/lib/api-client';
import { getDocumentAiPrepStatus } from '@/lib/api/ai-prep';
import { listApprovedEnterpriseDmsTaxonomies } from '@/lib/api/enterprise';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  approvedDocumentTypeLabel,
  approvedDocumentTypeOptions,
  approvedSubtypeOptions,
} from '@/lib/dms-taxonomy';

interface DocumentActionCenterProps {
  documentId: string;
  disableInitialLoad?: boolean;
  initialAuditEvents?: DocumentAuditEventDto[];
  initialActiveEditSession?: DocumentEditSessionDto | null;
  initialDocument?: DocumentDto;
  initialRelatedEmails?: EmailMatterFilingDto[];
  initialRelatedDocuments?: DocumentDto[];
  initialSubversions?: DocumentSubversionDto[];
  initialTaxonomyCatalog?: EnterpriseApprovedDmsTaxonomyDto[];
  initialVersions?: DocumentVersionDto[];
  editIntent?: DocumentEditIntent | null;
  searchHitContext?: DocumentSearchHitContext | null;
}

export interface DocumentEditIntent {
  source: 'link';
  versionId?: string;
}

export type DocumentEditIntentAutomationStep =
  | 'idle'
  | 'start_session'
  | 'prepare_package'
  | 'open_native_draft';

interface DocumentEditIntentAutomationInput {
  activeSession: DocumentEditSessionDto | null;
  document: DocumentDto | null;
  editIntent: DocumentEditIntent | null;
  editPackage: DocumentEditPackageDto | null;
  isBusy: boolean;
  nativeDraft: DocumentNativeEditDraftDto | null;
  openedNativeDraft: boolean;
  preparedPackage: boolean;
  startedSession: boolean;
}

interface DocumentEditIntentAutomationState {
  key: string;
  openedNativeDraft: boolean;
  preparedPackage: boolean;
  startedSession: boolean;
}

export interface DocumentSearchHitContext {
  anchorId?: string;
  hitCount: number;
  hitIndex: number;
  source: 'search';
  target: SearchTarget;
}

interface ProfileDraft {
  title: string;
  documentType: DocumentType;
  subtype: string;
  confidentialityLevel: DocumentConfidentialityLevel;
}

interface QueueItem {
  title: string;
  description: string;
  tone: StatusBadgeTone;
}

interface ActionHierarchyItem {
  title: string;
  description: string;
  status: string;
  tone: StatusBadgeTone;
}

type RecordsActionTab = 'holds' | 'archive' | 'disposal';

interface RecordsActionRow {
  buttonLabel: string;
  description: string;
  tab: RecordsActionTab;
  title: string;
  readiness: string;
  tone: StatusBadgeTone;
}

const typeLabels = {
  contract: '계약서',
  memo: '메모',
  opinion: '의견서',
  court_filing: '법원 제출 문서',
  evidence: '증거',
  correspondence: '서신',
  corporate_record: '회사 기록',
  financial: '재무',
  other: '기타',
} as const satisfies Record<DocumentType, string>;

const confidentialityLabels = {
  standard: '일반',
  high: '높음',
  restricted: '제한됨',
} as const satisfies Record<DocumentConfidentialityLevel, string>;

const downloadReasonLabels = {
  casework: '업무 처리',
  client_request: '의뢰인 요청',
  court_filing: '법원 제출',
  compliance: '컴플라이언스',
  other: '기타',
} as const satisfies Record<DocumentDownloadReasonCode, string>;

const subversionStatusLabels = {
  saved: '내부 저장',
  submitted: '체크인됨',
  abandoned: '취소됨',
  promoted: '공식 발행됨',
} as const satisfies Record<DocumentSubversionStatus, string>;

const subversionVisibilityLabels = {
  session_owner: '작성자',
  reviewers: '검토자',
  matter_owners: 'Matter owner',
  matter_editors: 'Matter 편집자',
} as const satisfies Record<DocumentSubversionVisibilityScope, string>;

const subversionReviewDecisionLabels = {
  approved: '승인',
  changes_requested: '변경 요청',
} as const satisfies Record<DocumentSubversionReviewDecision, string>;

const subversionReviewGateLabels = {
  not_required: '검토 불필요',
  pending: '검토 대기',
  changes_requested: '변경 요청',
  approved: '검토 승인',
} as const satisfies Record<DocumentSubversionDto['reviewGate']['status'], string>;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '확인 불가';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 불가';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusTone(status: string): StatusBadgeTone {
  if (status === 'final' || status === 'executed' || status === 'ready') return 'success';
  if (status === 'failed' || status === 'deleted' || status === 'archived') return 'blocked';
  if (status.includes('pending') || status === 'draft') return 'warning';
  return 'neutral';
}

function subversionStatusTone(status: DocumentSubversionStatus): StatusBadgeTone {
  if (status === 'promoted') return 'success';
  if (status === 'submitted') return 'warning';
  if (status === 'abandoned') return 'blocked';
  return 'neutral';
}

function subversionReviewDecisionTone(
  decision: DocumentSubversionReviewDecision,
): StatusBadgeTone {
  return decision === 'approved' ? 'success' : 'warning';
}

function subversionReviewGateTone(
  status: DocumentSubversionDto['reviewGate']['status'],
): StatusBadgeTone {
  if (status === 'approved' || status === 'not_required') return 'success';
  if (status === 'changes_requested') return 'blocked';
  return 'warning';
}

function canPromoteSubversion(subversion: DocumentSubversionDto): boolean {
  return (
    subversion.status === 'submitted' &&
    (subversion.reviewGate.status === 'approved' ||
      subversion.reviewGate.status === 'not_required')
  );
}

function reviewGateCountLabel(gate: DocumentSubversionDto['reviewGate']): string {
  if (gate.activeReviewerCount === 0) return '검토자 없음';
  return `검토 ${gate.approvedReviewCount}/${gate.activeReviewerCount}`;
}

const editLifecycleReasonMessages: Record<string, string> = {
  base_version_stale:
    '기준 공식 버전이 이미 바뀌었습니다. 최신 버전에서 새 편집 세션을 시작하세요.',
  document_already_checked_out:
    '이미 다른 편집 세션이 lock을 보유하고 있습니다. 새로고침 후 현재 세션을 확인하세요.',
  edit_session_conflict:
    '편집 세션의 최신 내부 저장본이 바뀌었습니다. 새로고침 후 다시 체크인하세요.',
  edit_session_expired: '편집 lock이 만료되었습니다. 편집 세션을 다시 시작하세요.',
  promotion_conflict:
    '공식 발행 중 버전 충돌이 발생했습니다. 최신 버전을 확인한 뒤 다시 발행하세요.',
  review_changes_requested: '변경 요청이 남아 있어 공식 발행할 수 없습니다.',
  review_required: '검토 승인이 완료되어야 공식 발행할 수 있습니다.',
  subversion_not_promotable: '체크인된 내부 subversion만 공식 발행할 수 있습니다.',
};

export function editLifecycleErrorMessage(caught: unknown): string {
  if (caught instanceof ApiClientError && caught.reason) {
    return editLifecycleReasonMessages[caught.reason] ?? safeApiErrorMessage(caught);
  }
  return safeApiErrorMessage(caught);
}

function draftFromDocument(document: DocumentDto): ProfileDraft {
  return {
    title: document.title,
    documentType: document.documentType,
    subtype: document.subtype ?? '',
    confidentialityLevel: document.confidentialityLevel,
  };
}

function recordsUrlForDocument(document: DocumentDto, tab: 'holds' | 'archive' | 'disposal'): string {
  const params = new URLSearchParams();
  params.set('tab', tab);
  params.set('documentId', document.documentId);
  if (document.matterDisplayCode?.trim()) params.set('matterCode', document.matterDisplayCode.trim());
  if (document.title.trim()) params.set('documentTitle', document.title.trim());
  return `/records?${params.toString()}`;
}

function fileCabinetUrlForDocument(document: DocumentDto): string {
  const params = new URLSearchParams();
  if (document.matterDisplayCode?.trim()) params.set('matterCode', document.matterDisplayCode.trim());
  if (document.title.trim()) params.set('title', document.title.trim());
  const queryString = params.toString();
  return queryString ? `/files?${queryString}` : '/files';
}

function actionHierarchyItems(document: DocumentDto): ActionHierarchyItem[] {
  return [
    {
      title: '편집 시작',
      description: '현재 공식 버전을 기준으로 편집 세션을 만들고 문서 lock을 잡습니다.',
      status: document.status === 'archived' ? '보관 상태' : 'lock 가능',
      tone: document.status === 'archived' ? 'warning' : 'neutral',
    },
    {
      title: '내부 저장',
      description: '저장은 원본을 덮어쓰지 않고 vN.1, vN.2 같은 내부 subversion으로 남깁니다.',
      status: 'subversion',
      tone: 'neutral',
    },
    {
      title: '체크인',
      description: '마지막 내부 저장본을 검토 제출 상태로 전환하고 편집 세션을 닫습니다.',
      status: '검토 제출',
      tone: 'warning',
    },
    {
      title: '공식 발행',
      description: '체크인된 subversion만 다음 공식 버전으로 승격합니다.',
      status: document.legalHold ? '보존 확인' : 'vN+1',
      tone: document.legalHold ? 'warning' : 'success',
    },
  ];
}

function recordsActionRows(document: DocumentDto): RecordsActionRow[] {
  return [
    {
      buttonLabel: document.legalHold ? '보존 상태 열기' : '보존 검토',
      description: document.legalHold
        ? 'Legal Hold가 적용되어 폐기 흐름에서 차단됩니다.'
        : '필요 시 Records 화면에서 보존 적용을 검토합니다.',
      readiness: document.legalHold ? '적용 중' : '신청 가능',
      tab: 'holds',
      title: 'Legal Hold',
      tone: document.legalHold ? 'warning' : 'neutral',
    },
    {
      buttonLabel: '보관 처리',
      description:
        document.status === 'archived'
          ? '이미 보관 상태입니다. 기록 화면에서 보관 근거를 확인합니다.'
          : '보관 전환은 Records 화면에서 권한과 정책을 다시 확인합니다.',
      readiness: document.status === 'archived' ? '보관됨' : '보관 준비',
      tab: 'archive',
      title: 'Archive',
      tone: document.status === 'archived' ? 'success' : 'neutral',
    },
    {
      buttonLabel: '폐기 검토',
      description: document.legalHold
        ? 'Legal Hold 적용 중에는 폐기 검토를 진행할 수 없습니다.'
        : '폐기는 Records 정책, 보관 상태, 권한을 통과한 뒤 별도로 검토됩니다.',
      readiness: document.legalHold ? '보존으로 차단' : '검토 필요',
      tab: 'disposal',
      title: 'Disposal',
      tone: document.legalHold ? 'blocked' : 'warning',
    },
  ];
}

function DocumentHeaderRecordsActions({ document }: { document: DocumentDto }) {
  return (
    <nav aria-label="문서 기록 및 위치 작업" className="flex min-w-0 flex-wrap justify-end gap-2">
      {recordsActionRows(document).map((action) => (
        <Button
          asChild
          className="shrink-0"
          key={action.tab}
          size="sm"
          title={`${action.title}: ${action.description} ${action.readiness}`}
          variant="outline"
        >
          <Link href={recordsUrlForDocument(document, action.tab)}>
            {action.tab === 'holds' ? <ShieldCheck className="h-4 w-4" /> : null}
            {action.tab === 'archive' ? <Archive className="h-4 w-4" /> : null}
            {action.tab === 'disposal' ? <Trash2 className="h-4 w-4" /> : null}
            {action.buttonLabel}
          </Link>
        </Button>
      ))}
      <Button asChild className="shrink-0" size="sm" title="권한이 확인된 문서함 위치" variant="outline">
        <Link href={fileCabinetUrlForDocument(document)}>
          <FileSearch className="h-4 w-4" />
          문서함 위치
        </Link>
      </Button>
    </nav>
  );
}

export function relatedMatterDocuments(
  documents: DocumentDto[],
  currentDocumentId: string,
  limit = 5,
): DocumentDto[] {
  return documents
    .filter((document) => document.documentId !== currentDocumentId)
    .slice(0, limit);
}

export function relatedMatterEmails(
  emails: readonly EmailMatterFilingDto[],
  currentDocumentId: string,
  limit = 5,
): EmailMatterFilingDto[] {
  return emails
    .filter((email) => email.documentIds.includes(currentDocumentId))
    .slice(0, limit);
}

export function searchHitContextFromParams(params: {
  get(name: string): string | null;
}): DocumentSearchHitContext | null {
  if (params.get('from') !== 'search') return null;
  const target = parseSearchTarget(params.get('target'));
  const hitCount = boundedInteger(params.get('hitCount'), 0, 50);
  const hitIndex = hitCount > 0 ? boundedInteger(params.get('hit'), 1, hitCount) : 0;
  const anchorId = parsePreviewAnchorId(params.get('anchor'));
  return {
    ...(anchorId ? { anchorId } : {}),
    hitCount,
    hitIndex,
    source: 'search',
    target,
  };
}

export function editIntentFromParams(params: {
  get(name: string): string | null;
}): DocumentEditIntent | null {
  const edit = params.get('edit');
  if (edit !== '1' && edit !== 'true') return null;
  const versionId = parseUuidParam(params.get('versionId'));
  return {
    source: 'link',
    ...(versionId ? { versionId } : {}),
  };
}

export function nextEditIntentAutomationStep(
  input: DocumentEditIntentAutomationInput,
): DocumentEditIntentAutomationStep {
  if (!input.editIntent || !input.document || input.isBusy) return 'idle';
  if (!input.activeSession && !input.startedSession) return 'start_session';
  if (input.activeSession && !input.editPackage && !input.preparedPackage) return 'prepare_package';
  if (
    input.activeSession &&
    input.editPackage?.mode === 'vault_text' &&
    !input.nativeDraft &&
    !input.openedNativeDraft
  ) {
    return 'open_native_draft';
  }
  return 'idle';
}

function parseSearchTarget(value: string | null): SearchTarget {
  return value === 'title' || value === 'body' || value === 'all' ? value : 'all';
}

function parseUuidParam(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : undefined;
}

function boundedInteger(value: string | null, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function parsePreviewAnchorId(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^vph-([1-9]|[1-4][0-9]|50)-([0-9]|[1-9][0-9]|1[0-9]{2}|200)-([0-9]|[1-9][0-9]|1[0-9]{2}|200)$/.test(
    value,
  )
    ? value
    : undefined;
}

function searchHitUrlForDocument(documentId: string, context: DocumentSearchHitContext): string {
  const params = new URLSearchParams();
  params.set('from', 'search');
  params.set('target', context.target);
  if (context.hitCount > 0) {
    params.set('hit', String(context.hitIndex));
    params.set('hitCount', String(context.hitCount));
    if (context.anchorId) params.set('anchor', context.anchorId);
  }
  return `/documents/${encodeURIComponent(documentId)}?${params.toString()}`;
}

export function versionUploadStatusMessage(result: AddDocumentVersionResponseDto): string {
  const duplicateMessage =
    result.duplicates.length > 0 ? ` 중복 후보 ${result.duplicates.length}건이 감지되었습니다.` : '';
  return `v${result.versionNo} 새 버전이 추가되었습니다. 버전 목록, 감사 타임라인, 파일 정리 준비 상태를 갱신했습니다.${duplicateMessage}`;
}

function previewUrlForDocument(
  documentId: string,
  context: DocumentSearchHitContext | null,
): string {
  if (!context || context.hitCount < 1) return documentPreviewUrl(documentId);
  return documentPreviewUrl(documentId, {
    searchHit: {
      ...(context.anchorId ? { anchorId: context.anchorId } : {}),
      hitCount: context.hitCount,
      hitIndex: context.hitIndex,
      target: context.target,
    },
  });
}

const searchTargetLabels = {
  all: '제목+본문',
  title: '제목',
  body: '본문',
} as const satisfies Record<SearchTarget, string>;

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 px-3 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function SearchHitContextPanel({
  context,
  documentId,
}: {
  context: DocumentSearchHitContext;
  documentId: string;
}) {
  const hasPreviousHit = context.hitCount > 1 && context.hitIndex > 1;
  const hasNextHit = context.hitCount > 1 && context.hitIndex < context.hitCount;
  const previousIndex = Math.max(1, context.hitIndex - 1);
  const nextIndex = Math.min(context.hitCount, context.hitIndex + 1);
  return (
    <SectionCard
      icon={<FileSearch className="h-4 w-4" />}
      title="검색 결과 문맥"
      meta={searchTargetLabels[context.target]}
      actions={
        context.hitCount > 0 ? (
          <StatusBadge tone="neutral">
            {context.hitIndex} / {context.hitCount}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral">검색 결과</StatusBadge>
        )
      }
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <p className="text-sm leading-6 text-muted-foreground">
          검색 결과에서 열린 문서입니다. 표시 위치는 승인된 검색 hit 범위 안에서만 이동합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {hasPreviousHit ? (
            <Button asChild size="sm" variant="outline">
              <Link
                href={searchHitUrlForDocument(documentId, {
                  hitCount: context.hitCount,
                  hitIndex: previousIndex,
                  source: context.source,
                  target: context.target,
                })}
              >
                <ChevronLeft className="h-4 w-4" />
                이전 hit
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled type="button">
              <ChevronLeft className="h-4 w-4" />
              이전 hit
            </Button>
          )}
          {hasNextHit ? (
            <Button asChild size="sm" variant="outline">
              <Link
                href={searchHitUrlForDocument(documentId, {
                  hitCount: context.hitCount,
                  hitIndex: nextIndex,
                  source: context.source,
                  target: context.target,
                })}
              >
                다음 hit
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled type="button">
              다음 hit
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/search">검색으로 돌아가기</Link>
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function DocumentActionHierarchyPanel({ document }: { document: DocumentDto }) {
  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title="작업 우선순위"
      meta="편집 라이프사이클"
    >
      <div className="grid gap-2 md:grid-cols-2">
        {actionHierarchyItems(document).map((item) => (
          <div key={item.title} className="rounded-md border bg-background px-3 py-2.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
              <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        읽기/다운로드 전용 동작은 사유 기반 감사 다운로드로 유지됩니다. 저장은 같은 공식
        버전을 덮어쓰지 않고 내부 subversion으로 기록되며, 공식 발행 시에만 다음 vN+1 문서
        버전이 생성됩니다.
      </div>
    </SectionCard>
  );
}

function VersionRows({ versions }: { versions: DocumentVersionDto[] }) {
  if (versions.length === 0) {
    return <DataTableEmptyRow colSpan={4}>표시할 버전이 없습니다.</DataTableEmptyRow>;
  }

  return versions.map((version) => (
    <DataTableRow key={version.versionId}>
      <DataTableCell className="font-semibold">v{version.versionNo}</DataTableCell>
      <DataTableCell>
        <StatusBadge tone={statusTone(version.versionStatus)}>{version.versionStatus}</StatusBadge>
      </DataTableCell>
      <DataTableCell>{formatDateTime(version.createdAt)}</DataTableCell>
      <DataTableCell>{version.supersedesVersionId ? '이전 버전 보존' : '최초 버전'}</DataTableCell>
    </DataTableRow>
  ));
}

interface DocumentEditingLifecyclePanelProps {
  activeSession: DocumentEditSessionDto | null;
  cancelSaving: boolean;
  checkInSaving: boolean;
  checkoutSaving: boolean;
  errorMessage: string | null;
  editIntent: DocumentEditIntent | null;
  editPackage: DocumentEditPackageDto | null;
  editPackageLoading: boolean;
  isLoading: boolean;
  nativeDraft: DocumentNativeEditDraftDto | null;
  nativeDraftContent: string;
  nativeDraftLoading: boolean;
  nativeDraftSaving: boolean;
  reviewDecisionSaving: boolean;
  reviewDecisions: DocumentSubversionReviewDto[];
  reviewsLoading: boolean;
  reviewerSaving: boolean;
  reviewers: DocumentSubversionReviewerDto[];
  reviewersLoading: boolean;
  selectedReviewerSubject: OrgDirectorySubjectDto | null;
  selectedReviewSubversionId: string | null;
  onCancelSession: () => Promise<void>;
  onCheckInSession: () => Promise<void>;
  onChangeNativeDraftContent: (content: string) => void;
  onAssignReviewer: () => Promise<void>;
  onOpenEditBaseFile: () => void;
  onOpenNativeDraft: () => Promise<void>;
  onOpenSubversionFile: (subversion: DocumentSubversionDto) => void;
  onPrepareEditPackage: () => Promise<void>;
  onPromoteSubversion: (subversion: DocumentSubversionDto) => Promise<void>;
  onRevokeReviewer: (reviewer: DocumentSubversionReviewerDto) => Promise<void>;
  onSaveNativeDraft: () => Promise<void>;
  onSaveSubversion: () => Promise<void>;
  onSubmitReviewDecision: (decision: DocumentSubversionReviewDecision) => Promise<void>;
  onSelectReviewerSubject: (subject: OrgDirectorySubjectDto) => void;
  onSelectReviewSubversion: (subversionId: string) => void;
  onSelectSubversionVisibilityScope: (scope: DocumentSubversionVisibilityScope) => void;
  onSelectSubversionFile: (file: File | null) => void;
  onStartSession: () => Promise<void>;
  promoteSaving: boolean;
  subversionFile: File | null;
  subversionInputKey: number;
  subversionSaving: boolean;
  subversionVisibilityScope: DocumentSubversionVisibilityScope;
  subversions: DocumentSubversionDto[];
  matterId: string;
  successMessage: string | null;
}

function newestSubversion(items: DocumentSubversionDto[]): DocumentSubversionDto | undefined {
  return [...items].sort(
    (left, right) =>
      right.baseVersionNo - left.baseVersionNo ||
      right.subversionNo - left.subversionNo ||
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];
}

function reviewerLabel(reviewer: DocumentSubversionReviewerDto): string {
  return (
    reviewer.safeLabel ||
    reviewer.displayName ||
    reviewer.displayEmail ||
    (reviewer.status === 'active' ? '지정된 검토자' : '해제된 검토자')
  );
}

function reviewActorLabel(review: DocumentSubversionReviewDto): string {
  return review.safeLabel || review.displayName || review.displayEmail || '검토자';
}

function DocumentEditingLifecyclePanel({
  activeSession,
  cancelSaving,
  checkInSaving,
  checkoutSaving,
  errorMessage,
  editIntent,
  editPackage,
  editPackageLoading,
  isLoading,
  nativeDraft,
  nativeDraftContent,
  nativeDraftLoading,
  nativeDraftSaving,
  reviewDecisionSaving,
  reviewDecisions,
  reviewsLoading,
  reviewerSaving,
  reviewers,
  reviewersLoading,
  selectedReviewerSubject,
  selectedReviewSubversionId,
  matterId,
  onAssignReviewer,
  onCancelSession,
  onCheckInSession,
  onChangeNativeDraftContent,
  onOpenEditBaseFile,
  onOpenNativeDraft,
  onOpenSubversionFile,
  onPrepareEditPackage,
  onPromoteSubversion,
  onRevokeReviewer,
  onSaveNativeDraft,
  onSaveSubversion,
  onSubmitReviewDecision,
  onSelectReviewerSubject,
  onSelectReviewSubversion,
  onSelectSubversionVisibilityScope,
  onSelectSubversionFile,
  onStartSession,
  promoteSaving,
  subversionFile,
  subversionInputKey,
  subversionSaving,
  subversionVisibilityScope,
  subversions,
  successMessage,
}: DocumentEditingLifecyclePanelProps) {
  const sessionSubversions = activeSession
    ? subversions.filter((subversion) => subversion.editSessionId === activeSession.editSessionId)
    : [];
  const latestSavedSessionSubversion = newestSubversion(
    sessionSubversions.filter((subversion) => subversion.status === 'saved'),
  );
  const latestSubmittedSubversion = newestSubversion(
    subversions.filter((subversion) => subversion.status === 'submitted'),
  );
  const latestSubmittedGate = latestSubmittedSubversion?.reviewGate;
  const latestSubmittedCanPromote = latestSubmittedSubversion
    ? canPromoteSubversion(latestSubmittedSubversion)
    : false;
  const nativeDraftChanged = nativeDraft ? nativeDraft.content !== nativeDraftContent : false;
  const busy =
    checkoutSaving ||
    subversionSaving ||
    checkInSaving ||
    cancelSaving ||
    promoteSaving ||
    editPackageLoading ||
    nativeDraftLoading ||
    nativeDraftSaving ||
    reviewDecisionSaving ||
    reviewsLoading ||
    reviewerSaving ||
    reviewersLoading ||
    isLoading;
  const selectedReviewSubversionIndex = subversions.findIndex(
    (subversion) => subversion.subversionId === selectedReviewSubversionId,
  );
  const activeReviewers = reviewers.filter((reviewer) => reviewer.status === 'active');

  return (
    <SectionCard
      id="document-editing"
      icon={<Pencil className="h-4 w-4" />}
      title="문서 편집"
      meta={activeSession ? `v${activeSession.baseVersionNo} 편집 중` : '세션 없음'}
      actions={
        <StatusBadge tone={isLoading ? 'warning' : activeSession ? 'success' : 'neutral'}>
          {isLoading ? '확인 중' : activeSession ? activeSession.status : '대기'}
        </StatusBadge>
      }
    >
      <div className="space-y-3">
        {editIntent ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-5 text-primary">
            편집 바로가기에서 열린 문서입니다. Vault가 권한을 다시 확인한 뒤
            {editIntent.versionId ? ' 연결된 공식 버전을 기준으로 ' : ' 현재 공식 버전을 기준으로 '}
            lock과 편집 패키지를 준비합니다.
          </div>
        ) : null}

        <div className="rounded-md border bg-background px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">편집 세션</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                공식 버전을 직접 덮어쓰지 않고 내부 저장 이력을 생성합니다.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void onStartSession()}
              disabled={Boolean(activeSession) || busy}
            >
              <Pencil className="h-4 w-4" />
              {checkoutSaving ? '시작 중' : '편집 시작'}
            </Button>
          </div>
          {activeSession ? (
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="success">v{activeSession.baseVersionNo}</StatusBadge>
                <span>만료 {formatDateTime(activeSession.expiresAt)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onCheckInSession()}
                  disabled={!latestSavedSessionSubversion || busy}
                >
                  <Save className="h-4 w-4" />
                  {checkInSaving ? '체크인 중' : '체크인'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onCancelSession()}
                  disabled={busy}
                >
                  <X className="h-4 w-4" />
                  {cancelSaving ? '취소 중' : '세션 취소'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border bg-background px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">편집 패키지</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                현재 lock과 기준 파일을 묶어 저장 endpoint까지 확인합니다.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onPrepareEditPackage()}
              disabled={!activeSession || busy}
            >
              <FileSearch className="h-4 w-4" />
              {editPackageLoading ? '준비 중' : '패키지 준비'}
            </Button>
          </div>
          {editPackage ? (
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={editPackage.mode === 'vault_text' ? 'success' : 'neutral'}>
                  {editPackage.mode === 'vault_text' ? 'Vault 편집' : '파일 왕복'}
                </StatusBadge>
                <span className="truncate">{editPackage.filename}</span>
              </div>
              <p>
                기준 v{editPackage.baseVersionNo} · {editPackage.mimeType} ·{' '}
                {editPackage.sizeBytes.toLocaleString('ko-KR')} bytes
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onOpenEditBaseFile}
                  disabled={busy}
                >
                  <FileText className="h-4 w-4" />
                  편집 원본 열기
                </Button>
              </div>
              {editPackage.mode === 'binary_roundtrip' ? (
                <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  저장본 업로드 시 기준 파일 hash와 패키지 mode를 다시 검증한 뒤 내부 subversion으로만
                  저장합니다.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-md border bg-background px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Vault 편집기</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                활성 lock에서 열린 draft를 내부 subversion으로 저장합니다.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onOpenNativeDraft()}
              disabled={!activeSession || busy}
            >
              <FileText className="h-4 w-4" />
              {nativeDraftLoading ? '여는 중' : 'Vault 편집기 열기'}
            </Button>
          </div>
          {nativeDraft ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge tone="neutral">v{nativeDraft.baseVersionNo}</StatusBadge>
                <span className="truncate">{nativeDraft.filename}</span>
              </div>
              <textarea
                className="min-h-64 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={nativeDraftContent}
                onChange={(event) => onChangeNativeDraftContent(event.target.value)}
              />
              <Button
                type="button"
                className="w-full"
                onClick={() => void onSaveNativeDraft()}
                disabled={!nativeDraftChanged || busy}
              >
                <Save className="h-4 w-4" />
                {nativeDraftSaving ? '저장 중' : 'Vault draft 저장'}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <label className="space-y-1 text-sm font-medium">
            {editPackage?.mode === 'binary_roundtrip' ? '편집 저장본' : '내부 저장 파일'}
            <Input
              key={subversionInputKey}
              type="file"
              disabled={!activeSession || busy}
              onChange={(event) => onSelectSubversionFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="mt-3 block space-y-1 text-sm font-medium">
            가시성
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!activeSession || busy}
              value={subversionVisibilityScope}
              onChange={(event) =>
                onSelectSubversionVisibilityScope(
                  event.target.value as DocumentSubversionVisibilityScope,
                )
              }
            >
              {(
                Object.entries(subversionVisibilityLabels) as Array<
                  [DocumentSubversionVisibilityScope, string]
                >
              ).map(([scope, label]) => (
                <option key={scope} value={scope}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            className="mt-3 w-full"
            onClick={() => void onSaveSubversion()}
            disabled={!activeSession || !subversionFile || busy}
          >
            <Upload className="h-4 w-4" />
            {subversionSaving
              ? '저장 중'
              : editPackage?.mode === 'binary_roundtrip'
                ? '저장본을 subversion으로 저장'
                : '내부 subversion 저장'}
          </Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            내부 저장은 vN.1, vN.2 이력으로만 남고 검색, AI, Records 공식 대상에는 바로 올라가지
            않습니다.
          </p>
        </div>

        <div className="rounded-md border bg-background">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" />
            내부 subversion
          </div>
          {subversions.length > 0 ? (
            <ul className="divide-y">
              {subversions.map((subversion) => (
                <li key={subversion.subversionId} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{subversion.displayVersion}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={subversionStatusTone(subversion.status)}>
                        {subversionStatusLabels[subversion.status]}
                      </StatusBadge>
                      <StatusBadge tone={subversionReviewGateTone(subversion.reviewGate.status)}>
                        {subversionReviewGateLabels[subversion.reviewGate.status]}
                      </StatusBadge>
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {subversionVisibilityLabels[subversion.visibilityScope]} ·{' '}
                    {formatDateTime(subversion.createdAt)} · {reviewGateCountLabel(subversion.reviewGate)}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onOpenSubversionFile(subversion)}
                    disabled={busy}
                  >
                    <FileText className="h-4 w-4" />
                    검토 파일 열기
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              variant="no-data"
              title="내부 subversion 없음"
              description="편집 세션에서 저장한 내부 이력이 아직 없습니다."
            />
          )}
        </div>

        <div className="rounded-md border bg-background px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserPlus className="h-4 w-4 text-primary" />
            검토자 제한
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            reviewer 가시성 subversion은 지정된 사용자에게만 내부 이력을 엽니다.
          </p>
          <label className="mt-3 block space-y-1 text-sm font-medium">
            검토 대상
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={subversions.length === 0 || busy}
              value={selectedReviewSubversionIndex >= 0 ? String(selectedReviewSubversionIndex) : ''}
              onChange={(event) => {
                const subversion = subversions[Number(event.target.value)];
                if (subversion) onSelectReviewSubversion(subversion.subversionId);
              }}
            >
              {subversions.length === 0 ? <option value="">내부 subversion 없음</option> : null}
              {subversions.map((subversion, index) => (
                <option key={subversion.subversionId} value={String(index)}>
                  {subversion.displayVersion} · {subversionStatusLabels[subversion.status]}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 rounded-md border border-dashed bg-muted/20 p-3">
            <OrgSubjectPicker
              matterId={matterId}
              onSubjectSelected={onSelectReviewerSubject}
              purpose="matter-team"
              selectedSubject={selectedReviewerSubject}
              subjectType="user"
            />
            <Button
              type="button"
              className="mt-3 w-full"
              onClick={() => void onAssignReviewer()}
              disabled={!selectedReviewSubversionId || !selectedReviewerSubject || busy}
            >
              <UserPlus className="h-4 w-4" />
              {reviewerSaving ? '지정 중' : '검토자 지정'}
            </Button>
          </div>
          <div className="mt-3 rounded-md border bg-muted/10">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground">현재 검토자</span>
              <StatusBadge tone={activeReviewers.length > 0 ? 'success' : 'neutral'}>
                {reviewersLoading ? '확인 중' : `${activeReviewers.length}명`}
              </StatusBadge>
            </div>
            {activeReviewers.length > 0 ? (
              <ul className="divide-y">
                {activeReviewers.map((reviewer) => (
                  <li
                    key={reviewer.subversionReviewerId}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">{reviewerLabel(reviewer)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onRevokeReviewer(reviewer)}
                      disabled={busy}
                    >
                      <UserMinus className="h-4 w-4" />
                      해제
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                variant="no-data"
                title="검토자 없음"
                description="reviewers 가시성을 쓰려면 먼저 검토자를 지정해 주세요."
              />
            )}
          </div>
          <div className="mt-3 rounded-md border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-xs font-semibold text-muted-foreground">검토 결정</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onSubmitReviewDecision('approved')}
                  disabled={!selectedReviewSubversionId || busy}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {reviewDecisionSaving ? '저장 중' : '승인'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onSubmitReviewDecision('changes_requested')}
                  disabled={!selectedReviewSubversionId || busy}
                >
                  <AlertTriangle className="h-4 w-4" />
                  변경 요청
                </Button>
              </div>
            </div>
            {reviewDecisions.length > 0 ? (
              <ul className="divide-y">
                {reviewDecisions.map((review) => (
                  <li
                    key={review.subversionReviewId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">{reviewActorLabel(review)}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge tone={subversionReviewDecisionTone(review.decision)}>
                        {subversionReviewDecisionLabels[review.decision]}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(review.decidedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                variant="no-data"
                title={reviewsLoading ? '검토 결정 확인 중' : '검토 결정 없음'}
                description="승인 또는 변경 요청은 구조화된 결정 코드로만 저장됩니다."
              />
            )}
          </div>
        </div>

        <div className="rounded-md border bg-background px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">공식 버전 발행</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                체크인된 subversion만 다음 공식 버전으로 승격할 수 있습니다.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => latestSubmittedSubversion && void onPromoteSubversion(latestSubmittedSubversion)}
              disabled={!latestSubmittedSubversion || !latestSubmittedCanPromote || busy}
            >
              <Upload className="h-4 w-4" />
              {promoteSaving ? '발행 중' : '공식 발행'}
            </Button>
          </div>
          {latestSubmittedSubversion ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>발행 대기: {latestSubmittedSubversion.displayVersion}</span>
              {latestSubmittedGate ? (
                <StatusBadge tone={subversionReviewGateTone(latestSubmittedGate.status)}>
                  {subversionReviewGateLabels[latestSubmittedGate.status]} ·{' '}
                  {reviewGateCountLabel(latestSubmittedGate)}
                </StatusBadge>
              ) : null}
            </div>
          ) : null}
        </div>

        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        {successMessage ? (
          <p className="text-sm font-medium text-primary" role="status">
            {successMessage}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function RelatedDocumentsPanel({
  currentDocument,
  documents,
  errorMessage,
  isLoading,
  taxonomyCatalog,
}: {
  currentDocument: DocumentDto;
  documents: DocumentDto[];
  errorMessage: string | null;
  isLoading: boolean;
  taxonomyCatalog: EnterpriseApprovedDmsTaxonomyDto[];
}) {
  const matterCode = currentDocument.matterDisplayCode?.trim();
  const matterName = currentDocument.matterDisplayName?.trim();
  const sectionMeta = matterCode || matterName || 'Matter 범위';

  return (
    <SectionCard
      icon={<Link2 className="h-4 w-4" />}
      title="관련 문서"
      meta={sectionMeta}
      actions={
        <StatusBadge tone={isLoading ? 'warning' : 'neutral'}>
          {isLoading ? '확인 중' : `${documents.length}건`}
        </StatusBadge>
      }
    >
      {errorMessage ? (
        <EmptyState
          variant="api-error"
          title="관련 문서를 표시할 수 없습니다."
          description={errorMessage}
        />
      ) : null}

      {!errorMessage && isLoading ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          같은 Matter에서 권한이 확인된 관련 문서를 확인하는 중입니다.
        </div>
      ) : null}

      {!errorMessage && !isLoading && documents.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="관련 문서가 없습니다."
          description="현재 권한으로 확인되는 같은 Matter 문서가 없습니다."
        />
      ) : null}

      {!errorMessage && !isLoading && documents.length > 0 ? (
        <ul className="divide-y rounded-md border bg-background">
          {documents.map((relatedDocument) => (
            <li key={relatedDocument.documentId} className="px-3 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Link
                  href={`/documents/${relatedDocument.documentId}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {relatedDocument.title}
                </Link>
                <StatusBadge tone={statusTone(relatedDocument.status)}>
                  {relatedDocument.status}
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                동일 Matter에서 권한이 확인된 문서 ·{' '}
                {approvedDocumentTypeLabel(
                  relatedDocument.documentType,
                  typeLabels,
                  taxonomyCatalog,
                )}{' '}
                ·{' '}
                {formatDateTime(relatedDocument.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

function RelatedEmailsPanel({
  emails,
  errorMessage,
  isLoading,
}: {
  emails: EmailMatterFilingDto[];
  errorMessage: string | null;
  isLoading: boolean;
}) {
  return (
    <SectionCard
      icon={<Mail className="h-4 w-4" />}
      title="관련 이메일"
      meta="Matter 이메일 타임라인"
      actions={
        <StatusBadge tone={isLoading ? 'warning' : 'neutral'}>
          {isLoading ? '확인 중' : `${emails.length}건`}
        </StatusBadge>
      }
    >
      {errorMessage ? (
        <EmptyState
          variant="api-error"
          title="관련 이메일을 표시할 수 없습니다."
          description={errorMessage}
        />
      ) : null}

      {!errorMessage && isLoading ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          현재 문서와 연결된 Matter 이메일을 확인하는 중입니다.
        </div>
      ) : null}

      {!errorMessage && !isLoading && emails.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="관련 이메일이 없습니다."
          description="현재 문서에 연결된 Matter 이메일이 없습니다."
        />
      ) : null}

      {!errorMessage && !isLoading && emails.length > 0 ? (
        <ul className="divide-y rounded-md border bg-background">
          {emails.map((email) => (
            <li key={email.filingId} className="px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-foreground">
                {email.subject ?? '표시 가능한 제목 없음'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>보관 {formatDateTime(email.filedAt)}</span>
                <span>문서 {email.documentIds.length}건</span>
                <span>관련 이메일 {email.thread.relatedEmailCount}건</span>
                {email.hasOutsideParticipants ? (
                  <StatusBadge tone="warning" className="min-h-6 gap-1 px-2">
                    <AlertTriangle className="h-3 w-3" />
                    외부 참여자
                  </StatusBadge>
                ) : null}
                {email.privilegeTagSuggestion ? (
                  <StatusBadge tone="success" className="min-h-6">
                    {email.privilegeTagSuggestion.tag === 'attorney_client_privilege'
                      ? '비밀특권 후보'
                      : '기밀 후보'}
                  </StatusBadge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

function uploadQueueItems(
  document: DocumentDto,
  prepStatus: AiPrepDocumentStatusDto | null,
  versionFile: File | null,
  versionSaving: boolean,
): QueueItem[] {
  const items: QueueItem[] = [];
  if (versionSaving) {
    items.push({
      title: '새 버전 업로드 중',
      description: '선택한 파일을 기존 원본을 덮어쓰지 않고 새 버전으로 등록하는 중입니다.',
      tone: 'warning',
    });
  } else if (versionFile) {
    items.push({
      title: '새 버전 업로드 대기',
      description: '새 버전 파일이 선택되었습니다. 업로드를 시작하면 감사 기록 대상이 됩니다.',
      tone: 'neutral',
    });
  }

  if (document.extractionStatus === 'pending' || document.extractionStatus === 'ocr_pending') {
    items.push({
      title: '본문 추출 큐',
      description: '본문 검색과 파일 정리 준비를 위해 추출 작업 완료를 기다립니다.',
      tone: 'warning',
    });
  }
  if (document.extractionStatus === 'failed') {
    items.push({
      title: '본문 추출 실패',
      description: '검색 가능 상태로 전환되지 않아 운영 확인이 필요합니다.',
      tone: 'blocked',
    });
  }
  if (prepStatus && prepStatus.readinessStatus !== 'ready') {
    items.push({
      title: 'Gemma 파일 정리 준비',
      description: `현재 준비 상태는 ${prepStatus.readinessStatus}입니다.`,
      tone: statusTone(prepStatus.readinessStatus),
    });
  }
  return items;
}

export function DocumentActionCenter({
  disableInitialLoad = false,
  documentId,
  editIntent = null,
  initialAuditEvents = [],
  initialActiveEditSession = null,
  initialDocument,
  initialRelatedEmails = [],
  initialRelatedDocuments = [],
  initialSubversions = [],
  initialTaxonomyCatalog = [],
  initialVersions = [],
  searchHitContext = null,
}: DocumentActionCenterProps) {
  const [document, setDocument] = useState<DocumentDto | null>(initialDocument ?? null);
  const [versions, setVersions] = useState<DocumentVersionDto[]>(initialVersions);
  const [activeEditSession, setActiveEditSession] = useState<DocumentEditSessionDto | null>(
    initialActiveEditSession,
  );
  const [subversions, setSubversions] = useState<DocumentSubversionDto[]>(initialSubversions);
  const [relatedDocuments, setRelatedDocuments] = useState<DocumentDto[]>(() =>
    relatedMatterDocuments(initialRelatedDocuments, documentId),
  );
  const [relatedDocumentsLoading, setRelatedDocumentsLoading] = useState(false);
  const [relatedDocumentsError, setRelatedDocumentsError] = useState<string | null>(null);
  const [relatedEmails, setRelatedEmails] = useState<EmailMatterFilingDto[]>(() =>
    relatedMatterEmails(initialRelatedEmails, documentId),
  );
  const [relatedEmailsLoading, setRelatedEmailsLoading] = useState(false);
  const [relatedEmailsError, setRelatedEmailsError] = useState<string | null>(null);
  const [prepStatus, setPrepStatus] = useState<AiPrepDocumentStatusDto | null>(null);
  const [loading, setLoading] = useState(!initialDocument);
  const [error, setError] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(
    initialDocument ? draftFromDocument(initialDocument) : null,
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionSuccessMessage, setVersionSuccessMessage] = useState<string | null>(null);
  const [versionInputKey, setVersionInputKey] = useState(0);
  const [subversionFile, setSubversionFile] = useState<File | null>(null);
  const [subversionInputKey, setSubversionInputKey] = useState(0);
  const [subversionVisibilityScope, setSubversionVisibilityScope] =
    useState<DocumentSubversionVisibilityScope>('matter_editors');
  const [editLifecycleLoading, setEditLifecycleLoading] = useState(false);
  const [editLifecycleError, setEditLifecycleError] = useState<string | null>(null);
  const [editLifecycleSuccessMessage, setEditLifecycleSuccessMessage] = useState<string | null>(null);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [subversionSaving, setSubversionSaving] = useState(false);
  const [editPackage, setEditPackage] = useState<DocumentEditPackageDto | null>(null);
  const [editPackageLoading, setEditPackageLoading] = useState(false);
  const [nativeDraft, setNativeDraft] = useState<DocumentNativeEditDraftDto | null>(null);
  const [nativeDraftContent, setNativeDraftContent] = useState('');
  const [nativeDraftLoading, setNativeDraftLoading] = useState(false);
  const [nativeDraftSaving, setNativeDraftSaving] = useState(false);
  const [subversionReviews, setSubversionReviews] = useState<DocumentSubversionReviewDto[]>([]);
  const [subversionReviewsLoading, setSubversionReviewsLoading] = useState(false);
  const [reviewDecisionSaving, setReviewDecisionSaving] = useState(false);
  const [subversionReviewers, setSubversionReviewers] = useState<DocumentSubversionReviewerDto[]>([]);
  const [subversionReviewersLoading, setSubversionReviewersLoading] = useState(false);
  const [reviewerSaving, setReviewerSaving] = useState(false);
  const [selectedReviewerSubject, setSelectedReviewerSubject] =
    useState<OrgDirectorySubjectDto | null>(null);
  const [selectedReviewSubversionId, setSelectedReviewSubversionId] = useState<string | null>(
    initialSubversions[0]?.subversionId ?? null,
  );
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [cancelEditSaving, setCancelEditSaving] = useState(false);
  const [promoteSaving, setPromoteSaving] = useState(false);
  const editIntentAutomationRef = useRef<DocumentEditIntentAutomationState | null>(null);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [downloadReason, setDownloadReason] = useState<DocumentDownloadReasonCode>('casework');
  const [taxonomyCatalog, setTaxonomyCatalog] = useState<EnterpriseApprovedDmsTaxonomyDto[]>(
    initialTaxonomyCatalog,
  );
  const subtypeListId = useId();
  const documentTypeOptions = useMemo(
    () => approvedDocumentTypeOptions(typeLabels, taxonomyCatalog),
    [taxonomyCatalog],
  );
  const profileSubtypeOptions = useMemo(
    () => (profileDraft ? approvedSubtypeOptions(profileDraft.documentType, taxonomyCatalog) : []),
    [profileDraft, taxonomyCatalog],
  );

  const refreshPrepStatus = useCallback(async () => {
    try {
      const result = await getDocumentAiPrepStatus(documentId);
      setPrepStatus(result);
      setPrepError(null);
    } catch (caught) {
      setPrepStatus(null);
      setPrepError(safeApiErrorMessage(caught));
    }
  }, [documentId]);

  const refreshEditingState = useCallback(async () => {
    setEditLifecycleLoading(true);
    setEditLifecycleError(null);
    try {
      const [activeSessionResult, subversionResult] = await Promise.all([
        getActiveDocumentEditSession(documentId),
        listDocumentSubversions(documentId),
      ]);
      setActiveEditSession(activeSessionResult);
      setSubversions(subversionResult.items);
    } catch (caught) {
      setActiveEditSession(null);
      setSubversions([]);
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setEditLifecycleLoading(false);
    }
  }, [documentId]);

  const refreshSubversionReviewers = useCallback(
    async (subversionId: string | null = selectedReviewSubversionId) => {
      if (!subversionId) {
        setSubversionReviewers([]);
        setSubversionReviewersLoading(false);
        return;
      }
      setSubversionReviewersLoading(true);
      try {
        const result = await listDocumentSubversionReviewers(documentId, subversionId);
        setSubversionReviewers(result.items);
      } catch (caught) {
        setSubversionReviewers([]);
        setEditLifecycleError(editLifecycleErrorMessage(caught));
      } finally {
        setSubversionReviewersLoading(false);
      }
    },
    [documentId, selectedReviewSubversionId],
  );

  const refreshSubversionReviews = useCallback(
    async (subversionId: string | null = selectedReviewSubversionId) => {
      if (!subversionId) {
        setSubversionReviews([]);
        setSubversionReviewsLoading(false);
        return;
      }
      setSubversionReviewsLoading(true);
      try {
        const result = await listDocumentSubversionReviews(documentId, subversionId);
        setSubversionReviews(result.items);
      } catch (caught) {
        setSubversionReviews([]);
        setEditLifecycleError(editLifecycleErrorMessage(caught));
      } finally {
        setSubversionReviewsLoading(false);
      }
    },
    [documentId, selectedReviewSubversionId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [documentResult, versionResult] = await Promise.all([
        getDocument(documentId),
        listDocumentVersions(documentId),
      ]);
      setDocument(documentResult);
      setProfileDraft(draftFromDocument(documentResult));
      setVersions(versionResult.items);
      void refreshEditingState();
    } catch (caught) {
      setDocument(null);
      setProfileDraft(null);
      setVersions([]);
      setActiveEditSession(null);
      setSubversions([]);
      setSubversionReviewers([]);
      setSubversionReviews([]);
      setError(safeApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }

    void refreshPrepStatus();
  }, [documentId, refreshEditingState, refreshPrepStatus]);

  useEffect(() => {
    if (disableInitialLoad) return;
    void load();
  }, [disableInitialLoad, load]);

  useEffect(() => {
    setSelectedReviewSubversionId((current) => {
      if (current && subversions.some((subversion) => subversion.subversionId === current)) {
        return current;
      }
      return subversions[0]?.subversionId ?? null;
    });
  }, [subversions]);

  useEffect(() => {
    if (disableInitialLoad) return;
    void refreshSubversionReviewers(selectedReviewSubversionId);
  }, [disableInitialLoad, refreshSubversionReviewers, selectedReviewSubversionId]);

  useEffect(() => {
    if (disableInitialLoad) return;
    void refreshSubversionReviews(selectedReviewSubversionId);
  }, [disableInitialLoad, refreshSubversionReviews, selectedReviewSubversionId]);

  useEffect(() => {
    if (disableInitialLoad) return;
    let active = true;
    listApprovedEnterpriseDmsTaxonomies()
      .then((catalog) => {
        if (active) setTaxonomyCatalog(catalog.taxonomies);
      })
      .catch(() => {
        if (active) setTaxonomyCatalog([]);
      });
    return () => {
      active = false;
    };
  }, [disableInitialLoad]);

  useEffect(() => {
    if (disableInitialLoad) return;
    if (!document) {
      setRelatedDocuments([]);
      setRelatedDocumentsError(null);
      setRelatedDocumentsLoading(false);
      return;
    }

    let active = true;
    setRelatedDocuments([]);
    setRelatedDocumentsError(null);
    setRelatedDocumentsLoading(true);
    listMatterDocuments(document.matterId, {
      pageSize: 6,
      sortBy: 'updated_desc',
    })
      .then((response) => {
        if (active) setRelatedDocuments(relatedMatterDocuments(response.items, document.documentId));
      })
      .catch((caught) => {
        if (!active) return;
        setRelatedDocuments([]);
        setRelatedDocumentsError(safeApiErrorMessage(caught));
      })
      .finally(() => {
        if (active) setRelatedDocumentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [disableInitialLoad, document]);

  useEffect(() => {
    if (disableInitialLoad) return;
    if (!document) {
      setRelatedEmails([]);
      setRelatedEmailsError(null);
      setRelatedEmailsLoading(false);
      return;
    }

    let active = true;
    setRelatedEmails([]);
    setRelatedEmailsError(null);
    setRelatedEmailsLoading(true);
    listMatterEmailTimeline(document.matterId)
      .then((response) => {
        if (active) setRelatedEmails(relatedMatterEmails(response.items, document.documentId));
      })
      .catch((caught) => {
        if (!active) return;
        setRelatedEmails([]);
        setRelatedEmailsError(safeApiErrorMessage(caught));
      })
      .finally(() => {
        if (active) setRelatedEmailsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [disableInitialLoad, document]);

  useEffect(() => {
    if (disableInitialLoad || !editIntent || !document) {
      editIntentAutomationRef.current = null;
      return;
    }

    const key = `${document.documentId}:${editIntent.versionId ?? 'current'}`;
    if (editIntentAutomationRef.current?.key !== key) {
      editIntentAutomationRef.current = {
        key,
        openedNativeDraft: false,
        preparedPackage: false,
        startedSession: false,
      };
    }

    const automation = editIntentAutomationRef.current;
    if (!automation) return;
    const step = nextEditIntentAutomationStep({
      activeSession: activeEditSession,
      document,
      editIntent,
      editPackage,
      isBusy:
        loading ||
        editLifecycleLoading ||
        checkoutSaving ||
        editPackageLoading ||
        nativeDraftLoading ||
        nativeDraftSaving ||
        subversionSaving ||
        checkInSaving ||
        cancelEditSaving ||
        promoteSaving,
      nativeDraft,
      openedNativeDraft: automation.openedNativeDraft,
      preparedPackage: automation.preparedPackage,
      startedSession: automation.startedSession,
    });

    if (step === 'start_session') {
      automation.startedSession = true;
      void startEditSession();
      return;
    }
    if (step === 'prepare_package') {
      automation.preparedPackage = true;
      void prepareEditPackage();
      return;
    }
    if (step === 'open_native_draft') {
      automation.openedNativeDraft = true;
      void openNativeDraft();
    }
  });

  const matterLabel = useMemo(() => {
    if (!document) return 'Matter 확인 중';
    const code = document.matterDisplayCode?.trim();
    const name = document.matterDisplayName?.trim();
    if (code && name) return `${code} · ${name}`;
    if (code) return code;
    if (name) return name;
    return 'Matter app 표시명 없음';
  }, [document]);

  const previewSrc = useMemo(
    () => (document ? previewUrlForDocument(document.documentId, searchHitContext) : ''),
    [document, searchHitContext],
  );

  async function saveProfile() {
    if (!document || !profileDraft || profileSaving) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const updated = await updateDocumentMetadata(document.documentId, {
        confidentialityLevel: profileDraft.confidentialityLevel,
        documentType: profileDraft.documentType,
        subtype: profileDraft.subtype.trim() ? profileDraft.subtype.trim() : null,
        title: profileDraft.title.trim(),
      });
      setDocument(updated);
      setProfileDraft(draftFromDocument(updated));
      setEditingProfile(false);
    } catch (caught) {
      setProfileError(safeApiErrorMessage(caught));
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitNewVersion() {
    if (!document || !versionFile || versionSaving) return;
    setVersionSaving(true);
    setVersionError(null);
    setVersionSuccessMessage(null);
    try {
      const result = await addDocumentVersion(document.documentId, versionFile);
      setVersionFile(null);
      setVersionInputKey((current) => current + 1);
      const [updated, versionResult] = await Promise.all([
        getDocument(document.documentId),
        listDocumentVersions(document.documentId),
      ]);
      setDocument(updated);
      setProfileDraft(draftFromDocument(updated));
      setVersions(versionResult.items);
      await refreshPrepStatus();
      setAuditRefreshKey((current) => current + 1);
      setVersionSuccessMessage(versionUploadStatusMessage(result));
    } catch (caught) {
      setVersionError(safeApiErrorMessage(caught));
    } finally {
      setVersionSaving(false);
    }
  }

  async function startEditSession() {
    if (!document || checkoutSaving) return;
    setCheckoutSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const session = await createDocumentEditSession(document.documentId, {
        ...(editIntent?.versionId ? { baseVersionId: editIntent.versionId } : {}),
        clientKind: 'web_upload',
        checkoutReasonCode: 'WEB_EDIT',
        idempotencyKey: `web-edit:${document.documentId}:${editIntent?.versionId ?? 'current'}`,
      });
      setActiveEditSession(session);
      setEditPackage(null);
      setNativeDraft(null);
      setNativeDraftContent('');
      setSubversionVisibilityScope('matter_editors');
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(`v${session.baseVersionNo} 편집 세션을 시작했습니다.`);
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setCheckoutSaving(false);
    }
  }

  async function prepareEditPackage() {
    if (!document || !activeEditSession || editPackageLoading) return;
    setEditPackageLoading(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const prepared = await getDocumentEditPackage(
        document.documentId,
        activeEditSession.editSessionId,
      );
      setEditPackage(prepared);
      setEditLifecycleSuccessMessage(`v${prepared.baseVersionNo} 편집 패키지를 준비했습니다.`);
    } catch (caught) {
      setEditPackage(null);
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setEditPackageLoading(false);
    }
  }

  function openEditBaseFile() {
    if (!document || !activeEditSession) return;
    window.location.assign(documentEditBaseFileUrl(document.documentId, activeEditSession.editSessionId));
  }

  function openSubversionFile(subversion: DocumentSubversionDto) {
    if (!document) return;
    window.location.assign(documentSubversionFileUrl(document.documentId, subversion.subversionId));
  }

  function nativeEditorErrorMessage(caught: unknown): string {
    if (caught instanceof ApiClientError && caught.code === 'VALIDATION_FAILED') {
      return 'Vault 편집기는 텍스트 계열 문서만 열 수 있습니다.';
    }
    return editLifecycleErrorMessage(caught);
  }

  async function openNativeDraft() {
    if (!document || !activeEditSession || nativeDraftLoading) return;
    setNativeDraftLoading(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const draft = await getNativeDocumentEditDraft(
        document.documentId,
        activeEditSession.editSessionId,
      );
      setNativeDraft(draft);
      setNativeDraftContent(draft.content);
      setEditLifecycleSuccessMessage(`v${draft.baseVersionNo} draft를 열었습니다.`);
    } catch (caught) {
      setNativeDraft(null);
      setNativeDraftContent('');
      setEditLifecycleError(nativeEditorErrorMessage(caught));
    } finally {
      setNativeDraftLoading(false);
    }
  }

  async function saveNativeDraftContent() {
    if (!document || !activeEditSession || !nativeDraft || nativeDraftSaving) return;
    setNativeDraftSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const result = await saveNativeDocumentEditDraft(
        document.documentId,
        activeEditSession.editSessionId,
        {
          clientSaveId: `native-save:${Date.now().toString(36)}`,
          content: nativeDraftContent,
          saveReasonCode: 'NATIVE_SAVE',
          visibilityScope: 'matter_editors',
        },
      );
      setNativeDraft({
        ...nativeDraft,
        content: nativeDraftContent,
        sha256: result.fileHash,
        sizeBytes: new TextEncoder().encode(nativeDraftContent).byteLength,
      });
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(`${result.displayVersion} Vault draft를 저장했습니다.`);
    } catch (caught) {
      setEditLifecycleError(nativeEditorErrorMessage(caught));
    } finally {
      setNativeDraftSaving(false);
    }
  }

  async function saveInternalSubversion() {
    if (!document || !activeEditSession || !subversionFile || subversionSaving) return;
    setSubversionSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const result = await saveDocumentSubversion(
        document.documentId,
        activeEditSession.editSessionId,
        subversionFile,
        {
          clientSaveId: `web-save:${Date.now().toString(36)}`,
          ...(editPackage
            ? {
                editPackageMode: editPackage.mode,
                expectedBaseSha256: editPackage.sha256,
              }
            : {}),
          saveReasonCode: 'MANUAL_SAVE',
          visibilityScope: subversionVisibilityScope,
        },
      );
      setSubversionFile(null);
      setSubversionInputKey((current) => current + 1);
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(`${result.displayVersion} 내부 subversion을 저장했습니다.`);
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setSubversionSaving(false);
    }
  }

  async function checkInEditSession() {
    if (!document || !activeEditSession || checkInSaving) return;
    const latestSavedSubversion = newestSubversion(
      subversions.filter(
        (subversion) =>
          subversion.editSessionId === activeEditSession.editSessionId &&
          subversion.status === 'saved',
      ),
    );
    if (!latestSavedSubversion) return;
    setCheckInSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const session = await checkInDocumentEditSession(
        document.documentId,
        activeEditSession.editSessionId,
        {
          expectedLastSubversionId: latestSavedSubversion.subversionId,
        },
      );
      setActiveEditSession(session);
      setEditPackage(null);
      setNativeDraft(null);
      setNativeDraftContent('');
      setSubversionVisibilityScope('matter_editors');
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(`${latestSavedSubversion.displayVersion} 체크인을 완료했습니다.`);
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setCheckInSaving(false);
    }
  }

  async function cancelEditSession() {
    if (!document || !activeEditSession || cancelEditSaving) return;
    setCancelEditSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      await cancelDocumentEditSession(document.documentId, activeEditSession.editSessionId, {
        cancelledReasonCode: 'USER_CANCELLED',
      });
      setSubversionFile(null);
      setEditPackage(null);
      setNativeDraft(null);
      setNativeDraftContent('');
      setSubversionVisibilityScope('matter_editors');
      setSubversionInputKey((current) => current + 1);
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage('편집 세션을 취소했습니다.');
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setCancelEditSaving(false);
    }
  }

  async function promoteSubversion(subversion: DocumentSubversionDto) {
    if (!document || promoteSaving) return;
    setPromoteSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const result = await promoteDocumentSubversion(document.documentId, subversion.subversionId, {
        expectedBaseVersionId: subversion.baseVersionId,
        publishReasonCode: 'CLIENT_READY',
        idempotencyKey: `web-promote:${subversion.subversionId}:${Date.now().toString(36)}`,
      });
      const [updated, versionResult] = await Promise.all([
        getDocument(document.documentId),
        listDocumentVersions(document.documentId),
      ]);
      setDocument(updated);
      setProfileDraft(draftFromDocument(updated));
      setVersions(versionResult.items);
      await refreshEditingState();
      await refreshPrepStatus();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(
        `${subversion.displayVersion}을 공식 v${result.versionNo} 버전으로 발행했습니다.`,
      );
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setPromoteSaving(false);
    }
  }

  async function assignReviewerToSelectedSubversion() {
    if (
      !document ||
      !selectedReviewSubversionId ||
      !selectedReviewerSubject ||
      selectedReviewerSubject.subjectType !== 'user' ||
      reviewerSaving
    ) {
      return;
    }
    setReviewerSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const reviewer = await assignDocumentSubversionReviewer(
        document.documentId,
        selectedReviewSubversionId,
        {
          reviewerUserId: selectedReviewerSubject.subjectId,
        },
      );
      setSelectedReviewerSubject(null);
      await refreshSubversionReviewers(selectedReviewSubversionId);
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(`${reviewerLabel(reviewer)} 검토자를 지정했습니다.`);
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setReviewerSaving(false);
    }
  }

  async function revokeReviewerFromSelectedSubversion(reviewer: DocumentSubversionReviewerDto) {
    if (!document || reviewerSaving) return;
    setReviewerSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      await revokeDocumentSubversionReviewer(
        document.documentId,
        reviewer.subversionId,
        reviewer.reviewerUserId,
      );
      await refreshSubversionReviewers(reviewer.subversionId);
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(`${reviewerLabel(reviewer)} 검토자 지정을 해제했습니다.`);
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setReviewerSaving(false);
    }
  }

  async function submitReviewDecisionForSelectedSubversion(
    decision: DocumentSubversionReviewDecision,
  ) {
    if (!document || !selectedReviewSubversionId || reviewDecisionSaving) return;
    setReviewDecisionSaving(true);
    setEditLifecycleError(null);
    setEditLifecycleSuccessMessage(null);
    try {
      const review = await submitDocumentSubversionReview(
        document.documentId,
        selectedReviewSubversionId,
        { decision },
      );
      await refreshSubversionReviews(selectedReviewSubversionId);
      await refreshEditingState();
      setAuditRefreshKey((current) => current + 1);
      setEditLifecycleSuccessMessage(`${reviewActorLabel(review)} 검토 결정을 저장했습니다.`);
    } catch (caught) {
      setEditLifecycleError(editLifecycleErrorMessage(caught));
    } finally {
      setReviewDecisionSaving(false);
    }
  }

  function downloadCurrentDocument() {
    if (!document) return;
    window.location.assign(documentDownloadUrl(document.documentId, downloadReason));
  }

  return (
    <>
      <PageHeader
        breadcrumbs={['Vault', '파일']}
        title={document?.title || '표시 가능한 제목 없음'}
        description="권한이 확인된 파일 정보만 표시됩니다."
        actions={
          <div className="flex max-w-full flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              새로고침
            </Button>
            {document ? (
              <Button asChild size="sm">
                <a href="#document-download">
                  <Download className="h-4 w-4" />
                  다운로드 사유
                </a>
              </Button>
            ) : (
              <Button type="button" size="sm" disabled>
                <Download className="h-4 w-4" />
                다운로드 사유
              </Button>
            )}
            {document ? <DocumentHeaderRecordsActions document={document} /> : null}
          </div>
        }
      />

      {error ? <EmptyState variant="api-error" title="파일 정보를 표시할 수 없습니다." description={error} /> : null}

      {document ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="space-y-4">
            <DocumentActionHierarchyPanel document={document} />

            <SectionCard
              icon={<FileText className="h-4 w-4" />}
              title="문서 프로필"
              meta={matterLabel}
              actions={<StatusBadge tone={statusTone(document.status)}>{document.status}</StatusBadge>}
            >
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <ProfileField label="Matter" value={matterLabel} />
                <ProfileField
                  label="문서 유형"
                  value={approvedDocumentTypeLabel(document.documentType, typeLabels, taxonomyCatalog)}
                />
                <ProfileField label="세부 유형" value={document.subtype || '없음'} />
                <ProfileField
                  label="보안 등급"
                  value={confidentialityLabels[document.confidentialityLevel]}
                />
                <ProfileField label="특권 상태" value={document.privilegeStatus} />
                <ProfileField label="업데이트" value={formatDateTime(document.updatedAt)} />
                <ProfileField label="추출 상태" value={document.extractionStatus ?? '확인 불가'} />
                <ProfileField label="추출 방식" value={document.extractionMethod ?? '확인 불가'} />
                <ProfileField label="Legal Hold" value={document.legalHold ? '적용' : '미적용'} />
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingProfile((current) => !current)}
                >
                  {editingProfile ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {editingProfile ? '닫기' : '프로필 편집'}
                </Button>
              </div>

              {editingProfile && profileDraft ? (
                <div className="mt-4 grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium">
                    제목
                    <Input
                      value={profileDraft.title}
                      onChange={(event) =>
                        setProfileDraft((current) =>
                          current ? { ...current, title: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    문서 유형
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={profileDraft.documentType}
                      onChange={(event) =>
                        setProfileDraft((current) =>
                          current
                            ? { ...current, documentType: event.target.value as DocumentType }
                            : current,
                        )
                      }
                    >
                      {documentTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    세부 유형
                    <Input
                      value={profileDraft.subtype}
                      list={profileSubtypeOptions.length > 0 ? subtypeListId : undefined}
                      onChange={(event) =>
                        setProfileDraft((current) =>
                          current ? { ...current, subtype: event.target.value } : current,
                        )
                      }
                    />
                    {profileSubtypeOptions.length > 0 ? (
                      <datalist id={subtypeListId}>
                        {profileSubtypeOptions.map((subtype) => (
                          <option key={subtype} value={subtype} />
                        ))}
                      </datalist>
                    ) : null}
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    보안 등급
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={profileDraft.confidentialityLevel}
                      onChange={(event) =>
                        setProfileDraft((current) =>
                          current
                            ? {
                                ...current,
                                confidentialityLevel: event.target
                                  .value as DocumentConfidentialityLevel,
                              }
                            : current,
                        )
                      }
                    >
                      {documentConfidentialityLevels.map((level) => (
                        <option key={level} value={level}>
                          {confidentialityLabels[level]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Button type="button" size="sm" onClick={saveProfile} disabled={profileSaving}>
                      <Save className="h-4 w-4" />
                      {profileSaving ? '저장 중' : '저장'}
                    </Button>
                    {profileError ? (
                      <p className="text-sm text-destructive">{profileError}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </SectionCard>

            <DocumentGovernanceContextPanel document={document} prepStatus={prepStatus} />

            {searchHitContext ? (
              <SearchHitContextPanel context={searchHitContext} documentId={document.documentId} />
            ) : null}

            <SectionCard
              icon={<Eye className="h-4 w-4" />}
              title="미리보기"
              meta={searchHitContext ? searchTargetLabels[searchHitContext.target] : '권한 확인 후 제공'}
              actions={
                searchHitContext?.hitCount ? (
                  <StatusBadge tone="neutral">
                    hit {searchHitContext.hitIndex}/{searchHitContext.hitCount}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">preview</StatusBadge>
                )
              }
            >
              <div className="aspect-[16/10] overflow-hidden rounded-md border bg-muted">
                <iframe
                  className="h-full w-full bg-background"
                  src={previewSrc}
                  title={`${document.title} preview`}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {searchHitContext?.hitCount
                  ? '검색 hit 위치는 서버로 검색어 또는 스니펫을 보내지 않는 미리보기 fragment로만 연결됩니다.'
                  : '미리보기가 준비되지 않은 파일은 서버가 안전한 오류 상태를 반환합니다.'}
              </p>
            </SectionCard>

            {prepStatus ? <AiPrepStatusPanel status={prepStatus} /> : null}
            {prepError ? <p className="text-sm text-muted-foreground">{prepError}</p> : null}

            <DocumentAuditTimeline
              disableInitialLoad={disableInitialLoad}
              documentId={document.documentId}
              initialEvents={initialAuditEvents}
              refreshKey={auditRefreshKey}
            />
          </div>

          <aside className="space-y-4">
            <DocumentWorkflowOpsPanel document={document} prepStatus={prepStatus} />

            <RelatedDocumentsPanel
              currentDocument={document}
              documents={relatedDocuments}
              errorMessage={relatedDocumentsError}
              isLoading={relatedDocumentsLoading}
              taxonomyCatalog={taxonomyCatalog}
            />

            <RelatedEmailsPanel
              emails={relatedEmails}
              errorMessage={relatedEmailsError}
              isLoading={relatedEmailsLoading}
            />

            <DocumentEditingLifecyclePanel
              activeSession={activeEditSession}
              cancelSaving={cancelEditSaving}
              checkInSaving={checkInSaving}
              checkoutSaving={checkoutSaving}
              editIntent={editIntent}
              editPackage={editPackage}
              editPackageLoading={editPackageLoading}
              errorMessage={editLifecycleError}
              isLoading={editLifecycleLoading}
              nativeDraft={nativeDraft}
              nativeDraftContent={nativeDraftContent}
              nativeDraftLoading={nativeDraftLoading}
              nativeDraftSaving={nativeDraftSaving}
              matterId={document.matterId}
              onCancelSession={cancelEditSession}
              onCheckInSession={checkInEditSession}
              onChangeNativeDraftContent={setNativeDraftContent}
              onAssignReviewer={assignReviewerToSelectedSubversion}
              onOpenEditBaseFile={openEditBaseFile}
              onOpenNativeDraft={openNativeDraft}
              onOpenSubversionFile={openSubversionFile}
              onPrepareEditPackage={prepareEditPackage}
              onPromoteSubversion={promoteSubversion}
              onRevokeReviewer={revokeReviewerFromSelectedSubversion}
              onSaveNativeDraft={saveNativeDraftContent}
              onSaveSubversion={saveInternalSubversion}
              onSelectReviewerSubject={setSelectedReviewerSubject}
              onSelectReviewSubversion={setSelectedReviewSubversionId}
              onSelectSubversionVisibilityScope={setSubversionVisibilityScope}
              onSubmitReviewDecision={submitReviewDecisionForSelectedSubversion}
              onSelectSubversionFile={(file) => {
                setSubversionFile(file);
                setEditLifecycleSuccessMessage(null);
              }}
              onStartSession={startEditSession}
              promoteSaving={promoteSaving}
              reviewDecisionSaving={reviewDecisionSaving}
              reviewDecisions={subversionReviews}
              reviewsLoading={subversionReviewsLoading}
              reviewerSaving={reviewerSaving}
              reviewers={subversionReviewers}
              reviewersLoading={subversionReviewersLoading}
              selectedReviewerSubject={selectedReviewerSubject}
              selectedReviewSubversionId={selectedReviewSubversionId}
              subversionFile={subversionFile}
              subversionInputKey={subversionInputKey}
              subversionSaving={subversionSaving}
              subversionVisibilityScope={subversionVisibilityScope}
              subversions={subversions}
              successMessage={editLifecycleSuccessMessage}
            />

            <SectionCard
              id="document-download"
              icon={<Download className="h-4 w-4" />}
              title="다운로드"
              meta="감사 기록 대상"
              actions={<ShieldCheck className="h-4 w-4 text-primary" />}
            >
              <label className="space-y-1 text-sm font-medium">
                사유
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={downloadReason}
                  onChange={(event) =>
                    setDownloadReason(event.target.value as DocumentDownloadReasonCode)
                  }
                >
                  {documentDownloadReasonCodes.map((reason) => (
                    <option key={reason} value={reason}>
                      {downloadReasonLabels[reason]}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" className="mt-3 w-full" onClick={downloadCurrentDocument}>
                <Download className="h-4 w-4" />
                다운로드 시작
              </Button>
            </SectionCard>

            <SectionCard
              icon={<History className="h-4 w-4" />}
              title="버전"
              meta="원본 보존"
              actions={<StatusBadge tone="neutral">{versions.length}</StatusBadge>}
            >
              <DataTable caption="문서 버전 목록" minWidthClassName="min-w-[520px]">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>버전</DataTableHead>
                    <DataTableHead>상태</DataTableHead>
                    <DataTableHead>생성</DataTableHead>
                    <DataTableHead>관계</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  <VersionRows versions={versions} />
                </DataTableBody>
              </DataTable>

              <div className="mt-4 rounded-md border bg-background">
                <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
                  <Clock3 className="h-4 w-4 text-primary" />
                  업로드 및 처리 큐
                </div>
                {uploadQueueItems(document, prepStatus, versionFile, versionSaving).length > 0 ? (
                  <ul className="divide-y">
                    {uploadQueueItems(document, prepStatus, versionFile, versionSaving).map((item) => (
                      <li key={item.title} className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{item.title}</span>
                          <StatusBadge tone={item.tone}>상태 기반</StatusBadge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    대기 중인 업로드 또는 처리 작업이 없습니다.
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-md border bg-muted/20 p-3">
                <label className="space-y-1 text-sm font-medium">
                  새 버전 파일
                  <Input
                    key={versionInputKey}
                    type="file"
                    onChange={(event) => {
                      setVersionFile(event.target.files?.[0] ?? null);
                      setVersionSuccessMessage(null);
                    }}
                  />
                </label>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={submitNewVersion}
                  disabled={!versionFile || versionSaving}
                >
                  <Upload className="h-4 w-4" />
                  {versionSaving ? '업로드 중' : '새 버전 추가'}
                </Button>
                {versionError ? <p className="mt-2 text-sm text-destructive">{versionError}</p> : null}
                {versionSuccessMessage ? (
                  <p className="mt-2 text-sm font-medium text-primary" role="status">
                    {versionSuccessMessage}
                  </p>
                ) : null}
              </div>
            </SectionCard>

          </aside>
        </div>
      ) : null}

      {!document && !error && !loading ? (
        <EmptyState title="표시할 문서가 없습니다." description="권한이 있거나 존재하는 문서만 열람할 수 있습니다." />
      ) : null}
    </>
  );
}
