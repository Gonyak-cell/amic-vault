'use client';

import React from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { DmsWorkQueueItemDto } from '@amic-vault/shared';
import type { DashboardOverviewState } from '@/lib/api/dashboard';
import type { DataState } from '@/lib/data-state';

export function dashboardActionItems(state: DashboardOverviewState): DmsWorkQueueItemDto[] {
  const items: DmsWorkQueueItemDto[] = [];
  if (state.permissionPolicyAlerts.status === 'ready' && state.permissionPolicyAlerts.data.length > 0) {
    items.push({
      itemKey: 'permission-policy-0',
      source: 'permission_policy',
      sourceLabel: '권한/정책',
      title: '권한/정책 알림 확인',
      description: `${state.permissionPolicyAlerts.data.length}건의 정책 알림이 있습니다.`,
      href: '/audit',
      tone: 'warning',
      updatedAt: state.permissionPolicyAlerts.data[0]?.occurredAt,
    });
  }
  if (state.aiPrepStatus.status === 'ready' && state.aiPrepStatus.data.length > 0) {
    items.push({
      itemKey: 'ai-prep-0',
      source: 'ai_prep',
      sourceLabel: '파일 정리 준비',
      title: '파일 정리 준비 상태 확인',
      description: `${state.aiPrepStatus.data.length}개 Matter의 파일 정리 준비 상태가 있습니다.`,
      href: '/files?aiAllowed=true&sortBy=matter_asc',
      tone: 'neutral',
      updatedAt: state.aiPrepStatus.data[0]?.updatedAt,
    });
  }
  if (state.integrationStatus.status === 'ready' && state.integrationStatus.data.length > 0) {
    items.push({
      itemKey: 'integration-0',
      source: 'integration',
      sourceLabel: '통합',
      title: '통합 상태 확인',
      description: `${state.integrationStatus.data.length}개 통합 상태가 보고되었습니다.`,
      href: '/integrations/outlook',
      tone: 'neutral',
      updatedAt: state.integrationStatus.data[0]?.updatedAt,
    });
  }
  if (state.recentActivity.status === 'error' || state.recentFiles.status === 'error') {
    items.push({
      itemKey: 'operational-data-connection',
      source: 'operational_data',
      sourceLabel: '운영 데이터',
      title: '운영 데이터 연결 확인',
      description: '최근 파일 또는 활동 데이터를 표시할 수 없습니다.',
      href: '/audit',
      tone: 'blocked',
    });
  }
  return items;
}

export function DashboardWorkQueueSection({
  itemsState,
  state,
  title = '작업 큐',
}: {
  itemsState?: DataState<DmsWorkQueueItemDto[]> | undefined;
  state: DashboardOverviewState;
  title?: string;
}) {
  const items = itemsState?.status === 'ready' ? itemsState.data : dashboardActionItems(state);
  return (
    <SectionCard
      icon={<ListChecks className="h-4 w-4" />}
      title={title}
      meta={workQueueMeta(itemsState, items)}
    >
      {itemsState && itemsState.status !== 'ready' ? (
        <WorkQueueStateEmpty state={itemsState} />
      ) : items.length > 0 ? (
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

export function DashboardWorkQueueList({ items }: { items: DmsWorkQueueItemDto[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.itemKey} className="px-3.5 py-3 text-[13px] leading-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{item.title}</span>
                <StatusBadge tone={item.tone}>{item.sourceLabel}</StatusBadge>
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

function workQueueMeta(
  state: DataState<DmsWorkQueueItemDto[]> | undefined,
  items: DmsWorkQueueItemDto[],
): string {
  if (!state) return items.length > 0 ? '운영 데이터 기준' : '표시할 항목 없음';
  if (state.status === 'ready') return state.data.length > 0 ? `${state.data.length}건` : '표시할 항목 없음';
  if (state.status === 'empty') return '표시할 항목 없음';
  if (state.status === 'error') return '연결 확인 필요';
  if (state.status === 'forbidden' || state.status === 'blocked') return '권한 정책 적용';
  return '작업 API 연결 대기';
}

function WorkQueueStateEmpty({ state }: { state: DataState<DmsWorkQueueItemDto[]> }) {
  if (state.status === 'empty') {
    return (
      <EmptyState
        title="표시할 작업이 없습니다."
        description="작업 API가 실제 운영 상태에서 파생한 항목만 표시됩니다."
      />
    );
  }
  if (state.status === 'error') {
    return <EmptyState variant="api-error" title="작업 API 데이터를 표시할 수 없습니다." />;
  }
  if (state.status === 'forbidden') {
    return <EmptyState variant="no-access" title="작업 API에 접근할 권한이 없습니다." />;
  }
  if (state.status === 'blocked') {
    return (
      <EmptyState
        variant="policy-blocked"
        title="정보 차단 또는 권한 정책으로 표시할 수 없습니다."
      />
    );
  }
  return <EmptyState variant="api-unavailable" title="작업 API 연결 대기 중입니다." />;
}
