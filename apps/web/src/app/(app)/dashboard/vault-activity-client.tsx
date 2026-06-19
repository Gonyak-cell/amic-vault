'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Clock3,
  FileText,
  PlugZap,
  ShieldCheck,
} from 'lucide-react';
import { DashboardWorkQueueSection } from '@/components/dashboard/dashboard-work-queue';
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
  type DashboardAiPrepStatus,
  type DashboardIntegrationStatus,
  type DashboardOverviewState,
  type DashboardPolicyAlert,
  type DashboardRecentActivity,
  type DashboardRecentFile,
  type DashboardSectionId,
} from '@/lib/api/dashboard';
import type { DataState } from '@/lib/data-state';

const dashboardSectionLabels = {
  recentFiles: '최근 접근 파일',
  recentActivity: '최근 활동',
  permissionPolicyAlerts: '권한/정책 알림',
  aiPrepStatus: 'AI Prep 상태',
  integrationStatus: '통합 상태',
} as const satisfies Record<DashboardSectionId, string>;

export function VaultActivityClient() {
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

  return <VaultActivityContent dashboardState={dashboardState} />;
}

export function VaultActivityContent({
  dashboardState,
}: {
  dashboardState: DashboardOverviewState;
}) {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '홈']}
        title="홈"
        description="권한이 확인된 실제 파일과 활동만 표시됩니다."
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <PermissionBanner />
          <DashboardSection<DashboardRecentFile>
            icon={<FileText className="h-4 w-4" />}
            title={dashboardSectionLabels.recentFiles}
            state={dashboardState.recentFiles}
            emptyTitle="표시할 파일이 없습니다."
            renderItems={(items) => (
              <DashboardList>
                {items.map((item) => (
                  <DashboardListItem key={`${item.title}-${item.updatedAt ?? item.matterLabel ?? 'file'}`}>
                    <div className="font-medium text-foreground">{item.title}</div>
                    {item.matterLabel ? (
                      <div className="mt-1 text-[12px] text-muted-foreground">{item.matterLabel}</div>
                    ) : null}
                  </DashboardListItem>
                ))}
              </DashboardList>
            )}
          />
          <DashboardSection<DashboardRecentActivity>
            icon={<Clock3 className="h-4 w-4" />}
            title={dashboardSectionLabels.recentActivity}
            state={dashboardState.recentActivity}
            emptyTitle="표시할 활동이 없습니다."
            renderItems={(items) => (
              <DashboardList>
                {items.map((item) => (
                  <DashboardListItem key={`${item.actionLabel}-${item.occurredAt}`}>
                    <div className="font-medium text-foreground">{item.actionLabel}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {item.targetLabel} · {item.resultLabel}
                    </div>
                  </DashboardListItem>
                ))}
              </DashboardList>
            )}
          />
          <DashboardSection<DashboardPolicyAlert>
            icon={<Bell className="h-4 w-4" />}
            title={dashboardSectionLabels.permissionPolicyAlerts}
            state={dashboardState.permissionPolicyAlerts}
            emptyTitle="표시할 권한 또는 정책 알림이 없습니다."
            renderItems={(items) => (
              <DashboardList>
                {items.map((item) => (
                  <DashboardListItem key={item.title}>
                    <div className="font-medium text-foreground">{item.title}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">{item.description}</div>
                  </DashboardListItem>
                ))}
              </DashboardList>
            )}
          />
          <DashboardWorkQueueSection state={dashboardState} />
        </div>

        <aside className="grid gap-4 xl:sticky xl:top-20 xl:self-start">
          <SectionCard
            icon={<Bot className="h-4 w-4" />}
            title={dashboardSectionLabels.aiPrepStatus}
            meta={dashboardMeta(dashboardState.aiPrepStatus)}
          >
            <DashboardStateBody<DashboardAiPrepStatus>
              state={dashboardState.aiPrepStatus}
              emptyTitle="파일 정리 준비 상태가 없습니다."
              renderItems={(items) => (
                <DashboardList compact>
                  {items.map((item) => (
                    <DashboardListItem key={item.matterLabel}>
                      <div className="font-medium text-foreground">{item.matterLabel}</div>
                      <div className="mt-1 text-[12px] text-muted-foreground">{item.statusLabel}</div>
                    </DashboardListItem>
                  ))}
                </DashboardList>
              )}
            />
          </SectionCard>
          <SectionCard
            icon={<PlugZap className="h-4 w-4" />}
            title={dashboardSectionLabels.integrationStatus}
            meta={dashboardMeta(dashboardState.integrationStatus)}
          >
            <DashboardStateBody<DashboardIntegrationStatus>
              state={dashboardState.integrationStatus}
              emptyTitle="연결된 통합이 없습니다."
              renderItems={(items) => (
                <DashboardList compact>
                  {items.map((item) => (
                    <DashboardListItem key={item.integrationLabel}>
                      <div className="font-medium text-foreground">{item.integrationLabel}</div>
                      <div className="mt-1 text-[12px] text-muted-foreground">{item.statusLabel}</div>
                    </DashboardListItem>
                  ))}
                </DashboardList>
              )}
            />
          </SectionCard>
          <DashboardConnectionSummary state={dashboardState} />
        </aside>
      </div>
    </PageShell>
  );
}

