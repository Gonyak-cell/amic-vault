'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  documentConfidentialityLevels,
  documentExtractionStatuses,
  documentPrivilegeStatuses,
  documentStatuses,
  documentTypes,
  listDocumentSortValues,
  type DocumentConfidentialityLevel,
  type DocumentDto,
  type DocumentExtractionStatus,
  type DocumentPrivilegeStatus,
  type DocumentStatus,
  type DocumentType,
  type ListDocumentSort,
  type ListDocumentsQueryDto,
} from '@amic-vault/shared';
import { listDocuments } from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, FilterField } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';

const pageSize = 25;
type BooleanFilterValue = '' | 'true' | 'false';

export interface DocumentVaultFilterState {
  aiAllowed: BooleanFilterValue;
  confidentialityLevel: '' | DocumentConfidentialityLevel;
  documentType: '' | DocumentType;
  extractionStatus: '' | DocumentExtractionStatus;
  legalHold: BooleanFilterValue;
  matterCode: string;
  privilegeStatus: '' | DocumentPrivilegeStatus;
  sortBy: ListDocumentSort;
  status: '' | DocumentStatus;
  title: string;
}

export interface DocumentVaultListProps {
  refreshKey?: number | string;
}

const emptyDocumentVaultFilters: DocumentVaultFilterState = {
  aiAllowed: '',
  confidentialityLevel: '',
  documentType: '',
  extractionStatus: '',
  legalHold: '',
  matterCode: '',
  privilegeStatus: '',
  sortBy: 'updated_desc',
  status: '',
  title: '',
};

export const selectClassName =
  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export const documentTypeLabels = {
  contract: '계약',
  memo: '메모',
  opinion: '의견서',
  court_filing: '소송 제출',
  evidence: '증거',
  correspondence: '서신',
  corporate_record: '회사 기록',
  financial: '재무',
  other: '기타',
} as const satisfies Record<DocumentType, string>;

export const documentStatusLabels = {
  draft: '초안',
  internal_review: '내부 검토',
  client_sent: '고객 발송',
  counterparty_sent: '상대방 발송',
  markup_received: '마크업 수령',
  negotiation: '협상',
  final: '최종',
  executed: '체결',
  archived: '보관',
  disposal_locked: '처분 잠금',
  deleted: '삭제',
} as const satisfies Record<DocumentStatus, string>;

export const confidentialityLabels = {
  standard: '일반',
  high: '높음',
  restricted: '제한',
} as const satisfies Record<DocumentConfidentialityLevel, string>;

export const privilegeLabels = {
  none: '비특권',
  privileged: '특권',
  work_product: '업무 산출물',
  joint_privilege: '공동 특권',
} as const satisfies Record<DocumentPrivilegeStatus, string>;

export const extractionStatusLabels = {
  pending: '추출 대기',
  ready: '검색 가능',
  ocr_pending: 'OCR 필요',
  failed: '추출 실패',
} as const satisfies Record<DocumentExtractionStatus, string>;

export const sortLabels = {
  updated_desc: '최근 업데이트',
  updated_asc: '오래된 업데이트',
  title_asc: '문서명',
  matter_asc: 'Matter Code',
  type_asc: '문서 유형',
  status_asc: '상태',
} as const satisfies Record<ListDocumentSort, string>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function matterLabel(document: DocumentDto): string {
  const code = document.matterDisplayCode?.trim();
  const name = document.matterDisplayName?.trim();
  if (code && name) return `${code} · ${name}`;
  if (code) return code;
  if (name) return name;
  return 'Matter 표시명 없음';
}

function extractionLabel(status: DocumentExtractionStatus | null | undefined): string {
  return status ? extractionStatusLabels[status] : '확인 전';
}

function extractionTone(
  status: DocumentExtractionStatus | null | undefined,
): 'blocked' | 'neutral' | 'success' | 'warning' {
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'blocked';
  if (status === 'ocr_pending') return 'warning';
  return 'neutral';
}

function booleanFilterValue(value: BooleanFilterValue): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function cleanFilters(filters: DocumentVaultFilterState): DocumentVaultFilterState {
  return {
    ...filters,
    matterCode: filters.matterCode.trim(),
    title: filters.title.trim(),
  };
}

function enumParam<T extends readonly string[]>(values: T, value: string | null): T[number] | '' {
  return value && (values as readonly string[]).includes(value) ? (value as T[number]) : '';
}

function booleanParam(value: string | null): BooleanFilterValue {
  if (value === 'true' || value === 'false') return value;
  return '';
}

