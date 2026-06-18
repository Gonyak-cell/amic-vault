'use client';

import * as React from 'react';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { useI18n, type TranslationKey } from '@/lib/i18n';

export function RouteBlockedState({
  area,
  areaKey,
  reason,
  reasonKey,
}: {
  area?: string;
  areaKey?: TranslationKey;
  reason?: string;
  reasonKey?: TranslationKey;
}) {
  const { t } = useI18n();
  const displayArea = areaKey ? t(areaKey) : area ?? t('route.blocked.defaultArea');
  const displayReason = reasonKey ? t(reasonKey) : reason ?? t('route.blocked.defaultReason');

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', displayArea]}
        title={displayArea}
        description={t('route.blocked.description')}
      />
      <SectionCard
        icon={<ShieldAlert className="h-4 w-4" />}
        title={t('route.blocked.cardTitle')}
        meta={t('route.blocked.cardMeta')}
      >
        <EmptyState
          variant="policy-blocked"
          title={t('route.blocked.title')}
          description={displayReason}
        />
      </SectionCard>
    </PageShell>
  );
}
