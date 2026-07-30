'use client';

import React, { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import type { DmsWorkQueueResponseDto } from '@amic-vault/shared';
import { DashboardWorkQueueList } from '@/components/dashboard/dashboard-work-queue';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import {
  emptyStateVariantForUiErrorKind,
  uiErrorStateForApiError,
  type UiErrorKind,
} from '@/lib/api/error-messages';
import { getWorkQueue, type WorkQueueQuery } from '@/lib/api/work-ops';

export type MatterLoadStatus = 'loading' | 'ready' | 'unavailable' | UiErrorKind;
export type MatterResource = 'matter' | 'timeline' | 'work';

type MatterWorkItemsState =
  | { status: 'loading' }
  | { status: 'ready'; response: DmsWorkQueueResponseDto }
  | { status: Exclude<MatterLoadStatus, 'loading' | 'ready'> };

export function matterLoadStatusForError(
  error: unknown,
): Exclude<MatterLoadStatus, 'loading' | 'ready'> {
  const state = uiErrorStateForApiError(error);
  return state.emptyStateVariant === 'api-unavailable' ? 'unavailable' : state.kind;
}

export function matterWorkQueueQuery(matterId: string): WorkQueueQuery {
  return {
    matterId,
    assignee: 'all',
    limit: 100,
    offset: 0,
  };
}

export function MatterWorkItems({ matterId }: { matterId: string }) {
  const [state, setState] = useState<MatterWorkItemsState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getWorkQueue(matterWorkQueueQuery(matterId))
      .then((response) => {
        if (active) setState({ status: 'ready', response });
      })
      .catch((caught: unknown) => {
        if (active) setState({ status: matterLoadStatusForError(caught) });
      });
    return () => {
      active = false;
    };
  }, [matterId]);

  return <MatterWorkItemsView state={state} />;
}

export function MatterWorkItemsView({ state }: { state: MatterWorkItemsState }) {
  const itemCount = state.status === 'ready' ? state.response.items.length : 0;
  const total = state.status === 'ready' ? (state.response.page?.total ?? itemCount) : 0;

  return (
    <SectionCard
      icon={<ListChecks className="h-4 w-4" />}
      title="처리할 업무"
      meta={state.status === 'ready' ? `${total}건` : workStateMeta[state.status]}
    >
      {state.status === 'ready' ? (
        itemCount > 0 ? (
          <div className="grid gap-3">
            <DashboardWorkQueueList items={state.response.items} />
            {state.response.page?.hasNext ? (
              <p className="text-xs text-muted-foreground">
                전체 {total}건 중 {itemCount}건을 표시합니다.
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="이 Matter에 처리할 업무가 없습니다."
            description="서버에 등록된 현재 업무만 표시됩니다."
          />
        )
      ) : (
        <MatterResourceNotice resource="work" status={state.status} />
      )}
    </SectionCard>
  );
}

export function MatterResourceNotice({
  resource,
  status,
}: {
  resource: MatterResource;
  status: Exclude<MatterLoadStatus, 'ready'>;
}) {
  const copy = resourceNoticeCopy[resource][status];
  if (status === 'loading') {
    return <EmptyState variant="loading" title={copy.title} description={copy.description} />;
  }
  if (status === 'unavailable') {
    return (
      <EmptyState variant="api-unavailable" title={copy.title} description={copy.description} />
    );
  }
  return (
    <EmptyState
      variant={emptyStateVariantForUiErrorKind(status)}
      title={copy.title}
      description={copy.description}
    />
  );
}

const workStateMeta = {
  loading: '불러오는 중',
  auth: '로그인 필요',
  permission: '권한 없음',
  policy: '정보 차단',
  api: '요청 실패',
  unavailable: '연결 실패',
} as const satisfies Record<Exclude<MatterLoadStatus, 'ready'>, string>;

const resourceNoticeCopy = {
  matter: {
    loading: {
      title: 'Matter를 불러오는 중입니다.',
      description: 'Matter 기본 정보를 확인하고 있습니다.',
    },
    auth: {
      title: '로그인이 필요합니다.',
      description: '로그인한 뒤 Matter를 다시 열어 주세요.',
    },
    permission: {
      title: 'Matter를 볼 권한이 없습니다.',
      description: 'Matter 담당자 또는 관리자에게 접근 권한을 확인해 주세요.',
    },
    policy: {
      title: '정보 차단 정책으로 Matter를 표시할 수 없습니다.',
      description: '현재 적용된 정보 차단 정책에 따라 접근이 제한됩니다.',
    },
    api: {
      title: 'Matter를 표시하지 못했습니다.',
      description: '요청을 다시 시도해 주세요.',
    },
    unavailable: {
      title: 'Matter 연결에 실패했습니다.',
      description: '서버 연결을 확인한 뒤 다시 시도해 주세요.',
    },
  },
  timeline: {
    loading: {
      title: '이메일 기록을 불러오는 중입니다.',
      description: '이 Matter에 보관된 이메일을 확인하고 있습니다.',
    },
    auth: {
      title: '로그인이 필요합니다.',
      description: '로그인한 뒤 이메일 기록을 다시 열어 주세요.',
    },
    permission: {
      title: '이메일 기록을 볼 권한이 없습니다.',
      description: 'Matter 담당자 또는 관리자에게 접근 권한을 확인해 주세요.',
    },
    policy: {
      title: '정보 차단 정책으로 이메일 기록을 표시할 수 없습니다.',
      description: '현재 적용된 정보 차단 정책에 따라 접근이 제한됩니다.',
    },
    api: {
      title: '이메일 기록을 표시하지 못했습니다.',
      description: '요청을 다시 시도해 주세요.',
    },
    unavailable: {
      title: '이메일 기록 연결에 실패했습니다.',
      description: '서버 연결을 확인한 뒤 다시 시도해 주세요.',
    },
  },
  work: {
    loading: {
      title: '업무를 불러오는 중입니다.',
      description: '이 Matter에 등록된 업무를 확인하고 있습니다.',
    },
    auth: {
      title: '로그인이 필요합니다.',
      description: '로그인한 뒤 업무를 다시 열어 주세요.',
    },
    permission: {
      title: '이 Matter의 업무를 볼 권한이 없습니다.',
      description: 'Matter 담당자 또는 관리자에게 접근 권한을 확인해 주세요.',
    },
    policy: {
      title: '정보 차단 정책으로 업무를 표시할 수 없습니다.',
      description: '현재 적용된 정보 차단 정책에 따라 접근이 제한됩니다.',
    },
    api: {
      title: '업무를 표시하지 못했습니다.',
      description: '요청을 다시 시도해 주세요.',
    },
    unavailable: {
      title: '업무 연결에 실패했습니다.',
      description: '서버 연결을 확인한 뒤 다시 시도해 주세요.',
    },
  },
} as const satisfies Record<
  MatterResource,
  Record<Exclude<MatterLoadStatus, 'ready'>, { title: string; description: string }>
>;
