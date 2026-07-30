import React from 'react';
import type {
  EmailMatterFilingDto,
  EmailThreadGroupDto,
  MatterDashboardDto,
  MatterDto,
  MatterStatus,
  MatterType,
} from '@amic-vault/shared';
import { listMatterEmailTimeline } from '@/lib/api-client';
import { matterLoadStatusForError, type MatterLoadStatus } from './matter-work-items';

type MatterEmailTimelineLoadResult =
  | {
      status: 'ready';
      emails: EmailMatterFilingDto[];
      threads: EmailThreadGroupDto[];
    }
  | {
      status: Exclude<MatterLoadStatus, 'loading' | 'ready'>;
      emails: [];
      threads: [];
    };

export async function resolveMatterEmailTimeline(
  matterId: string,
  loader: typeof listMatterEmailTimeline = listMatterEmailTimeline,
): Promise<MatterEmailTimelineLoadResult> {
  try {
    const timeline = await loader(matterId);
    return {
      status: 'ready',
      emails: [...timeline.items],
      threads: [...(timeline.threads ?? [])],
    };
  } catch (caught: unknown) {
    return {
      status: matterLoadStatusForError(caught),
      emails: [],
      threads: [],
    };
  }
}

export function MatterContextSummary({ matter }: { matter: MatterDto }) {
  return (
    <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0 rounded-md border bg-card p-3">
        <dt className="text-xs uppercase text-muted-foreground">고객</dt>
        <dd className="mt-1 break-words font-medium">
          {matter.clientDisplayName ?? '고객 표시명 없음'}
        </dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card p-3">
        <dt className="text-xs uppercase text-muted-foreground">유형</dt>
        <dd className="mt-1 break-words font-medium">{matterTypeLabel(matter.matterType)}</dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card p-3">
        <dt className="text-xs uppercase text-muted-foreground">그룹</dt>
        <dd className="mt-1 break-words font-medium">
          {matter.practiceGroup ?? '표시할 항목이 없습니다.'}
        </dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card p-3">
        <dt className="text-xs uppercase text-muted-foreground">보안 등급</dt>
        <dd className="mt-1 break-words font-medium">
          {matterConfidentialityLabel(matter.confidentialityLevel)}
          {matter.ethicalWallActive ? ' · Wall 활성' : ''}
        </dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card p-3">
        <dt className="text-xs uppercase text-muted-foreground">보존 제한</dt>
        <dd className="mt-1 break-words font-medium">{matter.legalHold ? '적용됨' : '없음'}</dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card p-3">
        <dt className="text-xs uppercase text-muted-foreground">책임 변호사</dt>
        <dd className="mt-1 break-words font-medium">
          {matter.leadPartnerDisplayName ?? matter.leadLawyerDisplayName ?? '미지정'}
        </dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card p-3">
        <dt className="text-xs uppercase text-muted-foreground">실무 담당 변호사</dt>
        <dd className="mt-1 break-words font-medium">
          {matter.leadAssociateDisplayName ?? '미지정'}
        </dd>
      </div>
    </dl>
  );
}

const matterConfidentialityLabels = {
  standard: '표준',
  high: '높음',
  restricted: '제한',
} as const satisfies Record<MatterDto['confidentialityLevel'], string>;

export function matterConfidentialityLabel(value: MatterDto['confidentialityLevel']): string {
  return matterConfidentialityLabels[value];
}

const matterTypeLabels = {
  advisory: '자문',
  arbitration: '중재',
  compliance: '컴플라이언스',
  contract: '계약',
  finance: '금융',
  investigation: '조사',
  ip: '지식재산',
  litigation: '송무',
  ma: 'M&A',
  other: '기타',
} as const satisfies Record<MatterType, string>;

export function matterTypeLabel(value: string): string {
  return matterTypeLabels[value as MatterType] ?? matterTypeLabels.other;
}

const matterStatusLabels = {
  proposed: '제안됨',
  open: '접수',
  active: '진행 중',
  closing: '종결 준비',
  closed: '종결',
  archived: '보관됨',
  disposal_review: '폐기 검토',
  disposed: '폐기됨',
} as const satisfies Record<MatterStatus, string>;

export function matterStatusLabel(value: string): string {
  return matterStatusLabels[value as MatterStatus] ?? '상태 미확인';
}

export function riskLabel(value: MatterDashboardDto['issueSummary']['highestRiskLevel']): string {
  if (value === 'critical') return '최고 위험 · 매우 높음';
  if (value === 'high') return '최고 위험 · 높음';
  if (value === 'medium') return '최고 위험 · 보통';
  if (value === 'low') return '최고 위험 · 낮음';
  return '열린 쟁점 없음';
}
