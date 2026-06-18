'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { useI18n } from '@/lib/i18n';

export default function FilesPage() {
  const { t } = useI18n();

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('files.page.title')]}
        title={t('files.page.title')}
        description={t('files.page.description')}
      />
      <SectionCard
        icon={<FileText className="h-4 w-4" />}
        title={t('files.section.title')}
        meta={t('files.section.meta')}
      >
        <EmptyState
          variant="api-unavailable"
          title={t('files.empty.title')}
        />
      </SectionCard>
    </PageShell>
  );
}
