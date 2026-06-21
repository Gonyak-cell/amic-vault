'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
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
  X,
} from 'lucide-react';
import type {
  AddDocumentVersionResponseDto,
  AiPrepDocumentStatusDto,
  DocumentAuditEventDto,
  DocumentConfidentialityLevel,
  DocumentDownloadReasonCode,
  DocumentDto,
  EnterpriseApprovedDmsTaxonomyDto,
  DocumentType,
  DocumentVersionDto,
  EmailMatterFilingDto,
  SearchTarget,
} from '@amic-vault/shared';
import {
  documentConfidentialityLevels,
  documentDownloadReasonCodes,
} from '@amic-vault/shared';
import { AiPrepStatusPanel } from '@/components/ai/ai-prep-status-panel';
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
  documentDownloadUrl,
  documentPreviewUrl,
  getDocument,
  listDocumentVersions,
  listMatterEmailTimeline,
  listMatterDocuments,
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
  initialDocument?: DocumentDto;
  initialRelatedEmails?: EmailMatterFilingDto[];
  initialRelatedDocuments?: DocumentDto[];
  initialTaxonomyCatalog?: EnterpriseApprovedDmsTaxonomyDto[];
  initialVersions?: DocumentVersionDto[];
  searchHitContext?: DocumentSearchHitContext | null;
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
      title: '검토',
      description: '권한 확인 후 미리보기와 문서 감사 타임라인을 먼저 확인합니다.',
      status: document.extractionStatus === 'ready' ? '미리보기 준비' : '서버 상태 확인',
      tone: statusTone(document.extractionStatus ?? 'pending'),
    },
    {
      title: '감사 다운로드',
      description: '다운로드는 사유를 선택한 뒤 감사 대상 작업으로 실행합니다.',
      status: '사유 필수',
      tone: 'success',
    },
    {
      title: '프로필 메타데이터',
      description: '제목, 유형, 세부 유형, 보안 등급만 문서 메타데이터로 수정합니다.',
      status: document.status === 'archived' ? '보관 상태' : '수정 가능',
      tone: document.status === 'archived' ? 'warning' : 'neutral',
    },
    {
      title: '버전 및 Records',
      description: '새 파일은 원본을 덮어쓰지 않고 새 버전으로 추가하며 Records 흐름은 별도 검토합니다.',
      status: document.legalHold ? '보존 적용' : '보존 확인',
      tone: document.legalHold ? 'warning' : 'neutral',
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

function parseSearchTarget(value: string | null): SearchTarget {
  return value === 'title' || value === 'body' || value === 'all' ? value : 'all';
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
      meta="읽기/다운로드 전용"
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
        현재 문서 화면은 미리보기, 사유 기반 다운로드, 프로필 메타데이터 수정, 새 버전 추가를
        지원합니다. 원본 파일을 직접 수정하는 작업은 별도 승인된 편집 계약 전까지 노출하지
        않습니다.
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
  initialAuditEvents = [],
  initialDocument,
  initialRelatedEmails = [],
  initialRelatedDocuments = [],
  initialTaxonomyCatalog = [],
  initialVersions = [],
  searchHitContext = null,
}: DocumentActionCenterProps) {
  const [document, setDocument] = useState<DocumentDto | null>(initialDocument ?? null);
  const [versions, setVersions] = useState<DocumentVersionDto[]>(initialVersions);
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
    } catch (caught) {
      setDocument(null);
      setProfileDraft(null);
      setVersions([]);
      setError(safeApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }

    void refreshPrepStatus();
  }, [documentId, refreshPrepStatus]);

  useEffect(() => {
    if (disableInitialLoad) return;
    void load();
  }, [disableInitialLoad, load]);

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
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              새로고침
            </Button>
            {document ? (
              <Button asChild>
                <a href="#document-download">
                  <Download className="h-4 w-4" />
                  다운로드 사유
                </a>
              </Button>
            ) : (
              <Button type="button" disabled>
                <Download className="h-4 w-4" />
                다운로드 사유
              </Button>
            )}
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

            <SectionCard
              icon={<Link2 className="h-4 w-4" />}
              title="기록/보존"
              meta="권한 범위 내 조치"
            >
              <div className="space-y-2">
                {recordsActionRows(document).map((action) => (
                  <div
                    key={action.tab}
                    className="rounded-md border bg-background px-3 py-2.5"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {action.title}
                          </span>
                          <StatusBadge tone={action.tone}>{action.readiness}</StatusBadge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {action.description}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={recordsUrlForDocument(document, action.tab)}>
                          {action.tab === 'holds' ? <ShieldCheck className="h-4 w-4" /> : null}
                          {action.tab === 'archive' ? <Archive className="h-4 w-4" /> : null}
                          {action.tab === 'disposal' ? <Trash2 className="h-4 w-4" /> : null}
                          {action.buttonLabel}
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
                <Button asChild size="sm" variant="outline">
                  <Link href={fileCabinetUrlForDocument(document)}>
                    <FileSearch className="h-4 w-4" />
                    문서함 위치
                  </Link>
                </Button>
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
