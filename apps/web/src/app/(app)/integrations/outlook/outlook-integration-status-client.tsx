'use client';

import React, { useEffect, useState } from 'react';
import type { OutlookIntegrationAdminStatusDto } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { getOutlookIntegrationAdminStatus } from '@/lib/api/outlook-addin';

type StatusState =
  | { status: 'loading' }
  | { status: 'ready'; data: OutlookIntegrationAdminStatusDto }
  | { status: 'error' };

const featureLabels: Record<string, string> = {
  ADDIN_BOOTSTRAP: 'Add-in bootstrap',
  AUTH_EXCHANGE: '인증 교환',
  GRAPH_ATTACHMENT_ACQUISITION: 'Graph 첨부 획득',
  SMART_ALERTS: 'Smart Alerts',
  SEND_FILE: 'Send and file',
  DOCUMENT_INSERTION: 'Vault 문서 삽입',
  FOLDER_MAPPING: '폴더 매핑',
  AUTOFILE: '자동 파일링',
};

const evidenceLabels: Record<string, string> = {
  'EV-OUTLOOK-002': 'Manifest 검증',
  'EV-OUTLOOK-003': 'Graph consent 검증',
  'OPERATOR-APPROVAL': '운영 승인',
  'DISABLE-REMOVE-REHEARSAL': '비활성화 리허설',
};

export function OutlookIntegrationStatusClient() {
  const [state, setState] = useState<StatusState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    getOutlookIntegrationAdminStatus()
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  return <OutlookIntegrationStatusContent state={state} />;
}

export function OutlookIntegrationStatusContent({ state }: { state: StatusState }) {
  if (state.status === 'loading') {
    return (
      <EmptyState
        variant="api-unavailable"
        title="Outlook 운영 상태를 불러오는 중입니다."
        description="상태 API 응답 전에는 연결 여부나 배포 상태를 표시하지 않습니다."
      />
    );
  }

  if (state.status === 'error') {
    return (
      <EmptyState
        variant="api-error"
        title="Outlook 운영 상태를 표시할 수 없습니다."
        description="권한 또는 상태 API 연결을 확인해 주세요."
      />
    );
  }

  const status = state.data;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
      <SectionCard title="운영 게이트" meta="API 응답 기준">
        <dl className="grid gap-3 sm:grid-cols-3">
          <StatusValue
            label="게이트 적용"
            value={status.operationalGateEnforced ? '적용 중' : '개발 모드'}
            tone={status.operationalGateEnforced ? 'success' : 'neutral'}
          />
          <StatusValue
            label="Rollout ring"
            value={status.rolloutRing ?? '설정되지 않음'}
            tone={status.rolloutRing ? 'neutral' : 'warning'}
          />
          <StatusValue
            label="Audit availability"
            value={status.auditAvailable ? '확인됨' : '미확인'}
            tone={status.auditAvailable ? 'success' : 'blocked'}
          />
        </dl>
      </SectionCard>

      <SectionCard title="Evidence 상태" meta="참조값 원문 비노출">
        <div className="flex flex-col gap-2">
          {status.evidence.map((item) => (
            <div key={item.kind} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium">
                {evidenceLabels[item.kind] ?? item.kind}
              </span>
              <StatusBadge tone={item.present && item.validFormat ? 'success' : 'warning'}>
                {item.present ? (item.validFormat ? '형식 확인' : '형식 확인 필요') : '미제출'}
              </StatusBadge>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard className="lg:col-span-2" title="기능별 운영 상태" meta="feature flag + gate decision">
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <caption className="sr-only">Outlook 기능별 운영 상태</caption>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">기능</th>
                <th className="px-4 py-3 font-medium">설정</th>
                <th className="px-4 py-3 font-medium">Gate</th>
                <th className="px-4 py-3 font-medium">차단 사유</th>
              </tr>
            </thead>
            <tbody>
              {status.features.map((feature) => (
                <tr key={feature.feature} className="border-t">
                  <td className="px-4 py-3 font-medium">
                    {featureLabels[feature.feature] ?? feature.feature}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={feature.configured ? 'success' : 'neutral'}>
                      {feature.configured ? '활성화' : '비활성'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={feature.allowed ? 'success' : 'blocked'}>
                      {feature.allowed ? '허용' : '차단'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {feature.allowed ? '없음' : (feature.reasonCode ?? '정책 확인 필요')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function StatusValue({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'blocked';
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2">
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </dd>
    </div>
  );
}
