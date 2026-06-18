'use client';

import React from 'react';
import Link from 'next/link';
import { FileInput, MailCheck, SearchCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
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
      <SectionCard
        icon={<FileInput className="h-4 w-4" />}
        title="Vault 파일링 경로"
        meta="동일 문서 모델"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <FilingPathCard
            icon={<MailCheck className="h-4 w-4" />}
            title="Outlook 첨부 보관"
            description="첨부 보관은 Matter 권한, 감사 기록, 문서 메타데이터 모델을 통과한 후 Vault 문서로 이어져야 합니다."
            status="게이트 적용"
          />
          <FilingPathCard
            icon={<SearchCheck className="h-4 w-4" />}
            title="검색/상세 연결"
            description="보관된 이메일과 첨부는 Matter 파일 목록, 문서 상세, 권한 검색에서 같은 표시명 정책을 사용합니다."
            status="동일 UX"
            href="/search"
          />
        </div>
      </SectionCard>
    </PageShell>
  );
}

function FilingPathCard({
  description,
  href,
  icon,
  status,
  title,
}: {
  description: string;
  href?: string | undefined;
  icon: React.ReactNode;
  status: string;
  title: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <StatusBadge tone="success">{status}</StatusBadge>
      </div>
      <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{description}</p>
      {href ? (
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link href={href}>열기</Link>
        </Button>
      ) : null}
    </div>
  );
}
