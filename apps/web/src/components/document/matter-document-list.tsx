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
  type DocumentFolderDto,
  type DocumentPrivilegeStatus,
  type DocumentStatus,
  type DocumentType,
  type ListDocumentSort,
  type ListDocumentsQueryDto,
} from '@amic-vault/shared';
import {
  listDocumentFolders,
  listDocumentTags,
  listMatterDocuments,
  setDocumentTags,
  updateDocumentMetadata,
} from '@/lib/api-client';
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
import { matterFileCabinetContextUrl } from '@/components/matter/matter-dms-links';
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
  folderId: string;
  legalHold: BooleanFilterValue;
  privilegeStatus: '' | DocumentPrivilegeStatus;
  sortBy: ListDocumentSort;
  status: '' | DocumentStatus;
  tag: string;
  title: string;
}

export const emptyMatterDocumentFilters: MatterDocumentFilterState = {
  aiAllowed: '',
  confidentialityLevel: '',
  documentType: '',
  extractionStatus: '',
  folderId: '',
  legalHold: '',
  privilegeStatus: '',
  sortBy: 'updated_desc',
  status: '',
  tag: '',
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
    folderId: filters.folderId.trim(),
    tag: filters.tag.trim(),
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

function countActiveFilters(filters: MatterDocumentFilterState): number {
  return [
    filters.aiAllowed,
    filters.confidentialityLevel,
    filters.documentType,
    filters.extractionStatus,
    filters.folderId.trim(),
    filters.legalHold,
    filters.privilegeStatus,
    filters.status,
    filters.tag.trim(),
    filters.title.trim(),
  ].filter(Boolean).length;
}

function parseDocumentTagsInput(value: string): string[] {
  const tags = value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 50);
}

function DocumentTagEditor({
  document,
  onTagsUpdate,
}: {
  document: DocumentDto;
  onTagsUpdate: ((document: DocumentDto, tags: string[]) => Promise<void>) | undefined;
}) {
  const [value, setValue] = React.useState((document.tags ?? []).join(', '));
  const [isSaving, setIsSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue((document.tags ?? []).join(', '));
  }, [document.documentId, document.tags]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onTagsUpdate) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onTagsUpdate(document, parseDocumentTagsInput(value));
    } catch (error) {
      setErrorMessage(safeApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid min-w-[14rem] gap-1.5" onSubmit={handleSubmit}>
      <Input
        aria-label={`${document.title} 태그`}
        value={value}
        placeholder="태그"
        disabled={!onTagsUpdate || isSaving}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={!onTagsUpdate || isSaving}>
          저장
        </Button>
        {errorMessage ? <span className="text-xs text-destructive">{errorMessage}</span> : null}
      </div>
    </form>
  );
}

