'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import type { CurrentUserResponseDto, UserSummary } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { getCurrentUser } from '@/lib/auth';
import { canRoleViewRoute, findRouteVisibilityPolicy } from '@/lib/features';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { RouteBlockedState } from './route-blocked-state';

export type RouteGuardState =
  | { status: 'loading' }
  | { status: 'allowed'; user: UserSummary }
  | { status: 'blocked' };

export async function resolveRouteVisibility(
  route: string,
  loadCurrentUser: () => Promise<CurrentUserResponseDto> = getCurrentUser,
): Promise<RouteGuardState> {
  try {
    const policy = findRouteVisibilityPolicy(route);
    const { user } = await loadCurrentUser();
    return policy && canRoleViewRoute(policy, user.role)
      ? { status: 'allowed', user }
      : { status: 'blocked' };
  } catch {
    return { status: 'blocked' };
  }
}

export function RouteVisibilityGuard({
  area,
  areaKey,
  children,
  route,
}: {
  area?: string;
  areaKey?: TranslationKey;
  children: ReactNode;
  route: string;
}) {
  const { t } = useI18n();
  const displayArea = areaKey ? t(areaKey) : (area ?? t('route.blocked.defaultArea'));
  const [state, setState] = useState<RouteGuardState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    resolveRouteVisibility(route).then((nextState) => {
      if (active) setState(nextState);
    });

    return () => {
      active = false;
    };
  }, [route]);

  if (state.status === 'allowed') return children;

  if (state.status === 'blocked') {
    return <RouteBlockedState area={displayArea} reason={t('route.blocked.adminReason')} />;
  }

  return (
    <PageShell>
      <PageHeader breadcrumbs={['문서 보관', displayArea]} title={displayArea} />
      <SectionCard title={t('route.loading.cardTitle')} meta={t('route.loading.cardMeta')}>
        <EmptyState
          variant="api-unavailable"
          title={t('route.loading.title')}
          description={t('route.loading.descriptionLong')}
        />
      </SectionCard>
    </PageShell>
  );
}
