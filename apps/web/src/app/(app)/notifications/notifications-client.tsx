'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { DashboardNotificationList } from '@/components/dashboard/dashboard-notifications';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, FilterField } from '@/components/ui/filter-bar';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  createNotificationsUnavailableState,
  dismissNotification,
  getNotificationCenter,
  markNotificationRead,
  notificationCenterToState,
  operationalApiErrorState,
  workQueueUrlStateFromParams,
  type DmsNotificationItem,
  type WorkQueueUrlState,
} from '@/lib/api/work-ops';
import type { DataState } from '@/lib/data-state';
import { WorkInboxTabs } from '@/components/work/work-inbox-tabs';

type PersistedNotificationSource = Extract<
  DmsNotificationItem['source'],
  'operational_data' | 'records'
>;
type NotificationSourceFilter = 'all' | PersistedNotificationSource;
type NotificationToneFilter = 'all' | DmsNotificationItem['tone'];
type NotificationSortMode = 'attention' | 'occurred_desc' | 'source';
type NotificationMutation = 'dismiss' | 'read';

const selectClassName =
  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const notificationSourceLabels = {
  all: '전체 구분',
  operational_data: '문서 처리',
  records: '기록 보존',
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
  source: '업무 구분별',
} as const satisfies Record<NotificationSortMode, string>;

const notificationSourceOptions = Object.keys(
  notificationSourceLabels,
) as NotificationSourceFilter[];
const notificationToneOptions = Object.keys(notificationToneLabels) as NotificationToneFilter[];
const notificationSortOptions = Object.keys(notificationSortLabels) as NotificationSortMode[];