function MatterFolderTree({
  folders,
  selectedFolderId,
  onSelect,
}: {
  folders: readonly DocumentFolderDto[];
  selectedFolderId: string;
  onSelect: (folderId: string) => void;
}) {
  if (folders.length === 0) return null;
  const sortedFolders = [...folders].sort((left, right) => left.path.localeCompare(right.path));
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">폴더</p>
        <Button type="button" variant="outline" size="sm" onClick={() => onSelect('')}>
          전체
        </Button>
      </div>
      <div className="grid gap-1">
        {sortedFolders.map((folder) => {
          const depth = Math.max(0, folder.path.split('/').length - 1);
          const selected = selectedFolderId === folder.folderId;
          return (
            <button
              key={folder.folderId}
              type="button"
              className={`h-8 rounded-md px-2 text-left text-sm ${
                selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => onSelect(folder.folderId)}
            >
              {folder.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DocumentFolderSelector({
  document,
  folders,
  onFolderUpdate,
}: {
  document: DocumentDto;
  folders: DocumentFolderDto[];
  onFolderUpdate: ((document: DocumentDto, folderId: string | null) => Promise<void>) | undefined;
}) {
  const [value, setValue] = React.useState(document.folderId ?? '');
  const [isSaving, setIsSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue(document.folderId ?? '');
  }, [document.documentId, document.folderId]);

  if (!onFolderUpdate) {
    return <span className="text-muted-foreground">{document.folderPath?.trim() || '루트'}</span>;
  }
  const submitFolderUpdate = onFolderUpdate!;

  const hasCurrentFolder =
    document.folderId !== null &&
    document.folderId !== undefined &&
    folders.some((folder) => folder.folderId === document.folderId);
  const folderOptions = hasCurrentFolder || !document.folderId
    ? folders
    : [
        ...folders,
        {
          folderId: document.folderId,
          matterId: document.matterId,
          parentFolderId: null,
          name: document.folderPath?.trim() || '현재 폴더',
          path: document.folderPath?.trim() || '현재 폴더',
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      ];

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;
    const previousValue = value;
    setValue(nextValue);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await submitFolderUpdate(document, nextValue || null);
    } catch (error) {
      setValue(previousValue);
      setErrorMessage(safeApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid min-w-[14rem] gap-1.5">
      <select
        aria-label={`${document.title} 폴더`}
        className={selectClassName}
        disabled={isSaving}
        value={value}
        onChange={handleChange}
      >
        <option value="">루트</option>
        {folderOptions.map((folder) => (
          <option key={folder.folderId} value={folder.folderId}>
            {folder.path}
          </option>
        ))}
      </select>
      {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
    </div>
  );
}

export function MatterDocumentTable({
  documents,
  folders = [],
  onFolderUpdate,
  onTagsUpdate,
}: {
  documents: DocumentDto[];
  folders?: DocumentFolderDto[];
  onFolderUpdate?: (document: DocumentDto, folderId: string | null) => Promise<void>;
  onTagsUpdate?: (document: DocumentDto, tags: string[]) => Promise<void>;
}) {
  return (
    <DataTable caption="Matter별 문서함" minWidthClassName="min-w-[1320px]">
      <DataTableHeader>
        <tr>
          <DataTableHead>문서</DataTableHead>
          <DataTableHead>폴더</DataTableHead>
          <DataTableHead>유형</DataTableHead>
          <DataTableHead>상태</DataTableHead>
          <DataTableHead>보안</DataTableHead>
          <DataTableHead>특권</DataTableHead>
          <DataTableHead>태그</DataTableHead>
          <DataTableHead>파일 정리</DataTableHead>
          <DataTableHead>추출/OCR</DataTableHead>
          <DataTableHead>보존 조치</DataTableHead>
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
            <DataTableCell className="min-w-[16rem]">
              <DocumentFolderSelector
                document={document}
                folders={folders}
                onFolderUpdate={onFolderUpdate}
              />
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
            <DataTableCell className="min-w-[16rem]">
              <DocumentTagEditor document={document} onTagsUpdate={onTagsUpdate} />
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
  const [folders, setFolders] = React.useState<DocumentFolderDto[]>([]);
  const [knownTags, setKnownTags] = React.useState<string[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [draftFilters, setDraftFilters] =
    React.useState<MatterDocumentFilterState>(emptyMatterDocumentFilters);
  const [filters, setFilters] = React.useState<MatterDocumentFilterState>(emptyMatterDocumentFilters);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [organizationError, setOrganizationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedMatter) {
      setDocuments([]);
      setFolders([]);
      setKnownTags([]);
      setTotalCount(0);
      setErrorMessage(null);
      setOrganizationError(null);
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

  React.useEffect(() => {
    if (!selectedMatter) return;
    let active = true;
    setDraftFilters(emptyMatterDocumentFilters);
    setFilters(emptyMatterDocumentFilters);
    setOrganizationError(null);
    Promise.all([
      listDocumentFolders(selectedMatter.matterReference),
      listDocumentTags(selectedMatter.matterReference),
    ])
      .then(([folderList, tagList]) => {
        if (!active) return;
        setFolders(folderList);
        setKnownTags(tagList.tags);
      })
      .catch((error) => {
        if (!active) return;
        setFolders([]);
        setKnownTags([]);
        setOrganizationError(safeApiErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [selectedMatter]);

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

  function selectFolderFilter(folderId: string) {
    const nextFilters = cleanMatterDocumentFilters({ ...draftFilters, folderId });
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  }

  async function handleDocumentTagsUpdate(document: DocumentDto, tags: string[]): Promise<void> {
    const result = await setDocumentTags(document.documentId, { tags });
    setDocuments((current) =>
      current.map((item) =>
        item.documentId === document.documentId ? { ...item, tags: result.tags } : item,
      ),
    );
    setKnownTags((current) => [...new Set([...current, ...result.tags])].sort());
  }

  async function handleDocumentFolderUpdate(
    document: DocumentDto,
    folderId: string | null,
  ): Promise<void> {
    const result = await updateDocumentMetadata(document.documentId, { folderId });
    setDocuments((current) =>
      current.map((item) => (item.documentId === document.documentId ? result : item)),
    );
  }

  if (!selectedMatter) {
    return (
      <EmptyState
        variant="pre-search"
        title="Matter code를 선택하면 파일 목록이 표시됩니다."
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
      <FilterField htmlFor="matter-document-legal-hold" label="보존 조치">
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
      <FilterField htmlFor="matter-document-folder" label="폴더">
        <select
          id="matter-document-folder"
          className={selectClassName}
          value={draftFilters.folderId}
          onChange={(event) => updateDraftFilter('folderId', event.target.value)}
        >
          <option value="">전체</option>
          {folders.map((folder) => (
            <option key={folder.folderId} value={folder.folderId}>
              {folder.path}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField htmlFor="matter-document-tag" label="태그">
        <Input
          id="matter-document-tag"
          value={draftFilters.tag}
          list="matter-document-tags"
          onChange={(event) => updateDraftFilter('tag', event.target.value)}
          placeholder="태그"
        />
        <datalist id="matter-document-tags">
          {knownTags.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
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
      <div className="mb-3 flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link
            href={matterFileCabinetContextUrl(
              selectedMatter.matterCode,
              filters.folderId || undefined,
            )}
          >
            워크벤치에서 보기
          </Link>
        </Button>
      </div>
      <FilterBar
        label="Matter 문서함 필터"
        title="Matter 문서함 필터"
        description="선택한 Matter code 안에서 권한이 확인된 문서를 문서명, 보안 상태, 파일 정리 상태, 추출/OCR 상태 기준으로 좁힙니다."
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
      {organizationError ? (
        <p className="mt-2 text-sm text-destructive">{organizationError}</p>
      ) : null}
      <div className="mt-3">
        <MatterFolderTree
          folders={folders}
          selectedFolderId={draftFilters.folderId}
          onSelect={selectFolderFilter}
        />
      </div>
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
          description="선택한 Matter code에서 접근 권한과 필터 조건을 통과한 파일이 여기에 표시됩니다."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterPanel}
      <div className="flex min-h-11 items-center justify-between gap-3 border-b bg-muted/30 px-3 text-sm">
        <span className="font-medium text-foreground">Matter별 문서</span>
        <span className="text-muted-foreground">{totalCount}건</span>
      </div>
      <MatterDocumentTable
        documents={documents}
        folders={folders}
        onFolderUpdate={handleDocumentFolderUpdate}
        onTagsUpdate={handleDocumentTagsUpdate}
      />
    </div>
  );
}

export { formatDate };
