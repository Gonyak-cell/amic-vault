'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, Bot, PlugZap } from 'lucide-react';
import {
  dashboardNotificationItems,
  DashboardNotificationsSection,
  notificationSourceMeta,
} from '@/components/dashboard/dashboard-notifications';
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
  createNotificationsUnavailableState,
  dismissNotification,
  getNotificationCenter,
  markNotificationRead,
  notificationCenterToState,
  operationalApiErrorState,
  type DmsNotificationItem,
} from '@/lib/api/work-ops';
import type { DataState } from '@/lib/data-state';

type NotificationSourceFilter = 'all' | DmsNotificationItem['source'];
type NotificationToneFilter = 'all' | DmsNotificationItem['tone'];
type NotificationSortMode = 'attention' | 'occurred_desc' | 'source';

const selectClassName =
  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const notificationSourceLabels = {
  all: '전체 출처',
  permission_policy: '권한/정책',
  ai_prep: '파일 정리 준비',
  integration: '통합',
  operational_data: '문서 처리',
  records: '기록 보존',
  recent_activity: '최근 활동',
} as const satisfies Record<NotificationSourceFilter, string>;

const notificationToneLabels = {
  all: '전체 상태',
  blocked: '차단/확인 필요',
  warning: '주의',
  neutral: '상태 확인',
  success: '정상',
} as const satisfies Record<NotificationToneFilter, string>;

const notificationSortLabels = {
  attention: '주의 알림 우선',
  occurred_desc: '최근 발생',
  source: '출처별',
} as const satisfies Record<NotificationSortMode, string>;

const notificationSourceOptions = Object.keys(notificationSourceLabels) as NotificationSourceFilter[];
const notificationToneOptions = Object.keys(notificationToneLabels) as NotificationToneFilter[];
const notificationSortOptions = Object.keys(notificationSortLabels) as NotificationSortMode[];

export function NotificationsClient() {
  const [dashboardState, setDashboardState] = useState<DashboardOverviewState>(() =>
    createDashboardUnavailableState(),
  );
  const [notificationState, setNotificationState] = useState<DataState<DmsNotificationItem[]>>(() =>
    createNotificationsUnavailableState(),
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
    getNotificationCenter()
      .then((response) => {
        if (active) setNotificationState(notificationCenterToState(response));
      })
      .catch((error: unknown) => {
        if (active) setNotificationState(operationalApiErrorState(error));
      });
    return () => {
      active = false;
    };
  }, []);

  function updateNotificationState(
    updater: (items: DmsNotificationItem[]) => DmsNotificationItem[],
  ) {
    setNotificationState((current) => {
      if (current.status !== 'ready') return current;
      const next = updater(current.data);
      return next.length > 0 ? { status: 'ready', data: next } : { status: 'empty' };
    });
  }

  function handleMarkRead(item: DmsNotificationItem) {
    markNotificationRead(item.itemKey).then(() => {
      updateNotificationState((items) =>
        items.map((current) =>
          current.itemKey === item.itemKey
            ? { ...current, status: 'read', statusLabel: '읽음' }
            : current,
        ),
      );
    });
  }

  function handleDismiss(item: DmsNotificationItem) {
    dismissNotification(item.itemKey).then(() => {
      updateNotificationState((items) =>
        items.filter((current) => current.itemKey !== item.itemKey),
      );
    });
  }

  return (
    <NotificationsContent
      dashboardState={dashboardState}
      notificationState={notificationState}
      onDismiss={handleDismiss}
      onMarkRead={handleMarkRead}
    />
  );
}

