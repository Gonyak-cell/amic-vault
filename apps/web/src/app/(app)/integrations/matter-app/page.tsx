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

function formatSyncTime(value: string | null): string {
  if (!value) return '기록 없음';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '기록 오류';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

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
        setStatus(apiStatus);
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
  const syncTone: StatusBadgeTone = status.syncStateAvailable ? 'success' : 'blocked';
  const driftTone: StatusBadgeTone =
    status.driftCount === 0 && status.syncStateAvailable ? 'success' : 'warning';

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={['문서 보관', t('integrations.page.title'), 'Matter 관리 시스템']}
        title="Matter 관리 시스템 연결 상태"
        actions={
          <Button asChild variant="outline">
            <Link href="/files">업로드 화면 보기</Link>
          </Button>
        }
      />

      <SectionCard
        icon={<FolderSearch className="h-4 w-4" />}
        title="Matter 코드 기준 정보"
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
            icon={<ShieldCheck className="h-4 w-4" />}
            title="마지막 반영"
            value={formatSyncTime(status.lastSyncAt)}
            tone={syncTone}
            description={
              status.syncStateAvailable
                ? `${status.reflectedCount.toLocaleString('ko-KR')}건 반영 기록을 확인했습니다.`
                : '서버의 반영 기록이 확인되기 전에는 연결 준비로 보지 않습니다.'
            }
          />
          <StatusTile
            icon={<FolderSearch className="h-4 w-4" />}
            title="드리프트"
            value={`${status.driftCount.toLocaleString('ko-KR')}건`}
            tone={driftTone}
            description="마지막 반영 이후 서버가 계산한 미해소 차이 건수입니다."
          />
          <StatusTile
            icon={<FileInput className="h-4 w-4" />}
            title="업로드 조건"
            value={status.uploadAuthoritative ? '업로드 가능' : '업로드 차단'}
            tone={uploadTone}
            description="파일 업로드는 Matter 정보 연결이 확인될 때만 사용할 수 있습니다."
          />
        </div>
      </SectionCard>

      <SectionCard icon={<ShieldCheck className="h-4 w-4" />} title="운영 조건" meta="업로드 기준">
        <div className="grid gap-3 lg:grid-cols-2">
          <ContractRow
            title="Matter 정보 확인"
            status={status.sourceContractReady ? '확인됨' : '설정 필요'}
            tone={status.sourceContractReady ? 'success' : 'blocked'}
            description={
              statusSource === 'api'
                ? 'Matter 코드, 표시명, 고객, 상태, 업무그룹은 서버에서 확인된 연동 상태를 기준으로 표시합니다.'
                : '서버 확인 전에는 업로드 가능한 연결로 취급하지 않습니다.'
            }
          />
          <ContractRow
            title="Matter 미선택 업로드"
            status="불가"
            tone="blocked"
            description="사용자는 Matter 코드를 먼저 선택해야 하며, 임의 값을 직접 입력하지 않습니다."
          />
          <ContractRow
            title="문서 보관함 기준 표시"
            status={
              status.projectionFallbackAllowed && !status.productionRuntime
                ? '개발 환경 확인용'
                : '운영 환경에서 사용 안 함'
            }
            tone="neutral"
            description="연결 검증 전 문서 보관함 기준 표시는 개발 환경에서만 확인용으로 사용하며, 운영 업로드 권한을 부여하지 않습니다."
          />
          <ContractRow
            title="권한 확인"
            status="권한 확인"
            tone="success"
            description="선택한 Matter 기준으로 권한과 정보 차단 정책을 확인한 뒤 문서 작업이 진행됩니다."
          />
          <ContractRow
            title="증빙 범위"
            status="확인용 정보만 표시"
            tone="neutral"
            description="연결 상태 화면에는 민감한 연결 정보나 문서 본문을 표시하지 않습니다."
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
