'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Clock3,
  FileText,
  SearchCheck,
  UploadCloud,
} from 'lucide-react';
import { DashboardWorkQueueSection } from '@/components/dashboard/dashboard-work-queue';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { listMatters } from '@/lib/api-client';
import {
  createDashboardUnavailableState,
  dashboardErrorState,
  dashboardOverviewToState,
  getDashboardOverview,
  type DashboardOverviewState,
  type DashboardPolicyAlert,
  type DashboardRecentActivity,
  type DashboardRecentFile,
} from '@/lib/api/dashboard';
import {
  createWorkItemsUnavailableState,
  getWorkQueue,
  operationalApiErrorState,
  workQueueToState,
  type DmsWorkQueueItem,
} from '@/lib/api/work-ops';
import type { DataState } from '@/lib/data-state';
import type { MatterDto } from '@amic-vault/shared';

type DueWorkItem = DmsWorkQueueItem & { dueAt: string };

const dashboardSectionLabels = {
  recentFiles: '최근 문서',
  recentActivity: '최근 활동',
  permissionPolicyAlerts: '권한/정책 알림',
} as const;

export function VaultActivityClient() {
  const [dashboardState, setDashboardState] = useState<DashboardOverviewState>(() =>
    createDashboardUnavailableState(),
  );
  const [workItemsState, setWorkItemsState] = useState<DataState<DmsWorkQueueItem[]>>(() =>
    createWorkItemsUnavailableState(),
  );
  const [recentMattersState, setRecentMattersState] = useState<DataState<MatterDto[]>>({
    status: 'unavailable',
  });

  useEffect(() => {
    let active = true;
    getDashboardOverview()
      .then((overview) => {
        if (active) setDashboardState(dashboardOverviewToState(overview));
      })
      .catch((error: unknown) => {
        if (active) setDashboardState(dashboardErrorState(error));
      });
    getWorkQueue({ assignee: 'mine', limit: 5 })
      .then((response) => {
        if (active) setWorkItemsState(workQueueToState(response));
      })
      .catch((error: unknown) => {
        if (active) setWorkItemsState(operationalApiErrorState(error));
      });
    listMatters({ pageSize: 5 })
      .then((response) => {
        if (active) setRecentMattersState(arrayState(response.items));
      })
      .catch((error: unknown) => {
        if (active) setRecentMattersState(operationalApiErrorState(error));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <VaultActivityContent
      dashboardState={dashboardState}
      recentMattersState={recentMattersState}
      workItemsState={workItemsState}
    />
  );
}

export function VaultActivityContent({
  dashboardState,
  recentMattersState,
  workItemsState,
}: {
  dashboardState: DashboardOverviewState;
  recentMattersState: DataState<MatterDto[]>;
  workItemsState: DataState<DmsWorkQueueItem[]>;
}) {
  const dueItemsState = workItemsWithDueDates(workItemsState);

  return (
    <PageShell>
      <PageHeader breadcrumbs={['문서 보관', '홈']} title="홈" />

      <div className="grid min-w-0 gap-4">
        <DashboardActionLauncher />
        <DashboardWorkQueueSection
          itemsState={workItemsState}
          state={dashboardState}
          title="내 업무"
        />
        <DashboardSection<DueWorkItem>
          actionHref="/work"
          actionLabel="작업함 열기"
          icon={<CalendarClock className="h-4 w-4" />}
          title="업무 기한"
          state={dueItemsState}
          emptyTitle="표시할 기한이 없습니다."
          renderItems={(items) => (
            <DashboardList>
              {items.map((item) => (
                <DashboardListItem actionHref={item.href} actionLabel="열기" key={item.itemKey}>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{item.title}</div>
                    <time
                      className="mt-1 block text-[12px] text-muted-foreground"
                      dateTime={item.dueAt}
                    >
                      {formatDueAt(item.dueAt)}
                    </time>
                  </div>
                </DashboardListItem>
              ))}
            </DashboardList>
          )}
        />
        <DashboardSection<MatterDto>
          actionHref="/matters"
          actionLabel="Matter 열기"
          icon={<BriefcaseBusiness className="h-4 w-4" />}
          title="접근 가능한 Matter"
          state={recentMattersState}
          emptyTitle="표시할 Matter가 없습니다."
          renderItems={(items) => (
            <DashboardList>
              {items.map((item) => (
                <DashboardListItem
                  actionHref={`/matters/${encodeURIComponent(item.matterId)}`}
                  actionLabel="열기"
                  key={item.matterId}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{item.matterName}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {item.matterCode}
                      {item.clientDisplayName ? ` · ${item.clientDisplayName}` : null}
                    </div>
                  </div>
                </DashboardListItem>
              ))}
            </DashboardList>
          )}
        />
        <DashboardSection<DashboardRecentFile>
          actionHref="/files"
          actionLabel="문서함 열기"
          icon={<FileText className="h-4 w-4" />}
          title={dashboardSectionLabels.recentFiles}
          state={dashboardState.recentFiles}
          emptyTitle="표시할 문서가 없습니다."
          renderItems={(items) => (
            <DashboardList>
              {items.map((item) => (
                <DashboardListItem
                  actionHref="/files"
                  actionLabel="문서함"
                  key={`${item.title}-${item.updatedAt ?? item.matterLabel ?? 'file'}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{item.title}</div>
                    {item.matterLabel ? (
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        {item.matterLabel}
                      </div>
                    ) : null}
                  </div>
                </DashboardListItem>
              ))}
            </DashboardList>
          )}
        />
        <DashboardSection<DashboardRecentActivity>
          actionHref="/audit"
          actionLabel="감사 열기"
          icon={<Clock3 className="h-4 w-4" />}
          title={dashboardSectionLabels.recentActivity}
          state={dashboardState.recentActivity}
          emptyTitle="표시할 활동이 없습니다."
          renderItems={(items) => (
            <DashboardList>
              {items.map((item) => (
                <DashboardListItem
                  actionHref="/audit"
                  actionLabel="감사"
                  key={`${item.actionLabel}-${item.occurredAt}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{item.actionLabel}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {item.targetLabel} · {item.resultLabel}
                    </div>
                  </div>
                </DashboardListItem>
              ))}
            </DashboardList>
          )}
        />
        <DashboardSection<DashboardPolicyAlert>
          actionHref="/work?view=notifications"
          actionLabel="알림 열기"
          icon={<Bell className="h-4 w-4" />}
          title={dashboardSectionLabels.permissionPolicyAlerts}
          state={dashboardState.permissionPolicyAlerts}
          emptyTitle="표시할 권한 또는 정책 알림이 없습니다."
          renderItems={(items) => (
            <DashboardList>
              {items.map((item) => (
                <DashboardListItem
                  actionHref="/work?view=notifications"
                  actionLabel="알림"
                  key={item.title}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{item.title}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">{item.description}</div>
                  </div>
                </DashboardListItem>
              ))}
            </DashboardList>
          )}
        />
      </div>
    </PageShell>
  );
}

function DashboardSection<T>({
  actionHref,
  actionLabel,
  emptyTitle,
  icon,
  renderItems,
  state,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  emptyTitle: string;
  icon: React.ReactNode;
  renderItems: (items: T[]) => React.ReactNode;
  state: DataState<T[]>;
  title: string;
}) {
  return (
    <SectionCard
      icon={icon}
      title={title}
      meta={dashboardMeta(state)}
      actions={
        actionHref && actionLabel ? <SectionAction href={actionHref} label={actionLabel} /> : null
      }
    >
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
    return (
      <EmptyState
        variant="policy-blocked"
        title="정보 차단 또는 권한 정책으로 표시할 수 없습니다."
      />
    );
  }

  return <EmptyState variant="api-unavailable" title="데이터를 불러오는 중입니다." />;
}

function dashboardMeta<T>(state: DataState<T[]>): string {
  if (state.status === 'ready')
    return state.data.length > 0 ? '확인된 데이터 기준' : '표시할 항목 없음';
  if (state.status === 'empty') return '표시할 항목 없음';
  if (state.status === 'error') return '연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  return '데이터 불러오는 중';
}

function arrayState<T>(items: T[]): DataState<T[]> {
  return items.length > 0 ? { status: 'ready', data: items } : { status: 'empty' };
}

function workItemsWithDueDates(state: DataState<DmsWorkQueueItem[]>): DataState<DueWorkItem[]> {
  if (state.status === 'ready') {
    return arrayState(
      state.data
        .filter((item): item is DueWorkItem => Boolean(item.dueAt))
        .sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
    );
  }
  return state;
}

function formatDueAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function DashboardList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y rounded-lg border">{children}</ul>;
}

function DashboardListItem({
  actionHref,
  actionLabel,
  children,
}: {
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 px-3.5 py-3 text-[13px] leading-5 sm:flex-row sm:items-center sm:justify-between">
      {children}
      {actionHref && actionLabel ? <SectionAction href={actionHref} label={actionLabel} /> : null}
    </li>
  );
}

function DashboardActionLauncher() {
  const links = [
    {
      href: '/files#matter-upload',
      icon: <UploadCloud className="h-4 w-4" />,
      title: '문서 업로드',
      description: 'Matter를 선택해 파일을 추가합니다.',
    },
    {
      href: '/search',
      icon: <SearchCheck className="h-4 w-4" />,
      title: '문서 검색',
      description: '권한 내 본문과 문서 정보를 찾습니다.',
    },
    {
      href: '/work',
      icon: <Activity className="h-4 w-4" />,
      title: '내 업무',
      description: '담당 업무와 기한을 확인합니다.',
    },
  ] as const;

  return (
    <SectionCard
      aria-label="문서 업무 바로가기"
      icon={<Activity className="h-4 w-4" />}
      title="문서 업무 바로가기"
    >
      <ul className="divide-y overflow-hidden rounded-lg border md:grid md:grid-cols-3 md:divide-y-0">
        {links.map((link) => (
          <li key={link.href} className="md:border-r md:last:border-r-0">
            <Link
              className="flex h-full items-start gap-3 p-3.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-dashboard-quick-action
              href={link.href}
            >
              <span className="mt-0.5 shrink-0 text-primary">{link.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-foreground">
                  {link.title}
                </span>
                <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">
                  {link.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function SectionAction({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
