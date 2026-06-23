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
  refreshKey?: number | string;
}

const actionLabels: Record<string, string> = {
  ACCESS_DENIED: '접근 제한',
  DISPOSAL_APPROVED: '폐기 승인',
  DISPOSAL_CERTIFICATE_CREATED: '폐기 증명서',
  DISPOSAL_EXECUTED: '폐기 실행',
  DISPOSAL_REQUESTED: '폐기 요청',
  DOCUMENT_DOWNLOADED: '문서 다운로드',
  DOCUMENT_METADATA_CHANGED: '문서 프로필 변경',
  DOCUMENT_TEXT_EXTRACTED: '본문 추출',
  DOCUMENT_UPLOADED: '문서 업로드',
  DOCUMENT_VERSION_ADDED: '문서 버전 추가',
  DOCUMENT_VIEWED: '문서 열람',
  LEGAL_HOLD_APPLIED: 'Legal Hold 적용',
  LEGAL_HOLD_RELEASED: 'Legal Hold 해제',
  MATTER_CREATED: '사건 생성',
  MATTER_MEMBER_ADDED: '팀원 추가',
  MATTER_MEMBER_REMOVED: '팀원 제거',
  MATTER_MEMBER_ROLE_CHANGED: '팀 권한 변경',
  MATTER_STATUS_CHANGED: '상태 변경',
  MATTER_UPDATED: '사건 정보 변경',
  PERMISSION_CHANGED: '권한 변경',
  RECORD_ARCHIVED: '보관 처리',
  SEARCH_EXECUTED: '검색 실행',
};

function categoryLabel(action: string): string {
  if (action.startsWith('DOCUMENT_')) {
    if (action === 'DOCUMENT_VIEWED' || action === 'DOCUMENT_DOWNLOADED') return '열람/다운로드';
    if (action === 'DOCUMENT_METADATA_CHANGED') return '메타데이터';
    return '문서/버전';
  }
  if (action.startsWith('SEARCH_')) return '검색';
  if (
    action.startsWith('DISPOSAL_') ||
    action === 'LEGAL_HOLD_APPLIED' ||
    action === 'LEGAL_HOLD_RELEASED' ||
    action === 'RECORD_ARCHIVED'
  ) {
    return 'Records';
  }
  if (action.startsWith('MATTER_')) return 'Matter';
  return '정책 관리';
}

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
  refreshKey = 0,
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
  }, [disableInitialLoad, matterId, refreshKey]);

  return (
    <SectionCard
      icon={<Activity className="h-4 w-4" />}
      title="사건 감사 타임라인"
      meta="Matter 통합 활동"
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
              <DataTableHead>범주</DataTableHead>
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
                <DataTableCell>
                  <StatusBadge tone="neutral">{categoryLabel(event.action)}</StatusBadge>
                </DataTableCell>
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
              <DataTableEmptyRow colSpan={6}>
                {loading ? '감사 기록을 확인하는 중입니다.' : '표시할 감사 기록이 없습니다.'}
              </DataTableEmptyRow>
            ) : null}
          </DataTableBody>
        </DataTable>
      )}
    </SectionCard>
  );
}
