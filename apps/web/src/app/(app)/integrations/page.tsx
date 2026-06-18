'use client';

import React from 'react';
import Link from 'next/link';
import { MailCheck, Plug, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
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
        <div className="grid gap-3 lg:grid-cols-3">
          <IntegrationCard
            icon={<MailCheck className="h-4 w-4" />}
            title="Outlook"
            description="운영 게이트, 증빙, 기능 플래그 상태를 실제 API 응답으로 확인합니다."
            status="상태 API"
            tone="success"
            href="/integrations/outlook"
          />
          <IntegrationCard
            icon={<ShieldAlert className="h-4 w-4" />}
            title="OneDrive"
            description="저장소, 버전, 감사, 권한 계약 승인 전에는 연결 상태를 주장하지 않습니다."
            status="승인 전 숨김"
            tone="warning"
          />
          <IntegrationCard
            icon={<ShieldAlert className="h-4 w-4" />}
            title="Office 열기/저장"
            description="공동편집, 잠금, 롤백 계약이 승인될 때까지 생산 경로를 열지 않습니다."
            status="계약 필요"
            tone="warning"
          />
        </div>
      </SectionCard>
    </PageShell>
  );
}

function IntegrationCard({
  description,
  href,
  icon,
  status,
  title,
  tone,
}: {
  description: string;
  href?: string | undefined;
  icon: React.ReactNode;
  status: string;
  title: string;
  tone: 'success' | 'warning' | 'blocked' | 'neutral';
}) {
  return (
    <div className="flex min-h-40 flex-col justify-between rounded-md border bg-background p-3">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon}
            <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <StatusBadge tone={tone}>{status}</StatusBadge>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{description}</p>
      </div>
      {href ? (
        <Button asChild size="sm" variant="outline" className="mt-3 self-start">
          <Link href={href}>열기</Link>
        </Button>
      ) : null}
    </div>
  );
}
