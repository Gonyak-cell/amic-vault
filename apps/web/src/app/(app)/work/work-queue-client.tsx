'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, FileSearch, ListChecks, Users, X } from 'lucide-react';
import type {
  DmsWorkQueueAssigneeFilter,
  GraphNodeReviewAction,
  KnowledgeCandidateReviewAction,
  MatterWikiReviewAction,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterField } from '@/components/ui/filter-bar';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { WorkInboxTabs } from '@/components/work/work-inbox-tabs';
import {
  createWorkItemsUnavailableState,
  getWorkQueue,
  listWorkReassignmentCandidates,
  operationalApiErrorState,
  reassignWorkItem as requestWorkItemReassignment,
  reviewGraphFactNode,
  reviewKnowledgeCandidate,
  reviewMatterWikiPage,
  updateWorkItemDueAt as requestWorkItemDueAtUpdate,
  workQueueQueryFromUrlState,
  workQueueToState,
  workQueueUrl,
  workQueueUrlStateFromParams,
  type DmsWorkQueueItem,
  type WorkReassignmentCandidateDto,
  type WorkQueueUrlState,
} from '@/lib/api/work-ops';
import type { DataState } from '@/lib/data-state';

type WorkKindFilter = 'all' | NonNullable<DmsWorkQueueItem['kind']>;
type WorkQueuePage = { limit: number; offset: number; total: number; hasNext: boolean };
type ReassignHandler = (itemKey: string, assignedToUserId: string) => Promise<void>;
type DueAtHandler = (itemKey: string, dueAt: string) => Promise<void>;
type GraphFactReviewHandler = (nodeId: string, action: GraphNodeReviewAction) => Promise<void>;
type KnowledgeCandidateReviewHandler = (
  candidateId: string,
  action: KnowledgeCandidateReviewAction,
) => Promise<void>;
type MatterWikiReviewHandler = (pageId: string, action: MatterWikiReviewAction) => Promise<void>;

const selectClassName =
  'flex h-10 w-full min-w-0 max-w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

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

const kindFilterOptions = Object.keys(kindFilterLabels) as WorkKindFilter[];
const assigneeFilterOptions = Object.keys(assigneeFilterLabels) as DmsWorkQueueAssigneeFilter[];

type CandidateState =
  | { status: 'idle'; data: readonly WorkReassignmentCandidateDto[] }
  | { status: 'loading'; data: readonly WorkReassignmentCandidateDto[] }
  | { status: 'ready'; data: readonly WorkReassignmentCandidateDto[] }
  | { status: 'empty'; data: readonly [] }
  | { status: 'error'; data: readonly [] };

const emptyCandidateState: CandidateState = { status: 'idle', data: [] };

export function WorkReassignmentCandidateFeedback({
  status,
}: {
  status: CandidateState['status'];
}) {
  if (status === 'loading') {
    return (
      <p
        className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
        role="status"
      >
        담당자 후보를 불러오는 중입니다.
      </p>
    );
  }
  if (status === 'empty') {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        현재 작업에서 선택 가능한 담당자가 없습니다.
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p
        className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        role="alert"
      >
        담당자 후보를 불러오지 못했습니다.
      </p>
    );
  }
  return null;
}

export function requestWorkReassignmentCandidates(
  item: DmsWorkQueueItem,
  panelOpen: boolean,
  load: typeof listWorkReassignmentCandidates = listWorkReassignmentCandidates,
) {
  const actionable = item.status === 'open' || item.status === 'in_progress';
  if (!panelOpen || !actionable || item.canReassign !== true) return undefined;
  return load(item.itemKey, { limit: 25 });
}

export function findWorkReassignmentCandidate(
  candidates: readonly WorkReassignmentCandidateDto[],
  userId: string,
): WorkReassignmentCandidateDto | null {
  return candidates.find((candidate) => candidate.userId === userId) ?? null;
}

export function reassignSelectedWorkItem(
  itemKey: string,
  candidate: WorkReassignmentCandidateDto | null,
  onReassign: ReassignHandler | undefined,
): Promise<void> | undefined {
  if (!candidate || !onReassign) return undefined;
  return onReassign(itemKey, candidate.userId);
}

