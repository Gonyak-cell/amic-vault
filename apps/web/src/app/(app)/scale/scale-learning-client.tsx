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

const sampleHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export function ScaleLearningClient() {
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
          <Field label="Evidence ref" value={evidenceRef} onChange={setEvidenceRef} />
          <Field label="Pattern code" value={patternCode} onChange={setPatternCode} />
          <Button onClick={refreshAll} disabled={busy} title="Refresh scale readiness">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <PanelTitle icon={<Gauge className="h-4 w-4" />} label="Scale Evidence" />
          <Button onClick={recordPerformance} disabled={busy || !evidenceRef.trim()}>
            <Gauge className="h-4 w-4" />
            Performance
          </Button>
          <Button onClick={recordCost} disabled={busy || !evidenceRef.trim()}>
            <CircleDollarSign className="h-4 w-4" />
            Cost
          </Button>
          <Button onClick={recordEval} disabled={busy || !evidenceRef.trim()}>
            <ListChecks className="h-4 w-4" />
            Eval
          </Button>
          <Button onClick={recordMigrationDrill} disabled={busy || !evidenceRef.trim()}>
            <DatabaseZap className="h-4 w-4" />
            Migration
          </Button>
          <Button onClick={recordLearning} disabled={busy || !evidenceRef.trim() || !patternCode.trim()}>
            <CheckCircle2 className="h-4 w-4" />
            Learning
          </Button>
          <Button onClick={recordAiGate} disabled={busy || !evidenceRef.trim()}>
            <BrainCircuit className="h-4 w-4" />
            AI Gate
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryPanel
            title="Readiness"
            rows={[
              ['Performance', String(readiness?.passingPerformanceRunCount ?? 0)],
              ['Cost', String(readiness?.costSnapshotCount ?? 0)],
              ['Eval', String(readiness?.passingEvalRunCount ?? 0)],
              ['Migration', String(readiness?.passingMigrationDrillCount ?? 0)],
              ['Learning', String(readiness?.learningEventCount ?? 0)],
              ['External AI open', String(readiness?.externalModelAllowedCount ?? 0)],
              ['Technical pass', readiness?.technicalPass ? 'yes' : 'no'],
            ]}
          />
          <SummaryPanel
            title="Performance"
            rows={performance?.runs.map((item) => [
              item.scenario,
              `p95 ${item.p95Ms}ms`,
              item.status,
            ])}
          />
          <SummaryPanel
            title="Cost"
            rows={costs?.snapshots.map((item) => [
              item.scope,
              `${item.estimatedCostCents} ${item.currency}`,
              String(item.unitCount),
            ])}
          />
          <SummaryPanel
            title="Eval"
            rows={evals?.runs.map((item) => [
              item.suite,
              `${item.passCount}/${item.caseCount}`,
              item.status,
            ])}
          />
          <SummaryPanel
            title="Migration"
            rows={drills?.drills.map((item) => [
              item.scope,
              `${item.durationMs}ms`,
              item.status,
            ])}
          />
          <SummaryPanel
            title="Learning"
            rows={learning?.events.map((item) => [
              item.patternCode,
              item.category,
              item.severity,
            ])}
          />
          <SummaryPanel
            title="AI Gate"
            rows={aiReviews?.reviews.map((item) => [
              item.candidateRoute,
              item.decision,
              item.externalModelAllowed ? 'open' : 'closed',
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

function SummaryPanel({ title, rows }: { title: string; rows?: string[][] | undefined }) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {(rows?.length ? rows : [['No records', '', '']]).map((row, index) => (
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
