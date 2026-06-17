'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { EthicalWallDetailDto, WallMembershipType } from '@amic-vault/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n, type Language } from '@/lib/i18n';

export interface WallPolicyInspectorProps {
  item: EthicalWallDetailDto | null;
}

const copyByLanguage: Record<
  Language,
  {
    title: string;
    meta: string;
    emptyTitle: string;
    emptyDescription: string;
    barrier: string;
    status: string;
    matter: string;
    matterHidden: string;
    members: string;
    createdAt: string;
    policyContext: string;
    policyDescription: string;
    active: string;
    released: string;
    membershipLabels: Record<WallMembershipType, string>;
  }
> = {
  ko: {
    title: '정책 상세',
    meta: '선택한 정보 장벽',
    emptyTitle: '선택한 정보 장벽이 없습니다.',
    emptyDescription: '정보 장벽 행을 선택하면 정책 범위와 감사 맥락이 표시됩니다.',
    barrier: '정보 장벽',
    status: '상태',
    matter: 'Matter',
    matterHidden: '내부 참조는 기본 화면에 표시하지 않음',
    members: '구성원 상태',
    createdAt: '생성 시각',
    policyContext: '정책 및 감사 맥락',
    policyDescription:
      '정보 장벽 변경은 권한 정책과 감사 기록을 통과한 작업만 반영됩니다. 구성원 세부 참조는 보안 운영 영역에서만 확인합니다.',
    active: '활성',
    released: '해제됨',
    membershipLabels: {
      insider: '차단 예외',
      excluded: '접근 차단',
    },
  },
  en: {
    title: 'Policy details',
    meta: 'Selected information barrier',
    emptyTitle: 'No information barrier selected.',
    emptyDescription: 'Select a barrier row to inspect policy scope and audit context.',
    barrier: 'Information barrier',
    status: 'Status',
    matter: 'Matter',
    matterHidden: 'Internal references are hidden by default',
    members: 'Membership status',
    createdAt: 'Created at',
    policyContext: 'Policy and audit context',
    policyDescription:
      'Information barrier changes are shown only after permission policy and audit recording. Member references remain in security operations areas.',
    active: 'Active',
    released: 'Released',
    membershipLabels: {
      insider: 'Insider',
      excluded: 'Blocked',
    },
  },
};

export function WallPolicyInspector({ item }: WallPolicyInspectorProps) {
  const { language } = useI18n();
  const copy = copyByLanguage[language];

  if (!item) {
    return (
      <SectionCard icon={<ShieldCheck className="h-4 w-4" />} title={copy.title} meta={copy.meta}>
        <EmptyState
          variant="policy-blocked"
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      </SectionCard>
    );
  }

  const membershipCounts = item.memberships.reduce<Record<WallMembershipType, number>>(
    (current, membership) => ({
      ...current,
      [membership.membershipType]: current[membership.membershipType] + 1,
    }),
    { insider: 0, excluded: 0 },
  );

  return (
    <SectionCard icon={<ShieldCheck className="h-4 w-4" />} title={copy.title} meta={copy.meta}>
      <dl className="grid gap-3 text-sm">
        <Value label={copy.barrier} value={item.wall.wallName} />
        <div className="min-w-0">
          <dt className="text-muted-foreground">{copy.status}</dt>
          <dd className="mt-1">
            <StatusBadge tone={item.wall.status === 'active' ? 'success' : 'blocked'}>
              {item.wall.status === 'active' ? copy.active : copy.released}
            </StatusBadge>
          </dd>
        </div>
        <Value label={copy.matter} value={copy.matterHidden} />
        <Value label={copy.createdAt} value={item.wall.createdAt} />
        <div className="min-w-0">
          <dt className="text-muted-foreground">{copy.members}</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {(['excluded', 'insider'] as WallMembershipType[]).map((type) => (
              <StatusBadge key={type} tone={type === 'excluded' ? 'warning' : 'neutral'}>
                {copy.membershipLabels[type]} {membershipCounts[type]}
              </StatusBadge>
            ))}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-md border bg-muted/20 p-3">
        <p className="text-sm font-medium">{copy.policyContext}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.policyDescription}</p>
      </div>
    </SectionCard>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
