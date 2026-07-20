'use client';

import React, { useState } from 'react';
import { CheckCircle2, FileText, Plus, XCircle } from 'lucide-react';
import type {
  CreateLitigationFactRequestDto,
  LitigationEvidenceDto,
  LitigationFactDto,
  LitigationFactStatus,
  LitigationMateriality,
  UpdateLitigationFactRequestDto,
} from '@amic-vault/shared';
import {
  createLitigationFactRequestSchema,
  updateLitigationFactRequestSchema,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { createLitigationFact, updateLitigationFact } from '@/lib/api/litigation';

const statusLabels = {
  draft: '초안',
  verified: '검증',
  disputed: '다툼',
  withdrawn: '철회',
} as const satisfies Record<LitigationFactStatus, string>;

const materialityLabels = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '중요',
} as const satisfies Record<LitigationMateriality, string>;

export interface FactLedgerFormState {
  citationRefs: string;
  evidenceId: string;
  factCode: string;
  factSummary: string;
  materiality: LitigationMateriality;
}

export function buildFactInput(
  matterId: string,
  state: FactLedgerFormState,
): CreateLitigationFactRequestDto {
  return createLitigationFactRequestSchema.parse({
    matterId,
    evidenceId: state.evidenceId || undefined,
    factCode: state.factCode.trim(),
    factSummary: state.factSummary.trim(),
    materiality: state.materiality,
    status: 'draft',
    citationRefs: splitRefs(state.citationRefs),
  });
}

export function allowedFactTransitions(fact: LitigationFactDto): LitigationFactStatus[] {
  if (fact.status === 'withdrawn') return [];
  const next: LitigationFactStatus[] = [];
  if (fact.status !== 'verified' && fact.citationRefs.length > 0) next.push('verified');
  if (fact.status !== 'disputed') next.push('disputed');
  next.push('withdrawn');
  return next.filter((status) => status !== fact.status);
}

export async function submitFactRegistration(input: {
  createFact?: (body: CreateLitigationFactRequestDto) => Promise<LitigationFactDto>;
  matterId: string;
  onSubmitted?: (fact: LitigationFactDto) => void | Promise<void>;
  state: FactLedgerFormState;
}): Promise<LitigationFactDto> {
  const body = buildFactInput(input.matterId, input.state);
  const fact = await (input.createFact ?? createLitigationFact)(body);
  await input.onSubmitted?.(fact);
  return fact;
}

export async function submitFactTransition(input: {
  fact: LitigationFactDto;
  onSubmitted?: (fact: LitigationFactDto) => void | Promise<void>;
  status: LitigationFactStatus;
  updateFact?: (factId: string, body: UpdateLitigationFactRequestDto) => Promise<LitigationFactDto>;
}): Promise<LitigationFactDto> {
  const body = updateLitigationFactRequestSchema.parse({ status: input.status });
  const fact = await (input.updateFact ?? updateLitigationFact)(input.fact.factId, body);
  await input.onSubmitted?.(fact);
  return fact;
}

export function FactLedgerForm({
  evidence,
  facts,
  matterId,
  onChanged,
}: {
  evidence: LitigationEvidenceDto[];
  facts: LitigationFactDto[];
  matterId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<FactLedgerFormState>(() => emptyState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitFactRegistration({
        matterId,
        state,
        onSubmitted: async () => {
          await onChanged();
          setState(emptyState());
        },
      });
    } catch {
      setError('Fact를 등록할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function transition(fact: LitigationFactDto, status: LitigationFactStatus) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitFactTransition({
        fact,
        status,
        onSubmitted: onChanged,
      });
    } catch {
      setError('Fact 상태를 변경할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-md border p-4">
      <h2 className="text-base font-semibold">Fact Ledger</h2>
      <form className="grid gap-3 lg:grid-cols-[132px_1fr_148px_148px_auto]" onSubmit={submit}>
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.factCode}
          disabled={busy}
          placeholder="FACT-001"
          aria-label="Fact 코드"
          onChange={(event) =>
            setState((current) => ({ ...current, factCode: event.target.value }))
          }
        />
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.factSummary}
          disabled={busy}
          placeholder="사실 요지"
          aria-label="사실 요지"
          onChange={(event) =>
            setState((current) => ({ ...current, factSummary: event.target.value }))
          }
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.evidenceId}
          disabled={busy}
          aria-label="연결 증거"
          onChange={(event) =>
            setState((current) => ({ ...current, evidenceId: event.target.value }))
          }
        >
          <option value="">증거 없음</option>
          {evidence.map((item) => (
            <option key={item.evidenceId} value={item.evidenceId}>
              {item.exhibitLabel ?? item.evidenceCode}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={state.materiality}
          disabled={busy}
          aria-label="중요도"
          onChange={(event) =>
            setState((current) => ({
              ...current,
              materiality: event.target.value as LitigationMateriality,
            }))
          }
        >
          {Object.entries(materialityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          size="sm"
          disabled={!state.factCode.trim() || !state.factSummary.trim() || busy}
        >
          <Plus className="h-4 w-4" />
          등록
        </Button>
      </form>
      <input
        className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={state.citationRefs}
        disabled={busy}
        placeholder="evidence:EV-001"
        aria-label="인용 참조"
        onChange={(event) =>
          setState((current) => ({ ...current, citationRefs: event.target.value }))
        }
      />
      <div className="grid gap-2">
        {facts.map((fact) => (
          <div
            key={fact.factId}
            className="flex flex-col gap-3 rounded-md border px-3 py-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border px-2 py-1 text-xs font-semibold">
                  {statusLabels[fact.status]}
                </span>
                <span className="truncate text-sm font-semibold">{fact.factCode}</span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{fact.factSummary}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {allowedFactTransitions(fact).map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void transition(fact, status)}
                >
                  {transitionIcon(status)}
                  {statusLabels[status]}
                </Button>
              ))}
            </div>
          </div>
        ))}
        {facts.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            등록된 Fact가 없습니다.
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function emptyState(): FactLedgerFormState {
  return {
    citationRefs: '',
    evidenceId: '',
    factCode: '',
    factSummary: '',
    materiality: 'medium',
  };
}

function splitRefs(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function transitionIcon(status: LitigationFactStatus): React.ReactNode {
  if (status === 'verified') return <CheckCircle2 className="h-4 w-4" />;
  if (status === 'withdrawn') return <XCircle className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}
