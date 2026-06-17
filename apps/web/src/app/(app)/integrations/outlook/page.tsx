import React from 'react';
import { MailCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { OutlookIntegrationStatusClient } from './outlook-integration-status-client';

export default function OutlookIntegrationPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '통합', 'Outlook']}
        title="Outlook 통합"
        description="Office task pane과 별도로, 관리자용 연결 상태만 표시합니다."
      />
      <SectionCard icon={<MailCheck className="h-4 w-4" />} title="Outlook 운영 상태" meta="상태 API 기준">
        <OutlookIntegrationStatusClient />
      </SectionCard>
    </PageShell>
  );
}