export function NotificationsClient({
  urlState = workQueueUrlStateFromParams(),
}: {
  urlState?: WorkQueueUrlState;
}) {
  const [notificationState, setNotificationState] = useState<DataState<DmsNotificationItem[]>>(() =>
    createNotificationsUnavailableState(),
  );
  const [notificationPartial, setNotificationPartial] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getNotificationCenter()
      .then((response) => {
        if (active) {
          setNotificationState(notificationCenterToState(response));
          setNotificationPartial(response.partial === true || response.hasMore === true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setNotificationState(operationalApiErrorState(error));
          setNotificationPartial(false);
        }
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
    setMutationError(null);
    markNotificationRead(item.itemKey)
      .then(() => {
        updateNotificationState((items) =>
          items.map((current) =>
            current.itemKey === item.itemKey
              ? { ...current, status: 'read', statusLabel: '읽음' }
              : current,
          ),
        );
      })
      .catch(() => {
        setMutationError(notificationMutationErrorMessage('read'));
      });
  }

  function handleDismiss(item: DmsNotificationItem) {
    setMutationError(null);
    dismissNotification(item.itemKey)
      .then(() => {
        updateNotificationState((items) =>
          items.filter((current) => current.itemKey !== item.itemKey),
        );
      })
      .catch(() => {
        setMutationError(notificationMutationErrorMessage('dismiss'));
      });
  }

  return (
    <NotificationsContent
      mutationError={mutationError}
      notificationPartial={notificationPartial}
      notificationState={notificationState}
      onDismiss={handleDismiss}
      onMarkRead={handleMarkRead}
      urlState={urlState}
    />
  );
}

export function NotificationsContent({
  mutationError = null,
  notificationPartial = false,
  notificationState,
  onDismiss,
  onMarkRead,
  urlState = workQueueUrlStateFromParams(),
}: {
  mutationError?: string | null;
  notificationPartial?: boolean;
  notificationState: DataState<DmsNotificationItem[]>;
  onDismiss?: (item: DmsNotificationItem) => void;
  onMarkRead?: (item: DmsNotificationItem) => void;
  urlState?: WorkQueueUrlState;
}) {
  const [sourceFilter, setSourceFilter] = useState<NotificationSourceFilter>('all');
  const [toneFilter, setToneFilter] = useState<NotificationToneFilter>('all');
  const [sortMode, setSortMode] = useState<NotificationSortMode>('attention');
  const items = notificationState.status === 'ready' ? notificationState.data : [];
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
        breadcrumbs={['문서 보관', '알림']}
        title="알림"
        actions={
          <StatusBadge tone={items.length > 0 ? 'warning' : 'success'}>실제 상태 기반</StatusBadge>
        }
      />
      <WorkInboxTabs activeView="notifications" urlState={urlState} />

      <div className="grid min-w-0 gap-4">
        <FilterBar
          label="알림 조치 콘솔"
          title="알림 조치 콘솔"
          description="실제 운영 이벤트에서 발생한 알림만 업무 구분과 상태 기준으로 좁히고 원본 업무 화면으로 이동합니다."
          resultsSummary={notificationFilterSummary(
            notificationState,
            visibleItems,
            items,
            notificationPartial,
          )}
          controls={
            <>
              <FilterField htmlFor="notification-source-filter" label="업무 구분">
                <select
                  id="notification-source-filter"
                  className={selectClassName}
                  value={sourceFilter}
                  onChange={(event) =>
                    setSourceFilter(event.target.value as NotificationSourceFilter)
                  }
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
        {mutationError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {mutationError}
          </div>
        ) : null}
        {notificationPartial ? (
          <div
            role="status"
            className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          >
            최근 알림 일부만 표시됩니다. 더 많은 알림이 있어 이 목록이 전체가 아닙니다.
          </div>
        ) : null}
        <SectionCard
          icon={<Bell className="h-4 w-4" />}
          title="알림 센터"
          meta={notificationStateMeta(visibleNotificationState)}
        >
          <NotificationStateBody state={visibleNotificationState} {...notificationActionProps} />
        </SectionCard>
      </div>
    </PageShell>
  );
}

function NotificationStateBody({
  onDismiss,
  onMarkRead,
  state,
}: {
  onDismiss?: (item: DmsNotificationItem) => void;
  onMarkRead?: (item: DmsNotificationItem) => void;
  state: DataState<DmsNotificationItem[]>;
}) {
  if (state.status === 'ready') {
    return (
      <DashboardNotificationList
        items={state.data}
        {...(onDismiss ? { onDismiss } : {})}
        {...(onMarkRead ? { onMarkRead } : {})}
      />
    );
  }
  if (state.status === 'empty') {
    return (
      <EmptyState
        title="표시할 알림이 없습니다."
        description="실제 운영 이벤트와 상태에서 발생한 알림만 표시됩니다."
      />
    );
  }
  if (state.status === 'error')
    return <EmptyState variant="api-error" title="알림 데이터를 표시할 수 없습니다." />;
  if (state.status === 'forbidden')
    return <EmptyState variant="no-access" title="알림 데이터에 접근할 권한이 없습니다." />;
  if (state.status === 'blocked') {
    return (
      <EmptyState variant="policy-blocked" title="정보 차단 정책에 따라 표시할 수 없습니다." />
    );
  }
  return <EmptyState variant="api-unavailable" title="알림 연결 대기 중입니다." />;
}

function notificationStateMeta(state: DataState<DmsNotificationItem[]>): string {
  if (state.status === 'ready') {
    return state.data.length > 0 ? `${state.data.length}건` : '표시할 항목 없음';
  }
  if (state.status === 'empty') return '표시할 항목 없음';
  if (state.status === 'error') return '연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  return '연결 대기';
}

function filteredNotificationState(
  state: DataState<DmsNotificationItem[]>,
  items: DmsNotificationItem[],
): DataState<DmsNotificationItem[]> {
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
  const occurredDelta =
    notificationTimeRank(right.occurredAt) - notificationTimeRank(left.occurredAt);
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
  return source === 'records' ? 0 : 1;
}

function notificationTimeRank(occurredAt: string | undefined): number {
  if (!occurredAt) return 0;
  const time = Date.parse(occurredAt);
  return Number.isNaN(time) ? 0 : time;
}

function notificationFilterSummary(
  state: DataState<DmsNotificationItem[]>,
  visibleItems: DmsNotificationItem[],
  allItems: DmsNotificationItem[],
  partial: boolean,
): string {
  if (state.status === 'error') return '운영 데이터 연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  if (state.status === 'empty') return '표시할 알림 없음';
  if (state.status !== 'ready') return '알림 데이터 연결 대기';
  if (partial) return `${visibleItems.length}건 표시 · 최근 ${allItems.length}건 중 일부`;
  return `${visibleItems.length}건 표시 · 전체 ${allItems.length}건`;
}

export function notificationMutationErrorMessage(mutation: NotificationMutation): string {
  return mutation === 'read'
    ? '읽음 처리를 완료하지 못했습니다. 다시 시도해 주세요.'
    : '알림을 숨기지 못했습니다. 다시 시도해 주세요.';
}
