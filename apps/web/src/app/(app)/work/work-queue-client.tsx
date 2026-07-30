'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Bell, Bot, Check, FileSearch, PlugZap, Users, X } from 'lucide-react';
import {
  dashboardActionItems,
  DashboardWorkQueueSection,
} from '@/components/dashboard/dashboard-work-queue';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterField } from '@/components/ui/filter-bar';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  createDashboardUnavailableState,
  dashboardErrorState,
  dashboardOverviewToState,
  getDashboardOverview,
  type DashboardOverviewState,
} from '@/lib/api/dashboard';
import {
  createWorkItemsUnavailableState,
  getWorkQueue,
  operationalApiErrorState,
  reassignWorkItem as requestWorkItemReassignment,
  reviewGraphFactNode,
  reviewKnowledgeCandidate,
  reviewMatterWikiPage,
  workQueueToState,
  type DmsWorkQueueItem,
} from '@/lib/api/work-ops';
import type {
  DmsWorkQueueAssigneeFilter,
  GraphNodeReviewAction,
  KnowledgeCandidateReviewAction,
  MatterWikiReviewAction,
  OrgDirectorySubjectDto,
} from '@amic-vault/shared';
import type { DataState } from '@/lib/data-state';
import { OrgSubjectPicker } from '@/components/access/org-subject-picker';
import { WorkInboxTabs } from '@/components/work/work-inbox-tabs';

type WorkSourceFilter = 'all' | DmsWorkQueueItem['source'];
type WorkKindFilter = 'all' | NonNullable<DmsWorkQueueItem['kind']>;
type WorkToneFilter = 'all' | DmsWorkQueueItem['tone'];
type WorkSortMode = 'due_asc' | 'attention' | 'updated_desc' | 'source';
type WorkQueuePage = { limit: number; offset: number; total: number; hasNext: boolean };
type ReassignHandler = (itemKey: string, assignedToUserId: string) => Promise<void>;
type GraphFactReviewHandler = (nodeId: string, action: GraphNodeReviewAction) => Promise<void>;
type KnowledgeCandidateReviewHandler = (
  candidateId: string,
  action: KnowledgeCandidateReviewAction,
) => Promise<void>;
type MatterWikiReviewHandler = (pageId: string, action: MatterWikiReviewAction) => Promise<void>;

const workPageSize = 20;

const selectClassName =
  'flex h-10 w-full min-w-0 max-w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const sourceFilterLabels = {
  all: '전체 구분',
  permission_policy: '권한/정책',
  ai_prep: '파일 정리 준비',
  integration: '연동',
  operational_data: '운영 데이터',
  records: '기록 보존',
} as const satisfies Record<WorkSourceFilter, string>;

const kindFilterLabels = {
  all: '전체 종류',
  records_disposal_approval: '삭제 승인',
  records_disposal_execution: '삭제 실행',
  document_extraction_failed: '추출 실패',
  document_ocr_pending: 'OCR 대기',
  document_metadata_required: '문서 정보 보완',
  duplicate_decision_pending: '중복 결정',
  upload_exception: '업로드 예외',
  contract_review_stage: '계약 검토',
  dd_rfi_due: 'DD RFI',
  dd_mapping_review: 'DD 매핑',
  external_qa_approval: '외부 Q&A',
  litigation_deadline: '송무 기한',
  knowledge_candidate_review: '지식은행 후보',
  wiki_page_review: '위키 페이지',
  ai_candidate_review: 'AI 후보 검토',
  graph_fact_review: 'AI 사실관계 검토',
} as const satisfies Record<WorkKindFilter, string>;

const assigneeFilterLabels = {
  all: '전체 담당',
  mine: '내 업무',
  unassigned: '미배정',
} as const satisfies Record<DmsWorkQueueAssigneeFilter, string>;

const toneFilterLabels = {
  all: '전체 상태',
  blocked: '차단/확인 필요',
  warning: '주의',
  neutral: '상태 확인',
  success: '정상',
} as const satisfies Record<WorkToneFilter, string>;

const sortModeLabels = {
  due_asc: '마감 임박순',
  attention: '주의 항목 우선',
  updated_desc: '최근 업데이트',
  source: '업무 구분별',
} as const satisfies Record<WorkSortMode, string>;

