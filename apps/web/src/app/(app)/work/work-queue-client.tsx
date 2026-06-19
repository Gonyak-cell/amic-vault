'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, Bell, Bot, FileSearch, PlugZap } from 'lucide-react';
import {
  dashboardActionItems,
  DashboardWorkQueueSection,
} from '@/components/dashboard/dashboard-work-queue';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, FilterField } from '@/components/ui/filter-bar';
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
  workQueueToState,
  type DmsWorkQueueItem,
} from '@/lib/api/work-ops';
import type { DataState } from '@/lib/data-state';

type WorkSourceFilter = 'all' | DmsWorkQueueItem['source'];
type WorkToneFilter = 'all' | DmsWorkQueueItem['tone'];
type WorkSortMode = 'attention' | 'updated_desc' | 'source';

const selectClassName =
  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const sourceFilterLabels = {
  all: '전체 출처',
  permission_policy: '권한/정책',
  ai_prep: '파일 정리 준비',
  integration: '통합',
  operational_data: '운영 데이터',
} as const satisfies Record<WorkSourceFilter, string>;

const toneFilterLabels = {
  all: '전체 상태',
  blocked: '차단/확인 필요',
  warning: '주의',
  neutral: '상태 확인',
  success: '정상',
} as const satisfies Record<WorkToneFilter, string>;

const sortModeLabels = {
  attention: '주의 항목 우선',
  updated_desc: '최근 업데이트',
  source: '출처별',
} as const satisfies Record<WorkSortMode, string>;

const sourceFilterOptions = Object.keys(sourceFilterLabels) as WorkSourceFilter[];
const toneFilterOptions = Object.keys(toneFilterLabels) as WorkToneFilter[];
const sortModeOptions = Object.keys(sortModeLabels) as WorkSortMode[];

export function WorkQueueClient() {
  const [dashboardState, setDashboardState] = useState<DashboardOverviewState>(() =>
    createDashboardUnavailableState(),
  );
  const [workItemsState, setWorkItemsState] = useState<DataState<DmsWorkQueueItem[]>>(() =>
    createWorkItemsUnavailableState(),
  );

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

  useEffect(() => {
    let active = true;
    getWorkQueue()
      .then((response) => {
        if (active) setWorkItemsState(workQueueToState(response));
      })
      .catch((error: unknown) => {
        if (active) setWorkItemsState(operationalApiErrorState(error));
      });
    return () => {
      active = false;
    };
  }, []);

  return <WorkQueueContent dashboardState={dashboardState} workItemsState={workItemsState} />;
}

export function WorkQueueContent({
  dashboardState,
  workItemsState,
}: {
  dashboardState: DashboardOverviewState;
  workItemsState?: DataState<DmsWorkQueueItem[]>;
}) {
  const [sourceFilter, setSourceFilter] = useState<WorkSourceFilter>('all');
  const [toneFilter, setToneFilter] = useState<WorkToneFilter>('all');
  const [sortMode, setSortMode] = useState<WorkSortMode>('attention');
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
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '작업함']}
        title="작업함"
        description="권한과 운영 상태가 확인된 작업만 표시됩니다."
        actions={
          <StatusBadge tone={actionItems.length > 0 ? 'warning' : 'success'}>
            실제 상태 기반
          </StatusBadge>
        }
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <FilterBar
            label="작업함 조치 콘솔"
            title="작업함 조치 콘솔"
            description="실제 문서·사건 상태에서 발생한 작업만 출처와 상태 기준으로 좁힙니다."
            resultsSummary={workFilterSummary(workItemsState, visibleActionItems, actionItems)}
            controls={
              <>
                <FilterField htmlFor="work-source-filter" label="출처">
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
              </>
            }
            actions={
              sourceFilter !== 'all' || toneFilter !== 'all' || sortMode !== 'attention' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSourceFilter('all');
                    setToneFilter('all');
                    setSortMode('attention');
                  }}
                >
                  초기화
                </Button>
              ) : null
            }
          />
          <DashboardWorkQueueSection
            itemsState={visibleItemsState}
            state={dashboardState}
            title="내 작업"
          />
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
                <Link href="/files?status=draft">메타데이터 보완</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/files?aiAllowed=true&sortBy=matter_asc">파일 정리 준비</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/records">보존 조치</Link>
              </Button>
            </div>
          </SectionCard>
          <SectionCard icon={<Activity className="h-4 w-4" />} title="작업 출처" meta="운영 API">
            <ul className="grid gap-2 sm:grid-cols-2">
              <SourceStateItem
                label="권한/정책 알림"
                state={dashboardState.permissionPolicyAlerts}
              />
              <SourceStateItem label="파일 정리 준비" state={dashboardState.aiPrepStatus} />
              <SourceStateItem label="통합 상태" state={dashboardState.integrationStatus} />
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
            title="통합"
            emptyTitle="연결된 통합 상태가 없습니다."
            state={dashboardState.integrationStatus}
          />
        </aside>
      </div>
    </PageShell>
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
  return <EmptyState variant="api-unavailable" title="운영 데이터 연결 대기 중입니다." />;
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
  if (source === 'ai_prep') return 1;
  if (source === 'integration') return 2;
  return 3;
}

function updatedRank(updatedAt: string | undefined): number {
  if (!updatedAt) return 0;
  const time = Date.parse(updatedAt);
  return Number.isNaN(time) ? 0 : time;
}

function workFilterSummary(
  state: DataState<DmsWorkQueueItem[]> | undefined,
  visibleItems: DmsWorkQueueItem[],
  allItems: DmsWorkQueueItem[],
): string {
  if (state?.status === 'error') return '운영 데이터 연결 확인 필요';
  if (state?.status === 'forbidden' || state?.status === 'blocked') return '권한 정책 적용';
  if (state && state.status !== 'ready') return '작업 데이터 연결 대기';
  return `${visibleItems.length}건 표시 · 전체 ${allItems.length}건`;
}
