'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Landmark, Save } from 'lucide-react';
import {
  createPartySchema,
  partyRoles,
  partyTypes,
  updatePartySchema,
  type CreatePartyDto,
  type MatterDto,
  type PartyDto,
  type PartyRole,
  type PartyType,
  type UpdatePartyDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { dataStateStatusForApiError } from '@/lib/api/error-messages';
import type { DataState } from '@/lib/data-state';
import { createMatterParty, listMatterParties, updateParty } from '@/lib/api-client';

type PartyLoadStatus = DataState<PartyDto[]>['status'];
type SubmitState = 'idle' | 'submitting' | 'invalid' | 'error';
type RestrictionState = 'idle' | 'updating' | 'error';

export interface NewPartyFormState {
  name: string;
  partyRole: PartyRole;
  partyType: PartyType;
}

export interface EditPartyFormState extends NewPartyFormState {
  partyId: string;
}

interface MatterPartyPanelViewProps {
  editForm?: EditPartyFormState | null;
  editState?: SubmitState;
  form: NewPartyFormState;
  loadStatus: PartyLoadStatus;
  matterStatus: string;
  parties: PartyDto[];
  restrictionState?: Record<string, RestrictionState>;
  editError?: string | null;
  submitError?: string | null;
  submitState: SubmitState;
  onCancelEdit?: () => void;
  onEditFormChange?: (form: EditPartyFormState) => void;
  onEditSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange?: (form: NewPartyFormState) => void;
  onRefresh?: () => void;
  onRestrictionChange?: (party: PartyDto, isRestricted: boolean) => void;
  onStartEdit?: (party: PartyDto) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

const closedMatterStatuses = new Set(['closed', 'archived', 'disposal_review', 'disposed']);

const initialForm: NewPartyFormState = {
  name: '',
  partyRole: 'counterparty',
  partyType: 'corporation',
};

const partyRoleLabels = {
  borrower: '차주',
  client: '고객',
  co_counsel: '공동대리인',
  counterparty: '상대방',
  guarantor: '보증인',
  investor: '투자자',
  lender: '대주',
  opposing_counsel: '상대방 대리인',
  other: '기타',
  target: '대상회사',
  witness: '증인',
} satisfies Record<PartyRole, string>;

const partyTypeLabels = {
  corporation: '법인',
  government: '공공기관',
  individual: '개인',
  other: '기타',
} satisfies Record<PartyType, string>;

export function buildCreatePartyInput(form: NewPartyFormState): CreatePartyDto {
  return createPartySchema.parse({
    name: form.name,
    partyRole: form.partyRole,
    partyType: form.partyType,
  });
}

export function buildUpdatePartyInput(form: EditPartyFormState): UpdatePartyDto {
  return updatePartySchema.parse({
    name: form.name,
    partyRole: form.partyRole,
    partyType: form.partyType,
  });
}

function editFormFromParty(party: PartyDto): EditPartyFormState {
  return {
    name: party.name,
    partyId: party.partyId,
    partyRole: party.partyRole as PartyRole,
    partyType: party.partyType as PartyType,
  };
}

function isMatterClosedForParties(status: string): boolean {
  return closedMatterStatuses.has(status);
}

function visiblePartyName(party: PartyDto): string {
  return party.isRestricted ? '제한 당사자' : party.name;
}

function emptyStateFor(loadStatus: PartyLoadStatus) {
  if (loadStatus === 'loading') {
    return (
      <EmptyState
        variant="api-unavailable"
        title="당사자 목록을 불러오는 중입니다."
        className="m-5"
      />
    );
  }
  if (loadStatus === 'empty') {
    return <EmptyState title="등록된 당사자가 없습니다." className="m-5" />;
  }
  if (loadStatus === 'error') {
    return <EmptyState variant="api-error" title="당사자를 표시할 수 없습니다." className="m-5" />;
  }
  if (loadStatus === 'forbidden') {
    return <EmptyState variant="no-access" title="당사자를 볼 권한이 없습니다." className="m-5" />;
  }
  if (loadStatus === 'blocked') {
    return (
      <EmptyState
        variant="policy-blocked"
        title="권한 정책으로 당사자를 표시할 수 없습니다."
        className="m-5"
      />
    );
  }
  return null;
}

export function MatterPartyPanelView({
  editForm = null,
  editState = 'idle',
  form,
  loadStatus,
  matterStatus,
  parties,
  restrictionState = {},
  editError,
  submitError,
  submitState,
  onCancelEdit,
  onEditFormChange,
  onEditSubmit,
  onFormChange,
  onRefresh,
  onRestrictionChange,
  onStartEdit,
  onSubmit,
}: MatterPartyPanelViewProps) {
  const mutationBlocked = isMatterClosedForParties(matterStatus);
  const submitting = submitState === 'submitting';
  const editing = editState === 'submitting';
  const submitDisabled = mutationBlocked || submitting || form.name.trim().length === 0;
  const editDisabled = mutationBlocked || editing || !editForm || editForm.name.trim().length === 0;

  return (
    <SectionCard
      icon={<Landmark className="h-4 w-4" />}
      title="당사자"
      meta="상대방·관계자"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          새로고침
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-x-auto rounded-md border">
          <div className="min-w-[740px]">
            <div className="grid min-h-12 grid-cols-[minmax(180px,1fr)_110px_90px_72px_172px] items-center gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              <span>당사자</span>
              <span>역할</span>
              <span>유형</span>
              <span>제한</span>
              <span>관리</span>
            </div>
            {parties.map((party) => {
              const restrictionStatus = restrictionState[party.partyId] ?? 'idle';
              const updatingRestriction = restrictionStatus === 'updating';
              const nextRestricted = !party.isRestricted;

              return (
                <div
                  key={party.partyId}
                  className="grid min-h-14 grid-cols-[minmax(180px,1fr)_110px_90px_72px_172px] items-center gap-4 border-b px-4 py-3 text-sm last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{visiblePartyName(party)}</p>
                    {party.isRestricted ? (
                      <p className="truncate text-xs text-muted-foreground">이름 비공개</p>
                    ) : null}
                  </div>
                  <span className="truncate text-muted-foreground">
                    {partyRoleLabels[party.partyRole as PartyRole] ?? party.partyRole}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {partyTypeLabels[party.partyType as PartyType] ?? party.partyType}
                  </span>
                  <span className="inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground">
                    {party.isRestricted ? '제한' : '일반'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mutationBlocked || party.isRestricted || !onStartEdit}
                      onClick={() => onStartEdit?.(party)}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mutationBlocked || updatingRestriction || !onRestrictionChange}
                      onClick={() => onRestrictionChange?.(party, nextRestricted)}
                    >
                      {updatingRestriction ? '변경 중' : nextRestricted ? '제한 표시' : '제한 해제'}
                    </Button>
                    {restrictionStatus === 'error' ? (
                      <p className="basis-full text-xs font-medium text-destructive">변경 실패</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {emptyStateFor(loadStatus)}
        </div>

        {editForm ? (
          <form
            className="grid gap-3 border-t pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"
            onSubmit={onEditSubmit}
          >
            <div>
              <h3 className="text-sm font-semibold">당사자 수정</h3>
              {mutationBlocked ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  종료된 Matter에서는 추가·제한 변경을 할 수 없습니다.
                </p>
              ) : null}
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              이름
              <Input
                aria-label="수정할 당사자 이름"
                autoComplete="off"
                disabled={mutationBlocked || editing}
                maxLength={1000}
                value={editForm.name}
                onChange={(event) => onEditFormChange?.({ ...editForm, name: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              역할
              <select
                aria-label="수정할 당사자 역할"
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={mutationBlocked || editing}
                value={editForm.partyRole}
                onChange={(event) =>
                  onEditFormChange?.({
                    ...editForm,
                    partyRole: event.target.value as PartyRole,
                  })
                }
              >
                {partyRoles.map((role) => (
                  <option key={role} value={role}>
                    {partyRoleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              유형
              <select
                aria-label="수정할 당사자 유형"
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={mutationBlocked || editing}
                value={editForm.partyType}
                onChange={(event) =>
                  onEditFormChange?.({
                    ...editForm,
                    partyType: event.target.value as PartyType,
                  })
                }
              >
                {partyTypes.map((type) => (
                  <option key={type} value={type}>
                    {partyTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            {editError ? <p className="text-sm font-medium text-destructive">{editError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={editDisabled}>
                <Save className="h-4 w-4" />
                수정 저장
              </Button>
              <Button type="button" variant="outline" disabled={editing} onClick={onCancelEdit}>
                취소
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="grid gap-3 border-t pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"
            onSubmit={onSubmit}
          >
            <div>
              <h3 className="text-sm font-semibold">당사자 추가</h3>
              {mutationBlocked ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  종료된 Matter에서는 추가·제한 변경을 할 수 없습니다.
                </p>
              ) : null}
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              이름
              <Input
                aria-label="당사자 이름"
                autoComplete="off"
                disabled={mutationBlocked || submitting}
                maxLength={1000}
                value={form.name}
                onChange={(event) => onFormChange?.({ ...form, name: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              역할
              <select
                aria-label="당사자 역할"
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={mutationBlocked || submitting}
                value={form.partyRole}
                onChange={(event) =>
                  onFormChange?.({ ...form, partyRole: event.target.value as PartyRole })
                }
              >
                {partyRoles.map((role) => (
                  <option key={role} value={role}>
                    {partyRoleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              유형
              <select
                aria-label="당사자 유형"
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={mutationBlocked || submitting}
                value={form.partyType}
                onChange={(event) =>
                  onFormChange?.({ ...form, partyType: event.target.value as PartyType })
                }
              >
                {partyTypes.map((type) => (
                  <option key={type} value={type}>
                    {partyTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            {submitError ? (
              <p className="text-sm font-medium text-destructive">{submitError}</p>
            ) : null}
            <Button type="submit" disabled={submitDisabled}>
              <Save className="h-4 w-4" />
              당사자 추가
            </Button>
          </form>
        )}
      </div>
    </SectionCard>
  );
}

function submitErrorMessage(submitState: SubmitState): string | null {
  if (submitState === 'invalid') return '당사자 이름과 입력값을 확인해 주세요.';
  if (submitState === 'error') return '당사자를 추가하지 못했습니다.';
  return null;
}

function editErrorMessage(editState: SubmitState): string | null {
  if (editState === 'invalid') return '수정할 당사자 이름과 입력값을 확인해 주세요.';
  if (editState === 'error') return '당사자를 수정하지 못했습니다.';
  return null;
}

export function MatterPartyPanel({ matter }: { matter: MatterDto }) {
  const [parties, setParties] = useState<PartyDto[]>([]);
  const [loadStatus, setLoadStatus] = useState<PartyLoadStatus>('loading');
  const [form, setForm] = useState<NewPartyFormState>(initialForm);
  const [editForm, setEditForm] = useState<EditPartyFormState | null>(null);
  const [editState, setEditState] = useState<SubmitState>('idle');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [restrictionState, setRestrictionState] = useState<Record<string, RestrictionState>>({});

  const refreshParties = useCallback(() => {
    setLoadStatus('loading');
    listMatterParties(matter.matterId)
      .then((result) => {
        setParties(result.items);
        setLoadStatus(result.items.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: unknown) => {
        setParties([]);
        setLoadStatus(dataStateStatusForApiError(error));
      });
  }, [matter.matterId]);

  useEffect(() => {
    refreshParties();
  }, [refreshParties]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let input: CreatePartyDto;
    try {
      input = buildCreatePartyInput(form);
    } catch {
      setSubmitState('invalid');
      return;
    }
    setSubmitState('submitting');
    try {
      const party = await createMatterParty(matter.matterId, input);
      setParties((current) => [...current.filter((item) => item.partyId !== party.partyId), party]);
      setLoadStatus('ready');
      setForm(initialForm);
      setSubmitState('idle');
    } catch {
      setSubmitState('error');
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm) return;
    let input: UpdatePartyDto;
    try {
      input = buildUpdatePartyInput(editForm);
    } catch {
      setEditState('invalid');
      return;
    }
    setEditState('submitting');
    try {
      const updated = await updateParty(editForm.partyId, input);
      setParties((current) =>
        current.map((item) => (item.partyId === updated.partyId ? updated : item)),
      );
      setEditForm(null);
      setEditState('idle');
    } catch {
      setEditState('error');
    }
  }

  async function changeRestriction(party: PartyDto, isRestricted: boolean) {
    setRestrictionState((current) => ({ ...current, [party.partyId]: 'updating' }));
    try {
      const updated = await updateParty(party.partyId, { isRestricted });
      setParties((current) =>
        current.map((item) => (item.partyId === updated.partyId ? updated : item)),
      );
      setRestrictionState((current) => ({ ...current, [party.partyId]: 'idle' }));
    } catch {
      setRestrictionState((current) => ({ ...current, [party.partyId]: 'error' }));
    }
  }

  return (
    <MatterPartyPanelView
      editError={editErrorMessage(editState)}
      editForm={editForm}
      editState={editState}
      form={form}
      loadStatus={loadStatus}
      matterStatus={matter.status}
      parties={parties}
      restrictionState={restrictionState}
      submitError={submitErrorMessage(submitState)}
      submitState={submitState}
      onCancelEdit={() => {
        setEditForm(null);
        setEditState('idle');
      }}
      onEditFormChange={setEditForm}
      onEditSubmit={saveEdit}
      onFormChange={setForm}
      onRefresh={refreshParties}
      onRestrictionChange={changeRestriction}
      onStartEdit={(party) => {
        if (party.isRestricted) return;
        setEditForm(editFormFromParty(party));
        setEditState('idle');
      }}
      onSubmit={submit}
    />
  );
}
