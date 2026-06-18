'use client';

import React from 'react';
import { Plug } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { useI18n } from '@/lib/i18n';

export default function IntegrationsPage() {
  const { t } = useI18n();

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('integrations.page.title')]}
        title={t('integrations.page.title')}
        description={t('integrations.page.description')}
      />
      <SectionCard
        icon={<Plug className="h-4 w-4" />}
        title={t('integrations.section.title')}
        meta={t('integrations.section.meta')}
      >
        <EmptyState variant="integrations-none" />
      </SectionCard>
    </PageShell>
  );
}
