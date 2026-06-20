'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { FolderSearch, RotateCcw, Search, Trash2 } from 'lucide-react';
import type {
  DocumentConfidentialityLevel,
  DocumentPrivilegeStatus,
  DocumentType,
  SavedSearchDto,
  SearchFolderScope,
  SearchQueryDto,
} from '@amic-vault/shared';
import { savedSearchSummary } from '@/components/search/search-save-panel';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import { deleteSavedSearch, listSavedSearches, recordSavedSearchOpen } from '@/lib/api/search';

export function SearchFoldersClient() {
  const router = useRouter();
  const [folders, setFolders] = React.useState<SavedSearchDto[]>([]);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await listSavedSearches();
      setFolders(response.items);
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
      setFolders([]);
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function removeFolder(savedSearchId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteSavedSearch(savedSearchId);
      setFolders((current) => current.filter((folder) => folder.savedSearchId !== savedSearchId));
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openFolder(folder: SavedSearchDto) {
    setBusy(true);
    setError(null);
    try {
      const opened = await recordSavedSearchOpen(folder.savedSearchId);
      setFolders((current) => sortSavedSearchFolders(upsertSavedSearchFolder(current, opened)));
      router.push(searchUrlForSavedQuery(folder.query));
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SearchFoldersContent
      busy={busy}
      error={error}
      folders={folders}
      onDelete={(savedSearchId) => void removeFolder(savedSearchId)}
      onOpen={(folder) => void openFolder(folder)}
    />
  );
}

export function SearchFoldersContent({
  busy,
  error,
  folders,
  onDelete,
  onOpen,
}: {
  busy: boolean;
  error?: string | null;
  folders: readonly SavedSearchDto[];
  onDelete?: (savedSearchId: string) => void;
  onOpen?: (folder: SavedSearchDto) => void;
}) {
  return (
    <SectionCard
      icon={<FolderSearch className="h-4 w-4" />}
      title="내 검색 폴더"
      meta="저장된 검색 기준"
      actions={
        <StatusBadge tone={busy ? 'warning' : 'neutral'}>
          {busy ? '동기화 중' : `${folders.length}개`}
        </StatusBadge>
      }
    >
      {error ? (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {folders.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {folders.map((folder) => (
            <li key={folder.savedSearchId} className="rounded-md border bg-background p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{folder.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {savedSearchSummary(folder.query)}
                  </p>
                </div>
                <StatusBadge>{searchFolderScopeLabel(folder.scope)}</StatusBadge>
              </div>
              <SearchFolderFilterChips query={folder.query} />
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <dt className="text-[11px] font-medium text-muted-foreground">검색 범위</dt>
                  <dd className="mt-1 text-[13px] font-semibold text-foreground">
                    {searchFolderTargetLabel(folder.query)}
                  </dd>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <dt className="text-[11px] font-medium text-muted-foreground">열기</dt>
                  <dd className="mt-1 text-[13px] font-semibold text-foreground">
                    {folder.openCount}회
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {onOpen ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => onOpen(folder)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    열기
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link href={searchUrlForSavedQuery(folder.query)}>
                      <RotateCcw className="h-4 w-4" />
                      열기
                    </Link>
                  </Button>
                )}
                {onDelete ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !folder.canRevoke}
                    onClick={() => onDelete(folder.savedSearchId)}
                  >
                    <Trash2 className="h-4 w-4" />
                    해제
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          variant={busy ? 'api-unavailable' : 'no-data'}
          title={busy ? '검색 폴더를 불러오는 중입니다.' : '저장된 검색 폴더가 없습니다.'}
          description={
            busy
              ? '저장된 검색 조건을 확인하고 있습니다.'
              : '문서 검색에서 조건을 저장하면 이 화면에서 반복 업무용 검색 폴더로 열 수 있습니다.'
          }
          actions={
            <Button asChild variant="outline">
              <Link href="/search">
                <Search className="h-4 w-4" />
                문서 검색으로 이동
              </Link>
            </Button>
          }
        />
      )}
    </SectionCard>
  );
}

function SearchFolderFilterChips({ query }: { query: SearchQueryDto }) {
  const items = searchFolderContextItems(query);
  if (items.length === 0) return null;
  return (
    <dl className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
          <dt className="text-[11px] font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 max-w-48 truncate text-[12px] font-semibold text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function searchUrlForSavedQuery(query: SearchQueryDto): string {
  const params = new URLSearchParams();
  const searchText = query.query?.trim();
  if (searchText) params.set('q', searchText);
  if (query.target && query.target !== 'all') params.set('target', query.target);
  if (query.sortBy && query.sortBy !== 'relevance') params.set('sortBy', query.sortBy);
  if (query.groupBy && query.groupBy !== 'none') params.set('groupBy', query.groupBy);
  if (query.filters?.matterId) params.set('matterId', query.filters.matterId);
  if (query.filters?.clientId) params.set('clientId', query.filters.clientId);
  if (query.filters?.matterCode) params.set('matterCode', query.filters.matterCode);
  if (query.filters?.matterName) params.set('matterName', query.filters.matterName);
  if (query.filters?.clientName) params.set('clientName', query.filters.clientName);
  if (query.filters?.title) params.set('title', query.filters.title);
  if (query.filters?.confidentialityLevel) {
    params.set('confidentialityLevel', query.filters.confidentialityLevel);
  }
  if (typeof query.filters?.documentType === 'string') {
    params.set('documentType', query.filters.documentType);
  }
  if (query.filters?.extractionStatus) {
    params.set('extractionStatus', query.filters.extractionStatus);
  }
  if (query.filters?.legalHold) params.set('legalHold', query.filters.legalHold);
  if (query.filters?.privilegeStatus) params.set('privilegeStatus', query.filters.privilegeStatus);
  if (query.filters?.recordsStatus) params.set('recordsStatus', query.filters.recordsStatus);
  if (query.filters?.versionStatus) params.set('versionStatus', query.filters.versionStatus);
  return `/search?${params.toString()}`;
}

const documentTypeLabels = {
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
  standard: '표준',
  high: '높음',
  restricted: '제한',
} as const satisfies Record<DocumentConfidentialityLevel, string>;

const privilegeLabels = {
  none: '특권 없음',
  privileged: '변호사-의뢰인 특권',
  work_product: '작업 산출물',
  joint_privilege: '공동 특권',
} as const satisfies Record<DocumentPrivilegeStatus, string>;

const extractionStatusLabels = {
  ready: '본문 검색 가능',
  pending: '추출 대기',
  ocr_pending: 'OCR 필요',
  failed: '추출 실패',
} as const;

const legalHoldLabels = {
  document_hold: '파일 삭제 금지',
  matter_hold: '사건 삭제 금지',
  no_hold: '보존 조치 없음',
} as const;

const recordsStatusLabels = {
  active: '운영 중',
  archived: '보관됨',
  disposal_locked: '처분 잠금',
} as const;

function searchFolderContextItems(query: SearchQueryDto): Array<{ label: string; value: string }> {
  const filters = query.filters;
  const items: Array<{ label: string; value: string }> = [];
  if (filters?.matterCode) items.push({ label: 'Matter Code', value: filters.matterCode });
  if (filters?.matterName) items.push({ label: 'Matter', value: filters.matterName });
  if (filters?.clientName) items.push({ label: '고객', value: filters.clientName });
  if (filters?.title) items.push({ label: '제목', value: filters.title });
  if (typeof filters?.documentType === 'string') {
    items.push({ label: '문서 유형', value: documentTypeLabels[filters.documentType] });
  }
  if (filters?.confidentialityLevel) {
    items.push({ label: '기밀도', value: confidentialityLabels[filters.confidentialityLevel] });
  }
  if (filters?.privilegeStatus) {
    items.push({ label: '특권', value: privilegeLabels[filters.privilegeStatus] });
  }
  if (filters?.extractionStatus) {
    items.push({ label: '추출/OCR', value: extractionStatusLabels[filters.extractionStatus] });
  }
  if (filters?.legalHold) {
    items.push({ label: '보존', value: legalHoldLabels[filters.legalHold] });
  }
  if (filters?.recordsStatus) {
    items.push({ label: '기록', value: recordsStatusLabels[filters.recordsStatus] });
  }
  if (filters?.versionStatus) items.push({ label: '버전', value: filters.versionStatus });
  return items;
}

function searchFolderTargetLabel(query: SearchQueryDto): string {
  if (query.target === 'title') return '제목';
  if (query.target === 'body') return '본문';
  return '제목+본문';
}

function searchFolderScopeLabel(scope: SearchFolderScope): string {
  if (scope === 'matter-team') return 'Matter 팀 공유';
  if (scope === 'admin-shared') return '관리자 공유';
  return '개인';
}

function upsertSavedSearchFolder(
  current: SavedSearchDto[],
  next: SavedSearchDto,
): SavedSearchDto[] {
  const withoutExisting = current.filter((folder) => folder.savedSearchId !== next.savedSearchId);
  return [next, ...withoutExisting];
}

function sortSavedSearchFolders(items: SavedSearchDto[]): SavedSearchDto[] {
  return [...items].sort((a, b) => {
    const updated = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (updated !== 0) return updated;
    return a.name.localeCompare(b.name);
  });
}
