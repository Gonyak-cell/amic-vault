'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CircleDot, Plus, Trash2 } from 'lucide-react';
import type {
  MatterIssueDto,
  MatterIssueRiskLevel,
  MatterIssueStatus,
  MatterKeyDateDto,
  MatterKeyDateStatus,
  MatterKeyDateType,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import {
  createMatterIssue,
  createMatterKeyDate,
  deleteMatterIssue,
  deleteMatterKeyDate,
  listMatterIssues,
  listMatterKeyDates,
  updateMatterIssue,
  updateMatterKeyDate,
} from '@/lib/api-client';

const issueStatusLabels = {
  open: '열림',
  monitoring: '모니터링',
  resolved: '해소',
} as const satisfies Record<MatterIssueStatus, string>;

const riskLevelLabels = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '긴급',
} as const satisfies Record<MatterIssueRiskLevel, string>;

const keyDateTypeLabels = {
  court: '법원',
  contractual: '계약',
  internal: '내부',
} as const satisfies Record<MatterKeyDateType, string>;

const keyDateStatusLabels = {
  pending: '예정',
  completed: '완료',
  cancelled: '취소',
} as const satisfies Record<MatterKeyDateStatus, string>;

const keyDateSourceLabels = {
  core: 'Matter',
  litigation_pleading: 'Litigation',
  dd_rfi: 'DD',
} as const satisfies Record<MatterKeyDateDto['sourceType'], string>;

export function isDueWithinDays(dueDate: string, days: number, now = new Date()): boolean {
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return diffDays >= 0 && diffDays <= days;
}

