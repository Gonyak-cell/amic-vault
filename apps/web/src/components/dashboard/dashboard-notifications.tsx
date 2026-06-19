'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import type {
  DashboardOverviewState,
  DashboardRecentActivity,
} from '@/lib/api/dashboard';
import type { DataState } from '@/lib/data-state';

export interface DashboardNotificationItem {
  category: string;
  title: string;
  description: string;
  tone: 'success' | 'warning' | 'blocked' | 'neutral';
}

export function dashboardNotificationItems(
  state: DashboardOverviewState,
): DashboardNotificationItem[] {
  const items: DashboardNotificationItem[] = [];

  if (state.permissionPolicyAlerts.status === 'ready') {
    for (const alert of state.permissionPolicyAlerts.data.slice(0, 5)) {
      items.push({
        category: '권한/정책',
        title: alert.title,
        description: alert.description,
        tone: 'warning',
      });
    }
  }

  if (state.aiPrepStatus.status === 'ready') {
    for (const prep of state.aiPrepStatus.data.slice(0, 5)) {
      items.push({
        category: '파일 정리 준비',
        title: prep.matterLabel,
        description: prep.statusLabel,
        tone: 'neutral',
      });
    }
  }

  if (state.integrationStatus.status === 'ready') {
    for (const integration of state.integrationStatus.data.slice(0, 5)) {
      items.push({
        category: '통합',
        title: integration.integrationLabel,
        description: integration.statusLabel,
        tone: 'neutral',
      });
    }
  }

  if (state.recentActivity.status === 'ready') {
    for (const activity of state.recentActivity.data.slice(0, 5)) {
      items.push(activityNotification(activity));
    }
  }

  if (
    state.recentActivity.status === 'error' ||
    state.recentFiles.status === 'error' ||
    state.permissionPolicyAlerts.status === 'error'
  ) {
    items.push({
      category: '운영 데이터',
      title: '운영 데이터 연결 확인',
      description: '일부 알림 출처를 표시할 수 없습니다.',
      tone: 'blocked',
    });
  }

  return items;
}

export function DashboardNotificationsSection({
  state,
  title = '알림',
}: {
  state: DashboardOverviewState;
  title?: string;
}) {
  const items = dashboardNotificationItems(state);
  return (
    <SectionCard
      icon={<Bell className="h-4 w-4" />}
      title={title}
      meta={items.length > 0 ? `${items.length}건` : '표시할 항목 없음'}
    >
      <DashboardNotificationList items={items} />
    </SectionCard>
  );
}

export function DashboardNotificationList({
  items,
}: {
  items: DashboardNotificationItem[];
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
          key={`${item.category}-${item.title}-${item.description}`}
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

function activityNotification(activity: DashboardRecentActivity): DashboardNotificationItem {
  return {
    category: '최근 활동',
    title: activity.actionLabel,
    description: `${activity.targetLabel} · ${activity.resultLabel}`,
    tone: activity.resultLabel.includes('차단') ? 'blocked' : 'success',
  };
}
