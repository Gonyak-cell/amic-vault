'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileArchive,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type {
  MatterClosingBinderDto,
  MatterClosingChecklistDto,
  MatterClosingChecklistItemCode,
  MatterClosingChecklistItemDto,
  MatterDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { maskInternalReference } from '@/components/security/secure-ref';
import {
  ApiClientError,
  evaluateMatterClosingChecklist,
  getMatterClosingBinder,
  getMatterClosingChecklist,
  matterClosingBinderManifestUrl,
  updateMatterStatus,
  waiveMatterClosingChecklistItem,
} from '@/lib/api-client';
import { dataStateStatusForApiError } from '@/lib/api/error-messages';
import type { DataState } from '@/lib/data-state';

type ClosingLoadStatus = DataState<MatterClosingChecklistItemDto[]>['status'];
type ClosingActionState = 'idle' | 'evaluating' | 'waiving' | 'status' | 'error';

interface MatterClosingChecklistPanelViewProps {
  actionError?: string | null;
  actionState: ClosingActionState;
  binder?: MatterClosingBinderDto | null;
  binderCsvHref?: string | undefined;
  binderJsonHref?: string | undefined;
  binderLoadStatus?: ClosingLoadStatus | undefined;
  checklist: MatterClosingChecklistDto | null;
  loadStatus: ClosingLoadStatus;
  matter: MatterDto;
  waiverReasons: Partial<Record<MatterClosingChecklistItemCode, string>>;
  onCloseMatter?: () => void;
  onEvaluate?: () => void;
  onPrepareClosing?: () => void;
  onWaive?: (itemCode: MatterClosingChecklistItemCode) => void;
  onWaiverReasonChange?: (itemCode: MatterClosingChecklistItemCode, value: string) => void;
}

const checklistItemLabels = {
  execution_copy_designated: '집행본 지정',
  official_final_version: '공식 최종본',
  legal_hold_clear: '활성 보존 제한 없음',
  external_links_clear: '활성 외부 링크 없음',
  issues_resolved: '열린 쟁점 없음',
} satisfies Record<MatterClosingChecklistItemCode, string>;

const checklistReasonLabels: Record<string, string> = {
  active_external_link: '활성 외부 링크가 남아 있습니다.',
  active_legal_hold: '활성 보존 제한이 남아 있습니다.',
  execution_copy_found: '집행본이 확인되었습니다.',
  execution_copy_missing: '집행본 지정이 필요합니다.',
  no_active_external_link: '활성 외부 링크가 없습니다.',
  no_active_legal_hold: '활성 보존 제한이 없습니다.',
  no_open_matter_issue: '열린 쟁점이 없습니다.',
  not_evaluated: '아직 평가되지 않았습니다.',
  official_final_found: '공식 최종본이 확인되었습니다.',
  official_final_missing: '공식 최종본이 필요합니다.',
  open_matter_issue: '열린 쟁점이 남아 있습니다.',
  waived_by_authorized_user: '승인된 예외 처리입니다.',
};

const checklistStatusLabels = {
  passed: '통과',
  pending: '대기',
  waived: '예외',
} satisfies Record<MatterClosingChecklistItemDto['status'], string>;

const checklistStatusTones = {
  passed: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  pending: 'border-amber-300 bg-amber-50 text-amber-800',
  waived: 'border-slate-300 bg-slate-50 text-slate-700',
} satisfies Record<MatterClosingChecklistItemDto['status'], string>;

const binderItemTypeLabels = {
  execution_copy: '체결본',
  final_version: '최종본',
  key_email: '핵심 이메일',
} satisfies Record<MatterClosingBinderDto['manifest']['items'][number]['itemType'], string>;

function closingErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.reason === 'CLOSING_CHECKLIST_INCOMPLETE') {
    return '대기 중인 체크리스트 항목이 있어 Matter를 닫을 수 없습니다.';
  }
  return '종결 체크리스트 작업을 완료하지 못했습니다.';
}

function checklistEmptyState(loadStatus: ClosingLoadStatus) {
  if (loadStatus === 'loading') {
    return <EmptyState variant="api-unavailable" title="종결 체크리스트를 불러오는 중입니다." />;
  }
  if (loadStatus === 'empty') {
    return <EmptyState title="종결 체크리스트가 아직 생성되지 않았습니다." />;
  }
  if (loadStatus === 'error') {
    return <EmptyState variant="api-error" title="종결 체크리스트를 표시할 수 없습니다." />;
  }
  if (loadStatus === 'forbidden') {
    return <EmptyState variant="no-access" title="종결 체크리스트를 볼 권한이 없습니다." />;
  }
  if (loadStatus === 'blocked') {
    return (
      <EmptyState
        variant="policy-blocked"
        title="권한 정책으로 종결 체크리스트가 차단되었습니다."
      />
    );
  }
  return null;
}

