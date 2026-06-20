'use client';

import React from 'react';
import { Bookmark, Copy, RotateCcw, Save, Trash2 } from 'lucide-react';
import type {
  DocumentConfidentialityLevel,
  DocumentPrivilegeStatus,
  DocumentType,
  SavedSearchDto,
  SearchGroupBy,
  SearchQueryDto,
  SearchSort,
  SearchTarget,
  SearchUrlPrivacyMode,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { SearchFacetSelection } from './search-facets';

export interface SearchSavePanelProps {
  busy: boolean;
  onDeleteSavedSearch?: (savedSearchId: string) => void;
  onOpenSavedSearch?: (savedSearch: SavedSearchDto) => void;
  onSaveSearch?: (name: string) => void;
  privacyMode?: SearchUrlPrivacyMode;
  query: string;
  selection: SearchFacetSelection;
  savedSearchBusy?: boolean;
  savedSearchError?: string | null;
  savedSearches?: SavedSearchDto[];
  reusableUrl: string;
}

interface SearchPatternItem {
  label: string;
  value: string;
}

const targetLabels = {
  all: '제목+본문',
  title: '제목',
  body: '본문',
} as const satisfies Record<SearchTarget, string>;

const sortLabels = {
  relevance: '관련도',
  updated_desc: '최근 수정',
  updated_asc: '오래된 수정',
  title_asc: '제목',
  matter_asc: 'Matter',
  type_asc: '파일 유형',
} as const satisfies Record<SearchSort, string>;

const groupLabels = {
  none: '그룹 없음',
  matter: 'Matter',
  client: '고객',
  type: '파일 유형',
} as const satisfies Record<SearchGroupBy, string>;

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

const dateRangeLabels = {
  last_7_days: '최근 7일',
  last_30_days: '최근 30일',
  older: '30일 이전',
} as const;

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

export function SearchSavePanel({
  busy,
  onDeleteSavedSearch,
  onOpenSavedSearch,
  onSaveSearch,
  privacyMode = 'plaintext_url',
  query,
  reusableUrl,
  savedSearchBusy = false,
  savedSearchError = null,
  savedSearches = [],
  selection,
}: SearchSavePanelProps) {
  const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');
  const [savedSearchName, setSavedSearchName] = React.useState('');
  const items = searchPatternItems(query, selection);
  const hasReusableSearch = query.trim().length > 0;
  const allowsPlaintextReusableUrl = privacyMode === 'plaintext_url';
  const canSave = hasReusableSearch && !busy && !savedSearchBusy && Boolean(onSaveSearch);
  const canCopyReusableUrl =
    hasReusableSearch && allowsPlaintextReusableUrl && reusableUrl.trim().length > 0 && !busy;
  const effectiveSavedSearchName = savedSearchName.trim() || defaultSavedSearchName(query, selection);

  async function copyText(value: string) {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  async function copyReusableUrl() {
    if (!canCopyReusableUrl) return;
    await copyText(reusableUrl);
  }

  async function copySavedSearchReference(savedSearchId: string) {
    if (busy || savedSearchBusy) return;
    await copyText(privateSavedSearchUrl(savedSearchId));
  }

  return (
    <SectionCard
      icon={<Bookmark className="h-4 w-4" />}
      title="저장된 검색"
      meta="현재 조건 재사용"
      actions={
        <StatusBadge tone={savedSearchBusy ? 'warning' : 'neutral'}>
          {savedSearchBusy ? '동기화 중' : `${savedSearches.length}개`}
        </StatusBadge>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <div className="min-w-0">
          {hasReusableSearch ? (
            <>
              <p className="text-sm font-medium text-foreground">현재 검색 조건</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <div key={item.label} className="rounded-md border bg-background px-3 py-2">
                    <dt className="text-[11px] font-medium text-muted-foreground">{item.label}</dt>
                    <dd className="mt-1 truncate text-[13px] font-semibold text-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
              {allowsPlaintextReusableUrl ? (
                <p className="mt-3 break-all rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {reusableUrl}
                </p>
              ) : (
                <p className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                  검색어 포함 URL 비활성화 · 비공개 저장 참조
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              검색어를 입력하면 현재 조건을 다시 열 수 있는 링크가 표시됩니다.
            </p>
          )}
          {copyStatus === 'copied' ? (
            <p className="text-xs font-medium text-primary" role="status">
              링크를 복사했습니다.
            </p>
          ) : null}
          {copyStatus === 'error' ? (
            <p className="text-xs font-medium text-destructive" role="alert">
              브라우저에서 링크 복사를 허용하지 않았습니다.
            </p>
          ) : null}
          {savedSearchError ? (
            <p className="mt-3 text-xs font-medium text-destructive" role="alert">
              {savedSearchError}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-md border bg-background p-3">
            <label className="space-y-1 text-sm font-medium">
              저장 이름
              <Input
                value={savedSearchName}
                placeholder={effectiveSavedSearchName}
                onChange={(event) => setSavedSearchName(event.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canCopyReusableUrl}
                onClick={copyReusableUrl}
              >
                <Copy className="h-4 w-4" />
                링크 복사
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canSave}
                onClick={() => onSaveSearch?.(effectiveSavedSearchName)}
              >
                <Save className="h-4 w-4" />
                저장
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-background">
            <div className="border-b px-3 py-2 text-sm font-semibold">검색 목록</div>
            {savedSearches.length > 0 ? (
              <ul className="divide-y">
                {savedSearches.map((savedSearch) => (
                  <li key={savedSearch.savedSearchId} className="px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{savedSearch.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {savedSearchSummary(savedSearch.query)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {privacyMode === 'private_saved_ref' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy || savedSearchBusy}
                          onClick={() => void copySavedSearchReference(savedSearch.savedSearchId)}
                        >
                          <Copy className="h-4 w-4" />
                          참조 복사
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || savedSearchBusy}
                        onClick={() => onOpenSavedSearch?.(savedSearch)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        열기
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savedSearchBusy}
                        onClick={() => onDeleteSavedSearch?.(savedSearch.savedSearchId)}
                      >
                        <Trash2 className="h-4 w-4" />
                        삭제
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                저장된 검색이 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

export function searchPatternItems(
  query: string,
  selection: SearchFacetSelection,
): SearchPatternItem[] {
  const items: SearchPatternItem[] = [{ label: '검색어', value: query.trim() || '입력 전' }];
  items.push({ label: '검색 범위', value: targetLabels[selection.target ?? 'all'] });
  items.push({ label: '정렬', value: sortLabels[selection.sortBy ?? 'relevance'] });
  items.push({ label: '그룹', value: groupLabels[selection.groupBy ?? 'none'] });
  if (selection.title) items.push({ label: '제목', value: selection.title });
  if (selection.matterCode) items.push({ label: 'Matter Code', value: selection.matterCode });
  if (selection.matterName) items.push({ label: 'Matter 이름', value: selection.matterName });
  if (selection.clientName) items.push({ label: '고객명', value: selection.clientName });
  if (selection.documentType) {
    items.push({ label: '문서 유형', value: documentTypeLabels[selection.documentType] });
  }
  if (selection.confidentialityLevel) {
    items.push({
      label: '기밀도',
      value: confidentialityLabels[selection.confidentialityLevel],
    });
  }
  if (selection.privilegeStatus) {
    items.push({ label: '특권', value: privilegeLabels[selection.privilegeStatus] });
  }
  if (selection.extractionStatus) {
    items.push({
      label: '추출/OCR',
      value: extractionStatusLabels[selection.extractionStatus],
    });
  }
  if (selection.legalHold) {
    items.push({ label: '보존', value: legalHoldLabels[selection.legalHold] });
  }
  if (selection.recordsStatus) {
    items.push({ label: '기록', value: recordsStatusLabels[selection.recordsStatus] });
  }
  if (selection.versionStatus) items.push({ label: '버전 상태', value: selection.versionStatus });
  if (selection.dateRange) items.push({ label: '수정 기간', value: dateRangeLabels[selection.dateRange] });
  return items;
}

function defaultSavedSearchName(query: string, selection: SearchFacetSelection): string {
  const trimmed = query.trim();
  if (!trimmed) return '새 검색';
  const scope = targetLabels[selection.target ?? 'all'];
  return `${trimmed.slice(0, 40)} · ${scope}`;
}

export function savedSearchSummary(query: SearchQueryDto): string {
  const selection: SearchFacetSelection = {
    clientName: query.filters?.clientName,
    confidentialityLevel: query.filters?.confidentialityLevel,
    dateRange: undefined,
    documentType: Array.isArray(query.filters?.documentType)
      ? query.filters.documentType[0]
      : query.filters?.documentType,
    extractionStatus: query.filters?.extractionStatus,
    groupBy: query.groupBy,
    legalHold: query.filters?.legalHold,
    matterCode: query.filters?.matterCode,
    matterName: query.filters?.matterName,
    privilegeStatus: query.filters?.privilegeStatus,
    recordsStatus: query.filters?.recordsStatus,
    sortBy: query.sortBy,
    target: query.target,
    title: query.filters?.title,
    versionStatus: query.filters?.versionStatus,
  };
  return searchPatternItems(query.query ?? '', selection)
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.value}`)
    .join(' · ');
}

function privateSavedSearchUrl(savedSearchId: string): string {
  const params = new URLSearchParams();
  params.set('searchRef', savedSearchId);
  return `/search?${params.toString()}`;
}
