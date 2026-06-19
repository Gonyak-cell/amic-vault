'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Bell, Bot, FileSearch, PlugZap } from 'lucide-react';
import {
  dashboardActionItems,
  DashboardWorkQueueSection,
} from '@/components/dashboard/dashboard-work-queue';
import { Button } from '@/components/ui/button';
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

export function WorkQueueClient() {
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

  return <WorkQueueContent dashboardState={dashboardState} />;
}

export function WorkQueueContent({ dashboardState }: { dashboardState: DashboardOverviewState }) {
  const actionItems = dashboardActionItems(dashboardState);
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
          <DashboardWorkQueueSection state={dashboardState} title="내 작업" />
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
                <Link href="/files?aiAllowed=true&sortBy=matter_asc">파일 정리 준비</Link>
              </Button>
            </div>
          </SectionCard>
          <SectionCard icon={<Activity className="h-4 w-4" />} title="작업 출처" meta="운영 데이터">
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