export function documentVaultFiltersFromParams(params: {
  get(name: string): string | null;
}): DocumentVaultFilterState {
  return {
    aiAllowed: booleanParam(params.get('aiAllowed')),
    confidentialityLevel: enumParam(
      documentConfidentialityLevels,
      params.get('confidentialityLevel'),
    ),
    documentType: enumParam(documentTypes, params.get('documentType')),
    extractionStatus: enumParam(documentExtractionStatuses, params.get('extractionStatus')),
    legalHold: booleanParam(params.get('legalHold')),
    matterCode: params.get('matterCode')?.trim() ?? '',
    privilegeStatus: enumParam(documentPrivilegeStatuses, params.get('privilegeStatus')),
    sortBy: enumParam(listDocumentSortValues, params.get('sortBy')) || 'updated_desc',
    status: enumParam(documentStatuses, params.get('status')),
    title: params.get('title')?.trim() ?? '',
  };
}

export function documentVaultPageFromParams(params: { get(name: string): string | null }): number {
  return Math.max(1, Number(params.get('page') ?? '1') || 1);
}

export function documentVaultUrlForFilters(
  filters: DocumentVaultFilterState,
  page: number,
): string {
  const cleaned = cleanFilters(filters);
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (cleaned.title) params.set('title', cleaned.title);
  if (cleaned.matterCode) params.set('matterCode', cleaned.matterCode);
  if (cleaned.documentType) params.set('documentType', cleaned.documentType);
  if (cleaned.status) params.set('status', cleaned.status);
  if (cleaned.confidentialityLevel) {
    params.set('confidentialityLevel', cleaned.confidentialityLevel);
  }
  if (cleaned.privilegeStatus) params.set('privilegeStatus', cleaned.privilegeStatus);
  if (cleaned.extractionStatus) params.set('extractionStatus', cleaned.extractionStatus);
  if (cleaned.aiAllowed) params.set('aiAllowed', cleaned.aiAllowed);
  if (cleaned.legalHold) params.set('legalHold', cleaned.legalHold);
  if (cleaned.sortBy !== 'updated_desc') params.set('sortBy', cleaned.sortBy);
  const queryString = params.toString();
  return queryString ? `/files?${queryString}` : '/files';
}

export function documentVaultListQueryFromFilters(
  filters: DocumentVaultFilterState,
  page: number,
): Partial<ListDocumentsQueryDto> {
  const cleaned = cleanFilters(filters);
  return {
    page,
    pageSize,
    sortBy: cleaned.sortBy,
    ...(cleaned.title ? { title: cleaned.title } : {}),
    ...(cleaned.matterCode ? { matterCode: cleaned.matterCode } : {}),
    ...(cleaned.documentType ? { documentType: cleaned.documentType } : {}),
    ...(cleaned.status ? { status: cleaned.status } : {}),
    ...(cleaned.confidentialityLevel ? { confidentialityLevel: cleaned.confidentialityLevel } : {}),
    ...(cleaned.privilegeStatus ? { privilegeStatus: cleaned.privilegeStatus } : {}),
    ...(cleaned.extractionStatus ? { extractionStatus: cleaned.extractionStatus } : {}),
    ...(cleaned.aiAllowed ? { aiAllowed: booleanFilterValue(cleaned.aiAllowed) } : {}),
    ...(cleaned.legalHold ? { legalHold: booleanFilterValue(cleaned.legalHold) } : {}),
  };
}

function countActiveFilters(filters: DocumentVaultFilterState): number {
  return [
    filters.aiAllowed,
    filters.confidentialityLevel,
    filters.documentType,
    filters.extractionStatus,
    filters.legalHold,
    filters.matterCode.trim(),
    filters.privilegeStatus,
    filters.status,
    filters.title.trim(),
  ].filter(Boolean).length;
}

