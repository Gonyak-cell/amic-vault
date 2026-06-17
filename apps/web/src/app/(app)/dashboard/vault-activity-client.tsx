'use client';

import React from 'react';
import { Clock3, FileText, ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';

export function VaultActivityClient() {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', '홈']}
        title="홈"
        description="권한이 확인된 실제 파일과 활동만 표시됩니다."
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <PermissionBanner />
          <SectionCard
            icon={<FileText className="h-4 w-4" />}
            title="최근 접근 파일"
            meta="실제 데이터만 표시"
          >
            <EmptyState title="표시할 파일이 없습니다." />
          </SectionCard>
          <SectionCard
            icon={<Clock3 className="h-4 w-4" />}
            title="최근 활동"
            meta="실제 데이터만 표시"
          >
            <EmptyState title="표시할 활동이 없습니다." />
          </SectionCard>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <SectionCard icon={<FileText className="h-4 w-4" />} title="상세 정보" meta="선택된 항목 없음">
            <p className="text-[13px] leading-6 text-muted-foreground">
              실제 파일 또는 활동을 선택하면 상세 정보가 표시됩니다.
            </p>
          </SectionCard>
        </aside>
      </div>
    </PageShell>
  );
}

function PermissionBanner() {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-3 p-4 sm:p-[18px] md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[15px] font-semibold text-foreground">권한이 확인된 항목만 표시됩니다</div>
          <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
            접근 권한과 정보 차단 정책을 통과한 운영 데이터만 이 화면에 나타납니다.
          </p>
        </div>
        <StatusBadge tone="success" className="h-[34px] shrink-0 gap-2 px-3">
          <ShieldCheck className="h-4 w-4" />
          보호됨
        </StatusBadge>
      </div>
    </section>
  );
}
