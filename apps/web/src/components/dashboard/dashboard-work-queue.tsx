'use client';

import React from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { DashboardOverviewState } from '@/lib/api/dashboard';

interface DashboardActionItem {
  title: string;
  description: string;
  href: string;
  tone: 'success' | 'warning' | 'blocked' | 'neutral';
}

export function dashboardActionItems(state: DashboardOverviewState): DashboardActionItem[] {
  const items: DashboardActionItem[] = [];
  if (state.permissionPolicyAlerts.status === 'ready' && state.permissionPolicyAlerts.data.length > 0) {
    items.push({
      title: '권한/정책 알림 확인',
      description: `${state.permissionPolicyAlerts.data.length}건의 정책 알림이 있습니다.`,
      href: '/audit',
      tone: 'warning',
    });
  }
  if (state.aiPrepStatus.status === 'ready' && state.aiPrepStatus.data.length > 0) {
    items.push({
      title: '파일 정리 준비 상태 확인',
      description: `${state.aiPrepStatus.data.length}개 Matter의 파일 정리 준비 상태가 있습니다.`,
      href: '/matters',
      tone: 'neutral',
    });
  }
  if (state.integrationStatus.status === 'ready' && state.integrationStatus.data.length > 0) {
    items.push({
      title: '통합 상태 확인',
      description: `${state.integrationStatus.data.length}개 통합 상태가 보고되었습니다.`,
      href: '/integrations/outlook',
      tone: 'neutral',
    });
  }
  if (state.recentActivity.status === 'error' || state.recentFiles.status === 'error') {
    items.push({
      title: '운영 데이터 연결 확인',
      description: '최근 파일 또는 활동 데이터를 표시할 수 없습니다.',
      href: '/audit',
      tone: 'blocked',
    });
  }
  return items;
}

export function DashboardWorkQueueSection({
  state,
  title = '작업 큐',
}: {
  state: DashboardOverviewState;
  title?: string;
}) {
  const items = dashboardActionItems(state);
  return (
    <SectionCard
      icon={<ListChecks className="h-4 w-4" />}
      title={title}
      meta={items.length > 0 ? '운영 데이터 기준' : '표시할 항목 없음'}
    >
      {items.length > 0 ? (
        <DashboardWorkQueueList items={items} />
      ) : (
        <EmptyState
          title="표시할 작업이 없습니다."
          description="실제 운영 데이터에서 발생한 작업만 표시됩니다."
        />
      )}
    </SectionCard>
  );
}

export function DashboardWorkQueueList({ items }: { items: DashboardActionItem[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.title} className="px-3.5 py-3 text-[13px] leading-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{item.title}</span>
                <StatusBadge tone={item.tone}>상태 기반</StatusBadge>
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{item.description}</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={item.href}>열기</Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
