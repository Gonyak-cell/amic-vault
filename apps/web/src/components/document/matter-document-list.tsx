'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import {
  documentConfidentialityLevels,
  documentExtractionStatuses,
  documentPrivilegeStatuses,
  documentStatuses,
  documentTypes,
  type DocumentConfidentialityLevel,
  type DocumentDto,
  type DocumentExtractionStatus,
  type DocumentPrivilegeStatus,
  type DocumentStatus,
  type DocumentType,
  type ListDocumentSort,
  type ListDocumentsQueryDto,
} from '@amic-vault/shared';
import { listMatterDocuments } from '@/lib/api-client';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import type { MatterCodeOption } from '@/lib/matter-app';
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
import {
  confidentialityLabels,
  documentStatusLabels,
  documentTypeLabels,
  documentVaultExtractionLabel,
  documentVaultExtractionTone,
  formatVaultDocumentDate,
  privilegeLabels,
  selectClassName,
  sortLabels,
} from './document-vault-list';

export interface MatterDocumentListProps {
  refreshKey?: number | string;
  selectedMatter: MatterCodeOption | null;
}

type BooleanFilterValue = '' | 'true' | 'false';

export interface MatterDocumentFilterState {
  aiAllowed: BooleanFilterValue;
  confidentialityLevel: '' | DocumentConfidentialityLevel;
  documentType: '' | DocumentType;
  extractionStatus: '' | DocumentExtractionStatus;
  legalHold: BooleanFilterValue;
  privilegeStatus: '' | DocumentPrivilegeStatus;
  sortBy: ListDocumentSort;
  status: '' | DocumentStatus;
  title: string;
}

export const emptyMatterDocumentFilters: MatterDocumentFilterState = {
  aiAllowed: '',
  confidentialityLevel: '',
  documentType: '',
  extractionStatus: '',
  legalHold: '',
  privilegeStatus: '',
  sortBy: 'updated_desc',
  status: '',
  title: '',
};

const pageSize = 25;
const formatDate = formatVaultDocumentDate;

function booleanFilterValue(value: BooleanFilterValue): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function cleanMatterDocumentFilters(filters: MatterDocumentFilterState): MatterDocumentFilterState {
  return {
    ...filters,
    title: filters.title.trim(),
  };
}

export function matterDocumentListQueryFromFilters(
  filters: MatterDocumentFilterState,
): Partial<ListDocumentsQueryDto> {
  const cleaned = cleanMatterDocumentFilters(filters);
  return {
    pageSize,
    sortBy: cleaned.sortBy,
    ...(cleaned.title ? { title: cleaned.title } : {}),
    ...(cleaned.documentType ? { documentType: cleaned.documentType } : {}),
    ...(cleaned.status ? { status: cleaned.status } : {}),
    ...(cleaned.confidentialityLevel ? { confidentialityLevel: cleaned.confidentialityLevel } : {}),
    ...(cleaned.privilegeStatus ? { privilegeStatus: cleaned.privilegeStatus } : {}),
    ...(cleaned.extractionStatus ? { extractionStatus: cleaned.extractionStatus } : {}),
    ...(cleaned.aiAllowed ? { aiAllowed: booleanFilterValue(cleaned.aiAllowed) } : {}),
    ...(cleaned.legalHold ? { legalHold: booleanFilterValue(cleaned.legalHold) } : {}),
  };
}

function countActiveFilters(filters: MatterDocumentFilterState): number {
  return [
    filters.aiAllowed,
    filters.confidentialityLevel,
    filters.documentType,
    filters.extractionStatus,
    filters.legalHold,
    filters.privilegeStatus,
    filters.status,
    filters.title.trim(),
  ].filter(Boolean).length;
}

