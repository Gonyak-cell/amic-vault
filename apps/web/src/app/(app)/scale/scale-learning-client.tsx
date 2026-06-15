'use client';

import React, { useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  DatabaseZap,
  Gauge,
  ListChecks,
  RefreshCw,
} from 'lucide-react';
import type {
  ScaleAiGateReviewListResponseDto,
  ScaleCostSnapshotListResponseDto,
  ScaleEvalRunListResponseDto,
  ScaleLearningEventListResponseDto,
  ScaleMigrationDrillListResponseDto,
  ScalePerformanceRunListResponseDto,
  ScaleReadinessSummaryDto,
} from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  createScaleAiGateReview,
  createScaleCostSnapshot,
  createScaleEvalRun,
  createScaleLearningEvent,
  createScaleMigrationDrill,
  createScalePerformanceRun,
  getScaleReadiness,
  listScaleAiGateReviews,
  listScaleCostSnapshots,
  listScaleEvalRuns,
  listScaleLearningEvents,
  listScaleMigrationDrills,
  listScalePerformanceRuns,
} from '@/lib/api/scale';
import { useI18n, type Language } from '@/lib/i18n';

const sampleHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const scaleCopy: Record<
  Language,
  {
    evidenceRef: string;
    patternCode: string;
    refreshTitle: string;
    refresh: string;
    title: string;
    performance: string;
    cost: string;
    eval: string;
    migration: string;
    learning: string;
    aiGate: string;
    readiness: string;
    externalAi: string;
    technicalPass: string;
    yes: string;
    no: string;
    noRecords: string;
    unit: string;
    statusOpen: string;
    statusClosed: string;
  }
> = {
  ko: {
    evidenceRef: '증빙 ID',
    patternCode: '패턴 ID',
    refreshTitle: '시스템 상태 새로고침',
    refresh: '새로고침',
    title: '시스템 상태 증빙',
    performance: '성능',
    cost: '비용',
    eval: '검증',
    migration: '마이그레이션',
    learning: '학습 기록',
    aiGate: 'AI 사용 통제',
    readiness: '준비 상태',
    externalAi: '외부 AI 허용 여부',
    technicalPass: '시스템 점검',
    yes: '통과',
    no: '미통과',
    noRecords: '표시할 기록이 없습니다.',
    unit: '건',
    statusOpen: '허용',
    statusClosed: '차단',
  },
  en: {
    evidenceRef: 'Evidence ref',
    patternCode: 'Pattern ref',
    refreshTitle: 'Refresh system health',
    refresh: 'Refresh',
    title: 'System health evidence',
    performance: 'Performance',
    cost: 'Cost',
    eval: 'Validation',
    migration: 'Migration',
    learning: 'Learning log',
    aiGate: 'AI controls',
    readiness: 'Readiness',
    externalAi: 'External AI allowed',
    technicalPass: 'Technical check',
    yes: 'Pass',
    no: 'Not passed',
    noRecords: 'No records to show.',
    unit: 'items',
    statusOpen: 'Open',
    statusClosed: 'Closed',
  },
};