export function WorkReassignmentSelect({
  candidates,
  id,
  onChange,
  value,
}: {
  candidates: readonly WorkReassignmentCandidateDto[];
  id: string;
  onChange: (userId: string) => void;
  value: string;
}) {
  return (
    <select
      aria-describedby={`${id}-hint`}
      className={selectClassName}
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">담당자를 선택하세요</option>
      {candidates.map((candidate) => (
        <option key={candidate.userId} value={candidate.userId}>
          {candidate.label}
        </option>
      ))}
    </select>
  );
}

export function workMutationErrorMessage(error: unknown): string {
  return (
    operationalApiErrorState<never>(error).error ??
    '작업 변경을 완료하지 못했습니다. 연결 상태를 확인해 주세요.'
  );
}

export function workDueDateToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const iso = `${value}T00:00:00.000Z`;
  const parsed = new Date(iso);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === iso ? iso : null;
}

export function WorkQueueClient({
  urlState = workQueueUrlStateFromParams(),
}: {
  urlState?: WorkQueueUrlState;
}) {
  const router = useRouter();
  const [workItemsState, setWorkItemsState] = useState<DataState<DmsWorkQueueItem[]>>(() =>
    createWorkItemsUnavailableState(),
  );
  const [workPage, setWorkPage] = useState<WorkQueuePage>(() => ({
    limit: urlState.limit,
    offset: urlState.offset,
    total: 0,
    hasNext: false,
  }));

  const loadWorkQueue = useCallback(async () => {
    const response = await getWorkQueue(workQueueQueryFromUrlState(urlState));
    setWorkItemsState(workQueueToState(response));
    setWorkPage(
      response.page ?? {
        limit: urlState.limit,
        offset: urlState.offset,
        total: response.items.length,
        hasNext: false,
      },
    );
  }, [urlState]);

  useEffect(() => {
    let active = true;
    getWorkQueue(workQueueQueryFromUrlState(urlState))
      .then((response) => {
        if (!active) return;
        setWorkItemsState(workQueueToState(response));
        setWorkPage(
          response.page ?? {
            limit: urlState.limit,
            offset: urlState.offset,
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
  }, [urlState]);

  const navigate = useCallback(
    (next: Partial<WorkQueueUrlState>, clearKind = false) => {
      const nextState = { ...urlState, ...next, view: 'mine' } satisfies WorkQueueUrlState;
      if (clearKind) delete nextState.kind;
      router.push(workQueueUrl(nextState));
    },
    [router, urlState],
  );
  const handleReassign = useCallback<ReassignHandler>(
    async (itemKey, assignedToUserId) => {
      await requestWorkItemReassignment(itemKey, assignedToUserId);
      await loadWorkQueue();
    },
    [loadWorkQueue],
  );
  const handleDueAtChange = useCallback<DueAtHandler>(async (itemKey, dueAt) => {
    const updated = await requestWorkItemDueAtUpdate(itemKey, dueAt);
    setWorkItemsState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            data: current.data.map((item) =>
              item.itemKey === updated.itemKey ? { ...item, dueAt: updated.dueAt } : item,
            ),
          }
        : current,
    );
  }, []);
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
      onAssigneeFilterChange={(assignee) => navigate({ assignee, offset: 0 })}
      onGraphFactReview={handleGraphFactReview}
      onDueAtChange={handleDueAtChange}
      onKindFilterChange={(kind) =>
        navigate(kind === 'all' ? { offset: 0 } : { kind, offset: 0 }, kind === 'all')
      }
      onKnowledgeCandidateReview={handleKnowledgeCandidateReview}
      onMatterWikiReview={handleMatterWikiReview}
      onPageOffsetChange={(offset) => navigate({ offset })}
      onReassign={handleReassign}
      onReset={() => {
        const resetState = workQueueUrlStateFromParams();
        router.push(workQueueUrl(resetState));
      }}
      urlState={urlState}
      workItemsState={workItemsState}
      workPage={workPage}
    />
  );
}

export function WorkQueueContent({
  mutationError,
  onAssigneeFilterChange,
  onGraphFactReview,
  onDueAtChange,
  onKindFilterChange,
  onKnowledgeCandidateReview,
  onMatterWikiReview,
  onPageOffsetChange,
  onReassign,
  onReset,
  urlState = workQueueUrlStateFromParams(),
  workItemsState = createWorkItemsUnavailableState(),
  workPage,
}: {
  mutationError?: string | null | undefined;
  onAssigneeFilterChange?: (next: DmsWorkQueueAssigneeFilter) => void;
  onGraphFactReview?: GraphFactReviewHandler | undefined;
  onDueAtChange?: DueAtHandler | undefined;
  onKindFilterChange?: (next: WorkKindFilter) => void;
  onKnowledgeCandidateReview?: KnowledgeCandidateReviewHandler | undefined;
  onMatterWikiReview?: MatterWikiReviewHandler | undefined;
  onPageOffsetChange?: (offset: number) => void;
  onReassign?: ReassignHandler | undefined;
  onReset?: () => void;
  urlState?: WorkQueueUrlState;
  workItemsState?: DataState<DmsWorkQueueItem[]>;
  workPage?: WorkQueuePage | undefined;
}) {
  const items = workItemsState.status === 'ready' ? workItemsState.data : [];
  const kindFilter: WorkKindFilter = urlState.kind ?? 'all';
  const hasServerFilters =
    kindFilter !== 'all' ||
    urlState.assignee !== 'mine' ||
    urlState.offset > 0 ||
    urlState.limit !== 20;
  const canPageBackward = Boolean(workPage && workPage.offset > 0);
  const canPageForward = Boolean(workPage?.hasNext);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', '작업함']}
        title="작업함"
        actions={
          <StatusBadge tone={workQueueStateTone(workItemsState)}>
            {workQueueStateMeta(workItemsState, workPage)}
          </StatusBadge>
        }
      />
      <WorkInboxTabs activeView="mine" urlState={urlState} />

      <section
        aria-label="작업함 조치 콘솔"
        className="rounded-lg border bg-card p-3 shadow-none sm:p-4"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-normal text-foreground">
                작업함 조치 콘솔
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                서버에 저장된 작업을 담당자와 종류 기준으로 확인합니다.
              </p>
            </div>
            {hasServerFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!onReset}
                onClick={onReset}
              >
                초기화
              </Button>
            ) : null}
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <FilterField htmlFor="work-kind-filter" label="작업 종류">
              <select
                id="work-kind-filter"
                className={selectClassName}
                value={kindFilter}
                onChange={(event) => onKindFilterChange?.(event.target.value as WorkKindFilter)}
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
                value={urlState.assignee}
                onChange={(event) =>
                  onAssigneeFilterChange?.(event.target.value as DmsWorkQueueAssigneeFilter)
                }
              >
                {assigneeFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {assigneeFilterLabels[option]}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        </div>
      </section>

      <WorkQueueSection
        items={items}
        mutationError={mutationError}
        onDueAtChange={onDueAtChange}
        onGraphFactReview={onGraphFactReview}
        onKnowledgeCandidateReview={onKnowledgeCandidateReview}
        onMatterWikiReview={onMatterWikiReview}
        onReassign={onReassign}
        state={workItemsState}
        workPage={workPage}
      />

      {workPage && workPage.total > 0 && (canPageBackward || canPageForward) ? (
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
              onClick={() => onPageOffsetChange?.(Math.max(0, workPage.offset - workPage.limit))}
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

      <SectionCard icon={<FileSearch className="h-4 w-4" />} title="문서함 바로가기">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/files?extractionStatus=failed">추출 실패</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/files?extractionStatus=ocr_pending">OCR 필요</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/files?status=draft">문서 정보 보완</Link>
          </Button>
        </div>
      </SectionCard>
    </PageShell>
  );
}

function WorkQueueSection({
  items,
  mutationError,
  onGraphFactReview,
  onDueAtChange,
  onKnowledgeCandidateReview,
  onMatterWikiReview,
  onReassign,
  state,
  workPage,
}: {
  items: DmsWorkQueueItem[];
  mutationError?: string | null | undefined;
  onGraphFactReview?: GraphFactReviewHandler | undefined;
  onDueAtChange?: DueAtHandler | undefined;
  onKnowledgeCandidateReview?: KnowledgeCandidateReviewHandler | undefined;
  onMatterWikiReview?: MatterWikiReviewHandler | undefined;
  onReassign?: ReassignHandler | undefined;
  state: DataState<DmsWorkQueueItem[]>;
  workPage?: WorkQueuePage | undefined;
}) {
  return (
    <SectionCard
      icon={<ListChecks className="h-4 w-4" />}
      title="내 작업"
      meta={workQueueStateMeta(state, workPage)}
    >
      {mutationError ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {mutationError}
        </div>
      ) : null}
      {state.status !== 'ready' ? (
        <WorkQueueStateEmpty state={state} />
      ) : items.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <WorkQueueItemRow
              item={item}
              key={item.itemKey}
              onDueAtChange={onDueAtChange}
              onGraphFactReview={onGraphFactReview}
              onKnowledgeCandidateReview={onKnowledgeCandidateReview}
              onMatterWikiReview={onMatterWikiReview}
              onReassign={onReassign}
            />
          ))}
        </ul>
      ) : workPage && workPage.total > 0 ? (
        <EmptyState
          title="현재 페이지에 표시할 작업이 없습니다."
          description="이전 페이지로 이동하거나 조건을 초기화해 주세요."
        />
      ) : (
        <EmptyState
          title="표시할 작업이 없습니다."
          description="서버에 저장된 운영 작업만 표시됩니다."
        />
      )}
    </SectionCard>
  );
}