function DashboardSection<T>({
  emptyTitle,
  icon,
  renderItems,
  state,
  title,
}: {
  emptyTitle: string;
  icon: React.ReactNode;
  renderItems: (items: T[]) => React.ReactNode;
  state: DataState<T[]>;
  title: string;
}) {
  return (
    <SectionCard icon={icon} title={title} meta={dashboardMeta(state)}>
      <DashboardStateBody state={state} emptyTitle={emptyTitle} renderItems={renderItems} />
    </SectionCard>
  );
}

function DashboardStateBody<T>({
  emptyTitle,
  renderItems,
  state,
}: {
  emptyTitle: string;
  renderItems: (items: T[]) => React.ReactNode;
  state: DataState<T[]>;
}) {
  if (state.status === 'ready') {
    if (state.data.length === 0) {
      return <EmptyState title={emptyTitle} />;
    }
    return <>{renderItems(state.data)}</>;
  }

  if (state.status === 'empty') {
    return <EmptyState title={emptyTitle} />;
  }

  if (state.status === 'error') {
    return <EmptyState variant="api-error" title="데이터를 표시할 수 없습니다." />;
  }

  if (state.status === 'forbidden') {
    return <EmptyState variant="no-access" title="이 항목을 볼 권한이 없습니다." />;
  }

  if (state.status === 'blocked') {
    return <EmptyState variant="policy-blocked" title="정보 차단 또는 권한 정책으로 표시할 수 없습니다." />;
  }

  return <EmptyState variant="api-unavailable" title="운영 데이터 연결 대기 중입니다." />;
}

function dashboardMeta<T>(state: DataState<T[]>): string {
  if (state.status === 'ready') return state.data.length > 0 ? 'API 응답 기준' : '표시할 항목 없음';
  if (state.status === 'empty') return '표시할 항목 없음';
  if (state.status === 'error') return '연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  return '운영 데이터 연결 대기';
}

function DashboardList({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return <ul className={compact ? 'divide-y' : 'divide-y rounded-lg border'}>{children}</ul>;
}

function DashboardListItem({ children }: { children: React.ReactNode }) {
  return <li className="px-3.5 py-3 text-[13px] leading-5">{children}</li>;
}

function DashboardConnectionSummary({ state }: { state: DashboardOverviewState }) {
  const rows = [
    { sectionId: 'recentFiles', status: state.recentFiles.status },
    { sectionId: 'recentActivity', status: state.recentActivity.status },
    { sectionId: 'permissionPolicyAlerts', status: state.permissionPolicyAlerts.status },
    { sectionId: 'aiPrepStatus', status: state.aiPrepStatus.status },
    { sectionId: 'integrationStatus', status: state.integrationStatus.status },
  ] as const satisfies ReadonlyArray<{
    sectionId: DashboardSectionId;
    status: DataState<unknown[]>['status'];
  }>;

  return (
    <SectionCard icon={<Activity className="h-4 w-4" />} title="운영 데이터 연결 상태" meta="섹션 상태">
      <ul className="divide-y rounded-lg border">
        {rows.map(({ sectionId, status }) => (
          <li key={sectionId} className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className="text-[13px] font-medium text-foreground">{dashboardSectionLabels[sectionId]}</span>
            <span className="text-[12px] text-muted-foreground">{dashboardConnectionLabel(status)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function dashboardConnectionLabel(status: DataState<unknown[]>['status']): string {
  if (status === 'ready') return '연결됨';
  if (status === 'error') return '확인 필요';
  if (status === 'forbidden' || status === 'blocked') return '정책 적용';
  return '연결 대기';
}

function PermissionBanner() {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-3 p-4 sm:p-[18px] md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[15px] font-semibold text-foreground">권한이 확인된 항목만 표시됩니다</div>
          <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
            접근 권한과 정보 차단 정책을 통과한 운영 데이터만 이 화면에 나타납니다.
          </p>
        </div>
        <StatusBadge tone="success" className="h-[34px] shrink-0 gap-2 px-3">
          <ShieldCheck className="h-4 w-4" />
          보호됨
        </StatusBadge>
      </div>
    </section>
  );
}
