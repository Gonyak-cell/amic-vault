'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Clock3,
  FileText,
  FolderSearch,
  PlugZap,
  SearchCheck,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { DashboardWorkQueueSection } from '@/components/dashboard/dashboard-work-queue';
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
          <DashboardActionLauncher />
          <DashboardSection<DashboardRecentFile>
            actionHref="/files"
            actionLabel="문서함 열기"
            icon={<FileText className="h-4 w-4" />}
            title={dashboardSectionLabels.recentFiles}
            state={dashboardState.recentFiles}
            emptyTitle="표시할 파일이 없습니다."
            renderItems={(items) => (
              <DashboardList>
                {items.map((item) => (
                  <DashboardListItem
                    actionHref={recentFileHref(item)}
                    actionLabel="필터"
                    key={`${item.title}-${item.updatedAt ?? item.matterLabel ?? 'file'}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{item.title}</div>
                      {item.matterLabel ? (
                        <div className="mt-1 text-[12px] text-muted-foreground">{item.matterLabel}</div>
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
            actionHref="/notifications"
            actionLabel="알림 열기"
            icon={<Bell className="h-4 w-4" />}
            title={dashboardSectionLabels.permissionPolicyAlerts}
            state={dashboardState.permissionPolicyAlerts}
            emptyTitle="표시할 권한 또는 정책 알림이 없습니다."
            renderItems={(items) => (
              <DashboardList>
                {items.map((item) => (
                  <DashboardListItem actionHref="/notifications" actionLabel="알림" key={item.title}>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{item.title}</div>
                      <div className="mt-1 text-[12px] text-muted-foreground">{item.description}</div>
                    </div>
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
            actions={<SectionAction href="/files?aiAllowed=true&sortBy=matter_asc" label="문서함 필터" />}
          >
            <DashboardStateBody<DashboardAiPrepStatus>
              state={dashboardState.aiPrepStatus}
              emptyTitle="파일 정리 준비 상태가 없습니다."
              renderItems={(items) => (
                <DashboardList compact>
                  {items.map((item) => (
                    <DashboardListItem
                      actionHref="/files?aiAllowed=true&sortBy=matter_asc"
                      actionLabel="필터"
                      key={item.matterLabel}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{item.matterLabel}</div>
                        <div className="mt-1 text-[12px] text-muted-foreground">{item.statusLabel}</div>
                      </div>
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
            actions={<SectionAction href="/integrations/outlook" label="통합 열기" />}
          >
            <DashboardStateBody<DashboardIntegrationStatus>
              state={dashboardState.integrationStatus}
              emptyTitle="연결된 통합이 없습니다."
              renderItems={(items) => (
                <DashboardList compact>
                  {items.map((item) => (
                    <DashboardListItem
                      actionHref="/integrations/outlook"
                      actionLabel="상태"
                      key={item.integrationLabel}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{item.integrationLabel}</div>
                        <div className="mt-1 text-[12px] text-muted-foreground">{item.statusLabel}</div>
                      </div>
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
      actions={actionHref && actionLabel ? <SectionAction href={actionHref} label={actionLabel} /> : null}
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
      title: 'Matter 업로드',
      description: 'Matter Code 선택 후 파일을 업로드합니다.',
    },
    {
      href: '/files',
      icon: <FileText className="h-4 w-4" />,
      title: '전체 문서함',
      description: '권한 문서를 필터와 정렬로 확인합니다.',
    },
    {
      href: '/search',
      icon: <SearchCheck className="h-4 w-4" />,
      title: '본문/메타데이터 검색',
      description: '허용된 문서 본문과 프로필 필드를 검색합니다.',
    },
    {
      href: '/search/folders',
      icon: <FolderSearch className="h-4 w-4" />,
      title: '검색 폴더',
      description: '저장된 검색으로 반복 업무에 돌아갑니다.',
    },
    {
      href: '/work',
      icon: <Activity className="h-4 w-4" />,
      title: '작업함',
      description: '운영 상태에서 파생된 조치 항목을 엽니다.',
    },
    {
      href: '/notifications',
      icon: <Bell className="h-4 w-4" />,
      title: '알림',
      description: '실제 이벤트와 상태 알림을 확인합니다.',
    },
    {
      href: '/files?aiAllowed=true&sortBy=matter_asc',
      icon: <Bot className="h-4 w-4" />,
      title: '파일 정리 준비',
      description: 'Gemma 적용 가능 파일을 문서함에서 봅니다.',
    },
    {
      href: '/admin',
      icon: <ShieldCheck className="h-4 w-4" />,
      title: '검색/운영 헬스',
      description: '관리자 권한으로 인덱스와 운영 상태를 확인합니다.',
    },
  ] as const;

  return (
    <SectionCard
      icon={<Activity className="h-4 w-4" />}
      title="DMS 작업 바로가기"
      meta="승인된 운영 표면"
    >
      <ul className="grid overflow-hidden rounded-lg border md:grid-cols-2 xl:grid-cols-4">
        {links.map((link) => (
          <li key={link.href} className="border-b md:border-r xl:[&:nth-child(4n)]:border-r-0">
            <Link
              className="flex h-full min-h-24 flex-col gap-2 p-3.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={link.href}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <span className="text-primary">{link.icon}</span>
                {link.title}
              </span>
              <span className="text-[12px] leading-5 text-muted-foreground">{link.description}</span>
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

function recentFileHref(item: DashboardRecentFile): string {
  const params = new URLSearchParams();
  params.set('title', item.title);
  return `/files?${params.toString()}`;
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
