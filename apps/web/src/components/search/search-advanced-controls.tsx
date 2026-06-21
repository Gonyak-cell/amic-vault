'use client';

import React, { useEffect, useState } from 'react';
import { HelpCircle, SlidersHorizontal, X } from 'lucide-react';
import {
  documentConfidentialityLevels,
  documentExtractionStatuses,
  documentPrivilegeStatuses,
  searchLegalHoldValues,
  searchRecordsStatusValues,
  searchVersionStatusValues,
  type DocumentConfidentialityLevel,
  type DocumentExtractionStatus,
  type DocumentPrivilegeStatus,
  type DocumentType,
  type EnterpriseApprovedDmsTaxonomyDto,
  type SearchGroupBy,
  type SearchLegalHold,
  type SearchRecordsStatus,
  type SearchSort,
  type SearchTarget,
  type SearchVersionStatus,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { approvedDocumentTypeOptions } from '@/lib/dms-taxonomy';
import {
  hasSearchRefiner,
  searchRefinerFieldKeys,
  type SearchRefinerKeySet,
} from '@/lib/search-refiners';

export type SearchDateRange = 'last_7_days' | 'last_30_days' | 'older';

export interface SearchAdvancedSelection {
  clientName?: string | undefined;
  confidentialityLevel?: DocumentConfidentialityLevel | undefined;
  dateRange?: SearchDateRange | undefined;
  documentType?: DocumentType | undefined;
  extractionStatus?: DocumentExtractionStatus | undefined;
  groupBy?: SearchGroupBy | undefined;
  legalHold?: SearchLegalHold | undefined;
  matterCode?: string | undefined;
  matterName?: string | undefined;
  privilegeStatus?: DocumentPrivilegeStatus | undefined;
  recordsStatus?: SearchRecordsStatus | undefined;
  sortBy?: SearchSort | undefined;
  target?: SearchTarget | undefined;
  title?: string | undefined;
  versionStatus?: SearchVersionStatus | undefined;
}

interface SearchAdvancedControlsProps {
  busy: boolean;
  approvedRefinerKeys?: SearchRefinerKeySet;
  taxonomyCatalog?: EnterpriseApprovedDmsTaxonomyDto[];
  selection: SearchAdvancedSelection;
  onApply: (selection: SearchAdvancedSelection) => void;
  onReset: () => void;
}

type SearchAdvancedDraft = Required<
  Pick<SearchAdvancedSelection, 'groupBy' | 'sortBy' | 'target'>
> & {
  clientName: string;
  confidentialityLevel: DocumentConfidentialityLevel | '';
  dateRange: SearchDateRange | '';
  documentType: DocumentType | '';
  extractionStatus: DocumentExtractionStatus | '';
  matterCode: string;
  matterName: string;
  legalHold: SearchLegalHold | '';
  privilegeStatus: DocumentPrivilegeStatus | '';
  recordsStatus: SearchRecordsStatus | '';
  title: string;
  versionStatus: SearchVersionStatus | '';
};

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

const versionStatusLabels = {
  current: '현재 버전',
  superseded: '이전 버전',
  all: '전체 버전',
} as const satisfies Record<SearchVersionStatus, string>;

const dateRangeLabels = {
  last_7_days: '최근 7일',
  last_30_days: '최근 30일',
  older: '30일 이전',
} as const satisfies Record<SearchDateRange, string>;

const extractionStatusLabels = {
  ready: '본문 검색 가능',
  pending: '추출 대기',
  ocr_pending: 'OCR 필요',
  failed: '추출 실패',
} as const satisfies Record<DocumentExtractionStatus, string>;

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

const legalHoldLabels = {
  document_hold: '파일 삭제 금지',
  matter_hold: '사건 삭제 금지',
  no_hold: '보존 조치 없음',
} as const satisfies Record<SearchLegalHold, string>;

const recordsStatusLabels = {
  active: '운영 중',
  archived: '보관됨',
  disposal_locked: '처분 잠금',
} as const satisfies Record<SearchRecordsStatus, string>;

function normalizeInput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const emptySearchRefinerKeys: SearchRefinerKeySet = new Set();

function normalizedDraft(
  draft: SearchAdvancedDraft,
  approvedRefinerKeys: SearchRefinerKeySet,
): SearchAdvancedSelection {
  return {
    clientName: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientName)
      ? normalizeInput(draft.clientName)
      : undefined,
    confidentialityLevel: hasSearchRefiner(
      approvedRefinerKeys,
      searchRefinerFieldKeys.confidentialityLevel,
    )
      ? draft.confidentialityLevel || undefined
      : undefined,
    dateRange: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.dateRange)
      ? draft.dateRange || undefined
      : undefined,
    documentType: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.documentType)
      ? draft.documentType || undefined
      : undefined,
    extractionStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.extractionStatus)
      ? draft.extractionStatus || undefined
      : undefined,
    groupBy: draft.groupBy,
    legalHold: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.legalHold)
      ? draft.legalHold || undefined
      : undefined,
    matterCode: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterCode)
      ? normalizeInput(draft.matterCode)
      : undefined,
    matterName: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterName)
      ? normalizeInput(draft.matterName)
      : undefined,
    privilegeStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.privilegeStatus)
      ? draft.privilegeStatus || undefined
      : undefined,
    recordsStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.recordsStatus)
      ? draft.recordsStatus || undefined
      : undefined,
    sortBy: draft.sortBy,
    target: draft.target,
    title: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.title)
      ? normalizeInput(draft.title)
      : undefined,
    versionStatus: hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.versionStatus)
      ? draft.versionStatus || undefined
      : undefined,
  };
}

