#!/usr/bin/env node
import {
  evaluateOutlookOperationalGate,
  outlookEvidenceEnvNames,
  outlookFeatureEnvNames,
} from './outlook-operational-policy.ts';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const target = argValue(args, '--target') ?? 'pr';
const mode = argValue(args, '--mode') ?? 'advisory';
const format = argValue(args, '--format') ?? 'json';

if (target !== 'pr' && target !== 'staging' && target !== 'production') {
  console.error('usage: pnpm outlook:operational:check --target <pr|staging|production>');
  process.exit(2);
}
if (mode !== 'advisory' && mode !== 'enforce') {
  console.error('usage: pnpm outlook:operational:check --mode <advisory|enforce>');
  process.exit(2);
}

const env: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  OUTLOOK_AUDIT_AVAILABLE: process.env.OUTLOOK_AUDIT_AVAILABLE,
  OUTLOOK_ROLLOUT_RING: process.env.OUTLOOK_ROLLOUT_RING,
};
for (const envName of Object.values(outlookFeatureEnvNames)) {
  env[envName] = process.env[envName];
}
for (const envName of Object.values(outlookEvidenceEnvNames)) {
  env[envName] = process.env[envName];
}

const report = evaluateOutlookOperationalGate({
  target,
  mode,
  env,
  repoRoot: process.cwd(),
});

const safeReport =
  format === 'compact'
    ? {
        status: report.status,
        target: report.target,
        mode: report.mode,
        ring: report.ring,
        enabledFeatures: report.enabledFeatures,
        failures: report.failures,
        sensitiveValuesPrinted: false,
      }
    : report;
const output = format === 'compact' ? JSON.stringify(safeReport) : JSON.stringify(safeReport, null, 2);
const leakedEvidenceRef = Object.values(outlookEvidenceEnvNames).some((envName) => {
  const value = env[envName];
  return value ? output.includes(value) : false;
});
if (leakedEvidenceRef) {
  console.error(JSON.stringify({ status: 'fail', code: 'SENSITIVE_EVIDENCE_REF_PRINTED' }));
  process.exit(1);
}

console.log(output);
if (report.status !== 'pass') process.exit(1);