function binderEmptyState(loadStatus: ClosingLoadStatus | undefined) {
  if (loadStatus === 'loading') {
    return <EmptyState variant="api-unavailable" title="종결 문서철을 불러오는 중입니다." />;
  }
  if (loadStatus === 'error') {
    return <EmptyState variant="api-error" title="종결 문서철을 표시할 수 없습니다." />;
  }
  if (loadStatus === 'forbidden') {
    return <EmptyState variant="no-access" title="종결 문서철을 볼 권한이 없습니다." />;
  }
  if (loadStatus === 'blocked') {
    return (
      <EmptyState variant="policy-blocked" title="권한 정책으로 종결 문서철이 차단되었습니다." />
    );
  }
  return <EmptyState title="종결 문서철이 아직 생성되지 않았습니다." />;
}

function statusBadge(item: MatterClosingChecklistItemDto) {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold ${checklistStatusTones[item.status]}`}
    >
      {checklistStatusLabels[item.status]}
    </span>
  );
}

export function MatterClosingChecklistPanelView({
  actionError,
  actionState,
  binder,
  binderCsvHref,
  binderJsonHref,
  binderLoadStatus,
  checklist,
  loadStatus,
  matter,
  waiverReasons,
  onCloseMatter,
  onEvaluate,
  onPrepareClosing,
  onWaive,
  onWaiverReasonChange,
}: MatterClosingChecklistPanelViewProps) {
  const isBusy =
    actionState === 'evaluating' || actionState === 'waiving' || actionState === 'status';
  const hasItems = Boolean(checklist && checklist.items.length > 0);
  const canPrepareClosing = matter.status === 'active' && !isBusy;
  const canCloseMatter = matter.status === 'closing' && checklist?.complete === true && !isBusy;

  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title="종결 체크리스트"
      meta={checklist?.complete ? '닫기 가능' : '닫기 전 확인'}
      actions={
        <>
          {matter.status === 'active' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canPrepareClosing}
              onClick={onPrepareClosing}
            >
              <CheckCircle2 className="h-4 w-4" />
              종료 준비
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={onEvaluate}>
            <RefreshCw className="h-4 w-4" />
            재평가
          </Button>
          <Button type="button" size="sm" disabled={!canCloseMatter} onClick={onCloseMatter}>
            <CheckCircle2 className="h-4 w-4" />
            종료 확정
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {checklist?.complete ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          ) : (
            <CircleAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />
          )}
          <span>
            {checklist?.complete
              ? '모든 항목이 통과 또는 예외 처리되었습니다.'
              : '대기 항목은 해결하거나 사유를 남겨 예외 처리해야 합니다.'}
          </span>
        </div>

        {hasItems ? (
          <div className="grid gap-2">
            {checklist?.items.map((item) => {
              const reason = waiverReasons[item.itemCode] ?? '';
              const canWaive = !isBusy && reason.trim().length >= 8 && item.status !== 'passed';
              return (
                <div
                  key={item.checklistItemId}
                  className="grid gap-3 rounded-md border px-3 py-3 lg:grid-cols-[minmax(0,1fr)_280px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(item)}
                      <p className="text-sm font-semibold text-foreground">
                        {checklistItemLabels[item.itemCode]}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {checklistReasonLabels[item.reasonCode] ?? item.reasonCode}
                    </p>
                    {item.evidenceRef ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        근거: {maskInternalReference(item.evidenceRef)}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                      예외 사유
                      <input
                        className="h-10 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={isBusy || item.status === 'passed'}
                        maxLength={500}
                        value={reason}
                        onChange={(event) =>
                          onWaiverReasonChange?.(item.itemCode, event.target.value)
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canWaive}
                      onClick={() => onWaive?.(item.itemCode)}
                    >
                      예외 처리
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          checklistEmptyState(loadStatus)
        )}

        <div className="grid gap-3 border-t pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <FileArchive className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">종결 문서철</p>
                <p className="text-xs text-muted-foreground">
                  {binder
                    ? `${binder.manifest.items.length}개 항목 · 보관 ${binder.recordsArchiveCount}건`
                    : '종료 확정 후 생성'}
                </p>
              </div>
            </div>
            {binder ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <a href={binderJsonHref ?? '#'}>
                    <Download className="h-4 w-4" />
                    JSON
                  </a>
                </Button>
                <Button asChild type="button" variant="outline" size="sm">
                  <a href={binderCsvHref ?? '#'}>
                    <Download className="h-4 w-4" />
                    CSV
                  </a>
                </Button>
              </div>
            ) : null}
          </div>

          {binder ? (
            <div className="grid gap-2">
              {binder.manifest.items.map((item) => (
                <div
                  key={item.itemId}
                  className="grid gap-2 rounded-md border px-3 py-3 md:grid-cols-[140px_minmax(0,1fr)_180px]"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {binderItemTypeLabels[item.itemType]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.versionLabel ?? maskInternalReference(item.sourceRef)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    파일 해시 {maskInternalReference(item.sha256)}
                  </p>
                </div>
              ))}
              {binder.manifest.items.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  바인더 항목이 없습니다.
                </p>
              ) : null}
            </div>
          ) : (
            binderEmptyState(binderLoadStatus)
          )}
        </div>

        {actionError ? <p className="text-sm font-medium text-destructive">{actionError}</p> : null}
      </div>
    </SectionCard>
  );
}

export function MatterClosingChecklistPanel({
  matter,
  onMatterUpdated,
}: {
  matter: MatterDto;
  onMatterUpdated?: (matter: MatterDto) => void;
}) {
  const [checklist, setChecklist] = useState<MatterClosingChecklistDto | null>(null);
  const [binder, setBinder] = useState<MatterClosingBinderDto | null>(null);
  const [loadStatus, setLoadStatus] = useState<ClosingLoadStatus>('loading');
  const [binderLoadStatus, setBinderLoadStatus] = useState<ClosingLoadStatus>('loading');
  const [actionState, setActionState] = useState<ClosingActionState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [waiverReasons, setWaiverReasons] = useState<
    Partial<Record<MatterClosingChecklistItemCode, string>>
  >({});

  const refreshChecklist = useCallback(() => {
    setLoadStatus('loading');
    getMatterClosingChecklist(matter.matterId)
      .then((result) => {
        setChecklist(result);
        setLoadStatus(result.items.length === 0 ? 'empty' : 'ready');
      })
      .catch((caught: unknown) => {
        setChecklist(null);
        setLoadStatus(dataStateStatusForApiError(caught));
      });
  }, [matter.matterId]);

  useEffect(() => {
    refreshChecklist();
  }, [refreshChecklist]);

  const refreshBinder = useCallback(async () => {
    setBinderLoadStatus('loading');
    try {
      const result = await getMatterClosingBinder(matter.matterId);
      setBinder(result.binder);
      setBinderLoadStatus(result.binder ? 'ready' : 'empty');
    } catch (caught) {
      setBinder(null);
      setBinderLoadStatus(dataStateStatusForApiError(caught));
    }
  }, [matter.matterId]);

  useEffect(() => {
    void refreshBinder();
  }, [refreshBinder]);

  async function evaluateChecklist() {
    setActionState('evaluating');
    setActionError(null);
    try {
      const result = await evaluateMatterClosingChecklist(matter.matterId);
      setChecklist(result);
      setLoadStatus(result.items.length === 0 ? 'empty' : 'ready');
      setActionState('idle');
    } catch (caught) {
      setActionState('error');
      setActionError(closingErrorMessage(caught));
    }
  }

  async function prepareClosing() {
    setActionState('status');
    setActionError(null);
    try {
      const updated = await updateMatterStatus(matter.matterId, { status: 'closing' });
      onMatterUpdated?.(updated);
      const result = await evaluateMatterClosingChecklist(matter.matterId);
      setChecklist(result);
      setLoadStatus(result.items.length === 0 ? 'empty' : 'ready');
      setActionState('idle');
    } catch (caught) {
      setActionState('error');
      setActionError(closingErrorMessage(caught));
    }
  }

  async function closeMatter() {
    setActionState('status');
    setActionError(null);
    try {
      const updated = await updateMatterStatus(matter.matterId, { status: 'closed' });
      onMatterUpdated?.(updated);
      await refreshBinder();
      setActionState('idle');
    } catch (caught) {
      setActionState('error');
      setActionError(closingErrorMessage(caught));
      const result = await evaluateMatterClosingChecklist(matter.matterId).catch(() => null);
      if (result) {
        setChecklist(result);
        setLoadStatus(result.items.length === 0 ? 'empty' : 'ready');
      }
    }
  }

  async function waiveItem(itemCode: MatterClosingChecklistItemCode) {
    const reason = waiverReasons[itemCode]?.trim() ?? '';
    if (reason.length < 8) return;
    setActionState('waiving');
    setActionError(null);
    try {
      const result = await waiveMatterClosingChecklistItem(matter.matterId, itemCode, { reason });
      setChecklist(result);
      setLoadStatus(result.items.length === 0 ? 'empty' : 'ready');
      setWaiverReasons((current) => ({ ...current, [itemCode]: '' }));
      setActionState('idle');
    } catch (caught) {
      setActionState('error');
      setActionError(closingErrorMessage(caught));
    }
  }

  function updateWaiverReason(itemCode: MatterClosingChecklistItemCode, value: string) {
    setWaiverReasons((current) => ({ ...current, [itemCode]: value }));
  }

  return (
    <MatterClosingChecklistPanelView
      actionError={actionError}
      actionState={actionState}
      binder={binder}
      binderCsvHref={binder ? matterClosingBinderManifestUrl(matter.matterId, 'csv') : undefined}
      binderJsonHref={binder ? matterClosingBinderManifestUrl(matter.matterId, 'json') : undefined}
      binderLoadStatus={binderLoadStatus}
      checklist={checklist}
      loadStatus={loadStatus}
      matter={matter}
      waiverReasons={waiverReasons}
      onCloseMatter={() => void closeMatter()}
      onEvaluate={() => void evaluateChecklist()}
      onPrepareClosing={() => void prepareClosing()}
      onWaive={(itemCode) => void waiveItem(itemCode)}
      onWaiverReasonChange={updateWaiverReason}
    />
  );
}
