'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserSummary } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { getCurrentUser } from '@/lib/auth';
import { canRoleViewRoute, findRouteVisibilityPolicy } from '@/lib/features';
import { RouteBlockedState } from './route-blocked-state';

type GuardState =
  | { status: 'loading' }
  | { status: 'allowed'; user: UserSummary }
  | { status: 'blocked' };

export function RouteVisibilityGuard({
  area,
  children,
  route,
}: {
  area: string;
  children: ReactNode;
  route: string;
}) {
  const policy = useMemo(() => findRouteVisibilityPolicy(route), [route]);
  const [state, setState] = useState<GuardState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(({ user }) => {
        if (!active) return;
        if (policy && canRoleViewRoute(policy, user.role)) {
          setState({ status: 'allowed', user });
          return;
        }
        setState({ status: 'blocked' });
      })
      .catch(() => {
        if (active) setState({ status: 'blocked' });
      });

    return () => {
      active = false;
    };
  }, [policy]);

  if (state.status === 'allowed') return children;

  if (state.status === 'blocked') {
    return (
      <RouteBlockedState
        area={area}
        reason="이 화면은 관리자 권한과 운영 정책이 확인된 계정에만 표시됩니다."
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', area]}
        title={area}
        description="권한과 운영 정책을 확인한 뒤 화면을 표시합니다."
      />
      <SectionCard title="접근 상태 확인" meta="권한 확인 중">
        <EmptyState
          variant="api-unavailable"
          title="접근 상태 확인 중"
          description="관리자 화면은 계정 권한이 확인되기 전까지 표시하지 않습니다."
        />
      </SectionCard>
    </PageShell>
  );
}
