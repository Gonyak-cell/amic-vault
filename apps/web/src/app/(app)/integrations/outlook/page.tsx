'use client';

import React from 'react';
import { MailCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { useI18n } from '@/lib/i18n';
import { OutlookIntegrationStatusClient } from './outlook-integration-status-client';

export default function OutlookIntegrationPage() {
  const { t } = useI18n();

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('integrations.page.title'), t('outlook.page.title')]}
        title={t('outlook.page.title')}
        description={t('outlook.page.description')}
      />
      <SectionCard
        icon={<MailCheck className="h-4 w-4" />}
        title={t('outlook.section.statusTitle')}
        meta={t('outlook.section.statusMeta')}
      >
        <OutlookIntegrationStatusClient />
      </SectionCard>
    </PageShell>
  );
}