function WorkQueueItemRow({
  item,
  onGraphFactReview,
  onDueAtChange,
  onKnowledgeCandidateReview,
  onMatterWikiReview,
  onReassign,
}: {
  item: DmsWorkQueueItem;
  onGraphFactReview?: GraphFactReviewHandler | undefined;
  onDueAtChange?: DueAtHandler | undefined;
  onKnowledgeCandidateReview?: KnowledgeCandidateReviewHandler | undefined;
  onMatterWikiReview?: MatterWikiReviewHandler | undefined;
  onReassign?: ReassignHandler | undefined;
}) {
  const [draftAssignee, setDraftAssignee] = useState<WorkReassignmentCandidateDto | null>(null);
  const [candidateState, setCandidateState] = useState<CandidateState>(emptyCandidateState);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [dueDate, setDueDate] = useState(item.dueAt?.slice(0, 10) ?? '');
  const actionable = item.status === 'open' || item.status === 'in_progress';
  const showReassign = actionable && item.canReassign === true;
  const showDueAt = actionable && item.canUpdateDueAt === true;
  const reassignPanelId = `reassign-${item.itemKey}`;
  const candidateSelectId = `reassignment-candidate-${item.itemKey}`;
  const dueAt = workDueDateToIso(dueDate);

  useEffect(() => {
    setDueDate(item.dueAt?.slice(0, 10) ?? '');
  }, [item.dueAt]);

  useEffect(() => {
    const request = requestWorkReassignmentCandidates(item, reassignOpen);
    if (!request) {
      setCandidateState(emptyCandidateState);
      setDraftAssignee(null);
      return undefined;
    }

    let active = true;
    setCandidateState({ status: 'loading', data: [] });
    request
      .then((response) => {
        if (!active) return;
        setCandidateState(
          response.items.length > 0
            ? { status: 'ready', data: response.items }
            : { status: 'empty', data: [] },
        );
      })
      .catch(() => {
        if (active) setCandidateState({ status: 'error', data: [] });
      });

    return () => {
      active = false;
    };
  }, [item, reassignOpen]);

  async function runMutation(task: () => Promise<void>, onSuccess?: () => void): Promise<void> {
    setPending(true);
    setMutationError(null);
    try {
      await task();
      onSuccess?.();
    } catch (error: unknown) {
      setMutationError(workMutationErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="px-3.5 py-3 text-[13px] leading-5" data-work-item-key={item.itemKey}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">
                {item.title.replace('AI Fact', 'AI 사실관계')}
              </span>
              <StatusBadge tone={item.tone}>{item.sourceLabel}</StatusBadge>
              {item.statusLabel ? (
                <StatusBadge tone="neutral">{item.statusLabel}</StatusBadge>
              ) : null}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">{item.description}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
              {item.assignedToLabel ? <span>담당자 {item.assignedToLabel}</span> : null}
              {item.dueAt ? <span>기한 {item.dueAt.slice(0, 10)}</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ReviewActions
              disabled={pending}
              item={item}
              onGraphFactReview={onGraphFactReview}
              onKnowledgeCandidateReview={onKnowledgeCandidateReview}
              onMatterWikiReview={onMatterWikiReview}
              runMutation={runMutation}
            />
            {showReassign ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-controls={reassignPanelId}
                aria-expanded={reassignOpen}
                onClick={() => setReassignOpen((open) => !open)}
              >
                <Users className="h-3.5 w-3.5" />
                담당자 변경
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={item.href}>열기</Link>
            </Button>
          </div>
        </div>

        {showDueAt ? (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <label
              className="grid gap-1.5 text-sm font-medium text-foreground"
              htmlFor={`due-${item.itemKey}`}
            >
              <span>기한 변경</span>
              <input
                id={`due-${item.itemKey}`}
                className={selectClassName}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                !onDueAtChange || !dueAt || pending || dueDate === (item.dueAt?.slice(0, 10) ?? '')
              }
              onClick={() => {
                if (!onDueAtChange || !dueAt) return;
                void runMutation(() => onDueAtChange(item.itemKey, dueAt));
              }}
            >
              기한 저장
            </Button>
          </div>
        ) : null}

        {showReassign && reassignOpen ? (
          <div
            className="grid min-w-0 gap-2 border-t pt-3 sm:grid-cols-[minmax(220px,1fr)_auto]"
            id={reassignPanelId}
          >
            <div className="min-w-0">
              <label
                className="mb-1.5 block text-sm font-medium text-foreground"
                htmlFor={candidateSelectId}
              >
                새 담당자
              </label>
              {candidateState.status === 'ready' ? (
                <WorkReassignmentSelect
                  candidates={candidateState.data}
                  id={candidateSelectId}
                  onChange={(userId) =>
                    setDraftAssignee(findWorkReassignmentCandidate(candidateState.data, userId))
                  }
                  value={draftAssignee?.userId ?? ''}
                />
              ) : (
                <WorkReassignmentCandidateFeedback status={candidateState.status} />
              )}
              {candidateState.status === 'ready' ? (
                <p className="mt-1 text-xs text-muted-foreground" id={`${candidateSelectId}-hint`}>
                  현재 작업에서 선택할 수 있는 사용자만 표시됩니다.
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-end"
              disabled={
                !onReassign || candidateState.status !== 'ready' || !draftAssignee || pending
              }
              onClick={() => {
                if (!onReassign || !draftAssignee) return;
                void runMutation(
                  () =>
                    reassignSelectedWorkItem(item.itemKey, draftAssignee, onReassign) ??
                    Promise.resolve(),
                  () => setDraftAssignee(null),
                );
              }}
            >
              <Users className="h-3.5 w-3.5" />
              재배정
            </Button>
          </div>
        ) : null}

        {mutationError ? (
          <div role="alert" className="text-sm text-destructive">
            {mutationError}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ReviewActions({
  disabled,
  item,
  onGraphFactReview,
  onKnowledgeCandidateReview,
  onMatterWikiReview,
  runMutation,
}: {
  disabled: boolean;
  item: DmsWorkQueueItem;
  onGraphFactReview?: GraphFactReviewHandler | undefined;
  onKnowledgeCandidateReview?: KnowledgeCandidateReviewHandler | undefined;
  onMatterWikiReview?: MatterWikiReviewHandler | undefined;
  runMutation: (task: () => Promise<void>) => Promise<void>;
}) {
  if (!item.targetId || (item.status !== 'open' && item.status !== 'in_progress')) return null;
  if (item.kind === 'knowledge_candidate_review') {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !onKnowledgeCandidateReview}
          onClick={() => {
            if (onKnowledgeCandidateReview) {
              void runMutation(() => onKnowledgeCandidateReview(item.targetId!, 'approve'));
            }
          }}
        >
          <Check className="h-3.5 w-3.5" />
          승인
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !onKnowledgeCandidateReview}
          onClick={() => {
            if (onKnowledgeCandidateReview) {
              void runMutation(() => onKnowledgeCandidateReview(item.targetId!, 'reject'));
            }
          }}
        >
          <X className="h-3.5 w-3.5" />
          반려
        </Button>
      </>
    );
  }
  if (item.kind === 'wiki_page_review') {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !onMatterWikiReview}
          onClick={() => {
            if (onMatterWikiReview) {
              void runMutation(() => onMatterWikiReview(item.targetId!, 'confirm'));
            }
          }}
        >
          <Check className="h-3.5 w-3.5" />
          확인
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !onMatterWikiReview}
          onClick={() => {
            if (onMatterWikiReview) {
              void runMutation(() => onMatterWikiReview(item.targetId!, 'reject'));
            }
          }}
        >
          <X className="h-3.5 w-3.5" />
          거절
        </Button>
      </>
    );
  }
  if (item.kind === 'graph_fact_review') {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !onGraphFactReview}
          onClick={() => {
            if (onGraphFactReview) {
              void runMutation(() => onGraphFactReview(item.targetId!, 'confirm'));
            }
          }}
        >
          <Check className="h-3.5 w-3.5" />
          확인
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !onGraphFactReview}
          onClick={() => {
            if (onGraphFactReview) {
              void runMutation(() => onGraphFactReview(item.targetId!, 'reject'));
            }
          }}
        >
          <X className="h-3.5 w-3.5" />
          거절
        </Button>
      </>
    );
  }
  return null;
}

