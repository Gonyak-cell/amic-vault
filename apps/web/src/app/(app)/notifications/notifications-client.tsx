'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Bell, Bot, PlugZap } from 'lucide-react';
import {
  dashboardNotificationItems,
  DashboardNotificationsSection,
  notificationSourceMeta,
} from '@/components/dashboard/dashboard-notifications';
import { EmptyState } from '@/components/ui/empty-state';
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
import type { DataState } from '@/lib/data-state';

export function NotificationsClient() {
  const [dashboardState, setDashboardState] = useState<DashboardOverviewState>(() =>
    createDashboardUnavailableState(),
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

  return <NotificationsContent dashboardState={dashboardState} />;
}

export function NotificationsContent({
  dashboardState,
}: {
  dashboardState: DashboardOverviewState;
}) {
  const items = dashboardNotificationItems(dashboardState);
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
          <DashboardNotificationsSection state={dashboardState} title="알림 센터" />
          <SectionCard icon={<Activity className="h-4 w-4" />} title="알림 출처" meta="운영 데이터">
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
