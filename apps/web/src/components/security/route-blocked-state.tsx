import * as React from 'react';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';

export function RouteBlockedState({
  area,
  reason = '현재 운영 범위에 포함되지 않은 화면입니다.',
}: {
  area: string;
  reason?: string;
}) {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', area]}
        title={area}
        description="권한과 운영 정책이 확인된 화면만 표시됩니다."
      />
      <SectionCard icon={<ShieldAlert className="h-4 w-4" />} title="표시할 수 없는 화면" meta="운영 노출 차단">
        <EmptyState
          variant="policy-blocked"
          title="이 화면은 표시할 수 없습니다."
          description={reason}
        />
      </SectionCard>
    </PageShell>
  );
}
