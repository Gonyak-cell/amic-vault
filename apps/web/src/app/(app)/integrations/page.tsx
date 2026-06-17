import React from 'react';
import { Plug } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';

export default function IntegrationsPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '통합']}
        title="통합"
        description="연결 상태 API가 확인된 통합만 표시합니다."
      />
      <SectionCard icon={<Plug className="h-4 w-4" />} title="통합 상태" meta="운영 데이터 미연결">
        <EmptyState variant="integrations-none" />
      </SectionCard>
    </PageShell>
  );
}