export function MatterDocumentTable({ documents }: { documents: DocumentDto[] }) {
  return (
    <DataTable caption="Matter 범위 문서함" minWidthClassName="min-w-[1120px]">
      <DataTableHeader>
        <tr>
          <DataTableHead>문서</DataTableHead>
          <DataTableHead>유형</DataTableHead>
          <DataTableHead>상태</DataTableHead>
          <DataTableHead>보안</DataTableHead>
          <DataTableHead>특권</DataTableHead>
          <DataTableHead>파일 정리</DataTableHead>
          <DataTableHead>추출/OCR</DataTableHead>
          <DataTableHead>Legal Hold</DataTableHead>
          <DataTableHead>업데이트</DataTableHead>
        </tr>
      </DataTableHeader>
      <DataTableBody>
        {documents.map((document) => (
          <DataTableRow key={document.documentId}>
            <DataTableCell className="max-w-[22rem] truncate font-medium text-foreground">
              <Link
                href={`/documents/${document.documentId}`}
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                {document.title}
              </Link>
            </DataTableCell>
            <DataTableCell className="text-muted-foreground">
              {documentTypeLabels[document.documentType]}
            </DataTableCell>
            <DataTableCell className="text-muted-foreground">
              {documentStatusLabels[document.status]}
            </DataTableCell>
            <DataTableCell>
              <StatusBadge
                tone={document.confidentialityLevel === 'restricted' ? 'blocked' : 'neutral'}
              >
                {confidentialityLabels[document.confidentialityLevel]}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell>
              <StatusBadge tone={document.privilegeStatus === 'none' ? 'neutral' : 'warning'}>
                {privilegeLabels[document.privilegeStatus]}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell>
              <StatusBadge tone={document.aiAllowed ? 'success' : 'neutral'}>
                {document.aiAllowed ? '정리 준비' : '제외'}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell>
              <StatusBadge tone={documentVaultExtractionTone(document.extractionStatus)}>
                {documentVaultExtractionLabel(document.extractionStatus)}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell>
              <StatusBadge tone={document.legalHold ? 'warning' : 'success'}>
                {document.legalHold ? '보존 적용' : '보존 없음'}
              </StatusBadge>
            </DataTableCell>
            <DataTableCell className="text-muted-foreground">
              {formatDate(document.updatedAt)}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export function MatterDocumentList({ refreshKey = 0, selectedMatter }: MatterDocumentListProps) {
  const [documents, setDocuments] = React.useState<DocumentDto[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [draftFilters, setDraftFilters] =
    React.useState<MatterDocumentFilterState>(emptyMatterDocumentFilters);
  const [filters, setFilters] = React.useState<MatterDocumentFilterState>(emptyMatterDocumentFilters);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedMatter) {
      setDocuments([]);
      setTotalCount(0);
      setErrorMessage(null);
      return;
    }
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    listMatterDocuments(selectedMatter.matterReference, matterDocumentListQueryFromFilters(filters))
      .then((response) => {
        if (!active) return;
        setDocuments(response.items);
        setTotalCount(response.totalCount);
      })
      .catch((error) => {
        if (!active) return;
        setDocuments([]);
        setTotalCount(0);
        setErrorMessage(safeApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, refreshKey, selectedMatter]);

  function updateDraftFilter<K extends keyof MatterDocumentFilterState>(
    key: K,
    value: MatterDocumentFilterState[K],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = cleanMatterDocumentFilters(draftFilters);
    setDraftFilters(cleaned);
    setFilters(cleaned);
  }

  function resetFilters() {
    setDraftFilters(emptyMatterDocumentFilters);
    setFilters(emptyMatterDocumentFilters);
  }

  if (!selectedMatter) {
    return (
      <EmptyState
        variant="pre-search"
        title="Matter Code를 선택하면 파일 목록이 표시됩니다."
        description="목록은 접근 권한이 확인된 파일만 표시합니다."
      />
    );
  }

  const activeFilterCount = countActiveFilters(filters);
  const filterControls = (
    <>
      <FilterField htmlFor="matter-document-title" label="문서명">
        <Input
          id="matter-document-title"
          value={draftFilters.title}
          onChange={(event) => updateDraftFilter('title', event.target.value)}
          placeholder="문서명 검색"
        />
      </FilterField>
      <FilterField htmlFor="matter-document-type" label="유형">
        <select
          id="matter-document-type"
          className={selectClassName}
          value={draftFilters.documentType}
          onChange={(event) =>
            updateDraftFilter(
              'documentType',
              event.target.value as MatterDocumentFilterState['documentType'],
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
      <FilterField htmlFor="matter-document-status" label="상태">
        <select
          id="matter-document-status"
          className={selectClassName}
          value={draftFilters.status}
          onChange={(event) =>
            updateDraftFilter('status', event.target.value as MatterDocumentFilterState['status'])
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
      <FilterField htmlFor="matter-document-confidentiality" label="보안 등급">
        <select
          id="matter-document-confidentiality"
          className={selectClassName}
          value={draftFilters.confidentialityLevel}
          onChange={(event) =>
            updateDraftFilter(
              'confidentialityLevel',
              event.target.value as MatterDocumentFilterState['confidentialityLevel'],
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
      <FilterField htmlFor="matter-document-privilege" label="특권 상태">
        <select
          id="matter-document-privilege"
          className={selectClassName}
          value={draftFilters.privilegeStatus}
          onChange={(event) =>
            updateDraftFilter(
              'privilegeStatus',
              event.target.value as MatterDocumentFilterState['privilegeStatus'],
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
      <FilterField htmlFor="matter-document-ai-allowed" label="파일 정리">
        <select
          id="matter-document-ai-allowed"
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
      <FilterField htmlFor="matter-document-extraction-status" label="추출/OCR">
        <select
          id="matter-document-extraction-status"
          className={selectClassName}
          value={draftFilters.extractionStatus}
          onChange={(event) =>
            updateDraftFilter(
              'extractionStatus',
              event.target.value as MatterDocumentFilterState['extractionStatus'],
            )
          }
        >
          <option value="">전체</option>
          {documentExtractionStatuses.map((status) => (
            <option key={status} value={status}>
              {documentVaultExtractionLabel(status)}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField htmlFor="matter-document-legal-hold" label="Legal Hold">
        <select
          id="matter-document-legal-hold"
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
      <FilterField htmlFor="matter-document-sort" label="정렬">
        <select
          id="matter-document-sort"
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
        label="Matter 문서함 필터"
        title="Matter 문서함 필터"
        description="선택한 Matter Code 안에서 권한이 확인된 문서를 문서명, 보안 상태, 파일 정리 상태, 추출/OCR 상태 기준으로 좁힙니다."
        resultsSummary={
          isLoading
            ? 'Matter 문서함을 확인하는 중입니다.'
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
          title="Matter 문서함을 표시할 수 없습니다."
          description={errorMessage}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {filterPanel}
        <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Matter 문서함을 확인하는 중입니다.
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
          title="표시할 파일이 없습니다."
          description="선택한 Matter Code에서 접근 권한과 필터 조건을 통과한 파일이 여기에 표시됩니다."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterPanel}
      <div className="flex min-h-11 items-center justify-between gap-3 border-b bg-muted/30 px-3 text-sm">
        <span className="font-medium text-foreground">Matter 범위 문서</span>
        <span className="text-muted-foreground">{totalCount}건</span>
      </div>
      <MatterDocumentTable documents={documents} />
    </div>
  );
}

export { formatDate };
