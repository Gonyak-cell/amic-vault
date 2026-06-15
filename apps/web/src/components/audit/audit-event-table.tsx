'use client';

import React from 'react';
import type { AuditEventDto } from '@amic-vault/shared';
import { useI18n } from '@/lib/i18n';

export interface AuditEventTableProps {
  events: AuditEventDto[];
  busy?: boolean;
  error?: string | null;
}

export function AuditEventTable({ events, busy = false, error = null }: AuditEventTableProps) {
  const { language } = useI18n();
  const copy = language === 'ko'
    ? {
        time: '시간',
        action: '활동',
        actor: '수행자',
        target: '대상',
        result: '결과',
        loading: '활동 기록을 불러오는 중입니다.',
        empty: '표시할 활동 기록이 없습니다.',
        actorFallback: '시스템',
      }
    : {
        time: 'Time',
        action: 'Activity',
        actor: 'Actor',
        target: 'Target',
        result: 'Result',
        loading: 'Loading activity.',
        empty: 'No activity to show.',
        actorFallback: 'System',
      };

  if (error) {
    return <p className="text-sm font-medium text-destructive">{error}</p>;
  }
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <table className="w-full border-collapse text-sm">
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
            <tr key={event.eventId} className="border-t">
              <td className="px-4 py-3 font-mono text-xs">{event.createdAt}</td>
              <td className="px-4 py-3 font-medium">{formatAction(event.action)}</td>
              <td className="px-4 py-3 text-xs">{formatRef(event.actorId ?? event.actorType ?? copy.actorFallback)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span>{event.targetType}</span>
                  {event.targetId ? (
                    <span className="text-xs text-muted-foreground">
                      {event.targetId}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">{event.result}</td>
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

function formatAction(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRef(value: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return value.slice(0, 8);
  return value;
}
