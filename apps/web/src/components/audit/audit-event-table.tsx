'use client';

import React from 'react';
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
import { StatusBadge } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';

export interface AuditEventTableProps {
  events: AuditEventDto[];
  busy?: boolean;
  error?: string | null;
  onSelectEvent?: (event: AuditEventDto) => void;
  selectedEventId?: string | null;
}

export function AuditEventTable({
  events,
  busy = false,
  error = null,
  onSelectEvent,
  selectedEventId = null,
}: AuditEventTableProps) {
  const { language } = useI18n();
  const copy =
    language === 'ko'
      ? {
          time: '시간',
          action: '활동',
          actor: '수행자',
          target: '대상',
          result: '결과',
          caption: '활동 기록 표',
          loading: '활동 기록을 불러오는 중입니다.',
          empty: '표시할 활동 기록이 없습니다.',
          actorFallback: '표시 가능한 수행자 없음',
          systemActor: '시스템',
          userActor: '사용자',
          success: '성공',
          denied: '접근 제한',
          failure: '실패',
        }
      : {
          time: 'Time',
          action: 'Activity',
          actor: 'Actor',
          target: 'Target',
          result: 'Result',
          caption: 'Activity log table',
          loading: 'Loading activity.',
          empty: 'No activity to show.',
          actorFallback: 'No display actor available',
          systemActor: 'System',
          userActor: 'User',
          success: 'Success',
          denied: 'Access restricted',
          failure: 'Failure',
        };

  if (error) {
    return <EmptyState variant="api-error" title={error} className="items-start text-left" />;
  }
  return (
    <DataTable caption={copy.caption} minWidthClassName="min-w-[760px]">
      <DataTableHeader>
        <tr>
          <DataTableHead>{copy.time}</DataTableHead>
          <DataTableHead>{copy.action}</DataTableHead>
          <DataTableHead>{copy.actor}</DataTableHead>
          <DataTableHead>{copy.target}</DataTableHead>
          <DataTableHead>{copy.result}</DataTableHead>
        </tr>
      </DataTableHeader>
      <DataTableBody>
        {events.map((event) => (
          <DataTableRow
            key={event.eventId}
            selected={selectedEventId === event.eventId}
            onSelect={onSelectEvent ? () => onSelectEvent(event) : undefined}
          >
            <DataTableCell className="font-mono text-xs">{event.createdAt}</DataTableCell>
            <DataTableCell className="font-medium">{formatAction(event.action)}</DataTableCell>
            <DataTableCell className="text-xs">
              {event.actorType === 'system'
                ? copy.systemActor
                : event.actorType === 'user'
                  ? (event.actorDisplayName ?? event.actorDisplayEmail ?? copy.userActor)
                  : copy.actorFallback}
            </DataTableCell>
            <DataTableCell>
              <div className="flex flex-col gap-1">
                <span>{event.safeLabel ?? event.targetDisplayName ?? event.targetType}</span>
              </div>
            </DataTableCell>
            <DataTableCell>
              <StatusBadge tone={toneForResult(event.result)}>
                {labelForResult(event.result, copy)}
              </StatusBadge>
            </DataTableCell>
          </DataTableRow>
        ))}
        {events.length === 0 ? (
          <DataTableEmptyRow colSpan={5}>{busy ? copy.loading : copy.empty}</DataTableEmptyRow>
        ) : null}
      </DataTableBody>
    </DataTable>
  );
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
