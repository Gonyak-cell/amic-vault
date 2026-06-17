import React from 'react';
import { MailCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';

export default function OutlookIntegrationPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '통합', 'Outlook']}
        title="Outlook 통합"
        description="Office task pane과 별도로, 관리자용 연결 상태만 표시합니다."
      />
      <SectionCard icon={<MailCheck className="h-4 w-4" />} title="Outlook 연결 상태" meta="운영 데이터 미연결">
        <EmptyState
          variant="api-unavailable"
          title="Outlook 연결 상태를 표시할 수 없습니다."
        />
      </SectionCard>
    </PageShell>
  );
}