export function DocumentVaultList({ refreshKey = 0 }: DocumentVaultListProps) {
  const router = useRouter();
  const params = useSearchParams();
  const initialFilters = React.useMemo(() => documentVaultFiltersFromParams(params), [params]);
  const initialPage = React.useMemo(() => documentVaultPageFromParams(params), [params]);
  const [documents, setDocuments] = React.useState<DocumentDto[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(initialPage);
  const [draftFilters, setDraftFilters] = React.useState<DocumentVaultFilterState>(initialFilters);
  const [filters, setFilters] = React.useState<DocumentVaultFilterState>(initialFilters);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    listDocuments(documentVaultListQueryFromFilters(filters, page))
      .then((response) => {
        if (!active) return;
        setDocuments(response.items);
        setTotalCount(response.totalCount);
      })
      .catch((error) => {
        if (active) setErrorMessage(safeApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, page, refreshKey]);

  function updateDraftFilter<K extends keyof DocumentVaultFilterState>(
    key: K,
    value: DocumentVaultFilterState[K],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = cleanFilters(draftFilters);
    setPage(1);
    setFilters(cleaned);
    router.replace(documentVaultUrlForFilters(cleaned, 1));
  }

  function resetFilters() {
    setDraftFilters(emptyDocumentVaultFilters);
    setFilters(emptyDocumentVaultFilters);
    setPage(1);
    router.replace('/files');
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    router.replace(documentVaultUrlForFilters(filters, nextPage));
  }

  const activeFilterCount = countActiveFilters(filters);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const filterControls = (
    <>
      <FilterField htmlFor="document-vault-title" label="문서명">
        <Input
          id="document-vault-title"
          value={draftFilters.title}
          onChange={(event) => updateDraftFilter('title', event.target.value)}
          placeholder="문서명 검색"
        />
      </FilterField>
      <FilterField htmlFor="document-vault-matter-code" label="Matter Code">
        <Input
          id="document-vault-matter-code"
          value={draftFilters.matterCode}
          onChange={(event) => updateDraftFilter('matterCode', event.target.value)}
          placeholder="AMIC-2026"
        />
      </FilterField>
      <FilterField htmlFor="document-vault-type" label="유형">
        <select
          id="document-vault-type"
          className={selectClassName}
          value={draftFilters.documentType}
          onChange={(event) =>
            updateDraftFilter(
              'documentType',
              event.target.value as DocumentVaultFilterState['documentType'],
            )
          }
        >
          <option value="">전체</option>
          {documentTypes.map((type) => (
            <option key={type} value={type}>
              {documentTypeLabels[type]}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField htmlFor="document-vault-status" label="상태">
        <select
          id="document-vault-status"
          className={selectClassName}
          value={draftFilters.status}
          onChange={(event) =>
            updateDraftFilter('status', event.target.value as DocumentVaultFilterState['status'])
          }
        >
          <option value="">전체</option>
          {documentStatuses
            .filter((status) => status !== 'deleted')
            .map((status) => (
              <option key={status} value={status}>
                {documentStatusLabels[status]}
              </option>
            ))}
        </select>
      </FilterField>
      <FilterField htmlFor="document-vault-confidentiality" label="보안 등급">
        <select
          id="document-vault-confidentiality"
          className={selectClassName}
          value={draftFilters.confidentialityLevel}
          onChange={(event) =>
            updateDraftFilter(
              'confidentialityLevel',
              event.target.value as DocumentVaultFilterState['confidentialityLevel'],
            )
          }
        >
          <option value="">전체</option>
          {documentConfidentialityLevels.map((level) => (
            <option key={level} value={level}>
              {confidentialityLabels[level]}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField htmlFor="document-vault-privilege" label="특권 상태">
        <select
          id="document-vault-privilege"
          className={selectClassName}
          value={draftFilters.privilegeStatus}
          onChange={(event) =>
            updateDraftFilter(
              'privilegeStatus',
              event.target.value as DocumentVaultFilterState['privilegeStatus'],
            )
          }
        >
          <option value="">전체</option>
          {documentPrivilegeStatuses.map((status) => (
            <option key={status} value={status}>
              {privilegeLabels[status]}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField htmlFor="document-vault-ai-allowed" label="파일 정리">
        <select
          id="document-vault-ai-allowed"
          className={selectClassName}
          value={draftFilters.aiAllowed}
          onChange={(event) =>
            updateDraftFilter('aiAllowed', event.target.value as BooleanFilterValue)
          }
        >
          <option value="">전체</option>
          <option value="true">정리 준비</option>
          <option value="false">정리 제외</option>
        </select>
      </FilterField>
      <FilterField htmlFor="document-vault-extraction-status" label="추출/OCR">
        <select
          id="document-vault-extraction-status"
          className={selectClassName}
          value={draftFilters.extractionStatus}
          onChange={(event) =>
            updateDraftFilter(
              'extractionStatus',
              event.target.value as DocumentVaultFilterState['extractionStatus'],
            )
          }
        >
          <option value="">전체</option>
          {documentExtractionStatuses.map((status) => (
            <option key={status} value={status}>
              {extractionStatusLabels[status]}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField htmlFor="document-vault-legal-hold" label="보존">
        <select
          id="document-vault-legal-hold"
          className={selectClassName}
          value={draftFilters.legalHold}
          onChange={(event) =>
            updateDraftFilter('legalHold', event.target.value as BooleanFilterValue)
          }
        >
          <option value="">전체</option>
          <option value="true">보존 적용</option>
          <option value="false">보존 없음</option>
        </select>
      </FilterField>
      <FilterField htmlFor="document-vault-sort" label="정렬">
        <select
          id="document-vault-sort"
          className={selectClassName}
          value={draftFilters.sortBy}
          onChange={(event) => updateDraftFilter('sortBy', event.target.value as ListDocumentSort)}
        >
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FilterField>
    </>
  );

  const filterPanel = (
    <form onSubmit={applyFilters}>
      <FilterBar
        label="문서함 필터"
        title="문서함 필터"
        description="권한이 확인된 문서를 Matter Code, 문서명, 보안 상태, 파일 정리 상태, 추출/OCR 상태 기준으로 좁힙니다."
        resultsSummary={
          isLoading
            ? '문서함을 확인하는 중입니다.'
            : `${totalCount}건 · 활성 필터 ${activeFilterCount}개`
        }
        controls={filterControls}
        actions={
          <>
            <Button type="submit" size="sm" disabled={isLoading}>
              적용
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              초기화
            </Button>
          </>
        }
      />
    </form>
  );

  if (errorMessage) {
    return (
      <div className="space-y-3">
        {filterPanel}
        <EmptyState
          variant="api-error"
          title="전체 문서를 표시할 수 없습니다."
          description={errorMessage}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {filterPanel}
        <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          전체 문서를 확인하는 중입니다.
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="space-y-3">
        {filterPanel}
        <EmptyState
          variant="no-data"
          title="표시할 문서가 없습니다."
          description="접근 권한과 필터 조건을 통과한 문서만 이 문서함에 표시됩니다."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterPanel}
      <div className="flex min-h-11 items-center justify-between gap-3 border-b bg-muted/30 px-3 text-sm">
        <span className="font-medium text-foreground">권한 내 문서</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{totalCount}건</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => goToPage(Math.max(1, page - 1))}
          >
            이전
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
          >
            다음
          </Button>
        </div>
      </div>
      <DataTable caption="권한 내 문서함" minWidthClassName="min-w-[1040px]">
        <DataTableHeader>
          <tr>
            <DataTableHead>문서</DataTableHead>
            <DataTableHead>Matter</DataTableHead>
            <DataTableHead>유형</DataTableHead>
            <DataTableHead>상태</DataTableHead>
            <DataTableHead>보안</DataTableHead>
            <DataTableHead>정리</DataTableHead>
            <DataTableHead>추출/OCR</DataTableHead>
            <DataTableHead>업데이트</DataTableHead>
          </tr>
        </DataTableHeader>
        <DataTableBody>
          {documents.map((document) => (
            <DataTableRow key={document.documentId}>
              <DataTableCell className="max-w-[20rem] truncate font-medium text-foreground">
                <Link
                  href={`/documents/${document.documentId}`}
                  className="underline-offset-4 hover:text-primary hover:underline"
                >
                  {document.title}
                </Link>
              </DataTableCell>
              <DataTableCell className="max-w-[18rem] truncate text-muted-foreground">
                {matterLabel(document)}
              </DataTableCell>
              <DataTableCell className="text-muted-foreground">
                {documentTypeLabels[document.documentType]}
              </DataTableCell>
              <DataTableCell className="text-muted-foreground">
                {documentStatusLabels[document.status]}
              </DataTableCell>
              <DataTableCell>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge
                    tone={document.confidentialityLevel === 'restricted' ? 'blocked' : 'neutral'}
                  >
                    {confidentialityLabels[document.confidentialityLevel]}
                  </StatusBadge>
                  <StatusBadge tone={document.privilegeStatus === 'none' ? 'neutral' : 'warning'}>
                    {privilegeLabels[document.privilegeStatus]}
                  </StatusBadge>
                  {document.legalHold ? <StatusBadge tone="warning">보존</StatusBadge> : null}
                </div>
              </DataTableCell>
              <DataTableCell>
                <StatusBadge tone={document.aiAllowed ? 'success' : 'neutral'}>
                  {document.aiAllowed ? '정리 준비' : '제외'}
                </StatusBadge>
              </DataTableCell>
              <DataTableCell>
                <StatusBadge tone={extractionTone(document.extractionStatus)}>
                  {extractionLabel(document.extractionStatus)}
                </StatusBadge>
              </DataTableCell>
              <DataTableCell className="text-muted-foreground">
                {formatDate(document.updatedAt)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}

export {
  emptyDocumentVaultFilters,
  extractionLabel as documentVaultExtractionLabel,
  extractionTone as documentVaultExtractionTone,
  formatDate as formatVaultDocumentDate,
  matterLabel as documentVaultMatterLabel,
};
