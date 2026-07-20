'use client';

import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, Plus, XCircle } from 'lucide-react';
import type {
  CreateLitigationHearingRequestDto,
  LitigationHearingDto,
  LitigationHearingStatus,
  LitigationHearingType,
  UpdateLitigationHearingRequestDto,
} from '@amic-vault/shared';
import {
  createLitigationHearingRequestSchema,
  updateLitigationHearingRequestSchema,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import {
  cancelLitigationHearing,
  createLitigationHearing,
  updateLitigationHearing,
} from '@/lib/api/litigation';

const hearingTypeLabels = {
  hearing: '기일',
  deadline: '마감',
  trial: '변론',
  mediation: '조정',
  conference: '협의',
  other: '기타',
} as const satisfies Record<LitigationHearingType, string>;

const statusLabels = {
  scheduled: '예정',
  completed: '완료',
  cancelled: '취소',
} as const satisfies Record<LitigationHearingStatus, string>;

export interface HearingFormState {
  courtName: string;
  hearingType: LitigationHearingType;
  internalDeadline: string;
  location: string;
  scheduledAt: string;
  title: string;
}

export function buildHearingInput(
  matterId: string,
  state: HearingFormState,
): CreateLitigationHearingRequestDto {
  return createLitigationHearingRequestSchema.parse({
    matterId,
    title: state.title.trim(),
    hearingType: state.hearingType,
    scheduledAt: localDateTimeToIso(state.scheduledAt),
    courtName: state.courtName.trim() || undefined,
    location: state.location.trim() || undefined,
    internalDeadline: state.internalDeadline || undefined,
  });
}

export async function submitHearingRegistration(input: {
  createHearing?: (body: CreateLitigationHearingRequestDto) => Promise<LitigationHearingDto>;
  matterId: string;
  onSubmitted?: (hearing: LitigationHearingDto) => void | Promise<void>;
  state: HearingFormState;
}): Promise<LitigationHearingDto> {
  const body = buildHearingInput(input.matterId, input.state);
  const hearing = await (input.createHearing ?? createLitigationHearing)(body);
  await input.onSubmitted?.(hearing);
  return hearing;
}

export async function submitHearingStatus(input: {
  hearing: LitigationHearingDto;
  onSubmitted?: (hearing: LitigationHearingDto) => void | Promise<void>;
  status: Exclude<LitigationHearingStatus, 'cancelled'>;
  updateHearing?: (
    hearingId: string,
    body: UpdateLitigationHearingRequestDto,
  ) => Promise<LitigationHearingDto>;
}): Promise<LitigationHearingDto> {
  const body = updateLitigationHearingRequestSchema.parse({ status: input.status });
  const hearing = await (input.updateHearing ?? updateLitigationHearing)(
    input.hearing.hearingId,
    body,
  );
  await input.onSubmitted?.(hearing);
  return hearing;
}

export function HearingList({
  hearings,
  matterId,
  onChanged,
}: {
  hearings: LitigationHearingDto[];
  matterId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<HearingFormState>(() => emptyState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitHearingRegistration({
        matterId,
        state,
        onSubmitted: async () => {
          await onChanged();
          setState(emptyState());
        },
      });
    } catch {
      setError('기일을 등록할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(
    hearing: LitigationHearingDto,
    status: Exclude<LitigationHearingStatus, 'cancelled'>,
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitHearingStatus({ hearing, status, onSubmitted: onChanged });
    } catch {
      setError('기일 상태를 변경할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(hearing: LitigationHearingDto) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelLitigationHearing(hearing.hearingId);
      await onChanged();
    } catch {
      setError('기일을 취소할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-md border p-4">
      <h2 className="text-base font-semibold">기일 관리</h2>
      <form className="grid gap-3 lg:grid-cols-[1fr_128px_196px_140px_auto]" onSubmit={submit}>
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.title}
          disabled={busy}
          placeholder="준비서면 제출기한"
          aria-label="기일 제목"
          onChange={(event) => setState((current) => ({ ...current, title: event.target.value }))}
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.hearingType}
          disabled={busy}
          aria-label="기일 유형"
          onChange={(event) =>
            setState((current) => ({
              ...current,
              hearingType: event.target.value as LitigationHearingType,
            }))
          }
        >
          {Object.entries(hearingTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="datetime-local"
          value={state.scheduledAt}
          disabled={busy}
          aria-label="기일 일시"
          onChange={(event) =>
            setState((current) => ({ ...current, scheduledAt: event.target.value }))
          }
        />
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="date"
          value={state.internalDeadline}
          disabled={busy}
          aria-label="내부 마감"
          onChange={(event) =>
            setState((current) => ({ ...current, internalDeadline: event.target.value }))
          }
        />
        <Button type="submit" size="sm" disabled={!state.title.trim() || !state.scheduledAt || busy}>
          <Plus className="h-4 w-4" />
          등록
        </Button>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.courtName}
          disabled={busy}
          placeholder="법원"
          aria-label="법원"
          onChange={(event) =>
            setState((current) => ({ ...current, courtName: event.target.value }))
          }
        />
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.location}
          disabled={busy}
          placeholder="장소"
          aria-label="장소"
          onChange={(event) =>
            setState((current) => ({ ...current, location: event.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        {hearings.map((hearing) => (
          <div
            key={hearing.hearingId}
            className="flex flex-col gap-3 rounded-md border px-3 py-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border px-2 py-1 text-xs font-semibold">
                  {statusLabels[hearing.status]}
                </span>
                <span className="truncate text-sm font-semibold">{hearing.title}</span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {hearingTypeLabels[hearing.hearingType]} · {formatDateTime(hearing.scheduledAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hearing.status !== 'completed' && hearing.status !== 'cancelled' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void updateStatus(hearing, 'completed')}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  완료
                </Button>
              ) : null}
              {hearing.status !== 'scheduled' && hearing.status !== 'cancelled' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void updateStatus(hearing, 'scheduled')}
                >
                  <CalendarClock className="h-4 w-4" />
                  예정
                </Button>
              ) : null}
              {hearing.status !== 'cancelled' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void cancel(hearing)}
                >
                  <XCircle className="h-4 w-4" />
                  취소
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {hearings.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            등록된 기일이 없습니다.
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function emptyState(): HearingFormState {
  return {
    courtName: '',
    hearingType: 'hearing',
    internalDeadline: '',
    location: '',
    scheduledAt: '',
    title: '',
  };
}

function localDateTimeToIso(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toISOString();
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