export function ScaleLearningClient() {
  const { language } = useI18n();
  const copy = scaleCopy[language];
  const [evidenceRef, setEvidenceRef] = useState('r14/gate-evidence');
  const [patternCode, setPatternCode] = useState('R14.GATE.GREEN');
  const [performance, setPerformance] = useState<ScalePerformanceRunListResponseDto | null>(null);
  const [costs, setCosts] = useState<ScaleCostSnapshotListResponseDto | null>(null);
  const [evals, setEvals] = useState<ScaleEvalRunListResponseDto | null>(null);
  const [drills, setDrills] = useState<ScaleMigrationDrillListResponseDto | null>(null);
  const [learning, setLearning] = useState<ScaleLearningEventListResponseDto | null>(null);
  const [aiReviews, setAiReviews] = useState<ScaleAiGateReviewListResponseDto | null>(null);
  const [readiness, setReadiness] = useState<ScaleReadinessSummaryDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(task: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (caught) {
      setError(safeApiErrorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    const [nextPerformance, nextCosts, nextEvals, nextDrills, nextLearning, nextAiReviews, nextReadiness] =
      await Promise.all([
        run(() => listScalePerformanceRuns()),
        run(() => listScaleCostSnapshots()),
        run(() => listScaleEvalRuns()),
        run(() => listScaleMigrationDrills()),
        run(() => listScaleLearningEvents()),
        run(() => listScaleAiGateReviews()),
        run(() => getScaleReadiness()),
      ]);
    if (nextPerformance) setPerformance(nextPerformance);
    if (nextCosts) setCosts(nextCosts);
    if (nextEvals) setEvals(nextEvals);
    if (nextDrills) setDrills(nextDrills);
    if (nextLearning) setLearning(nextLearning);
    if (nextAiReviews) setAiReviews(nextAiReviews);
    if (nextReadiness) setReadiness(nextReadiness);
  }

  async function recordPerformance() {
    const result = await run(() =>
      createScalePerformanceRun({
        scenario: 'search_query',
        sampleCount: 201,
        p50Ms: 80,
        p95Ms: 180,
        p99Ms: 260,
        targetP95Ms: 250,
        measurementHash: sampleHash,
        evidenceRef: evidenceRef.trim(),
      }),
    );
    if (result) await refreshAll();
  }

  async function recordCost() {
    const result = await run(() =>
      createScaleCostSnapshot({
        scope: 'total',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-12',
        unitCount: 174,
        estimatedCostCents: 0,
        currency: 'USD',
        costModelHash: sampleHash,
        evidenceRef: evidenceRef.trim(),
      }),
    );
    if (result) await refreshAll();
  }

  async function recordEval() {
    const result = await run(() =>
      createScaleEvalRun({
        suite: 'full_regression',
        caseCount: 201,
        passCount: 201,
        failCount: 0,
        metricHash: sampleHash,
        evidenceRef: evidenceRef.trim(),
      }),
    );
    if (result) await refreshAll();
  }

  async function recordMigrationDrill() {
    const result = await run(() =>
      createScaleMigrationDrill({
        scope: 'full_roundtrip',
        durationMs: 18000,
        schemaHashBefore: sampleHash,
        schemaHashAfter: sampleHash,
        status: 'pass',
        evidenceRef: evidenceRef.trim(),
      }),
    );
    if (result) await refreshAll();
  }

  async function recordLearning() {
    const result = await run(() =>
      createScaleLearningEvent({
        category: 'gate',
        severity: 'low',
        patternCode: patternCode.trim(),
        evidenceRef: evidenceRef.trim(),
        resolutionRef: 'docs/ledger/gates/R14_gate.md',
      }),
    );
    if (result) await refreshAll();
  }

  async function recordAiGate() {
    const result = await run(() =>
      createScaleAiGateReview({
        candidateRoute: 'external_model',
        decision: 'external_blocked',
        externalModelAllowed: false,
        controlHash: sampleHash,
        evidenceRef: evidenceRef.trim(),
      }),
    );
    if (result) await refreshAll();
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={copy.evidenceRef} value={evidenceRef} onChange={setEvidenceRef} />
          <Field label={copy.patternCode} value={patternCode} onChange={setPatternCode} />
          <Button onClick={refreshAll} disabled={busy} title={copy.refreshTitle}>
            <RefreshCw className="h-4 w-4" />
            {copy.refresh}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<Gauge className="h-4 w-4" />} label={copy.title} />
          <Button onClick={recordPerformance} disabled={busy || !evidenceRef.trim()}>
            <Gauge className="h-4 w-4" />
            {copy.performance}
          </Button>
          <Button onClick={recordCost} disabled={busy || !evidenceRef.trim()}>
            <CircleDollarSign className="h-4 w-4" />
            {copy.cost}
          </Button>
          <Button onClick={recordEval} disabled={busy || !evidenceRef.trim()}>
            <ListChecks className="h-4 w-4" />
            {copy.eval}
          </Button>
          <Button onClick={recordMigrationDrill} disabled={busy || !evidenceRef.trim()}>
            <DatabaseZap className="h-4 w-4" />
            {copy.migration}
          </Button>
          <Button onClick={recordLearning} disabled={busy || !evidenceRef.trim() || !patternCode.trim()}>
            <CheckCircle2 className="h-4 w-4" />
            {copy.learning}
          </Button>
          <Button onClick={recordAiGate} disabled={busy || !evidenceRef.trim()}>
            <BrainCircuit className="h-4 w-4" />
            {copy.aiGate}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryPanel
            title={copy.readiness}
            empty={copy.noRecords}
            rows={[
              [copy.performance, String(readiness?.passingPerformanceRunCount ?? 0)],
              [copy.cost, String(readiness?.costSnapshotCount ?? 0)],
              [copy.eval, String(readiness?.passingEvalRunCount ?? 0)],
              [copy.migration, String(readiness?.passingMigrationDrillCount ?? 0)],
              [copy.learning, String(readiness?.learningEventCount ?? 0)],
              [copy.externalAi, String(readiness?.externalModelAllowedCount ?? 0)],
              [copy.technicalPass, readiness?.technicalPass ? copy.yes : copy.no],
            ]}
          />
          <SummaryPanel
            title={copy.performance}
            empty={copy.noRecords}
            rows={performance?.runs.map((item) => [
              item.scenario,
              `p95 ${item.p95Ms}ms`,
              item.status,
            ])}
          />
          <SummaryPanel
            title={copy.cost}
            empty={copy.noRecords}
            rows={costs?.snapshots.map((item) => [
              item.scope,
              `${item.estimatedCostCents} ${item.currency}`,
              String(item.unitCount),
            ])}
          />
          <SummaryPanel
            title={copy.eval}
            empty={copy.noRecords}
            rows={evals?.runs.map((item) => [
              item.suite,
              `${item.passCount}/${item.caseCount}`,
              item.status,
            ])}
          />
          <SummaryPanel
            title={copy.migration}
            empty={copy.noRecords}
            rows={drills?.drills.map((item) => [
              item.scope,
              `${item.durationMs}ms`,
              item.status,
            ])}
          />
          <SummaryPanel
            title={copy.learning}
            empty={copy.noRecords}
            rows={learning?.events.map((item) => [
              item.patternCode,
              item.category,
              item.severity,
            ])}
          />
          <SummaryPanel
            title={copy.aiGate}
            empty={copy.noRecords}
            rows={aiReviews?.reviews.map((item) => [
              item.candidateRoute,
              item.decision,
              item.externalModelAllowed ? copy.statusOpen : copy.statusClosed,
            ])}
          />
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-64 flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function PanelTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function SummaryPanel({
  title,
  rows,
  empty,
}: {
  title: string;
  rows?: string[][] | undefined;
  empty: string;
}) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {(rows?.length ? rows : [[empty, '', '']]).map((row, index) => (
          <div key={`${title}-${index}`} className="grid grid-cols-3 gap-3 text-sm">
            <span className="truncate font-medium">{row[0]}</span>
            <span className="truncate text-muted-foreground">{row[1]}</span>
            <span className="truncate text-muted-foreground">{row[2]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
