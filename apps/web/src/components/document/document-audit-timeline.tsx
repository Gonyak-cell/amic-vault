'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ExternalLink } from 'lucide-react';
import type { DocumentAuditEventDto } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
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
import { listDocumentAuditEvents } from '@/lib/api/audit';
import { safeApiErrorMessage } from '@/lib/api/error-messages';

interface DocumentAuditTimelineProps {
  documentId: string;
  disableInitialLoad?: boolean;
  initialEvents?: DocumentAuditEventDto[];
}

const actionLabels: Partial<Record<DocumentAuditEventDto['action'], string>> = {
  DOCUMENT_UPLOADED: '업로드',
  DOCUMENT_VIEWED: '열람',
  DOCUMENT_DOWNLOADED: '다운로드',
  DOCUMENT_DELETED: '삭제',
  DOCUMENT_RESTORED: '복원',
  DOCUMENT_METADATA_CHANGED: '프로필 변경',
  DOCUMENT_VERSION_ADDED: '새 버전',
  DOCUMENT_INTEGRITY_ALERT: '무결성 알림',
  DOCUMENT_TEXT_EXTRACTED: '본문 추출',
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 불가';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function actionLabel(action: DocumentAuditEventDto['action']): string {
  return actionLabels[action] ?? action.toLowerCase().replaceAll('_', ' ');
}

function actorLabel(event: DocumentAuditEventDto): string {
  if (event.actorType === 'system') return '시스템';
  return event.actorDisplayName ?? event.actorDisplayEmail ?? '사용자';
}

function resultTone(result: DocumentAuditEventDto['result']): StatusBadgeTone {
  if (result === 'success') return 'success';
  if (result === 'denied') return 'warning';
  return 'blocked';
}

function resultLabel(result: DocumentAuditEventDto['result']): string {
  if (result === 'success') return '성공';
  if (result === 'denied') return '접근 제한';
  return '실패';
}

export function DocumentAuditTimeline({
  disableInitialLoad = false,
  documentId,
  initialEvents = [],
}: DocumentAuditTimelineProps) {
  const [events, setEvents] = useState<DocumentAuditEventDto[]>(initialEvents);
  const [loading, setLoading] = useState(!disableInitialLoad && initialEvents.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disableInitialLoad) return;
    let active = true;
    setLoading(true);
    setError(null);
    setEvents([]);
    listDocumentAuditEvents(documentId, { limit: 8 })
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
  }, [disableInitialLoad, documentId]);

  return (
    <SectionCard
      icon={<Activity className="h-4 w-4" />}
      title="문서 감사 타임라인"
      meta="문서 단위 기록"
      actions={
        <Button asChild size="sm" variant="outline">
          <Link
            href={`/audit?targetType=document&targetId=${encodeURIComponent(documentId)}`}
          >
            <ExternalLink className="h-4 w-4" />
            전체 기록
          </Link>
        </Button>
      }
    >
      {error ? (
        <EmptyState
          className="items-start text-left"
          description={error}
          title="감사 기록을 표시할 수 없습니다."
          variant="api-error"
        />
      ) : (
        <DataTable caption="문서 감사 타임라인" minWidthClassName="min-w-[680px]">
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>시간</DataTableHead>
              <DataTableHead>활동</DataTableHead>
              <DataTableHead>수행자</DataTableHead>
              <DataTableHead>결과</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {events.map((event) => (
              <DataTableRow key={event.eventId}>
                <DataTableCell className="text-xs">{formatDateTime(event.createdAt)}</DataTableCell>
                <DataTableCell className="font-medium">{actionLabel(event.action)}</DataTableCell>
                <DataTableCell className="text-xs">{actorLabel(event)}</DataTableCell>
                <DataTableCell>
                  <StatusBadge tone={resultTone(event.result)}>{resultLabel(event.result)}</StatusBadge>
                </DataTableCell>
              </DataTableRow>
            ))}
            {events.length === 0 ? (
              <DataTableEmptyRow colSpan={4}>
                {loading ? '감사 기록을 확인하는 중입니다.' : '표시할 감사 기록이 없습니다.'}
              </DataTableEmptyRow>
            ) : null}
          </DataTableBody>
        </DataTable>
      )}
    </SectionCard>
  );
}
