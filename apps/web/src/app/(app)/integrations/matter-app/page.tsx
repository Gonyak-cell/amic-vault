'use client';

import React from 'react';
import Link from 'next/link';
import { FileInput, FolderSearch, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { matterAppSourceStatus } from '@/lib/matter-app';
import { useI18n } from '@/lib/i18n';

export default function MatterAppIntegrationPage() {
  const { t } = useI18n();
  const status = matterAppSourceStatus({
    sourceMode: process.env.NEXT_PUBLIC_MATTER_APP_SOURCE_MODE,
    sourceConfigured: process.env.NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED,
    projectionFallbackAllowed: process.env.NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE,
    runtimeReady: process.env.NEXT_PUBLIC_MATTER_APP_RUNTIME_READY,
    nodeEnv: process.env.NODE_ENV,
  });
  const uploadTone: StatusBadgeTone = status.uploadAuthoritative ? 'success' : 'blocked';

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('integrations.page.title'), 'Matter app']}
        title="Matter app 연결 상태"
        description="Matter Code source와 업로드 gate를 확인합니다. 연결 전에는 파일 업로드가 Matter app 확인 상태로 표시되지 않습니다."
        actions={
          <Button asChild variant="outline">
            <Link href="/files">업로드 화면 보기</Link>
          </Button>
        }
      />

      <SectionCard
        icon={<FolderSearch className="h-4 w-4" />}
        title="Matter Code source"
        meta="source-of-truth gate"
      >
        <div className="grid gap-3 lg:grid-cols-4">
          <StatusTile
            icon={<FolderSearch className="h-4 w-4" />}
            title="현재 source"
            value={status.label}
            tone={status.sourceAvailable ? 'success' : 'blocked'}
            description={status.description}
          />
          <StatusTile
            icon={<FileInput className="h-4 w-4" />}
            title="업로드 gate"
            value={status.uploadAuthoritative ? '업로드 가능' : '업로드 차단'}
            tone={uploadTone}
            description="파일 업로드는 Matter app API 또는 Matter app 이벤트 동기화가 runtime ready일 때만 열립니다."
          />
          <StatusTile
            icon={<ShieldCheck className="h-4 w-4" />}
            title="lookup/sync runtime"
            value={status.sourceContractReady ? '준비됨' : '준비 필요'}
            tone={status.sourceContractReady ? 'success' : 'blocked'}
            description="Matter app source는 configured flag와 runtime ready flag가 모두 확인되어야 합니다."
          />
          <StatusTile
            icon={<ShieldCheck className="h-4 w-4" />}
            title="프로덕션 projection fallback"
            value={status.productionRuntime ? '차단' : status.projectionFallbackAllowed ? '개발 허용' : '차단'}
            tone={status.productionRuntime || !status.projectionFallbackAllowed ? 'warning' : 'neutral'}
            description="로컬 Matter 목록은 운영 source로 표시하지 않습니다."
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={<ShieldCheck className="h-4 w-4" />}
        title="운영 조건"
        meta="Matter-first upload contract"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <ContractRow
            title="Matter app 확인"
            status={status.sourceContractReady ? '확인됨' : '설정 필요'}
            tone={status.sourceContractReady ? 'success' : 'blocked'}
            description="Matter Code, 표시명, 고객, 상태, 업무그룹은 Matter app runtime API 또는 승인된 이벤트 projection에서 확인되어야 합니다."
          />
          <ContractRow
            title="free-floating 업로드"
            status="불가"
            tone="blocked"
            description="일반 사용자는 Matter Code를 먼저 선택해야 하며, Vault 내부 식별자를 직접 입력하지 않습니다."
          />
          <ContractRow
            title="권한 확인"
            status="Vault 권한"
            tone="success"
            description="선택된 Matter context로 Vault PermissionService와 ethical wall을 통과한 뒤 문서 작업이 진행됩니다."
          />
          <ContractRow
            title="증빙 범위"
            status="refs only"
            tone="neutral"
            description="연결 상태 화면은 endpoint, token, cookie, 내부 식별자, document body를 노출하지 않습니다."
          />
        </div>
      </SectionCard>
    </PageShell>
  );
}

function StatusTile({
  description,
  icon,
  title,
  tone,
  value,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
  tone: StatusBadgeTone;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </div>
      <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function ContractRow({
  description,
  status,
  title,
  tone,
}: {
  description: string;
  status: string;
  title: string;
  tone: StatusBadgeTone;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        <StatusBadge tone={tone}>{status}</StatusBadge>
      </div>
      <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