function WorkQueueStateEmpty({ state }: { state: DataState<DmsWorkQueueItem[]> }) {
  if (state.status === 'empty') {
    return (
      <EmptyState
        title="표시할 작업이 없습니다."
        description="서버에 저장된 운영 작업만 표시됩니다."
      />
    );
  }
  if (state.status === 'error') {
    return <EmptyState variant="api-error" title="업무 데이터를 표시할 수 없습니다." />;
  }
  if (state.status === 'forbidden') {
    return <EmptyState variant="no-access" title="업무 데이터에 접근할 권한이 없습니다." />;
  }
  if (state.status === 'blocked') {
    return (
      <EmptyState variant="policy-blocked" title="정보 차단 정책에 따라 표시할 수 없습니다." />
    );
  }
  return <EmptyState variant="api-unavailable" title="업무 상태 연결 대기 중입니다." />;
}

function workQueueStateMeta(state: DataState<DmsWorkQueueItem[]>, page?: WorkQueuePage): string {
  if (state.status === 'ready') {
    if (page && page.total > state.data.length) {
      return `현재 페이지 ${state.data.length}건 · 전체 ${page.total}건`;
    }
    return state.data.length > 0 ? `${state.data.length}건` : '표시할 항목 없음';
  }
  if (state.status === 'empty') return '표시할 항목 없음';
  if (state.status === 'error') return '연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  return '업무 상태 연결 대기';
}

function workQueueStateTone(state: DataState<DmsWorkQueueItem[]>): StatusBadgeTone {
  if (state.status === 'ready') return state.data.length > 0 ? 'warning' : 'success';
  if (state.status === 'empty') return 'success';
  if (state.status === 'error' || state.status === 'blocked') return 'blocked';
  if (state.status === 'forbidden') return 'warning';
  return 'neutral';
}