const sourceFilterOptions = Object.keys(sourceFilterLabels) as WorkSourceFilter[];
const kindFilterOptions = Object.keys(kindFilterLabels) as WorkKindFilter[];
const assigneeFilterOptions = Object.keys(assigneeFilterLabels) as DmsWorkQueueAssigneeFilter[];
const toneFilterOptions = Object.keys(toneFilterLabels) as WorkToneFilter[];
const sortModeOptions = Object.keys(sortModeLabels) as WorkSortMode[];

export function WorkQueueClient() {
  const [dashboardState, setDashboardState] = useState<DashboardOverviewState>(() =>
    createDashboardUnavailableState(),
  );
  const [workItemsState, setWorkItemsState] = useState<DataState<DmsWorkQueueItem[]>>(() =>
    createWorkItemsUnavailableState(),
  );
  const [workPage, setWorkPage] = useState<WorkQueuePage>(() => ({
    limit: workPageSize,
    offset: 0,
    total: 0,
    hasNext: false,
  }));
  const [kindFilter, setKindFilter] = useState<WorkKindFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<DmsWorkQueueAssigneeFilter>('mine');
  const [pageOffset, setPageOffset] = useState(0);

  useEffect(() => {
    let active = true;
    getDashboardOverview()
      .then((overview) => {
        if (active) setDashboardState(dashboardOverviewToState(overview));
      })
      .catch((error: unknown) => {
        if (active) setDashboardState(dashboardErrorState(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const loadWorkQueue = useCallback(async () => {
    const response = await getWorkQueue({
      ...(kindFilter === 'all' ? {} : { kind: kindFilter }),
      assignee: assigneeFilter,
      limit: workPageSize,
      offset: pageOffset,
    });
    setWorkItemsState(workQueueToState(response));
    setWorkPage(
      response.page ?? {
        limit: workPageSize,
        offset: pageOffset,
        total: response.items.length,
        hasNext: false,
      },
    );
  }, [assigneeFilter, kindFilter, pageOffset]);

  useEffect(() => {
    let active = true;
    getWorkQueue({
      ...(kindFilter === 'all' ? {} : { kind: kindFilter }),
      assignee: assigneeFilter,
      limit: workPageSize,
      offset: pageOffset,
    })
      .then((response) => {
        if (!active) return;
        setWorkItemsState(workQueueToState(response));
        setWorkPage(
          response.page ?? {
            limit: workPageSize,
            offset: pageOffset,
            total: response.items.length,
            hasNext: false,
          },
        );
      })
      .catch((error: unknown) => {
        if (active) setWorkItemsState(operationalApiErrorState(error));
      });
    return () => {
      active = false;
    };
  }, [assigneeFilter, kindFilter, pageOffset]);

  const handleReassign = useCallback<ReassignHandler>(
    async (itemKey, assignedToUserId) => {
      await requestWorkItemReassignment(itemKey, assignedToUserId);
      await loadWorkQueue();
    },
    [loadWorkQueue],
  );
  const handleGraphFactReview = useCallback<GraphFactReviewHandler>(
    async (nodeId, action) => {
      await reviewGraphFactNode(nodeId, action);
      await loadWorkQueue();
    },
    [loadWorkQueue],
  );
  const handleKnowledgeCandidateReview = useCallback<KnowledgeCandidateReviewHandler>(
    async (candidateId, action) => {
      await reviewKnowledgeCandidate(candidateId, action);
      await loadWorkQueue();
    },
    [loadWorkQueue],
  );
  const handleMatterWikiReview = useCallback<MatterWikiReviewHandler>(
    async (pageId, action) => {
      await reviewMatterWikiPage(pageId, action);
      await loadWorkQueue();
    },
    [loadWorkQueue],
  );

  return (
    <WorkQueueContent
      assigneeFilter={assigneeFilter}
      dashboardState={dashboardState}
      kindFilter={kindFilter}
      onAssigneeFilterChange={(next) => {
        setAssigneeFilter(next);
        setPageOffset(0);
      }}
      onKindFilterChange={(next) => {
        setKindFilter(next);
        setPageOffset(0);
      }}
      onPageOffsetChange={setPageOffset}
      onGraphFactReview={handleGraphFactReview}
      onKnowledgeCandidateReview={handleKnowledgeCandidateReview}
      onMatterWikiReview={handleMatterWikiReview}
      onReassign={handleReassign}
      workItemsState={workItemsState}
      workPage={workPage}
    />
  );
}

export function WorkQueueContent({
  assigneeFilter = 'mine',
  dashboardState,
  kindFilter = 'all',
  onAssigneeFilterChange,
  onKindFilterChange,
  onPageOffsetChange,
  onGraphFactReview,
  onKnowledgeCandidateReview,
  onMatterWikiReview,
  onReassign,
  workPage,
  workItemsState,
}: {
  assigneeFilter?: DmsWorkQueueAssigneeFilter;
  dashboardState: DashboardOverviewState;
  kindFilter?: WorkKindFilter;
  onAssigneeFilterChange?: (next: DmsWorkQueueAssigneeFilter) => void;
  onKindFilterChange?: (next: WorkKindFilter) => void;
  onPageOffsetChange?: (offset: number) => void;
  onGraphFactReview?: GraphFactReviewHandler | undefined;
  onKnowledgeCandidateReview?: KnowledgeCandidateReviewHandler | undefined;
  onMatterWikiReview?: MatterWikiReviewHandler | undefined;
  onReassign?: ReassignHandler;
  workPage?: WorkQueuePage;
  workItemsState?: DataState<DmsWorkQueueItem[]>;
}) {
  const [sourceFilter, setSourceFilter] = useState<WorkSourceFilter>('all');
  const [toneFilter, setToneFilter] = useState<WorkToneFilter>('all');
  const [sortMode, setSortMode] = useState<WorkSortMode>('due_asc');
  const actionItems =
    workItemsState?.status === 'ready' ? workItemsState.data : dashboardActionItems(dashboardState);
  const visibleActionItems = useMemo(
    () => filterWorkItems(actionItems, sourceFilter, toneFilter, sortMode),
    [actionItems, sortMode, sourceFilter, toneFilter],
  );
  const visibleItemsState = useMemo(
    () => filteredWorkItemsState(workItemsState, visibleActionItems),
    [visibleActionItems, workItemsState],
  );
  const hasServerFilters = kindFilter !== 'all' || assigneeFilter !== 'all';
  const hasDisplayFilters =
    sourceFilter !== 'all' || toneFilter !== 'all' || sortMode !== 'due_asc';
  const canPageBackward = Boolean(workPage && workPage.offset > 0);
  const canPageForward = Boolean(workPage?.hasNext);
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', '작업함']}
        title="작업함"
        actions={
          <StatusBadge tone={actionItems.length > 0 ? 'warning' : 'success'}>
            실제 상태 기반
          </StatusBadge>
        }
      />
      <WorkInboxTabs activeView="mine" />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <section
            aria-label="작업함 조치 콘솔"
            className="rounded-lg border bg-card p-3 shadow-none sm:p-4"
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-baseline gap-x-2 overflow-hidden">
                  <h2 className="shrink-0 text-[15px] font-semibold tracking-normal text-foreground">
                    작업함 조치 콘솔
                  </h2>
                  <p className="min-w-0 flex-1 truncate whitespace-nowrap text-xs leading-5 text-muted-foreground">
                    실제 문서·Matter 상태에서 발생한 작업만 업무 구분과 상태 기준으로 좁힙니다.
                  </p>
                  <div aria-live="polite" className="text-xs leading-5 text-muted-foreground">
                    {workFilterSummary(workItemsState, visibleActionItems, actionItems, workPage)}
                  </div>
                </div>
                {hasServerFilters || hasDisplayFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onKindFilterChange?.('all');
                      onAssigneeFilterChange?.('all');
                      onPageOffsetChange?.(0);
                      setSourceFilter('all');
                      setToneFilter('all');
                      setSortMode('due_asc');
                    }}
                  >
                    초기화
                  </Button>
                ) : null}
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <FilterField htmlFor="work-kind-filter" label="작업 종류">
                  <select
                    id="work-kind-filter"
                    className={selectClassName}
                    value={kindFilter}
                    onChange={(event) => {
                      onKindFilterChange?.(event.target.value as WorkKindFilter);
                      onPageOffsetChange?.(0);
                    }}
                  >
                    {kindFilterOptions.map((option) => (
                      <option key={option} value={option}>
                        {kindFilterLabels[option]}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField htmlFor="work-assignee-filter" label="담당">
                  <select
                    id="work-assignee-filter"
                    className={selectClassName}
                    value={assigneeFilter}
                    onChange={(event) => {
                      onAssigneeFilterChange?.(event.target.value as DmsWorkQueueAssigneeFilter);
                      onPageOffsetChange?.(0);
                    }}
                  >
                    {assigneeFilterOptions.map((option) => (
                      <option key={option} value={option}>
                        {assigneeFilterLabels[option]}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField htmlFor="work-source-filter" label="업무 구분">
                  <select
                    id="work-source-filter"
                    className={selectClassName}
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value as WorkSourceFilter)}
                  >
                    {sourceFilterOptions.map((option) => (
                      <option key={option} value={option}>
                        {sourceFilterLabels[option]}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField htmlFor="work-status-filter" label="상태">
                  <select
                    id="work-status-filter"
                    className={selectClassName}
                    value={toneFilter}
                    onChange={(event) => setToneFilter(event.target.value as WorkToneFilter)}
                  >
                    {toneFilterOptions.map((option) => (
                      <option key={option} value={option}>
                        {toneFilterLabels[option]}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField htmlFor="work-sort" label="정렬">
                  <select
                    id="work-sort"
                    className={selectClassName}
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as WorkSortMode)}
                  >
                    {sortModeOptions.map((option) => (
                      <option key={option} value={option}>
                        {sortModeLabels[option]}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </div>
            </div>
          </section>
          <DashboardWorkQueueSection
            itemsState={visibleItemsState}
            state={dashboardState}
            title="내 작업"
          />
          <KnowledgeCandidateReviewPanel
            items={visibleActionItems}
            onReview={onKnowledgeCandidateReview}
          />
          <GraphFactReviewPanel items={visibleActionItems} onReview={onGraphFactReview} />
          <MatterWikiReviewPanel items={visibleActionItems} onReview={onMatterWikiReview} />
          {workPage && workPage.total > workPage.limit ? (
            <nav
              aria-label="작업함 페이지"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground"
            >
              <span>
                {workPage.offset + 1}-{Math.min(workPage.offset + workPage.limit, workPage.total)} /{' '}
                {workPage.total}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canPageBackward}
                  onClick={() =>
                    onPageOffsetChange?.(Math.max(0, workPage.offset - workPage.limit))
                  }
                >
                  이전
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canPageForward}
                  onClick={() => onPageOffsetChange?.(workPage.offset + workPage.limit)}
                >
                  다음
                </Button>
              </div>
            </nav>
          ) : null}
          <WorkReassignmentPanel items={visibleActionItems} onReassign={onReassign} />
          <SectionCard
            icon={<FileSearch className="h-4 w-4" />}
            title="문서함 조치 필터"
            meta="실시간 문서함"
          >
            <p className="text-sm text-muted-foreground">
              추출, OCR, 파일 정리 항목은 권한 내 문서함 필터로 바로 열 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/files?extractionStatus=failed">추출 실패</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/files?extractionStatus=ocr_pending">OCR 필요</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/files?status=draft">문서 정보 보완</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/files?aiAllowed=true&sortBy=matter_asc">파일 정리 준비</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/records">보존 조치</Link>
              </Button>
            </div>
          </SectionCard>
          <SectionCard
            icon={<Activity className="h-4 w-4" />}
            title="업무 구분"
            meta="확인된 데이터 기준"
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              <SourceStateItem
                label="권한/정책 알림"
                state={dashboardState.permissionPolicyAlerts}
              />
              <SourceStateItem label="파일 정리 준비" state={dashboardState.aiPrepStatus} />
              <SourceStateItem label="연동 상태" state={dashboardState.integrationStatus} />
              <SourceStateItem label="운영 데이터 연결" state={dashboardState.recentActivity} />
            </ul>
          </SectionCard>
        </div>

        <aside className="grid gap-4 xl:sticky xl:top-20 xl:self-start">
          <QueueSourcePanel
            icon={<Bell className="h-4 w-4" />}
            title="권한/정책"
            emptyTitle="표시할 권한 또는 정책 알림이 없습니다."
            state={dashboardState.permissionPolicyAlerts}
          />
          <QueueSourcePanel
            icon={<Bot className="h-4 w-4" />}
            title="파일 정리 준비"
            emptyTitle="파일 정리 준비 상태가 없습니다."
            state={dashboardState.aiPrepStatus}
          />
          <QueueSourcePanel
            icon={<PlugZap className="h-4 w-4" />}
            title="연동"
            emptyTitle="연결된 연동 상태가 없습니다."
            state={dashboardState.integrationStatus}
          />
        </aside>
      </div>
    </PageShell>
  );
}

function KnowledgeCandidateReviewPanel({
  items,
  onReview,
}: {
  items: DmsWorkQueueItem[];
  onReview?: KnowledgeCandidateReviewHandler | undefined;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const reviewItems = items.filter(
    (item) =>
      item.kind === 'knowledge_candidate_review' &&
      item.targetId &&
      (item.status === 'open' || item.status === 'in_progress'),
  );
  if (reviewItems.length === 0) return null;
  return (
    <SectionCard
      icon={<FileSearch className="h-4 w-4" />}
      title="지식은행 후보"
      meta={`${reviewItems.length}건`}
    >
      <ul className="grid gap-2">
        {reviewItems.slice(0, 5).map((item) => {
          const disabled = !onReview || pendingKey === item.itemKey;
          return (
            <li key={item.itemKey} className="rounded-md border bg-background px-3 py-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {item.description}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      handleKnowledgeCandidateReviewClick(item, 'approve', onReview, setPendingKey)
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                    승인
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      handleKnowledgeCandidateReviewClick(item, 'reject', onReview, setPendingKey)
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                    반려
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

async function handleKnowledgeCandidateReviewClick(
  item: DmsWorkQueueItem,
  action: KnowledgeCandidateReviewAction,
  onReview: KnowledgeCandidateReviewHandler | undefined,
  setPendingKey: React.Dispatch<React.SetStateAction<string | null>>,
): Promise<void> {
  if (!onReview || !item.targetId) return;
  setPendingKey(item.itemKey);
  try {
    await onReview(item.targetId, action);
  } finally {
    setPendingKey(null);
  }
}

function MatterWikiReviewPanel({
  items,
  onReview,
}: {
  items: DmsWorkQueueItem[];
  onReview?: MatterWikiReviewHandler | undefined;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const reviewItems = items.filter(
    (item) =>
      item.kind === 'wiki_page_review' &&
      item.targetId &&
      (item.status === 'open' || item.status === 'in_progress'),
  );
  if (reviewItems.length === 0) return null;
  return (
    <SectionCard
      icon={<FileSearch className="h-4 w-4" />}
      title="위키 페이지"
      meta={`${reviewItems.length}건`}
    >
      <ul className="grid gap-2">
        {reviewItems.slice(0, 5).map((item) => {
          const disabled = !onReview || pendingKey === item.itemKey;
          return (
            <li key={item.itemKey} className="rounded-md border bg-background px-3 py-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {item.description}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      handleMatterWikiReviewClick(item, 'confirm', onReview, setPendingKey)
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                    확인
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      handleMatterWikiReviewClick(item, 'reject', onReview, setPendingKey)
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                    거절
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

async function handleMatterWikiReviewClick(
  item: DmsWorkQueueItem,
  action: MatterWikiReviewAction,
  onReview: MatterWikiReviewHandler | undefined,
  setPendingKey: React.Dispatch<React.SetStateAction<string | null>>,
): Promise<void> {
  if (!onReview || !item.targetId) return;
  setPendingKey(item.itemKey);
  try {
    await onReview(item.targetId, action);
  } finally {
    setPendingKey(null);
  }
}

function GraphFactReviewPanel({
  items,
  onReview,
}: {
  items: DmsWorkQueueItem[];
  onReview?: GraphFactReviewHandler | undefined;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const reviewItems = items.filter(
    (item) =>
      item.kind === 'graph_fact_review' &&
      item.targetId &&
      (item.status === 'open' || item.status === 'in_progress'),
  );
  if (reviewItems.length === 0) return null;
  return (
    <SectionCard
      icon={<Bot className="h-4 w-4" />}
      title="AI 사실관계 검토"
      meta={`${reviewItems.length}건`}
    >
      <ul className="grid gap-2">
        {reviewItems.slice(0, 5).map((item) => {
          const disabled = !onReview || pendingKey === item.itemKey;
          return (
            <li key={item.itemKey} className="rounded-md border bg-background px-3 py-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground">
                    {item.title.replace('AI Fact', 'AI 사실관계')}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {item.description}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      handleGraphFactReviewClick(item, 'confirm', onReview, setPendingKey)
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                    확인
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      handleGraphFactReviewClick(item, 'reject', onReview, setPendingKey)
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                    거절
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

async function handleGraphFactReviewClick(
  item: DmsWorkQueueItem,
  action: GraphNodeReviewAction,
  onReview: GraphFactReviewHandler | undefined,
  setPendingKey: React.Dispatch<React.SetStateAction<string | null>>,
): Promise<void> {
  if (!onReview || !item.targetId) return;
  setPendingKey(item.itemKey);
  try {
    await onReview(item.targetId, action);
  } finally {
    setPendingKey(null);
  }
}

function WorkReassignmentPanel({
  items,
  onReassign,
}: {
  items: DmsWorkQueueItem[];
  onReassign?: ReassignHandler | undefined;
}) {
  const [drafts, setDrafts] = useState<Record<string, OrgDirectorySubjectDto | null>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const actionableItems = items.filter(
    (item) => item.status === 'open' || item.status === 'in_progress',
  );
  if (actionableItems.length === 0) return null;
  return (
    <SectionCard icon={<Users className="h-4 w-4" />} title="담당자 재배정" meta="검토 후 반영">
      <ul className="grid gap-2">
        {actionableItems.slice(0, 5).map((item) => {
          const draft = drafts[item.itemKey] ?? null;
          const disabled = !onReassign || !draft || pendingKey === item.itemKey;
          return (
            <li key={item.itemKey} className="rounded-md border bg-background px-3 py-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    {item.assignedToLabel ? `담당자 ${item.assignedToLabel}` : '담당자 미지정'}
                  </div>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="mb-1.5 text-sm font-medium text-foreground">새 담당자</p>
                    <OrgSubjectPicker
                      onSubjectSelected={(subject) =>
                        setDrafts((current) => ({ ...current, [item.itemKey]: subject }))
                      }
                      purpose="user-admin"
                      selectedSubject={draft}
                      subjectType="user"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={async () => {
                      if (!onReassign || !draft) return;
                      setPendingKey(item.itemKey);
                      try {
                        await onReassign(item.itemKey, draft.subjectId);
                        setDrafts((current) => ({ ...current, [item.itemKey]: null }));
                      } finally {
                        setPendingKey(null);
                      }
                    }}
                  >
                    <Users className="h-3.5 w-3.5" />
                    재배정
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function QueueSourcePanel<T>({
  emptyTitle,
  icon,
  state,
  title,
}: {
  emptyTitle: string;
  icon: React.ReactNode;
  state: DataState<T[]>;
  title: string;
}) {
  return (
    <SectionCard icon={icon} title={title} meta={sourceMeta(state)}>
      <SourceStateBody state={state} emptyTitle={emptyTitle} />
    </SectionCard>
  );
}

function SourceStateItem<T>({ label, state }: { label: string; state: DataState<T[]> }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <StatusBadge tone={statusTone(state)}>{sourceMeta(state)}</StatusBadge>
    </li>
  );
}

function SourceStateBody<T>({ emptyTitle, state }: { emptyTitle: string; state: DataState<T[]> }) {
  if (state.status === 'ready') {
    return state.data.length > 0 ? (
      <p className="text-sm text-muted-foreground">
        {state.data.length}건이 작업함에 반영되었습니다.
      </p>
    ) : (
      <EmptyState title={emptyTitle} />
    );
  }
  if (state.status === 'empty') return <EmptyState title={emptyTitle} />;
  if (state.status === 'error')
    return <EmptyState variant="api-error" title="데이터를 표시할 수 없습니다." />;
  if (state.status === 'forbidden')
    return <EmptyState variant="no-access" title="이 항목을 볼 권한이 없습니다." />;
  if (state.status === 'blocked') {
    return (
      <EmptyState
        variant="policy-blocked"
        title="정보 차단 또는 권한 정책으로 표시할 수 없습니다."
      />
    );
  }
  return <EmptyState variant="api-unavailable" title="데이터를 불러오는 중입니다." />;
}

function sourceMeta<T>(state: DataState<T[]>): string {
  if (state.status === 'ready')
    return state.data.length > 0 ? `${state.data.length}건` : '표시할 항목 없음';
  if (state.status === 'empty') return '표시할 항목 없음';
  if (state.status === 'error') return '연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  return '연결 대기';
}

function statusTone<T>(state: DataState<T[]>): 'success' | 'warning' | 'blocked' | 'neutral' {
  if (state.status === 'ready') return state.data.length > 0 ? 'warning' : 'success';
  if (state.status === 'empty') return 'success';
  if (state.status === 'error' || state.status === 'blocked') return 'blocked';
  if (state.status === 'forbidden') return 'warning';
  return 'neutral';
}

function filteredWorkItemsState(
  state: DataState<DmsWorkQueueItem[]> | undefined,
  items: DmsWorkQueueItem[],
): DataState<DmsWorkQueueItem[]> | undefined {
  if (!state) return undefined;
  if (state.status !== 'ready') return state;
  return { status: 'ready', data: items };
}

function filterWorkItems(
  items: DmsWorkQueueItem[],
  sourceFilter: WorkSourceFilter,
  toneFilter: WorkToneFilter,
  sortMode: WorkSortMode,
): DmsWorkQueueItem[] {
  return [...items]
    .filter((item) => sourceFilter === 'all' || item.source === sourceFilter)
    .filter((item) => toneFilter === 'all' || item.tone === toneFilter)
    .sort((left, right) => compareWorkItems(left, right, sortMode));
}

function compareWorkItems(
  left: DmsWorkQueueItem,
  right: DmsWorkQueueItem,
  sortMode: WorkSortMode,
): number {
  if (sortMode === 'source') {
    const sourceDelta = sourceRank(left.source) - sourceRank(right.source);
    if (sourceDelta !== 0) return sourceDelta;
  }
  if (sortMode === 'due_asc') {
    const leftDue = dueRank(left.dueAt);
    const rightDue = dueRank(right.dueAt);
    if (leftDue !== rightDue) return leftDue - rightDue;
  }
  if (sortMode === 'attention') {
    const toneDelta = toneRank(left.tone) - toneRank(right.tone);
    if (toneDelta !== 0) return toneDelta;
  }
  const updatedDelta = updatedRank(right.updatedAt) - updatedRank(left.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;
  return left.itemKey.localeCompare(right.itemKey);
}

function toneRank(tone: DmsWorkQueueItem['tone']): number {
  if (tone === 'blocked') return 0;
  if (tone === 'warning') return 1;
  if (tone === 'neutral') return 2;
  return 3;
}

function sourceRank(source: DmsWorkQueueItem['source']): number {
  if (source === 'permission_policy') return 0;
  if (source === 'records') return 1;
  if (source === 'ai_prep') return 2;
  if (source === 'integration') return 3;
  return 4;
}

function updatedRank(updatedAt: string | undefined): number {
  if (!updatedAt) return 0;
  const time = Date.parse(updatedAt);
  return Number.isNaN(time) ? 0 : time;
}

function dueRank(dueAt: string | undefined): number {
  if (!dueAt) return Number.POSITIVE_INFINITY;
  const time = Date.parse(dueAt);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function workFilterSummary(
  state: DataState<DmsWorkQueueItem[]> | undefined,
  visibleItems: DmsWorkQueueItem[],
  allItems: DmsWorkQueueItem[],
  page?: WorkQueuePage,
): string {
  if (state?.status === 'error') return '운영 데이터 연결 확인 필요';
  if (state?.status === 'forbidden' || state?.status === 'blocked') return '권한 정책 적용';
  if (state && state.status !== 'ready') return '작업 데이터 연결 대기';
  if (page) return `${visibleItems.length}건 표시 · 전체 ${page.total}건`;
  return `${visibleItems.length}건 표시 · 전체 ${allItems.length}건`;
}
