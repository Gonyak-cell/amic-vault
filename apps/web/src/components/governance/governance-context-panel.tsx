'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  Archive,
  Bot,
  CheckCircle2,
  Clock3,
  FileSearch,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type {
  AiPrepDocumentStatusDto,
  AiPrepMatterReadinessDto,
  DocumentDto,
  MatterDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';

type GovernanceTone = StatusBadgeTone;

interface GovernanceItem {
  label: string;
  value: string;
  tone?: GovernanceTone;
}

interface WorkflowTask {
  title: string;
  description: string;
  href?: string;
  tone: GovernanceTone;
}

const confidentialityLabels = {
  standard: '일반',
  high: '높음',
  restricted: '제한됨',
} as const satisfies Record<DocumentDto['confidentialityLevel'], string>;

const privilegeLabels = {
  none: '없음',
  privileged: '비밀특권',
  work_product: '업무 산출물',
  joint_privilege: '공동 특권',
} as const satisfies Record<DocumentDto['privilegeStatus'], string>;

const readinessLabels = {
  not_ready: '준비 전',
  pending: '대기',
  ready: '준비됨',
  partial: '부분 준비',
  blocked: '차단',
  failed: '실패',
  rejected: '거절',
  stale: '재처리 필요',
} as const satisfies Record<AiPrepDocumentStatusDto['readinessStatus'], string>;

function toneForBoolean(value: boolean): GovernanceTone {
  return value ? 'warning' : 'success';
}

function toneForExtraction(status: DocumentDto['extractionStatus']): GovernanceTone {
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'blocked';
  if (status === 'pending' || status === 'ocr_pending') return 'warning';
  return 'neutral';
}

function toneForPrep(status: AiPrepDocumentStatusDto['readinessStatus']): GovernanceTone {
  if (status === 'ready') return 'success';
  if (status === 'failed' || status === 'blocked' || status === 'rejected') return 'blocked';
  if (status === 'pending' || status === 'partial' || status === 'stale') return 'warning';
  return 'neutral';
}

function formattedDate(value: string | null | undefined): string {
  if (!value) return '확인 불가';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 불가';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function Row({ item }: { item: GovernanceItem }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0">
      <span className="min-w-0 text-[13px] text-muted-foreground">{item.label}</span>
      <span className="shrink-0 text-right text-[13px] font-medium text-foreground">
        {item.tone ? <StatusBadge tone={item.tone}>{item.value}</StatusBadge> : item.value}
      </span>
    </li>
  );
}

function GovernanceRows({ items }: { items: GovernanceItem[] }) {
  return (
    <ul className="overflow-hidden rounded-md border bg-background">
      {items.map((item) => (
        <Row key={item.label} item={item} />
      ))}
    </ul>
  );
}

export function DocumentGovernanceContextPanel({
  document,
  prepStatus,
}: {
  document: DocumentDto;
  prepStatus: AiPrepDocumentStatusDto | null;
}) {
  const accessItems: GovernanceItem[] = [
    { label: 'Matter membership', value: '필수', tone: 'success' },
    { label: '정보 차단 정책', value: '요청 시점 평가', tone: 'success' },
    {
      label: '보안 등급',
      value: confidentialityLabels[document.confidentialityLevel],
      tone: document.confidentialityLevel === 'standard' ? 'success' : 'warning',
    },
    {
      label: '특권 상태',
      value: privilegeLabels[document.privilegeStatus],
      tone: document.privilegeStatus === 'none' ? 'success' : 'warning',
    },
    {
      label: 'Legal Hold',
      value: document.legalHold ? '적용' : '미적용',
      tone: toneForBoolean(document.legalHold),
    },
  ];
  const activityItems: GovernanceItem[] = [
    {
      label: '추출 상태',
      value: document.extractionStatus ?? '확인 불가',
      tone: toneForExtraction(document.extractionStatus),
    },
    { label: '추출 방식', value: document.extractionMethod ?? '확인 불가' },
    { label: '최종 업데이트', value: formattedDate(document.updatedAt) },
    {
      label: '파일 정리 준비',
      value: prepStatus ? readinessLabels[prepStatus.readinessStatus] : '상태 없음',
      tone: prepStatus ? toneForPrep(prepStatus.readinessStatus) : 'neutral',
    },
  ];

  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title="거버넌스 상태"
      meta="권한·기록·운영 문맥"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">접근 근거</h3>
          <GovernanceRows items={accessItems} />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">기록 및 처리</h3>
          <GovernanceRows items={activityItems} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/records">
            <Archive className="h-4 w-4" />
            기록 보존
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/audit">
            <Activity className="h-4 w-4" />
            접근 기록
          </Link>
        </Button>
      </div>
    </SectionCard>
  );
}