export function MatterIssuesKeyDatesPanel({
  matterId,
  initialIssues = [],
  initialKeyDates = [],
}: {
  matterId: string;
  initialIssues?: MatterIssueDto[];
  initialKeyDates?: MatterKeyDateDto[];
}) {
  const [issues, setIssues] = useState<MatterIssueDto[]>(initialIssues);
  const [keyDates, setKeyDates] = useState<MatterKeyDateDto[]>(initialKeyDates);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueRisk, setIssueRisk] = useState<MatterIssueRiskLevel>('medium');
  const [keyDateTitle, setKeyDateTitle] = useState('');
  const [keyDateDueDate, setKeyDateDueDate] = useState('');
  const [keyDateType, setKeyDateType] = useState<MatterKeyDateType>('internal');
  const [keyDateSort, setKeyDateSort] = useState<'dueDate' | 'source'>('dueDate');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([listMatterIssues(matterId), listMatterKeyDates(matterId)])
      .then(([issueResult, keyDateResult]) => {
        setIssues(issueResult.items);
        setKeyDates(keyDateResult.items);
      })
      .catch(() => {
        setIssues([]);
        setKeyDates([]);
      });
  }, [matterId]);

  useEffect(() => {
    let active = true;
    Promise.all([listMatterIssues(matterId), listMatterKeyDates(matterId)])
      .then(([issueResult, keyDateResult]) => {
        if (!active) return;
        setIssues(issueResult.items);
        setKeyDates(keyDateResult.items);
      })
      .catch(() => {
        if (!active) return;
        setIssues([]);
        setKeyDates([]);
      });
    return () => {
      active = false;
    };
  }, [matterId]);

  async function addIssue() {
    if (!issueTitle.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createMatterIssue(matterId, {
        title: issueTitle,
        riskLevel: issueRisk,
        status: 'open',
      });
      setIssues((current) => [created, ...current]);
      setIssueTitle('');
      setIssueRisk('medium');
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeIssueStatus(issue: MatterIssueDto, status: MatterIssueStatus) {
    if (issue.status === status || busy) return;
    setBusy(true);
    try {
      const updated = await updateMatterIssue(matterId, issue.issueId, { status });
      setIssues((current) =>
        current.map((item) => (item.issueId === updated.issueId ? updated : item)),
      );
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeIssue(issue: MatterIssueDto) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteMatterIssue(matterId, issue.issueId);
      setIssues((current) => current.filter((item) => item.issueId !== issue.issueId));
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addKeyDate() {
    if (!keyDateTitle.trim() || !keyDateDueDate || busy) return;
    setBusy(true);
    try {
      const created = await createMatterKeyDate(matterId, {
        title: keyDateTitle,
        dueDate: keyDateDueDate,
        dateType: keyDateType,
        status: 'pending',
      });
      setKeyDates((current) => [created, ...current]);
      setKeyDateTitle('');
      setKeyDateDueDate('');
      setKeyDateType('internal');
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeKeyDateStatus(keyDate: MatterKeyDateDto, status: MatterKeyDateStatus) {
    if (!keyDate.mutable || keyDate.status === status || busy) return;
    setBusy(true);
    try {
      const updated = await updateMatterKeyDate(matterId, keyDate.sourceId, { status });
      setKeyDates((current) =>
        current.map((item) => (item.keyDateId === updated.keyDateId ? updated : item)),
      );
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeKeyDate(keyDate: MatterKeyDateDto) {
    if (!keyDate.mutable || busy) return;
    setBusy(true);
    try {
      await deleteMatterKeyDate(matterId, keyDate.sourceId);
      setKeyDates((current) => current.filter((item) => item.keyDateId !== keyDate.keyDateId));
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const sortedKeyDates = [...keyDates].sort((left, right) => {
    if (keyDateSort === 'source') {
      return (
        keyDateSourceLabels[left.sourceType].localeCompare(keyDateSourceLabels[right.sourceType]) ||
        left.dueDate.localeCompare(right.dueDate)
      );
    }
    return left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title);
  });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_128px_auto]">
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={issueTitle}
            disabled={busy}
            onChange={(event) => setIssueTitle(event.target.value)}
            placeholder="쟁점 제목"
            aria-label="쟁점 제목"
          />
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={issueRisk}
            disabled={busy}
            onChange={(event) => setIssueRisk(event.target.value as MatterIssueRiskLevel)}
            aria-label="쟁점 위험도"
          >
            {Object.entries(riskLevelLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={!issueTitle.trim() || busy} onClick={addIssue}>
            <Plus className="h-4 w-4" />
            추가
          </Button>
        </div>
        <div className="grid gap-2">
          {issues.map((issue) => (
            <div
              key={issue.issueId}
              className="flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${riskClassName(
                      issue.riskLevel,
                    )}`}
                  >
                    {riskLevelLabels[issue.riskLevel]}
                  </span>
                  <span className="truncate text-sm font-semibold">{issue.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {issueStatusLabels[issue.status]}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={issue.status}
                  disabled={busy}
                  onChange={(event) =>
                    void changeIssueStatus(issue, event.target.value as MatterIssueStatus)
                  }
                  aria-label="쟁점 상태"
                >
                  {Object.entries(issueStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="쟁점 제거"
                  aria-label="쟁점 제거"
                  onClick={() => void removeIssue(issue)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {issues.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              등록된 쟁점이 없습니다.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(160px,1fr)_148px_112px_auto]">
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={keyDateTitle}
            disabled={busy}
            onChange={(event) => setKeyDateTitle(event.target.value)}
            placeholder="기한 제목"
            aria-label="기한 제목"
          />
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="date"
            value={keyDateDueDate}
            disabled={busy}
            onChange={(event) => setKeyDateDueDate(event.target.value)}
            aria-label="기한 날짜"
          />
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={keyDateType}
            disabled={busy}
            onChange={(event) => setKeyDateType(event.target.value as MatterKeyDateType)}
            aria-label="기한 유형"
          >
            {Object.entries(keyDateTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!keyDateTitle.trim() || !keyDateDueDate || busy}
            onClick={addKeyDate}
          >
            <Plus className="h-4 w-4" />
            추가
          </Button>
        </div>
        <div className="flex justify-end">
          <select
            className="h-9 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={keyDateSort}
            onChange={(event) => setKeyDateSort(event.target.value as 'dueDate' | 'source')}
            aria-label="기한 정렬"
          >
            <option value="dueDate">날짜순</option>
            <option value="source">출처순</option>
          </select>
        </div>
        <div className="grid gap-2">
          {sortedKeyDates.map((keyDate) => {
            const urgent = keyDate.status === 'pending' && isDueWithinDays(keyDate.dueDate, 7);
            return (
              <div
                key={keyDate.keyDateId}
                className={`flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  urgent ? 'border-amber-300 bg-amber-50 text-amber-950' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border px-2 py-1 text-xs font-semibold">
                      {keyDateSourceLabels[keyDate.sourceType]}
                    </span>
                    {urgent ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">
                        <CircleDot className="h-3 w-3" />
                        임박
                      </span>
                    ) : null}
                    <span className="truncate text-sm font-semibold">{keyDate.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      keyDate.dueDate,
                      keyDateTypeLabels[keyDate.dateType],
                      keyDateStatusLabels[keyDate.status],
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={keyDate.status}
                    disabled={busy || !keyDate.mutable}
                    onChange={(event) =>
                      void changeKeyDateStatus(keyDate, event.target.value as MatterKeyDateStatus)
                    }
                    aria-label="기한 상태"
                  >
                    {Object.entries(keyDateStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {keyDate.mutable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      title="기한 제거"
                      aria-label="기한 제거"
                      onClick={() => void removeKeyDate(keyDate)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {sortedKeyDates.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              등록된 기한이 없습니다.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function riskClassName(riskLevel: MatterIssueRiskLevel): string {
  if (riskLevel === 'critical') return 'border-red-300 bg-red-50 text-red-800';
  if (riskLevel === 'high') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (riskLevel === 'medium') return 'border-sky-300 bg-sky-50 text-sky-800';
  return 'text-muted-foreground';
}
