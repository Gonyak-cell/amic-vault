'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Loader2, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import {
  documentConfidentialityLevels,
  documentExtractionStatuses,
  documentPrivilegeStatuses,
  documentStatuses,
  documentTypes,
  listDocumentSortValues,
  type DocumentConfidentialityLevel,
  type DocumentDto,
  type DocumentFolderDto,
  type DocumentExtractionStatus,
  type DocumentPrivilegeStatus,
  type DocumentStatus,
  type DocumentType,
  type ListDocumentSort,
  type ListDocumentsQueryDto,
} from '@amic-vault/shared';
import { listDocuments, updateDocumentStatus } from '@/lib/api-client';
import { documentStatusTransitionTargets } from '@/lib/document-status-transitions';
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
import { FilterField } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import type { MatterCodeOption } from '@/lib/matter-app';
import { DocumentBulkActions } from './document-bulk-actions';

const pageSize = 25;
type BooleanFilterValue = '' | 'true' | 'false';

export interface DocumentVaultFilterState {
  aiAllowed: BooleanFilterValue;
  confidentialityLevel: '' | DocumentConfidentialityLevel;
  documentType: '' | DocumentType;
  extractionStatus: '' | DocumentExtractionStatus;
  folderId: string;
  legalHold: BooleanFilterValue;
  matterCode: string;
  privilegeStatus: '' | DocumentPrivilegeStatus;
  sortBy: ListDocumentSort;
  status: '' | DocumentStatus;
  tag: string;
  title: string;
}

export interface DocumentVaultListProps {
  folders?: readonly DocumentFolderDto[];
  onDocumentSelect?: (document: DocumentDto | null) => void;
  refreshKey?: number | string;
  selectedDocumentId?: string | null;
  selectedFolderId?: string;
  selectedMatter?: MatterCodeOption | null;
  workbenchContext?: boolean;
}

const emptyDocumentVaultFilters: DocumentVaultFilterState = {
  aiAllowed: '',
  confidentialityLevel: '',
  documentType: '',
  extractionStatus: '',
  folderId: '',
  legalHold: '',
  matterCode: '',
  privilegeStatus: '',
  sortBy: 'updated_desc',
  status: '',
  tag: '',
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
  email: '이메일',
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
  matter_asc: 'Matter 코드',
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

function DocumentFolderAndTags({ document }: { document: DocumentDto }) {
  const tags = document.tags ?? [];
  return (
    <div className="min-w-0 space-y-1">
      <p className="truncate text-sm">{document.folderPath?.trim() || '루트'}</p>
      {tags.length > 0 ? (
        <div className="flex max-w-[18rem] flex-wrap gap-1">
          {tags.map((tag) => (
            <StatusBadge key={tag} tone="neutral">
              {tag}
            </StatusBadge>
          ))}
        </div>
      ) : null}
    </div>
  );
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
    folderId: filters.folderId.trim(),
    tag: filters.tag.trim(),
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
    folderId: params.get('folderId')?.trim() ?? '',
    legalHold: booleanParam(params.get('legalHold')),
    matterCode: params.get('matterCode')?.trim() ?? '',
    privilegeStatus: enumParam(documentPrivilegeStatuses, params.get('privilegeStatus')),
    sortBy: enumParam(listDocumentSortValues, params.get('sortBy')) || 'updated_desc',
    status: enumParam(documentStatuses, params.get('status')),
    tag: params.get('tag')?.trim() ?? '',
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
  if (cleaned.folderId) params.set('folderId', cleaned.folderId);
  if (cleaned.tag) params.set('tag', cleaned.tag);
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
    ...(cleaned.folderId ? { folderId: cleaned.folderId } : {}),
    ...(cleaned.tag ? { tag: cleaned.tag } : {}),
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
    filters.folderId.trim(),
    filters.privilegeStatus,
    filters.status,
    filters.tag.trim(),
    filters.title.trim(),
  ].filter(Boolean).length;
}