function countAdvanced(
  selection: SearchAdvancedSelection,
  approvedRefinerKeys: SearchRefinerKeySet,
): number {
  return [
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientName)
      ? selection.clientName
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.confidentialityLevel)
      ? selection.confidentialityLevel
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.dateRange)
      ? selection.dateRange
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.documentType)
      ? selection.documentType
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.extractionStatus)
      ? selection.extractionStatus
      : undefined,
    selection.groupBy && selection.groupBy !== 'none' ? selection.groupBy : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.legalHold)
      ? selection.legalHold
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterCode)
      ? selection.matterCode
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterName)
      ? selection.matterName
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.privilegeStatus)
      ? selection.privilegeStatus
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.recordsStatus)
      ? selection.recordsStatus
      : undefined,
    selection.sortBy && selection.sortBy !== 'relevance' ? selection.sortBy : undefined,
    selection.target && selection.target !== 'all' ? selection.target : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.title)
      ? selection.title
      : undefined,
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.versionStatus)
      ? selection.versionStatus
      : undefined,
  ].filter(Boolean).length;
}

export function SearchAdvancedControls({
  approvedRefinerKeys = emptySearchRefinerKeys,
  busy,
  onApply,
  onReset,
  selection,
  taxonomyCatalog = [],
}: SearchAdvancedControlsProps) {
  const [draft, setDraft] = useState<SearchAdvancedDraft>({
    clientName: selection.clientName ?? '',
    confidentialityLevel: selection.confidentialityLevel ?? '',
    dateRange: selection.dateRange ?? '',
    documentType: selection.documentType ?? '',
    extractionStatus: selection.extractionStatus ?? '',
    groupBy: selection.groupBy ?? 'none',
    legalHold: selection.legalHold ?? '',
    matterCode: selection.matterCode ?? '',
    matterName: selection.matterName ?? '',
    privilegeStatus: selection.privilegeStatus ?? '',
    recordsStatus: selection.recordsStatus ?? '',
    sortBy: selection.sortBy ?? 'relevance',
    target: selection.target ?? 'all',
    title: selection.title ?? '',
    versionStatus: selection.versionStatus ?? '',
  });

  useEffect(() => {
    setDraft({
      clientName: selection.clientName ?? '',
      confidentialityLevel: selection.confidentialityLevel ?? '',
      dateRange: selection.dateRange ?? '',
      documentType: selection.documentType ?? '',
      extractionStatus: selection.extractionStatus ?? '',
      groupBy: selection.groupBy ?? 'none',
      legalHold: selection.legalHold ?? '',
      matterCode: selection.matterCode ?? '',
      matterName: selection.matterName ?? '',
      privilegeStatus: selection.privilegeStatus ?? '',
      recordsStatus: selection.recordsStatus ?? '',
      sortBy: selection.sortBy ?? 'relevance',
      target: selection.target ?? 'all',
      title: selection.title ?? '',
      versionStatus: selection.versionStatus ?? '',
    });
  }, [selection]);

  const activeCount = countAdvanced(selection, approvedRefinerKeys);
  const documentTypeOptions = React.useMemo(
    () => approvedDocumentTypeOptions(documentTypeLabels, taxonomyCatalog),
    [taxonomyCatalog],
  );
  const allowed = React.useCallback(
    (fieldKey: keyof typeof searchRefinerFieldKeys) =>
      hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys[fieldKey]),
    [approvedRefinerKeys],
  );

  return (
    <SectionCard
      icon={<SlidersHorizontal className="h-4 w-4" />}
      title="검색 필터"
      meta="권한 범위 내 결과"
      actions={activeCount > 0 ? <StatusBadge>{activeCount}</StatusBadge> : null}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-sm font-medium">
          검색 범위
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.target}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                target: event.target.value as SearchTarget,
              }))
            }
          >
            {Object.entries(targetLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          정렬
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.sortBy}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sortBy: event.target.value as SearchSort,
              }))
            }
          >
            {Object.entries(sortLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          그룹
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.groupBy}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                groupBy: event.target.value as SearchGroupBy,
              }))
            }
          >
            {Object.entries(groupLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {allowed('documentType') ? (
          <label className="space-y-1 text-sm font-medium">
            문서 유형
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.documentType}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  documentType: event.target.value as DocumentType | '',
                }))
              }
            >
              <option value="">전체</option>
              {documentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('confidentialityLevel') ? (
          <label className="space-y-1 text-sm font-medium">
            기밀도
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.confidentialityLevel}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  confidentialityLevel: event.target.value as DocumentConfidentialityLevel | '',
                }))
              }
            >
              <option value="">전체</option>
              {documentConfidentialityLevels.map((level) => (
                <option key={level} value={level}>
                  {confidentialityLabels[level]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('privilegeStatus') ? (
          <label className="space-y-1 text-sm font-medium">
            특권 상태
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.privilegeStatus}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  privilegeStatus: event.target.value as DocumentPrivilegeStatus | '',
                }))
              }
            >
              <option value="">전체</option>
              {documentPrivilegeStatuses.map((status) => (
                <option key={status} value={status}>
                  {privilegeLabels[status]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('extractionStatus') ? (
          <label className="space-y-1 text-sm font-medium">
            추출/OCR
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.extractionStatus}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  extractionStatus: event.target.value as DocumentExtractionStatus | '',
                }))
              }
            >
              <option value="">전체 상태</option>
              {documentExtractionStatuses.map((status) => (
                <option key={status} value={status}>
                  {extractionStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('legalHold') ? (
          <label className="space-y-1 text-sm font-medium">
            보존/삭제 금지
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.legalHold}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  legalHold: event.target.value as SearchLegalHold | '',
                }))
              }
            >
              <option value="">전체</option>
              {searchLegalHoldValues.map((status) => (
                <option key={status} value={status}>
                  {legalHoldLabels[status]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('recordsStatus') ? (
          <label className="space-y-1 text-sm font-medium">
            기록 상태
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.recordsStatus}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  recordsStatus: event.target.value as SearchRecordsStatus | '',
                }))
              }
            >
              <option value="">전체 상태</option>
              {searchRecordsStatusValues.map((status) => (
                <option key={status} value={status}>
                  {recordsStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('versionStatus') ? (
          <label className="space-y-1 text-sm font-medium">
            버전 상태
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.versionStatus}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  versionStatus: event.target.value as SearchVersionStatus | '',
                }))
              }
            >
              <option value="">현재 버전 기본</option>
              {searchVersionStatusValues.map((status) => (
                <option key={status} value={status}>
                  {versionStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('dateRange') ? (
          <label className="space-y-1 text-sm font-medium">
            수정 기간
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft.dateRange}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateRange: event.target.value as SearchDateRange | '',
                }))
              }
            >
              <option value="">전체 기간</option>
              {Object.entries(dateRangeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allowed('title') ? (
          <label className="space-y-1 text-sm font-medium">
            제목
            <Input
              value={draft.title}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
        ) : null}
        {allowed('matterCode') ? (
          <label className="space-y-1 text-sm font-medium">
            Matter Code
            <Input
              value={draft.matterCode}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  matterCode: event.target.value,
                }))
              }
            />
          </label>
        ) : null}
        {allowed('matterName') ? (
          <label className="space-y-1 text-sm font-medium">
            Matter 이름
            <Input
              value={draft.matterName}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  matterName: event.target.value,
                }))
              }
            />
          </label>
        ) : null}
        {allowed('clientName') ? (
          <label className="space-y-1 text-sm font-medium">
            고객명
            <Input
              value={draft.clientName}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  clientName: event.target.value,
                }))
              }
            />
          </label>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.5fr)]">
        <section className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">활성 필터</h4>
            <StatusBadge tone={activeCount > 0 ? 'warning' : 'neutral'}>
              {activeCount > 0 ? `${activeCount}개` : '기본'}
            </StatusBadge>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeSearchChips(selection, approvedRefinerKeys).map((chip) => (
              <span
                key={`${chip.label}-${chip.value}`}
                className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border bg-muted/30 px-2.5 text-xs font-semibold text-foreground"
              >
                <span className="text-muted-foreground">{chip.label}</span>
                <span className="max-w-44 truncate">{chip.value}</span>
              </span>
            ))}
          </div>
        </section>
        <section className="rounded-md border bg-background p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HelpCircle className="h-4 w-4 text-primary" />
            검색식 도움말
          </div>
          <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-muted-foreground">
            <li>
              <code className="rounded border bg-muted px-1 py-0.5 text-foreground">
                "정확한 문구"
              </code>
              <span className="ml-2">정확한 문구 우선</span>
            </li>
            <li>
              <code className="rounded border bg-muted px-1 py-0.5 text-foreground">-제외어</code>
              <span className="ml-2">제외어 반영</span>
            </li>
            <li>본문/제목 범위와 Matter Code는 위 필터로 고정</li>
          </ul>
        </section>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onApply(normalizedDraft(draft, approvedRefinerKeys))}
          disabled={busy}
        >
          적용
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReset} disabled={busy}>
          <X className="h-4 w-4" />
          초기화
        </Button>
      </div>
    </SectionCard>
  );
}

