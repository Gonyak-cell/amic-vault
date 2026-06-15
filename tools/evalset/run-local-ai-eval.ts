#!/usr/bin/env node
import { collectLocalAiEval } from './local-ai-eval.ts';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const args = process.argv.slice(2);
const tenantId = argValue(args, '--tenant-id');
if (!tenantId) {
  console.error('usage: pnpm eval:local-ai -- --tenant-id <tenant_uuid>');
  process.exit(2);
}

const report = await collectLocalAiEval({ tenantId });
console.log(
  JSON.stringify(
    {
      ...report,
      citationAccuracyPercent: formatPercent(report.citationAccuracy),
      unsupportedClaimRatePercent: formatPercent(report.unsupportedClaimRate),
      fallbackRatePercent: formatPercent(report.fallbackRate),
    },
    null,
    2,
  ),
);

if (!report.technicalPass) process.exit(1);
