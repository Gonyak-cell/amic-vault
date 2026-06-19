'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { DmsNotificationItemDto } from '@amic-vault/shared';
import type {
  DashboardOverviewState,
  DashboardRecentActivity,
} from '@/lib/api/dashboard';
import type { DataState } from '@/lib/data-state';

export function dashboardNotificationItems(
  state: DashboardOverviewState,
): DmsNotificationItemDto[] {
  const items: DmsNotificationItemDto[] = [];

  if (state.permissionPolicyAlerts.status === 'ready') {
    state.permissionPolicyAlerts.data.slice(0, 5).forEach((alert, index) => {
      items.push({
        itemKey: `permission-policy-${index}`,
        source: 'permission_policy',
        category: '권한/정책',
        title: alert.title,
        description: alert.description,
        tone: 'warning',
        ...(alert.occurredAt ? { occurredAt: alert.occurredAt } : {}),
      });
    });
  }

  if (state.aiPrepStatus.status === 'ready') {
    state.aiPrepStatus.data.slice(0, 5).forEach((prep, index) => {
      items.push({
        itemKey: `ai-prep-${index}`,
        source: 'ai_prep',
        category: '파일 정리 준비',
        title: prep.matterLabel,
        description: prep.statusLabel,
        tone: 'neutral',
        ...(prep.updatedAt ? { occurredAt: prep.updatedAt } : {}),
      });
    });
  }

  if (state.integrationStatus.status === 'ready') {
    state.integrationStatus.data.slice(0, 5).forEach((integration, index) => {
      items.push({
        itemKey: `integration-${index}`,
        source: 'integration',
        category: '통합',
        title: integration.integrationLabel,
        description: integration.statusLabel,
        tone: 'neutral',
        ...(integration.updatedAt ? { occurredAt: integration.updatedAt } : {}),
      });
    });
  }

  if (state.recentActivity.status === 'ready') {
    state.recentActivity.data
      .slice(0, 5)
      .forEach((activity, index) => items.push(activityNotification(activity, index)));
  }

  if (
    state.recentActivity.status === 'error' ||
    state.recentFiles.status === 'error' ||
    state.permissionPolicyAlerts.status === 'error'
  ) {
    items.push({
      itemKey: 'operational-data-connection',
      source: 'recent_activity',
      category: '운영 데이터',
      title: '운영 데이터 연결 확인',
      description: '일부 알림 출처를 표시할 수 없습니다.',
      tone: 'blocked',
    });
  }

  return items;
}

export function DashboardNotificationsSection({
  itemsState,
  state,
  title = '알림',
}: {
  itemsState?: DataState<DmsNotificationItemDto[]> | undefined;
  state: DashboardOverviewState;
  title?: string;
}) {
  const items = itemsState?.status === 'ready' ? itemsState.data : dashboardNotificationItems(state);
  return (
    <SectionCard
      icon={<Bell className="h-4 w-4" />}
      title={title}
      meta={notificationListMeta(itemsState, items)}
    >
      {itemsState && itemsState.status !== 'ready' ? (
        <NotificationStateEmpty state={itemsState} />
      ) : (
        <DashboardNotificationList items={items} />
      )}
    </SectionCard>
  );
}

export function DashboardNotificationList({
  items,
}: {
  items: DmsNotificationItemDto[];
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="표시할 알림이 없습니다."
        description="실제 운영 이벤트와 상태에서 발생한 알림만 표시됩니다."
      />
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li
          key={item.itemKey}
          className="px-3.5 py-3 text-[13px] leading-5"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{item.title}</span>
                <StatusBadge tone={item.tone}>{item.category}</StatusBadge>
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {item.description}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function notificationSourceMeta<T>(state: DataState<T[]>): string {
  if (state.status === 'ready') {
    return state.data.length > 0 ? `${state.data.length}건` : '표시할 항목 없음';
  }
  if (state.status === 'empty') return '표시할 항목 없음';
  if (state.status === 'error') return '연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  return '연결 대기';
}

function notificationListMeta(
  state: DataState<DmsNotificationItemDto[]> | undefined,
  items: DmsNotificationItemDto[],
): string {
  if (!state) return items.length > 0 ? `${items.length}건` : '표시할 항목 없음';
  return notificationSourceMeta(state);
}

function NotificationStateEmpty({ state }: { state: DataState<DmsNotificationItemDto[]> }) {
  if (state.status === 'empty') {
    return (
      <EmptyState
        title="표시할 알림이 없습니다."
        description="알림 API가 실제 운영 이벤트와 상태에서 파생한 항목만 표시합니다."
      />
    );
  }
  if (state.status === 'error') {
    return <EmptyState variant="api-error" title="알림 API 데이터를 표시할 수 없습니다." />;
  }
  if (state.status === 'forbidden') {
    return <EmptyState variant="no-access" title="알림 API에 접근할 권한이 없습니다." />;
  }
  if (state.status === 'blocked') {
    return (
      <EmptyState
        variant="policy-blocked"
        title="정보 차단 또는 권한 정책으로 표시할 수 없습니다."
      />
    );
  }
  return <EmptyState variant="api-unavailable" title="알림 API 연결 대기 중입니다." />;
}

function activityNotification(
  activity: DashboardRecentActivity,
  index: number,
): DmsNotificationItemDto {
  return {
    itemKey: `recent-activity-${index}`,
    source: 'recent_activity',
    category: '최근 활동',
    title: activity.actionLabel,
    description: `${activity.targetLabel} · ${activity.resultLabel}`,
    tone: activity.resultLabel.includes('차단') ? 'blocked' : 'success',
    occurredAt: activity.occurredAt,
  };
}
