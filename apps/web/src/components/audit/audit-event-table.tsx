import React from 'react';
import type { AuditEventDto } from '@amic-vault/shared';

export interface AuditEventTableProps {
  events: AuditEventDto[];
  busy?: boolean;
  error?: string | null;
}

export function AuditEventTable({ events, busy = false, error = null }: AuditEventTableProps) {
  if (error) {
    return <p className="text-sm font-medium text-destructive">{error}</p>;
  }
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Action</th>
            <th className="px-4 py-3 font-medium">Actor</th>
            <th className="px-4 py-3 font-medium">Target</th>
            <th className="px-4 py-3 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.eventId} className="border-t">
              <td className="px-4 py-3 font-mono text-xs">{event.createdAt}</td>
              <td className="px-4 py-3 font-medium">{event.action}</td>
              <td className="px-4 py-3 font-mono text-xs">{event.actorId ?? event.actorType}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span>{event.targetType}</span>
                  {event.targetId ? (
                    <span className="font-mono text-xs text-muted-foreground">
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
                {busy ? 'Loading' : 'No events'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
