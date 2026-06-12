#!/usr/bin/env node
import { collectAiGateMetrics } from './ai-gate-metrics.ts';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const args = process.argv.slice(2);
const tenantId = argValue(args, '--tenant-id');
const matterId = argValue(args, '--matter-id') ?? null;
if (!tenantId) {
  console.error('usage: pnpm eval:ai-gate -- --tenant-id <tenant_uuid> [--matter-id <matter_uuid>]');
  process.exit(2);
}

const report = await collectAiGateMetrics({ tenantId, matterId });
console.log(
  JSON.stringify(
    {
      ...report,
      citationAccuracyPercent: formatPercent(report.citationAccuracy),
      hallucinationRatePercent: formatPercent(report.hallucinationRate),
      permissionAccuracyPercent: formatPercent(report.permissionAccuracy),
      retrievalRecallPercent: formatPercent(report.retrievalRecall),
      auditCoveragePercent: formatPercent(report.auditCoverage),
    },
    null,
    2,
  ),
);
