#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { receiptLeakFindings } from './matter-app-identity-preflight.mjs';

const DEFAULT_OUTPUT_DIR = '.omo/evidence/MATTER-APP-IDENTITY-ROLLOUT';
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/u;
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/u;
const TARGET_ENVIRONMENTS = new Set(['staging', 'production']);
const NOT_EXECUTED = Object.freeze([
  'Matter app client upsert',
  'Matter app matter upsert',
  'Vault projection sync',
  'customer document import',
  'Vault storage write',
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

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function safeHash(value) {
  const normalized = clean(value);
  return normalized ? sha256Hex(normalized).slice(0, 16) : null;
}

function safeReceiptRef(filePath) {
  return path.basename(clean(filePath)).replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 160);
}

function isPlaceholder(value) {
  const normalized = clean(value);
  return (
    normalized === 'PENDING_EXTERNAL_REF' ||
    normalized.startsWith('PENDING_') ||
    /^<[^>]+>$/u.test(normalized) ||
    /^MATTER-APP-[A-Z0-9-]+-REF$/u.test(normalized)
  );
}

function refStatus(value) {
  const normalized = clean(value);
  const present = normalized.length > 0;
  return {
    present,
    safe: present && SAFE_REF_PATTERN.test(normalized) && !isPlaceholder(normalized),
    hash_ref: present ? safeHash(normalized) : null,
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: false,
    targetEnvironment: '',
    runId: `matter-app-identity-rollout-preflight-${isoStamp()}`,
    localCloseout: '',
    identityPreflight: '',
    sanitizedOut: '',
    targetDatabaseRef: '',
    matterAppBridgeRef: '',
    operatorRef: '',
    approvalRef: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--') continue;
    if (key === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (key === '--execute') throw new Error('only --dry-run is supported');
    if (key === '--target-environment') args.targetEnvironment = value;
    else if (key === '--run-id') args.runId = value;
    else if (key === '--local-closeout') args.localCloseout = value;
    else if (key === '--identity-preflight') args.identityPreflight = value;
    else if (key === '--sanitized-out') args.sanitizedOut = value;
    else if (key === '--target-database-ref') args.targetDatabaseRef = value;
    else if (key === '--matter-app-bridge-ref') args.matterAppBridgeRef = value;
    else if (key === '--operator-ref') args.operatorRef = value;
    else if (key === '--approval-ref') args.approvalRef = value;
    else if (key === '--help') args.help = true;
    else throw new Error(`unknown argument: ${key}`);
    if (key?.startsWith('--') && key !== '--help') index += 1;
  }
  if (!args.sanitizedOut && args.targetEnvironment) {
    args.sanitizedOut = path.join(
      DEFAULT_OUTPUT_DIR,
      `${args.targetEnvironment}-identity-rollout-preflight.sanitized.json`,
    );
  }
  return args;
}

export function validateTargetRefs(args) {
  const blockers = [];
  const refs = {
    target_database_ref: refStatus(args.targetDatabaseRef),
    matter_app_bridge_ref: refStatus(args.matterAppBridgeRef),
    operator_ref: refStatus(args.operatorRef),
    approval_ref: refStatus(args.approvalRef),
  };
  for (const [name, status] of Object.entries(refs)) {
    if (name === 'approval_ref' && !status.present) continue;
    if (!status.present) blockers.push(`${name}_missing`);
    else if (!status.safe) blockers.push(`${name}_invalid`);
  }
  return { refs, blockers };
}

export function validateLocalReceipts({ localCloseout, identityPreflight }) {
  const blockers = [];
  if (!localCloseout) blockers.push('local_closeout_receipt_missing');
  if (!identityPreflight) blockers.push('identity_preflight_receipt_missing');

  const closeoutAcceptance = localCloseout?.acceptance_gate ?? {};
  const closeoutAcceptancePass =
    Object.values(closeoutAcceptance).length > 0 &&
    Object.values(closeoutAcceptance).every((value) => value === 'PASS');
  const identityAcceptance = identityPreflight?.acceptance_gate ?? {};
  const identityAcceptancePass =
    Object.values(identityAcceptance).length > 0 &&
    Object.values(identityAcceptance).every((value) => value === 'PASS');

  if (localCloseout && localCloseout.status !== 'pass') blockers.push('local_closeout_not_passed');
  if (localCloseout && localCloseout.leak_scan?.status !== 'PASS') {
    blockers.push('local_closeout_leak_scan_not_passed');
  }
  if (localCloseout && !closeoutAcceptancePass) blockers.push('local_closeout_acceptance_not_passed');
  if (identityPreflight && identityPreflight.status !== 'pass') {
    blockers.push('identity_preflight_not_passed');
  }
  if (identityPreflight && identityPreflight.leak_scan?.status !== 'PASS') {
    blockers.push('identity_preflight_leak_scan_not_passed');
  }
  if (identityPreflight && !identityAcceptancePass) {
    blockers.push('identity_preflight_acceptance_not_passed');
  }
  return {
    blockers,
    gates: {
      local_closeout_pass: localCloseout?.status === 'pass',
      local_closeout_acceptance_pass: closeoutAcceptancePass,
      local_closeout_leak_scan_pass: localCloseout?.leak_scan?.status === 'PASS',
      identity_preflight_pass: identityPreflight?.status === 'pass',
      identity_preflight_acceptance_pass: identityAcceptancePass,
      identity_preflight_leak_scan_pass: identityPreflight?.leak_scan?.status === 'PASS',
    },
  };
}

export function buildReceipt({ args, localCloseout, identityPreflight }) {
  const localValidation = validateLocalReceipts({ localCloseout, identityPreflight });
  const targetValidation = validateTargetRefs(args);
  const argBlockers = [];
  if (!args.dryRun) argBlockers.push('dry_run_required');
  if (!SAFE_RUN_ID_PATTERN.test(clean(args.runId))) argBlockers.push('run_id_invalid');
  if (!TARGET_ENVIRONMENTS.has(clean(args.targetEnvironment))) {
    argBlockers.push('target_environment_invalid');
  }
  const blockers = [
    ...argBlockers,
    ...localValidation.blockers,
    ...targetValidation.blockers,
  ];
  const receipt = {
    artifact: 'matter_app_identity_rollout_preflight_sanitized',
    generated_at: new Date().toISOString(),
    status: blockers.length === 0 ? 'ready_for_identity_dry_run' : 'blocked',
    mode: 'dry-run',
    write_executed: false,
    run_id_hash: sha256Hex(args.runId),
    target_environment: clean(args.targetEnvironment) || null,
    scope:
      'Matter app identity rollout target-ref intake only; validates local evidence and opaque staging/production refs without writing to target systems.',
    local_evidence_refs: {
      local_closeout_ref: safeReceiptRef(args.localCloseout),
      identity_preflight_ref: safeReceiptRef(args.identityPreflight),
    },
    target_refs: targetValidation.refs,
    local_evidence_gate: Object.fromEntries(
      Object.entries(localValidation.gates).map(([key, passed]) => [key, passed ? 'PASS' : 'FAIL']),
    ),
    target_ref_gate: {
      target_database_ref_present: targetValidation.refs.target_database_ref.present ? 'PASS' : 'FAIL',
      target_database_ref_safe: targetValidation.refs.target_database_ref.safe ? 'PASS' : 'FAIL',
      matter_app_bridge_ref_present: targetValidation.refs.matter_app_bridge_ref.present ? 'PASS' : 'FAIL',
      matter_app_bridge_ref_safe: targetValidation.refs.matter_app_bridge_ref.safe ? 'PASS' : 'FAIL',
      operator_ref_present: targetValidation.refs.operator_ref.present ? 'PASS' : 'FAIL',
      operator_ref_safe: targetValidation.refs.operator_ref.safe ? 'PASS' : 'FAIL',
      approval_ref_optional_or_present: 'PASS',
      approval_ref_safe:
        !targetValidation.refs.approval_ref.present || targetValidation.refs.approval_ref.safe
          ? 'PASS'
          : 'FAIL',
    },
    blockers: [...new Set(blockers)],
    next_gate:
      blockers.length === 0
        ? `${clean(args.targetEnvironment)}_identity_dry_run_can_be_requested`
        : `${clean(args.targetEnvironment) || 'target'}_identity_rollout_target_refs_required`,
    not_executed: NOT_EXECUTED,
    sanitization:
      'Receipt contains only statuses, hashed refs, sanitized evidence filenames, booleans, and blocker codes; no raw path, customer document body, OCR/text excerpt, screenshot, storage reference, credential value, raw UUID, Matter Code, matter name, or client label is persisted.',
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
    'usage: pnpm matter:identity-rollout-preflight -- --dry-run --target-environment <staging|production> --local-closeout <receipt.json> --identity-preflight <receipt.json> [--target-database-ref <ref>] [--matter-app-bridge-ref <ref>] [--operator-ref <ref>] [--approval-ref <ref>] [--sanitized-out <out.json>]',
    '',
    'Validates opaque target refs for a later identity-only staging/production dry-run.',
    'This runner never executes Matter app upserts, Vault projection sync, document import, cutover, Gemma indexing, OneDrive connected-state, or Office sync.',
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
  const localCloseout = await readJsonIfPresent(args.localCloseout);
  const identityPreflight = await readJsonIfPresent(args.identityPreflight);
  const receipt = buildReceipt({ args, localCloseout, identityPreflight });
  await writeJson(args.sanitizedOut, receipt);
  console.log(
    JSON.stringify({
      status: receipt.status,
      target_environment: receipt.target_environment,
      write_executed: receipt.write_executed,
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
