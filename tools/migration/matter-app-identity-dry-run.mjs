#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { receiptLeakFindings, sha256Hex } from './matter-app-identity-preflight.mjs';
import { validateIdentityPreflightReceipt } from './matter-app-canonical-upsert-sync.mjs';

const DEFAULT_OUTPUT_DIR = '.omo/evidence/MATTER-APP-IDENTITY-DRY-RUN';
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const TARGET_ENVIRONMENTS = new Set(['staging', 'production']);
const NOT_EXECUTED = Object.freeze([
  'Matter app client/matter upsert execute',
  'Vault projection sync execute',
  'customer document import',
  'Vault storage write',
  'production write',
  'source-of-truth cutover',
  'OneDrive connected-state claim',
  'Office open/save/sync claim',
  'Gemma indexing execution',
]);

function isoStamp(value = new Date()) {
  return value.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function basenameRef(filePath) {
  return path.basename(clean(filePath)).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 160);
}

function isPlaceholder(value) {
  const normalized = clean(value);
  return (
    normalized === 'PENDING_EXTERNAL_REF' ||
    normalized.startsWith('PENDING_') ||
    /^<[^>]+>$/u.test(normalized) ||
    /^APPROVAL-[A-Z0-9-]+-REF$/u.test(normalized)
  );
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: false,
    targetEnvironment: '',
    runId: `matter-app-identity-dry-run-${isoStamp()}`,
    targetPreflight: '',
    identityPreflight: '',
    approvalRef: '',
    sanitizedOut: '',
    expectedClients: 80,
    expectedMatters: 123,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (key === '--execute') throw new Error('identity dry-run does not support --execute');
    if (key === '--target-environment') args.targetEnvironment = value;
    else if (key === '--run-id') args.runId = value;
    else if (key === '--target-preflight') args.targetPreflight = value;
    else if (key === '--identity-preflight') args.identityPreflight = value;
    else if (key === '--approval-ref') args.approvalRef = value;
    else if (key === '--sanitized-out') args.sanitizedOut = value;
    else if (key === '--expected-clients') args.expectedClients = Number.parseInt(value, 10) || 80;
    else if (key === '--expected-matters') args.expectedMatters = Number.parseInt(value, 10) || 123;
    else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  if (!args.sanitizedOut && args.targetEnvironment) {
    args.sanitizedOut = path.join(
      DEFAULT_OUTPUT_DIR,
      `${args.targetEnvironment}-identity-dry-run.sanitized.json`,
    );
  }
  return args;
}

export function validateApprovalRef(approvalRef) {
  const normalized = clean(approvalRef);
  if (!normalized) return ['approval_ref_missing'];
  if (!SAFE_REF_PATTERN.test(normalized) || isPlaceholder(normalized)) {
    return ['approval_ref_invalid'];
  }
  return [];
}

export function validateTargetPreflightReceipt(receipt, targetEnvironment) {
  const blockers = [];
  if (!receipt) return ['target_preflight_receipt_missing'];
  if (receipt.artifact !== 'matter_app_identity_rollout_preflight_sanitized') {
    blockers.push('target_preflight_receipt_invalid');
  }
  if (receipt.status !== 'ready_for_identity_dry_run') {
    blockers.push('target_preflight_not_ready_for_identity_dry_run');
  }
  if (receipt.target_environment !== targetEnvironment) {
    blockers.push('target_preflight_environment_mismatch');
  }
  if (receipt.write_executed !== false) blockers.push('target_preflight_write_was_executed');
  if (receipt.leak_scan?.status !== 'PASS') blockers.push('target_preflight_leak_scan_not_passed');
  if (Array.isArray(receipt.blockers) && receipt.blockers.length > 0) {
    blockers.push('target_preflight_blockers_present');
  }
  const gateValues = Object.values(receipt.target_ref_gate ?? {});
  if (gateValues.length === 0 || !gateValues.every((value) => value === 'PASS')) {
    blockers.push('target_preflight_ref_gate_not_passed');
  }
  return blockers;
}

function plannedCounts(identityPreflight) {
  const clients = identityPreflight?.counts?.clients ?? 0;
  const matters = identityPreflight?.counts?.matters ?? 0;
  return {
    clients,
    matters,
    total_identity_rows: clients + matters,
    active_documents_context: identityPreflight?.counts?.active_documents ?? 0,
  };
}

