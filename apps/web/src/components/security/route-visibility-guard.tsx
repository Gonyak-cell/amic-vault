'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserSummary } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { getCurrentUser } from '@/lib/auth';
import { canRoleViewRoute, findRouteVisibilityPolicy } from '@/lib/features';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { RouteBlockedState } from './route-blocked-state';

type GuardState =
  | { status: 'loading' }
  | { status: 'allowed'; user: UserSummary }
  | { status: 'blocked' };

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
  const policy = useMemo(() => findRouteVisibilityPolicy(route), [route]);
  const displayArea = areaKey ? t(areaKey) : area ?? t('route.blocked.defaultArea');
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
        area={displayArea}
        reason={t('route.blocked.adminReason')}
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', displayArea]}
        title={displayArea}
        description={t('route.loading.description')}
      />
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
