'use client';

import React from 'react';
import type { AuditEventDto } from '@amic-vault/shared';
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
    return <p className="text-sm font-medium text-destructive">{error}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="min-w-[760px] w-full border-collapse text-sm">
        <caption className="sr-only">{copy.caption}</caption>
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">{copy.time}</th>
            <th className="px-4 py-3 font-medium">{copy.action}</th>
            <th className="px-4 py-3 font-medium">{copy.actor}</th>
            <th className="px-4 py-3 font-medium">{copy.target}</th>
            <th className="px-4 py-3 font-medium">{copy.result}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              aria-selected={selectedEventId === event.eventId}
              className="cursor-pointer border-t transition-colors hover:bg-muted/50 aria-selected:bg-primary/5"
              key={event.eventId}
              onClick={() => onSelectEvent?.(event)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                  keyboardEvent.preventDefault();
                  onSelectEvent?.(event);
                }
              }}
              tabIndex={onSelectEvent ? 0 : undefined}
            >
              <td className="px-4 py-3 font-mono text-xs">{event.createdAt}</td>
              <td className="px-4 py-3 font-medium">{formatAction(event.action)}</td>
              <td className="px-4 py-3 text-xs">
                {event.actorType === 'system'
                  ? copy.systemActor
                  : event.actorType === 'user'
                    ? copy.userActor
                    : copy.actorFallback}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span>{event.targetType}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge tone={toneForResult(event.result)}>
                  {labelForResult(event.result, copy)}
                </StatusBadge>
              </td>
            </tr>
          ))}
          {events.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>
                {busy ? copy.loading : copy.empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
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