export function buildReceipt({ args, targetPreflight, identityPreflight }) {
  const argBlockers = [];
  if (!args.dryRun) argBlockers.push('dry_run_required');
  if (!SAFE_RUN_ID_PATTERN.test(clean(args.runId))) argBlockers.push('run_id_invalid');
  if (!TARGET_ENVIRONMENTS.has(clean(args.targetEnvironment))) {
    argBlockers.push('target_environment_invalid');
  }
  if (!args.targetPreflight) argBlockers.push('target_preflight_path_missing');
  if (!args.identityPreflight) argBlockers.push('identity_preflight_path_missing');

  const blockers = [
    ...argBlockers,
    ...validateApprovalRef(args.approvalRef),
    ...validateTargetPreflightReceipt(targetPreflight, clean(args.targetEnvironment)),
    ...validateIdentityPreflightReceipt(identityPreflight, {
      clients: args.expectedClients,
      matters: args.expectedMatters,
    }),
  ];
  const uniqueBlockers = [...new Set(blockers)];
  const counts = plannedCounts(identityPreflight);
  const receipt = {
    artifact: 'matter_app_identity_dry_run_sanitized',
    generated_at: new Date().toISOString(),
    status: uniqueBlockers.length === 0 ? 'ready_for_identity_execute_approval' : 'blocked',
    mode: 'identity-only-dry-run',
    write_executed: false,
    matter_app_client_matter_upsert_executed: false,
    vault_projection_sync_executed: false,
    run_id_hash: sha256Hex(args.runId),
    approval_ref_hash: args.approvalRef ? sha256Hex(args.approvalRef) : null,
    target_environment: clean(args.targetEnvironment) || null,
    evidence_refs: {
      target_preflight_ref: basenameRef(args.targetPreflight),
      identity_preflight_ref: basenameRef(args.identityPreflight),
    },
    planned_identity_rows: counts,
    planned_actions: {
      would_upsert_clients: counts.clients,
      would_upsert_matters: counts.matters,
      would_sync_vault_projection_rows: counts.total_identity_rows,
      would_import_customer_documents: 0,
      would_write_vault_storage_objects: 0,
    },
    acceptance_gate: {
      dry_run_approved: validateApprovalRef(args.approvalRef).length === 0 ? 'PASS' : 'FAIL',
      target_preflight_ready:
        validateTargetPreflightReceipt(targetPreflight, clean(args.targetEnvironment)).length === 0
          ? 'PASS'
          : 'FAIL',
      identity_preflight_passed:
        validateIdentityPreflightReceipt(identityPreflight, {
          clients: args.expectedClients,
          matters: args.expectedMatters,
        }).length === 0
          ? 'PASS'
          : 'FAIL',
      no_write_executed: 'PASS',
      non_claims_preserved: 'PASS',
    },
    blockers: uniqueBlockers,
    next_gate:
      uniqueBlockers.length === 0
        ? `${clean(args.targetEnvironment)}_identity_execute_requires_separate_approval`
        : `${clean(args.targetEnvironment) || 'target'}_identity_dry_run_blocked`,
    not_executed: NOT_EXECUTED,
    sanitization:
      'Receipt contains counts, hashes, sanitized evidence filenames, booleans, and blocker codes only; no raw path, customer document body, OCR/text excerpt, screenshot, storage reference, credential value, raw UUID, Matter Code, matter name, or client label is persisted.',
  };
  const leakFindings = receiptLeakFindings(receipt);
  receipt.leak_scan = {
    status: leakFindings.length === 0 ? 'PASS' : 'FAIL',
    findings: leakFindings,
  };
  if (leakFindings.length > 0) receipt.status = 'blocked';
  return receipt;
}

async function readJsonIfPresent(filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function usage() {
  return [
    'usage: pnpm matter:identity-dry-run -- --dry-run --target-environment <staging|production> --target-preflight <approved-refs.json> --identity-preflight <identity-preflight.json> --approval-ref <approval-ref> [--sanitized-out <out.json>]',
    '',
    'Builds a no-write Matter app identity-only dry-run receipt from approved target refs and local identity preflight evidence.',
    'This runner never executes Matter app upserts, Vault projection sync, document import, cutover, Gemma indexing, OneDrive connected-state, Office sync, or production writes.',
  ].join('\n');
}

async function main() {
  let args;
  try {
    args = parseArgs();
    if (args.help) {
      console.error(usage());
      process.exitCode = 0;
      return;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  const targetPreflight = await readJsonIfPresent(args.targetPreflight);
  const identityPreflight = await readJsonIfPresent(args.identityPreflight);
  const receipt = buildReceipt({ args, targetPreflight, identityPreflight });
  await writeJson(args.sanitizedOut, receipt);
  console.log(
    JSON.stringify({
      status: receipt.status,
      target_environment: receipt.target_environment,
      write_executed: receipt.write_executed,
      planned_identity_rows: receipt.planned_identity_rows,
      blockers: receipt.blockers,
      leak_scan: receipt.leak_scan,
    }),
  );
  if (receipt.status === 'blocked') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
