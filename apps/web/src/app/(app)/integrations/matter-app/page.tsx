'use client';

import React from 'react';
import Link from 'next/link';
import { FileInput, FolderSearch, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { getMatterAppStatus } from '@/lib/api-client';
import { matterAppSourceStatus } from '@/lib/matter-app';
import { useI18n } from '@/lib/i18n';

export default function MatterAppIntegrationPage() {
  const { t } = useI18n();
  const localStatus = React.useMemo(
    () =>
      matterAppSourceStatus({
        sourceMode: process.env.NEXT_PUBLIC_MATTER_APP_SOURCE_MODE,
        sourceConfigured: process.env.NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED,
        projectionFallbackAllowed: process.env.NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE,
        runtimeReady: process.env.NEXT_PUBLIC_MATTER_APP_RUNTIME_READY,
        nodeEnv: process.env.NODE_ENV,
      }),
    [],
  );
  const [status, setStatus] = React.useState(localStatus);
  const [statusSource, setStatusSource] = React.useState<'api' | 'local'>('local');
  React.useEffect(() => {
    let active = true;
    getMatterAppStatus()
      .then((apiStatus) => {
        if (!active) return;
        setStatus({
          ...localStatus,
          mode: apiStatus.mode,
          requestedMode: apiStatus.requestedMode,
          sourceConfigured: apiStatus.sourceConfigured,
          runtimeReady: apiStatus.runtimeReady,
          sourceContractReady: apiStatus.sourceContractReady,
          sourceAvailable: apiStatus.sourceAvailable,
          uploadAuthoritative: apiStatus.uploadAuthoritative,
          productionRuntime: apiStatus.productionRuntime,
          projectionFallbackAllowed: apiStatus.projectionFallbackAllowed,
        });
        setStatusSource('api');
      })
      .catch(() => {
        if (active) setStatusSource('local');
      });
    return () => {
      active = false;
    };
  }, [localStatus]);
  const uploadTone: StatusBadgeTone = status.uploadAuthoritative ? 'success' : 'blocked';

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['Vault', t('integrations.page.title'), 'Matter app']}
        title="Matter app 연결 상태"
        description="Matter Code 기준 정보와 업로드 조건을 확인합니다. 연결 전에는 파일 업로드가 Matter app 확인 상태로 표시되지 않습니다."
        actions={
          <Button asChild variant="outline">
            <Link href="/files">업로드 화면 보기</Link>
          </Button>
        }
      />

      <SectionCard
        icon={<FolderSearch className="h-4 w-4" />}
        title="Matter Code 기준 정보"
        meta="연결 기준"
      >
        <div className="grid gap-3 lg:grid-cols-4">
          <StatusTile
            icon={<FolderSearch className="h-4 w-4" />}
            title="현재 기준"
            value={status.label}
            tone={status.sourceAvailable ? 'success' : 'blocked'}
            description={status.description}
          />
          <StatusTile
            icon={<FileInput className="h-4 w-4" />}
            title="업로드 조건"
            value={status.uploadAuthoritative ? '업로드 가능' : '업로드 차단'}
            tone={uploadTone}
            description="파일 업로드는 Matter 연결 상태가 확인될 때만 사용할 수 있습니다."
          />
          <StatusTile
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Matter 연결 상태"
            value={status.sourceContractReady ? '준비됨' : '준비 필요'}
            tone={status.sourceContractReady ? 'success' : 'blocked'}
            description={
              statusSource === 'api'
                ? '서버에서 Matter 연결 가능 상태를 확인했습니다.'
                : '서버 확인 전에는 안전 기준으로 제한 표시합니다.'
            }
          />
          <StatusTile
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Vault 기준 표시"
            value={status.productionRuntime ? '차단' : status.projectionFallbackAllowed ? '제한적 사용' : '차단'}
            tone={status.productionRuntime || !status.projectionFallbackAllowed ? 'warning' : 'neutral'}
            description="연결 확인 전에는 Vault에 저장된 기준 정보만 표시합니다."
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={<ShieldCheck className="h-4 w-4" />}
        title="운영 조건"
        meta="업로드 기준"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <ContractRow
            title="Matter app 확인"
            status={status.sourceContractReady ? '확인됨' : '설정 필요'}
            tone={status.sourceContractReady ? 'success' : 'blocked'}
            description="Matter Code, 표시명, 고객, 상태, 업무그룹은 Matter 연결 또는 승인된 동기화 정보에서 확인합니다."
          />
          <ContractRow
            title="Matter 미선택 업로드"
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