export function NotificationsContent({
  dashboardState,
  notificationState,
  onDismiss,
  onMarkRead,
}: {
  dashboardState: DashboardOverviewState;
  notificationState?: DataState<DmsNotificationItem[]>;
  onDismiss?: (item: DmsNotificationItem) => void;
  onMarkRead?: (item: DmsNotificationItem) => void;
}) {
  const [sourceFilter, setSourceFilter] = useState<NotificationSourceFilter>('all');
  const [toneFilter, setToneFilter] = useState<NotificationToneFilter>('all');
  const [sortMode, setSortMode] = useState<NotificationSortMode>('attention');
  const items =
    notificationState?.status === 'ready'
      ? notificationState.data
      : dashboardNotificationItems(dashboardState);
  const visibleItems = useMemo(
    () => filterNotifications(items, sourceFilter, toneFilter, sortMode),
    [items, sortMode, sourceFilter, toneFilter],
  );
  const visibleNotificationState = useMemo(
    () => filteredNotificationState(notificationState, visibleItems),
    [notificationState, visibleItems],
  );
  const notificationActionProps = {
    ...(onDismiss ? { onDismiss } : {}),
    ...(onMarkRead ? { onMarkRead } : {}),
  };
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '알림']}
        title="알림"
        description="권한이 확인된 실제 운영 이벤트와 상태 알림만 표시됩니다."
        actions={
          <StatusBadge tone={items.length > 0 ? 'warning' : 'success'}>
            실제 상태 기반
          </StatusBadge>
        }
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <FilterBar
            label="알림 조치 콘솔"
            title="알림 조치 콘솔"
            description="실제 운영 이벤트에서 발생한 알림만 출처와 상태 기준으로 좁히고 원본 업무 화면으로 이동합니다."
            resultsSummary={notificationFilterSummary(notificationState, visibleItems, items)}
            controls={
              <>
                <FilterField htmlFor="notification-source-filter" label="출처">
                  <select
                    id="notification-source-filter"
                    className={selectClassName}
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value as NotificationSourceFilter)}
                  >
                    {notificationSourceOptions.map((option) => (
                      <option key={option} value={option}>
                        {notificationSourceLabels[option]}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField htmlFor="notification-status-filter" label="상태">
                  <select
                    id="notification-status-filter"
                    className={selectClassName}
                    value={toneFilter}
                    onChange={(event) => setToneFilter(event.target.value as NotificationToneFilter)}
                  >
                    {notificationToneOptions.map((option) => (
                      <option key={option} value={option}>
                        {notificationToneLabels[option]}
                      </option>
                    ))}
                  </select>
                </FilterField>
                <FilterField htmlFor="notification-sort" label="정렬">
                  <select
                    id="notification-sort"
                    className={selectClassName}
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as NotificationSortMode)}
                  >
                    {notificationSortOptions.map((option) => (
                      <option key={option} value={option}>
                        {notificationSortLabels[option]}
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
          <DashboardNotificationsSection
            itemsState={visibleNotificationState}
            state={dashboardState}
            title="알림 센터"
            {...notificationActionProps}
          />
          <SectionCard icon={<Activity className="h-4 w-4" />} title="알림 출처" meta="운영 API">
            <ul className="grid gap-2 sm:grid-cols-2">
              <NotificationSourceItem label="권한/정책" state={dashboardState.permissionPolicyAlerts} />
              <NotificationSourceItem label="파일 정리 준비" state={dashboardState.aiPrepStatus} />
              <NotificationSourceItem label="통합 상태" state={dashboardState.integrationStatus} />
              <NotificationSourceItem label="최근 활동" state={dashboardState.recentActivity} />
            </ul>
          </SectionCard>
        </div>

        <aside className="grid gap-4 xl:sticky xl:top-20 xl:self-start">
          <NotificationSourcePanel
            icon={<Bell className="h-4 w-4" />}
            title="권한/정책"
            emptyTitle="표시할 권한 또는 정책 알림이 없습니다."
            state={dashboardState.permissionPolicyAlerts}
          />
          <NotificationSourcePanel
            icon={<Bot className="h-4 w-4" />}
            title="파일 정리 준비"
            emptyTitle="파일 정리 준비 상태 알림이 없습니다."
            state={dashboardState.aiPrepStatus}
          />
          <NotificationSourcePanel
            icon={<PlugZap className="h-4 w-4" />}
            title="통합"
            emptyTitle="연결된 통합 상태 알림이 없습니다."
            state={dashboardState.integrationStatus}
          />
        </aside>
      </div>
    </PageShell>
  );
}

function NotificationSourcePanel<T>({
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
    <SectionCard icon={icon} title={title} meta={notificationSourceMeta(state)}>
      <NotificationSourceBody state={state} emptyTitle={emptyTitle} />
    </SectionCard>
  );
}

function NotificationSourceItem<T>({ label, state }: { label: string; state: DataState<T[]> }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <StatusBadge tone={notificationTone(state)}>{notificationSourceMeta(state)}</StatusBadge>
    </li>
  );
}

function NotificationSourceBody<T>({
  emptyTitle,
  state,
}: {
  emptyTitle: string;
  state: DataState<T[]>;
}) {
  if (state.status === 'ready') {
    return state.data.length > 0 ? (
      <p className="text-sm text-muted-foreground">
        {state.data.length}건이 알림 센터에 반영되었습니다.
      </p>
    ) : (
      <EmptyState title={emptyTitle} />
    );
  }
  if (state.status === 'empty') return <EmptyState title={emptyTitle} />;
  if (state.status === 'error') return <EmptyState variant="api-error" title="알림을 표시할 수 없습니다." />;
  if (state.status === 'forbidden') return <EmptyState variant="no-access" title="이 항목을 볼 권한이 없습니다." />;
  if (state.status === 'blocked') {
    return <EmptyState variant="policy-blocked" title="정보 차단 또는 권한 정책으로 표시할 수 없습니다." />;
  }
  return <EmptyState variant="api-unavailable" title="운영 데이터 연결 대기 중입니다." />;
}

function notificationTone<T>(state: DataState<T[]>): 'success' | 'warning' | 'blocked' | 'neutral' {
  if (state.status === 'ready') return state.data.length > 0 ? 'warning' : 'success';
  if (state.status === 'empty') return 'success';
  if (state.status === 'error' || state.status === 'blocked') return 'blocked';
  if (state.status === 'forbidden') return 'warning';
  return 'neutral';
}

function filteredNotificationState(
  state: DataState<DmsNotificationItem[]> | undefined,
  items: DmsNotificationItem[],
): DataState<DmsNotificationItem[]> | undefined {
  if (!state) return undefined;
  if (state.status !== 'ready') return state;
  return { status: 'ready', data: items };
}

function filterNotifications(
  items: DmsNotificationItem[],
  sourceFilter: NotificationSourceFilter,
  toneFilter: NotificationToneFilter,
  sortMode: NotificationSortMode,
): DmsNotificationItem[] {
  return [...items]
    .filter((item) => sourceFilter === 'all' || item.source === sourceFilter)
    .filter((item) => toneFilter === 'all' || item.tone === toneFilter)
    .sort((left, right) => compareNotifications(left, right, sortMode));
}

function compareNotifications(
  left: DmsNotificationItem,
  right: DmsNotificationItem,
  sortMode: NotificationSortMode,
): number {
  if (sortMode === 'source') {
    const sourceDelta = notificationSourceRank(left.source) - notificationSourceRank(right.source);
    if (sourceDelta !== 0) return sourceDelta;
  }
  if (sortMode === 'attention') {
    const toneDelta = notificationToneRank(left.tone) - notificationToneRank(right.tone);
    if (toneDelta !== 0) return toneDelta;
  }
  const occurredDelta = notificationTimeRank(right.occurredAt) - notificationTimeRank(left.occurredAt);
  if (occurredDelta !== 0) return occurredDelta;
  return left.itemKey.localeCompare(right.itemKey);
}

function notificationToneRank(tone: DmsNotificationItem['tone']): number {
  if (tone === 'blocked') return 0;
  if (tone === 'warning') return 1;
  if (tone === 'neutral') return 2;
  return 3;
}

function notificationSourceRank(source: DmsNotificationItem['source']): number {
  if (source === 'permission_policy') return 0;
  if (source === 'ai_prep') return 1;
  if (source === 'integration') return 2;
  return 3;
}

function notificationTimeRank(occurredAt: string | undefined): number {
  if (!occurredAt) return 0;
  const time = Date.parse(occurredAt);
  return Number.isNaN(time) ? 0 : time;
}

function notificationFilterSummary(
  state: DataState<DmsNotificationItem[]> | undefined,
  visibleItems: DmsNotificationItem[],
  allItems: DmsNotificationItem[],
): string {
  if (state?.status === 'error') return '운영 데이터 연결 확인 필요';
  if (state?.status === 'forbidden' || state?.status === 'blocked') return '권한 정책 적용';
  if (state && state.status !== 'ready') return '알림 데이터 연결 대기';
  return `${visibleItems.length}건 표시 · 전체 ${allItems.length}건`;
}