function activeSearchChips(
  selection: SearchAdvancedSelection,
  approvedRefinerKeys: SearchRefinerKeySet,
): Array<{ label: string; value: string }> {
  const chips: Array<{ label: string; value: string }> = [];
  if (selection.target && selection.target !== 'all') {
    chips.push({ label: '범위', value: targetLabels[selection.target] });
  }
  if (selection.sortBy && selection.sortBy !== 'relevance') {
    chips.push({ label: '정렬', value: sortLabels[selection.sortBy] });
  }
  if (selection.groupBy && selection.groupBy !== 'none') {
    chips.push({ label: '그룹', value: groupLabels[selection.groupBy] });
  }
  if (
    selection.documentType &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.documentType)
  ) {
    chips.push({ label: '유형', value: documentTypeLabels[selection.documentType] });
  }
  if (
    selection.confidentialityLevel &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.confidentialityLevel)
  ) {
    chips.push({ label: '기밀도', value: confidentialityLabels[selection.confidentialityLevel] });
  }
  if (
    selection.privilegeStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.privilegeStatus)
  ) {
    chips.push({ label: '특권', value: privilegeLabels[selection.privilegeStatus] });
  }
  if (
    selection.extractionStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.extractionStatus)
  ) {
    chips.push({ label: '추출/OCR', value: extractionStatusLabels[selection.extractionStatus] });
  }
  if (
    selection.legalHold &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.legalHold)
  ) {
    chips.push({ label: '보존', value: legalHoldLabels[selection.legalHold] });
  }
  if (
    selection.recordsStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.recordsStatus)
  ) {
    chips.push({ label: '기록', value: recordsStatusLabels[selection.recordsStatus] });
  }
  if (
    selection.versionStatus &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.versionStatus)
  ) {
    chips.push({ label: '버전', value: versionStatusLabels[selection.versionStatus] });
  }
  if (
    selection.dateRange &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.dateRange)
  ) {
    chips.push({ label: '기간', value: dateRangeLabels[selection.dateRange] });
  }
  if (selection.title && hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.title)) {
    chips.push({ label: '제목', value: selection.title });
  }
  if (
    selection.matterCode &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterCode)
  ) {
    chips.push({ label: 'Matter Code', value: selection.matterCode });
  }
  if (
    selection.matterName &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.matterName)
  ) {
    chips.push({ label: 'Matter', value: selection.matterName });
  }
  if (
    selection.clientName &&
    hasSearchRefiner(approvedRefinerKeys, searchRefinerFieldKeys.clientName)
  ) {
    chips.push({ label: '고객', value: selection.clientName });
  }
  return chips.length > 0 ? chips : [{ label: '조건', value: '기본 검색' }];
}
