'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Ban, RefreshCw, SearchCheck, ShieldCheck } from 'lucide-react';
import type {
  ConflictCheckCandidateDto,
  ConflictCheckDto,
  MatterConflictStatus,
  MatterDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import {
  ApiClientError,
  getMatter,
  listMatterConflictChecks,
  resolveMatterConflictCheck,
  runMatterConflictCheck,
  updateMatterStatus,
} from '@/lib/api-client';
import { dataStateStatusForApiError } from '@/lib/api/error-messages';
import type { DataState } from '@/lib/data-state';

type ConflictLoadStatus = DataState<ConflictCheckDto[]>['status'];
type ConflictActionState = 'idle' | 'loading' | 'running' | 'resolving' | 'opening' | 'error';
type ConflictResolutionStatus = 'cleared' | 'blocked';

interface MatterConflictsPanelViewProps {
  actionError?: string | null;
  actionState: ConflictActionState;
  checks: ConflictCheckDto[];
  loadStatus: ConflictLoadStatus;
  matter: MatterDto;
  openError?: string | null;
  rationale: string;
  onOpenMatter?: () => void;
  onRationaleChange?: (value: string) => void;
  onRefresh?: () => void;
  onResolve?: (status: ConflictResolutionStatus) => void;
  onRunCheck?: () => void;
}

const conflictStatusLabels = {
  not_started: '미검사',
  in_review: '검토 중',
  cleared: '해소됨',
  blocked: '차단됨',
} satisfies Record<MatterConflictStatus, string>;

const conflictStatusTones = {
  not_started: 'border-slate-300 bg-slate-50 text-slate-700',
  in_review: 'border-amber-300 bg-amber-50 text-amber-800',
  cleared: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  blocked: 'border-red-300 bg-red-50 text-red-800',
} satisfies Record<MatterConflictStatus, string>;

const checkStatusLabels = {
  in_review: '검토 중',
  cleared: '해소됨',
  blocked: '차단됨',
} satisfies Record<ConflictCheckDto['status'], string>;

const candidateSourceLabels = {
  client: '고객',
  matter: 'Matter',
  party: '당사자',
} satisfies Record<ConflictCheckCandidateDto['sourceType'], string>;

function statusBadge(status: MatterConflictStatus) {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold ${conflictStatusTones[status]}`}
    >
      {conflictStatusLabels[status]}
    </span>
  );
}

export function latestConflictCheck(checks: ConflictCheckDto[]): ConflictCheckDto | null {
  return checks[0] ?? null;
}

export function formatConflictSimilarity(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const ratio = value > 1 ? value / 100 : value;
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

function emptyStateFor(loadStatus: ConflictLoadStatus) {
  if (loadStatus === 'loading') {
    return <EmptyState variant="api-unavailable" title="이해상충 검토 이력을 불러오는 중입니다." />;
  }
  if (loadStatus === 'empty') {
    return <EmptyState title="검토 이력이 없습니다." />;
  }
  if (loadStatus === 'error') {
    return <EmptyState variant="api-error" title="이해상충 검토 이력을 표시할 수 없습니다." />;
  }
  if (loadStatus === 'forbidden') {
    return <EmptyState variant="no-access" title="이해상충 검토 이력을 볼 권한이 없습니다." />;
  }
  if (loadStatus === 'blocked') {
    return (
      <EmptyState variant="policy-blocked" title="권한 정책으로 검토 이력이 차단되었습니다." />
    );
  }
  return null;
}

function openMatterErrorMessage(error: unknown, conflictsStatus: MatterConflictStatus): string {
  if (error instanceof ApiClientError && error.reason === 'CONFLICTS_NOT_CLEARED') {
    if (conflictsStatus === 'blocked') {
      return '정보 차단 설정으로 인해 수임을 진행할 수 없습니다.';
    }
    return '이해상충 검토 해소 후 Matter를 열 수 있습니다.';
  }
  return 'Matter 상태를 변경하지 못했습니다.';
}

function candidateRows(check: ConflictCheckDto | null) {
  if (!check || check.candidates.length === 0) {
    return (
      <tr>
        <td className="px-4 py-5 text-sm text-muted-foreground" colSpan={5}>
          표시할 후보가 없습니다.
        </td>
      </tr>
    );
  }

  return check.candidates.map((candidate) => (
    <tr key={`${candidate.sourceType}:${candidate.sourceId}:${candidate.targetName}`}>
      <td className="px-4 py-3 text-sm font-medium">{candidate.targetName}</td>
      <td className="px-4 py-3 text-sm">{candidate.sourceName}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {candidateSourceLabels[candidate.sourceType]}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums">
        {formatConflictSimilarity(candidate.similarity)}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {candidate.sourceMatterName ?? '-'}
      </td>
    </tr>
  ));
}

export function MatterConflictsPanelView({
  actionError,
  actionState,
  checks,
  loadStatus,
  matter,
  openError,
  rationale,
  onOpenMatter,
  onRationaleChange,
  onRefresh,
  onResolve,
  onRunCheck,
}: MatterConflictsPanelViewProps) {
  const latestCheck = latestConflictCheck(checks);
  const trimmedRationale = rationale.trim();
  const isBusy =
    actionState === 'running' || actionState === 'resolving' || actionState === 'opening';
  const canResolve = Boolean(latestCheck) && trimmedRationale.length > 0 && !isBusy;
  const canOpenMatter = matter.status === 'proposed' && !isBusy;
  const blocked = matter.conflictsStatus === 'blocked';

  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title="이해상충"
      meta="검토 상태"
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            새로고침
          </Button>
          <Button type="button" size="sm" disabled={isBusy} onClick={onRunCheck}>
            <SearchCheck className="h-4 w-4" />
            검사 실행
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(matter.conflictsStatus)}
            {latestCheck ? (
              <span className="text-sm text-muted-foreground">
                최근 검토: {checkStatusLabels[latestCheck.status]}
              </span>
            ) : null}
            {blocked ? (
              <a
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/walls"
              >
                정보 차단 설정 보기
              </a>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[760px] text-left">
              <thead className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">기준 이름</th>
                  <th className="px-4 py-3">후보</th>
                  <th className="px-4 py-3">출처</th>
                  <th className="px-4 py-3">유사도</th>
                  <th className="px-4 py-3">관련 Matter</th>
                </tr>
              </thead>
              <tbody className="divide-y">{candidateRows(latestCheck)}</tbody>
            </table>
            {emptyStateFor(loadStatus)}
          </div>
        </div>

        <div className="grid gap-3 border-t pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <label className="grid gap-1.5 text-sm font-medium">
            판단 근거
            <textarea
              aria-label="이해상충 판단 근거"
              className="min-h-28 resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isBusy}
              maxLength={2000}
              value={rationale}
              onChange={(event) => onRationaleChange?.(event.target.value)}
            />
          </label>

          {actionError ? (
            <p className="text-sm font-medium text-destructive">{actionError}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canResolve}
              onClick={() => onResolve?.('cleared')}
            >
              해소 승인
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canResolve}
              onClick={() => onResolve?.('blocked')}
            >
              <Ban className="h-4 w-4" />
              수임 차단
            </Button>
          </div>

          {matter.status === 'proposed' ? (
            <Button type="button" disabled={!canOpenMatter} onClick={onOpenMatter}>
              Matter 열기
            </Button>
          ) : null}
          {openError ? <p className="text-sm font-medium text-destructive">{openError}</p> : null}
        </div>
      </div>
    </SectionCard>
  );
}

export function MatterConflictsPanel({
  matter,
  onMatterUpdated,
}: {
  matter: MatterDto;
  onMatterUpdated?: (matter: MatterDto) => void;
}) {
  const [checks, setChecks] = useState<ConflictCheckDto[]>([]);
  const [loadStatus, setLoadStatus] = useState<ConflictLoadStatus>('loading');
  const [rationale, setRationale] = useState('');
  const [actionState, setActionState] = useState<ConflictActionState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const refreshMatter = useCallback(async () => {
    const updated = await getMatter(matter.matterId);
    onMatterUpdated?.(updated);
  }, [matter.matterId, onMatterUpdated]);

  const refreshChecks = useCallback(() => {
    setLoadStatus('loading');
    listMatterConflictChecks(matter.matterId)
      .then((result) => {
        setChecks(result.items);
        setLoadStatus(result.items.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: unknown) => {
        setChecks([]);
        setLoadStatus(dataStateStatusForApiError(error));
      });
  }, [matter.matterId]);

  useEffect(() => {
    refreshChecks();
  }, [refreshChecks]);

  async function runCheck() {
    setActionState('running');
    setActionError(null);
    setOpenError(null);
    try {
      const check = await runMatterConflictCheck(matter.matterId);
      setChecks((current) => [
        check,
        ...current.filter((item) => item.conflictCheckId !== check.conflictCheckId),
      ]);
      setLoadStatus('ready');
      setRationale('');
      await refreshMatter();
      setActionState('idle');
    } catch {
      setActionState('error');
      setActionError('이해상충 검토를 실행하지 못했습니다.');
    }
  }

  async function resolve(status: ConflictResolutionStatus) {
    const check = latestConflictCheck(checks);
    const trimmed = rationale.trim();
    if (!check || trimmed.length === 0) return;

    setActionState('resolving');
    setActionError(null);
    setOpenError(null);
    try {
      const updated = await resolveMatterConflictCheck(matter.matterId, check.conflictCheckId, {
        status,
        rationale: trimmed,
      });
      setChecks((current) =>
        current.map((item) => (item.conflictCheckId === updated.conflictCheckId ? updated : item)),
      );
      setRationale('');
      await refreshMatter();
      setActionState('idle');
    } catch {
      setActionState('error');
      setActionError('판단 근거와 검토 상태를 확인해 주세요.');
    }
  }

  async function openMatter() {
    setActionState('opening');
    setActionError(null);
    setOpenError(null);
    try {
      const updated = await updateMatterStatus(matter.matterId, { status: 'open' });
      onMatterUpdated?.(updated);
      setActionState('idle');
    } catch (error: unknown) {
      setActionState('error');
      setOpenError(openMatterErrorMessage(error, matter.conflictsStatus));
    }
  }

  return (
    <MatterConflictsPanelView
      actionError={actionError}
      actionState={actionState}
      checks={checks}
      loadStatus={loadStatus}
      matter={matter}
      openError={openError}
      rationale={rationale}
      onOpenMatter={openMatter}
      onRationaleChange={setRationale}
      onRefresh={refreshChecks}
      onResolve={resolve}
      onRunCheck={runCheck}
    />
  );
}
