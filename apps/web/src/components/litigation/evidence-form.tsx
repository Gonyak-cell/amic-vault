'use client';

import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type {
  CreateLitigationEvidenceRequestDto,
  LitigationEvidenceDirection,
  LitigationEvidenceDto,
  LitigationEvidenceNextCodeResponseDto,
  LitigationEvidenceType,
} from '@amic-vault/shared';
import { createLitigationEvidenceRequestSchema } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { MatterDocumentPicker } from '@/components/document/matter-document-picker';
import { createLitigationEvidence, getLitigationEvidenceNextCode } from '@/lib/api/litigation';

const directionLabels = {
  gap: '갑',
  eul: '을',
} as const satisfies Record<LitigationEvidenceDirection, string>;

const evidenceTypeLabels = {
  document: '문서',
  email: '이메일',
  testimony: '진술',
  exhibit: '첨부',
  expert: '전문가',
  other: '기타',
} as const satisfies Record<LitigationEvidenceType, string>;

export interface EvidenceFormState {
  documentId: string;
  direction: LitigationEvidenceDirection;
  evidenceCode: string;
  evidenceSequence: string;
  evidenceType: LitigationEvidenceType;
  exhibitLabel: string;
}

export function buildEvidenceInput(
  matterId: string,
  state: EvidenceFormState,
): CreateLitigationEvidenceRequestDto {
  return createLitigationEvidenceRequestSchema.parse({
    matterId,
    documentId: state.documentId.trim() || undefined,
    evidenceCode: state.evidenceCode.trim(),
    evidenceDirection: state.direction,
    evidenceSequence: state.evidenceSequence ? Number(state.evidenceSequence) : undefined,
    evidenceType: state.evidenceType,
    exhibitLabel: state.exhibitLabel.trim() || undefined,
  });
}

export async function submitEvidenceRegistration(input: {
  createEvidence?: (body: CreateLitigationEvidenceRequestDto) => Promise<LitigationEvidenceDto>;
  matterId: string;
  onSubmitted?: (evidence: LitigationEvidenceDto) => void | Promise<void>;
  state: EvidenceFormState;
}): Promise<LitigationEvidenceDto> {
  const body = buildEvidenceInput(input.matterId, input.state);
  const evidence = await (input.createEvidence ?? createLitigationEvidence)(body);
  await input.onSubmitted?.(evidence);
  return evidence;
}

export function EvidenceForm({
  matterId,
  onChanged,
}: {
  matterId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<EvidenceFormState>(() => emptyState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function applyNextCode(direction = state.direction) {
    setError(null);
    try {
      const next = await getLitigationEvidenceNextCode({ matterId, direction });
      setState((current) => applySuggestion(current, next));
    } catch {
      setError('증거번호를 계산할 수 없습니다.');
    }
  }

  useEffect(() => {
    let active = true;
    getLitigationEvidenceNextCode({ matterId, direction: state.direction })
      .then((next) => {
        if (active) setState((current) => applySuggestion(current, next));
      })
      .catch(() => {
        if (active) setError('증거번호를 계산할 수 없습니다.');
      });
    return () => {
      active = false;
    };
  }, [matterId, state.direction]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitEvidenceRegistration({
        matterId,
        state,
        onSubmitted: async () => {
          await onChanged();
          setState(emptyState(state.direction));
          await applyNextCode(state.direction);
        },
      });
    } catch {
      setError('증거를 등록할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">증거 등록</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          title="증거번호 다시 계산"
          aria-label="증거번호 다시 계산"
          onClick={() => void applyNextCode()}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <form className="grid gap-3 md:grid-cols-[96px_140px_140px_1fr_auto]" onSubmit={submit}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.direction}
          disabled={busy}
          aria-label="증거 방향"
          onChange={(event) =>
            setState((current) => ({
              ...current,
              direction: event.target.value as LitigationEvidenceDirection,
            }))
          }
        >
          {Object.entries(directionLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.evidenceCode}
          disabled={busy}
          placeholder="GAP-001"
          aria-label="증거 코드"
          onChange={(event) =>
            setState((current) => ({ ...current, evidenceCode: event.target.value }))
          }
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.evidenceType}
          disabled={busy}
          aria-label="증거 유형"
          onChange={(event) =>
            setState((current) => ({
              ...current,
              evidenceType: event.target.value as LitigationEvidenceType,
            }))
          }
        >
          {Object.entries(evidenceTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.exhibitLabel}
          disabled={busy}
          placeholder="갑 제1호증"
          aria-label="증거 표시명"
          onChange={(event) =>
            setState((current) => ({ ...current, exhibitLabel: event.target.value }))
          }
        />
        <Button type="submit" size="sm" disabled={!state.evidenceCode.trim() || busy}>
          <Plus className="h-4 w-4" />
          등록
        </Button>
      </form>
      <MatterDocumentPicker
        disabled={busy}
        matterId={matterId}
        onDocumentSelected={(document) =>
          setState((current) => ({ ...current, documentId: document.documentId }))
        }
        selectedDocumentId={state.documentId}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function emptyState(direction: LitigationEvidenceDirection = 'gap'): EvidenceFormState {
  return {
    documentId: '',
    direction,
    evidenceCode: '',
    evidenceSequence: '',
    evidenceType: 'document',
    exhibitLabel: '',
  };
}

function applySuggestion(
  state: EvidenceFormState,
  next: LitigationEvidenceNextCodeResponseDto,
): EvidenceFormState {
  return {
    ...state,
    direction: next.direction,
    evidenceCode: next.evidenceCode,
    evidenceSequence: String(next.nextSequence),
    exhibitLabel: next.exhibitLabel,
  };
}
