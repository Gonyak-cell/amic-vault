'use client';

import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import type { AuditEventDto } from '@amic-vault/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmptyRow,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { listMatterAuditEvents } from '@/lib/api/audit';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

interface MatterAuditTimelineProps {
  disableInitialLoad?: boolean;
  initialEvents?: AuditEventDto[];
  matterId: string;
}

const actionLabels: Record<string, string> = {
  ACCESS_DENIED: '접근 제한',
  DOCUMENT_DOWNLOADED: '문서 다운로드',
  DOCUMENT_METADATA_CHANGED: '문서 프로필 변경',
  DOCUMENT_UPLOADED: '문서 업로드',
  DOCUMENT_VERSION_ADDED: '문서 버전 추가',
  DOCUMENT_VIEWED: '문서 열람',
  MATTER_CREATED: '사건 생성',
  MATTER_MEMBER_ADDED: '팀원 추가',
  MATTER_MEMBER_REMOVED: '팀원 제거',
  MATTER_MEMBER_ROLE_CHANGED: '팀 권한 변경',
  MATTER_STATUS_CHANGED: '상태 변경',
  MATTER_UPDATED: '사건 정보 변경',
  PERMISSION_CHANGED: '권한 변경',
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 불가';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function actionLabel(action: string): string {
  return actionLabels[action] ?? action.toLowerCase().replaceAll('_', ' ');
}

function actorLabel(event: AuditEventDto): string {
  if (event.actorType === 'system') return '시스템';
  return event.actorDisplayName ?? event.actorDisplayEmail ?? '사용자';
}

function targetLabel(event: AuditEventDto): string {
  return event.safeLabel ?? event.targetDisplayName ?? event.matterDisplayCode ?? event.targetType;
}

function resultTone(result: AuditEventDto['result']): StatusBadgeTone {
  if (result === 'success') return 'success';
  if (result === 'denied') return 'warning';
  return 'blocked';
}

function resultLabel(result: AuditEventDto['result']): string {
  if (result === 'success') return '성공';
  if (result === 'denied') return '접근 제한';
  return '실패';
}

export function MatterAuditTimeline({
  disableInitialLoad = false,
  initialEvents = [],
  matterId,
}: MatterAuditTimelineProps) {
  const [events, setEvents] = useState<AuditEventDto[]>(initialEvents);
  const [loading, setLoading] = useState(!disableInitialLoad && initialEvents.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disableInitialLoad) return;
    let active = true;
    setLoading(true);
    setError(null);
    setEvents([]);
    listMatterAuditEvents(matterId, { limit: 8 })
      .then((result) => {
        if (active) setEvents(result.items);
      })
      .catch((caught) => {
        if (active) {
          setEvents([]);
          setError(safeApiErrorMessage(caught));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [disableInitialLoad, matterId]);

  return (
    <SectionCard
      icon={<Activity className="h-4 w-4" />}
      title="사건 감사 타임라인"
      meta="Matter 단위 기록"
    >
      {error ? (
        <EmptyState
          className="items-start text-left"
          description={error}
          title="감사 기록을 표시할 수 없습니다."
          variant="api-error"
        />
      ) : (
        <DataTable caption="사건 감사 타임라인" minWidthClassName="min-w-[760px]">
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>시간</DataTableHead>
              <DataTableHead>대상</DataTableHead>
              <DataTableHead>활동</DataTableHead>
              <DataTableHead>수행자</DataTableHead>
              <DataTableHead>결과</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {events.map((event) => (
              <DataTableRow key={event.eventId}>
                <DataTableCell className="text-xs">{formatDateTime(event.createdAt)}</DataTableCell>
                <DataTableCell className="max-w-[220px] truncate font-medium">
                  {targetLabel(event)}
                </DataTableCell>
                <DataTableCell>{actionLabel(event.action)}</DataTableCell>
                <DataTableCell className="text-xs">{actorLabel(event)}</DataTableCell>
                <DataTableCell>
                  <StatusBadge tone={resultTone(event.result)}>{resultLabel(event.result)}</StatusBadge>
                </DataTableCell>
              </DataTableRow>
            ))}
            {events.length === 0 ? (
              <DataTableEmptyRow colSpan={5}>
                {loading ? '감사 기록을 확인하는 중입니다.' : '표시할 감사 기록이 없습니다.'}
              </DataTableEmptyRow>
            ) : null}
          </DataTableBody>
        </DataTable>
      )}
    </SectionCard>
  );
}