export function MatterGovernanceContextPanel({
  matter,
  readiness,
}: {
  matter: MatterDto;
  readiness: AiPrepMatterReadinessDto | null;
}) {
  const items: GovernanceItem[] = [
    { label: 'Matter Code', value: matter.matterCode },
    { label: '상태', value: matter.status },
    { label: '업무 그룹', value: matter.practiceGroup ?? '표시할 항목 없음' },
    {
      label: '대표 담당자',
      value: matter.leadLawyerDisplayName ?? matter.leadLawyerDisplayEmail ?? '표시할 항목 없음',
    },
    {
      label: 'Legal Hold',
      value: matter.legalHold ? '적용' : '미적용',
      tone: toneForBoolean(matter.legalHold),
    },
    {
      label: '파일 정리 준비',
      value: readiness
        ? `${readiness.readyDocumentCount}/${readiness.documentCount}건 준비`
        : '상태 없음',
      tone: readiness && readiness.documentCount > 0 ? 'success' : 'neutral',
    },
  ];

  return (
    <SectionCard
      icon={<Scale className="h-4 w-4" />}
      title="사건 거버넌스"
      meta="권한·보존·운영 문맥"
    >
      <GovernanceRows items={items} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/matters/${matter.matterId}/team`}>
            <ShieldCheck className="h-4 w-4" />
            팀 권한
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/records">
            <Archive className="h-4 w-4" />
            기록 보존
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/walls">
            <TriangleAlert className="h-4 w-4" />
            정보 차단
          </Link>
        </Button>
      </div>
    </SectionCard>
  );
}

function documentWorkflowTasks(
  document: DocumentDto,
  prepStatus: AiPrepDocumentStatusDto | null,
): WorkflowTask[] {
  const tasks: WorkflowTask[] = [];
  if (document.extractionStatus === 'failed') {
    tasks.push({
      title: '본문 추출 실패 확인',
      description: '검색 가능 상태가 아니므로 운영자가 추출 상태를 확인해야 합니다.',
      tone: 'blocked',
    });
  }
  if (document.extractionStatus === 'pending' || document.extractionStatus === 'ocr_pending') {
    tasks.push({
      title: '본문 추출 대기',
      description: '추출 또는 OCR 작업이 완료되기 전까지 본문 검색 품질이 제한됩니다.',
      tone: 'warning',
    });
  }
  if (!document.subtype) {
    tasks.push({
      title: '세부 유형 보강',
      description: '프로필 편집에서 문서 세부 유형을 보강할 수 있습니다.',
      tone: 'neutral',
    });
  }
  if (document.legalHold) {
    tasks.push({
      title: 'Legal Hold 적용 중',
      description: '보존 정책이 적용된 문서는 폐기·삭제 흐름에서 차단됩니다.',
      href: '/records',
      tone: 'warning',
    });
  }
  if (prepStatus && prepStatus.readinessStatus !== 'ready') {
    tasks.push({
      title: '파일 정리 준비 확인',
      description: `현재 상태는 ${readinessLabels[prepStatus.readinessStatus]}입니다.`,
      tone: toneForPrep(prepStatus.readinessStatus),
    });
  }
  return tasks;
}

function matterWorkflowTasks(
  matter: MatterDto,
  readiness: AiPrepMatterReadinessDto | null,
): WorkflowTask[] {
  const tasks: WorkflowTask[] = [];
  if (matter.legalHold) {
    tasks.push({
      title: 'Matter Legal Hold 적용 중',
      description: 'Matter 단위 보존 제한이 적용되어 기록 보존 흐름에서 확인이 필요합니다.',
      href: '/records',
      tone: 'warning',
    });
  }
  if (!matter.leadLawyerDisplayName && !matter.leadLawyerDisplayEmail) {
    tasks.push({
      title: '대표 담당자 표시 정보 없음',
      description: 'Matter app 동기화 또는 팀 관리 화면에서 담당자 표시 정보를 확인하세요.',
      href: `/matters/${matter.matterId}/team`,
      tone: 'neutral',
    });
  }
  if (readiness) {
    if (readiness.failedDocumentCount > 0 || readiness.rejectedDocumentCount > 0) {
      tasks.push({
        title: '파일 정리 준비 실패 확인',
        description: `실패 ${readiness.failedDocumentCount}건, 거절 ${readiness.rejectedDocumentCount}건이 있습니다.`,
        tone: 'blocked',
      });
    }
    if (readiness.pendingDocumentCount > 0 || readiness.pendingJobCount > 0) {
      tasks.push({
        title: '파일 정리 준비 대기',
        description: `대기 문서 ${readiness.pendingDocumentCount}건, 작업 ${readiness.pendingJobCount}건이 있습니다.`,
        tone: 'warning',
      });
    }
    if (readiness.staleDocumentCount > 0 || readiness.staleArtifactCount > 0) {
      tasks.push({
        title: '파일 정리 준비 재처리 필요',
        description: `오래된 문서 ${readiness.staleDocumentCount}건, 산출물 ${readiness.staleArtifactCount}건이 있습니다.`,
        tone: 'warning',
      });
    }
  }
  return tasks;
}

function WorkflowTaskList({ tasks }: { tasks: WorkflowTask[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="표시할 작업이 없습니다."
        description="실제 문서·사건 상태에서 발생한 작업만 표시됩니다."
      />
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {tasks.map((task) => (
        <li key={task.title} className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{task.title}</span>
              <StatusBadge tone={task.tone}>{task.tone === 'blocked' ? '확인 필요' : '상태 기반'}</StatusBadge>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{task.description}</p>
          </div>
          {task.href ? (
            <Button asChild size="sm" variant="outline">
              <Link href={task.href}>열기</Link>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DocumentWorkflowOpsPanel({
  document,
  prepStatus,
}: {
  document: DocumentDto;
  prepStatus: AiPrepDocumentStatusDto | null;
}) {
  return (
    <SectionCard
      icon={<FileSearch className="h-4 w-4" />}
      title="작업 및 운영 상태"
      meta="실제 상태 기반"
    >
      <WorkflowTaskList tasks={documentWorkflowTasks(document, prepStatus)} />
      <div className="mt-3 rounded-md border bg-muted/20 p-3 text-[13px] leading-6 text-muted-foreground">
        <Bot className="mr-2 inline h-4 w-4 text-primary" />
        AI Prep는 업로드 후 파일 정리 준비 범위에서만 표시됩니다.
      </div>
    </SectionCard>
  );
}

export function MatterWorkflowOpsPanel({
  matter,
  readiness,
}: {
  matter: MatterDto;
  readiness: AiPrepMatterReadinessDto | null;
}) {
  return (
    <SectionCard icon={<Clock3 className="h-4 w-4" />} title="작업 큐" meta="실제 상태 기반">
      <WorkflowTaskList tasks={matterWorkflowTasks(matter, readiness)} />
      <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-[13px] text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        추가로 확인할 작업이 없습니다.
      </div>
    </SectionCard>
  );
}