function countAdvancedFilters(filters: DocumentVaultFilterState): number {
  return [
    filters.aiAllowed,
    filters.confidentialityLevel,
    filters.documentType,
    filters.extractionStatus,
    filters.legalHold,
    filters.privilegeStatus,
    filters.status,
  ].filter(Boolean).length;
}

export function DocumentVaultList({
  folders = [],
  onDocumentSelect,
  refreshKey = 0,
  selectedDocumentId = null,
  selectedFolderId = '',
  selectedMatter = null,
  workbenchContext = false,
}: DocumentVaultListProps) {
  const router = useRouter();
  const params = useSearchParams();
  const initialFilters = React.useMemo(() => documentVaultFiltersFromParams(params), [params]);
  const initialPage = React.useMemo(() => documentVaultPageFromParams(params), [params]);
  const [documents, setDocuments] = React.useState<DocumentDto[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(initialPage);
  const [draftFilters, setDraftFilters] = React.useState<DocumentVaultFilterState>(initialFilters);
  const [filters, setFilters] = React.useState<DocumentVaultFilterState>(initialFilters);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = React.useState(
    () => countAdvancedFilters(initialFilters) > 0,
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusTransitionError, setStatusTransitionError] = React.useState<string | null>(null);
  const [statusTransitionDocumentId, setStatusTransitionDocumentId] = React.useState<string | null>(
    null,
  );
  const [selectedDocumentIds, setSelectedDocumentIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [bulkActionRevision, setBulkActionRevision] = React.useState(0);
  const bulkActionRefreshRef = React.useRef(false);
  const filtersRef = React.useRef(filters);
  const contextKey = `${selectedMatter?.matterReference ?? ''}:${selectedFolderId}`;
  const previousContextKeyRef = React.useRef(contextKey);

  React.useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  React.useEffect(() => {
    if (!workbenchContext || previousContextKeyRef.current === contextKey) return;
    previousContextKeyRef.current = contextKey;
    const nextFilters = cleanFilters({
      ...filtersRef.current,
      folderId: selectedFolderId,
      matterCode: selectedMatter?.matterCode ?? '',
    });
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    setPage(1);
    onDocumentSelect?.(null);
    router.replace(documentVaultUrlForFilters(nextFilters, 1));
  }, [
    contextKey,
    onDocumentSelect,
    router,
    selectedFolderId,
    selectedMatter?.matterCode,
    workbenchContext,
  ]);

  React.useEffect(() => {
    onDocumentSelect?.(null);
    setSelectedDocumentIds(new Set());
  }, [filters, onDocumentSelect, page, refreshKey]);

  React.useEffect(() => {
    if (
      selectedDocumentId &&
      !documents.some((document) => document.documentId === selectedDocumentId)
    ) {
      onDocumentSelect?.(null);
    }
  }, [documents, onDocumentSelect, selectedDocumentId]);

  React.useEffect(() => {
    let active = true;
    const silentRefresh = bulkActionRefreshRef.current;
    bulkActionRefreshRef.current = false;
    if (!silentRefresh) setIsLoading(true);
    setErrorMessage(null);
    listDocuments(documentVaultListQueryFromFilters(filters, page))
      .then((response) => {
        if (!active) return;
        setDocuments(response.items);
        setTotalCount(response.totalCount);
        setSelectedDocumentIds((current) => {
          const visibleIds = new Set(response.items.map((document) => document.documentId));
          return new Set([...current].filter((documentId) => visibleIds.has(documentId)));
        });
      })
      .catch((error) => {
        if (active) setErrorMessage(safeApiErrorMessage(error));
      })
      .finally(() => {
        if (active && !silentRefresh) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bulkActionRevision, filters, page, refreshKey]);

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
    const nextFilters = {
      ...emptyDocumentVaultFilters,
      ...(workbenchContext
        ? {
            folderId: selectedFolderId,
            matterCode: selectedMatter?.matterCode ?? '',
          }
        : {}),
    };
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    setPage(1);
    router.replace(documentVaultUrlForFilters(nextFilters, 1));
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    router.replace(documentVaultUrlForFilters(filters, nextPage));
  }

  async function transitionDocumentStatus(document: DocumentDto, status: DocumentStatus) {
    if (document.status === status || statusTransitionDocumentId) return;
    setStatusTransitionDocumentId(document.documentId);
    setStatusTransitionError(null);
    try {
      const updated = await updateDocumentStatus(document.documentId, { status });
      setDocuments((current) =>
        current.map((item) => (item.documentId === updated.documentId ? updated : item)),
      );
    } catch (caught) {
      setStatusTransitionError(safeApiErrorMessage(caught));
    } finally {
      setStatusTransitionDocumentId(null);
    }
  }

  function toggleDocumentSelection(documentId: string, selected: boolean) {
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      if (selected) next.add(documentId);
      else next.delete(documentId);
      return next;
    });
  }

  const activeFilterCount = countActiveFilters(filters);
  const draftAdvancedFilterCount = countAdvancedFilters(draftFilters);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const advancedPanelId = 'document-vault-advanced-filters';
  const selectedFolder = folders.find((folder) => folder.folderId === selectedFolderId);
  const selectedDocuments = documents.filter((document) =>
    selectedDocumentIds.has(document.documentId),
  );
  const allPageDocumentsSelected =
    documents.length > 0 && selectedDocumentIds.size === documents.length;
  const somePageDocumentsSelected = selectedDocumentIds.size > 0 && !allPageDocumentsSelected;

  const quickSearchControls = (
    <>
      <FilterField htmlFor="document-vault-title" label="문서명">
        <Input
          id="document-vault-title"
          value={draftFilters.title}
          onChange={(event) => updateDraftFilter('title', event.target.value)}
          placeholder="문서명 검색"
        />
      </FilterField>
      <FilterField htmlFor="document-vault-tag" label="태그">
        <Input
          id="document-vault-tag"
          value={draftFilters.tag}
          onChange={(event) => updateDraftFilter('tag', event.target.value)}
          placeholder="예: 체결"
        />
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

  const advancedFilterControls = (
    <>
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
    </>
  );

  const filterPanel = (
    <form aria-label="문서함 필터" className="border-b pb-4" onSubmit={applyFilters}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-[15px] font-semibold tracking-normal text-foreground">
              문서함 검색
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              접근 가능한 문서를 문서명과 Matter 코드 기준으로 찾습니다.
            </p>
            <div aria-live="polite" className="text-xs leading-5 text-muted-foreground">
              {isLoading
                ? '문서함을 확인하는 중입니다.'
                : `${totalCount}건 · 활성 필터 ${activeFilterCount}개`}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <Button type="submit" size="sm" disabled={isLoading} title="검색 적용">
              <Search className="mr-1.5 h-4 w-4" aria-hidden="true" />
              검색
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFilters}
              title="검색 조건 초기화"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              초기화
            </Button>
          </div>
        </div>

        {workbenchContext ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {selectedMatter
              ? `${selectedMatter.matterCode} · ${selectedMatter.matterName || 'Matter'} · ${selectedFolder?.path || '전체 폴더'}`
              : '전체 Matter · 전체 폴더'}
          </p>
        ) : null}

        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quickSearchControls}
        </div>

        <div className="border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-controls={advancedPanelId}
            aria-expanded={advancedFiltersOpen}
            className="w-full min-w-[220px] justify-between sm:w-auto"
            title={advancedFiltersOpen ? '상세 검색 접기' : '상세 검색 펼치기'}
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
          >
            <span className="flex min-w-0 items-center whitespace-nowrap">
              <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
              상세 검색
              <span className="ml-2 shrink-0 text-xs font-normal text-muted-foreground">
                {draftAdvancedFilterCount > 0
                  ? `상세 조건 · ${draftAdvancedFilterCount}개`
                  : '상세 조건 · 선택 없음'}
              </span>
            </span>
            <ChevronDown
              className={`ml-3 h-4 w-4 shrink-0 transition-transform ${
                advancedFiltersOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </Button>
          {advancedFiltersOpen ? (
            <div
              id={advancedPanelId}
              className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              {advancedFilterControls}
            </div>
          ) : null}
        </div>
      </div>
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
          <Loader2 className="mr-2 h-4 w-4" aria-hidden="true" />
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
          description="조건에 맞는 문서가 없습니다. 검색 조건을 바꾸거나 초기화해 주세요."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterPanel}
      {selectedDocuments.length > 0 ? (
        <DocumentBulkActions
          documents={selectedDocuments}
          onClear={() => setSelectedDocumentIds(new Set())}
          onCompleted={() => {
            bulkActionRefreshRef.current = true;
            setBulkActionRevision((current) => current + 1);
          }}
        />
      ) : null}
      {statusTransitionError ? (
        <p className="text-sm text-destructive">{statusTransitionError}</p>
      ) : null}
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
      <DataTable caption="권한 내 문서함" minWidthClassName="min-w-[920px]">
        <DataTableHeader>
          <tr>
            <DataTableHead className="w-12">
              <PageSelectionCheckbox
                allSelected={allPageDocumentsSelected}
                someSelected={somePageDocumentsSelected}
                onChange={(selected) =>
                  setSelectedDocumentIds(
                    selected
                      ? new Set(documents.map((document) => document.documentId))
                      : new Set(),
                  )
                }
              />
            </DataTableHead>
            <DataTableHead>문서</DataTableHead>
            <DataTableHead>Matter</DataTableHead>
            <DataTableHead>폴더/태그</DataTableHead>
            <DataTableHead>유형</DataTableHead>
            <DataTableHead>상태</DataTableHead>
            <DataTableHead>업데이트</DataTableHead>
          </tr>
        </DataTableHeader>
        <DataTableBody>
          {documents.map((document) => (
            <DataTableRow
              key={document.documentId}
              onSelect={onDocumentSelect ? () => onDocumentSelect(document) : undefined}
              selected={selectedDocumentId === document.documentId}
            >
              <DataTableCell className="w-12">
                <input
                  aria-label={`${document.title} 선택`}
                  checked={selectedDocumentIds.has(document.documentId)}
                  className="h-4 w-4 rounded border"
                  onChange={(event) =>
                    toggleDocumentSelection(document.documentId, event.target.checked)
                  }
                  type="checkbox"
                />
              </DataTableCell>
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
              <DataTableCell className="max-w-[18rem] text-muted-foreground">
                <DocumentFolderAndTags document={document} />
              </DataTableCell>
              <DataTableCell className="text-muted-foreground">
                {documentTypeLabels[document.documentType]}
              </DataTableCell>
              <DataTableCell className="min-w-[11rem] text-muted-foreground">
                <div className="flex min-w-[10rem] items-center gap-2">
                  <select
                    aria-label={`${document.title} 상태 변경`}
                    className="h-9 w-[9.5rem] rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    value={document.status}
                    disabled={
                      statusTransitionDocumentId !== null ||
                      documentStatusTransitionTargets(document).length === 0
                    }
                    onChange={(event) =>
                      void transitionDocumentStatus(document, event.target.value as DocumentStatus)
                    }
                  >
                    <option value={document.status}>{documentStatusLabels[document.status]}</option>
                    {documentStatusTransitionTargets(document).map((status) => (
                      <option key={status} value={status}>
                        {documentStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                  {statusTransitionDocumentId === document.documentId ? (
                    <Loader2 className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                </div>
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

function PageSelectionCheckbox({
  allSelected,
  someSelected,
  onChange,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onChange: (selected: boolean) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = someSelected;
  }, [someSelected]);
  return (
    <input
      ref={inputRef}
      aria-label="현재 페이지 문서 선택"
      checked={allSelected}
      className="h-4 w-4 rounded border"
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  );
}

export {
  DocumentFolderAndTags,
  emptyDocumentVaultFilters,
  extractionLabel as documentVaultExtractionLabel,
  extractionTone as documentVaultExtractionTone,
  formatDate as formatVaultDocumentDate,
  matterLabel as documentVaultMatterLabel,
};
