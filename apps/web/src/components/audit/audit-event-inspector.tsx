'use client';

import React, { useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import type { AuditEventDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';

export interface AuditEventInspectorProps {
  event: AuditEventDto | null;
}

export function AuditEventInspector({ event }: AuditEventInspectorProps) {
  const { language } = useI18n();
  const [showRefs, setShowRefs] = useState(false);
  const copy =
    language === 'ko'
      ? {
          title: '상세 정보',
          meta: '선택한 활동',
          emptyTitle: '선택한 활동이 없습니다.',
          emptyDescription: '감사 행을 선택하면 표시 가능한 세부 정보가 여기에 표시됩니다.',
          action: '활동',
          result: '결과',
          target: '대상',
          actor: '수행자',
          time: '시간',
          systemActor: '시스템',
          userActor: '사용자',
          success: '성공',
          denied: '접근 제한',
          failure: '실패',
          referencesTitle: '보안 운영 참조',
          referencesDescription: '필요한 관리자만 내부 감사 참조를 확인합니다.',
          showReferences: '내부 참조 표시',
          hideReferences: '내부 참조 숨김',
          eventRef: '감사 이벤트 참조',
          actorRef: '수행자 참조',
          sessionRef: '세션 참조',
          targetRef: '대상 참조',
          matterRef: 'Matter 참조',
          noReference: '참조 없음',
        }
      : {
          title: 'Details',
          meta: 'Selected activity',
          emptyTitle: 'No activity selected.',
          emptyDescription: 'Select an audit row to inspect displayable details here.',
          action: 'Activity',
          result: 'Result',
          target: 'Target',
          actor: 'Actor',
          time: 'Time',
          systemActor: 'System',
          userActor: 'User',
          success: 'Success',
          denied: 'Access restricted',
          failure: 'Failure',
          referencesTitle: 'Security operations references',
          referencesDescription:
            'Only required administrators should reveal internal audit references.',
          showReferences: 'Show internal references',
          hideReferences: 'Hide internal references',
          eventRef: 'Audit event ref',
          actorRef: 'Actor ref',
          sessionRef: 'Session ref',
          targetRef: 'Target ref',
          matterRef: 'Matter ref',
          noReference: 'No reference',
        };

  if (!event) {
    return (
      <SectionCard icon={<FileText className="h-4 w-4" />} title={copy.title} meta={copy.meta}>
        <EmptyState variant="no-data" title={copy.emptyTitle} description={copy.emptyDescription} />
      </SectionCard>
    );
  }

  return (
    <SectionCard icon={<FileText className="h-4 w-4" />} title={copy.title} meta={copy.meta}>
      <dl className="grid gap-3 text-sm">
        <Value label={copy.action} value={formatAction(event.action)} />
        <div className="min-w-0">
          <dt className="text-muted-foreground">{copy.result}</dt>
          <dd className="mt-1">
            <StatusBadge tone={toneForResult(event.result)}>
              {labelForResult(event.result, copy)}
            </StatusBadge>
          </dd>
        </div>
        <Value label={copy.actor} value={labelForActor(event.actorType, copy)} />
        <Value label={copy.target} value={event.targetType} />
        <Value label={copy.time} value={event.createdAt} />
      </dl>

      <div className="mt-4 rounded-md border bg-muted/20 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{copy.referencesTitle}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {copy.referencesDescription}
            </p>
          </div>
        </div>
        <Button
          className="mt-3"
          onClick={() => setShowRefs((current) => !current)}
          size="sm"
          type="button"
          variant="outline"
        >
          {showRefs ? copy.hideReferences : copy.showReferences}
        </Button>
        {showRefs ? (
          <dl className="mt-3 grid gap-2 text-xs">
            <Value label={copy.eventRef} value={event.eventId} />
            <Value label={copy.actorRef} value={event.actorId ?? copy.noReference} />
            <Value label={copy.sessionRef} value={event.sessionId ?? copy.noReference} />
            <Value label={copy.targetRef} value={event.targetId ?? copy.noReference} />
            <Value label={copy.matterRef} value={event.matterId ?? copy.noReference} />
          </dl>
        ) : null}
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

function labelForActor(
  actorType: AuditEventDto['actorType'],
  copy: { systemActor: string; userActor: string },
) {
  return actorType === 'system' ? copy.systemActor : copy.userActor;
}

function toneForResult(result: AuditEventDto['result']) {
  if (result === 'success') return 'success';
  if (result === 'denied') return 'warning';
  return 'blocked';
}

function labelForResult(
  result: AuditEventDto['result'],
  copy: { success: string; denied: string; failure: string },
) {
  if (result === 'success') return copy.success;
  if (result === 'denied') return copy.denied;
  return copy.failure;
}

function formatAction(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}
