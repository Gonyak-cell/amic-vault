#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const requiredWriteMappingFields = [
  'candidate_id',
  'tenant_ref',
  'client_ref',
  'matter_ref',
  'status',
  'scope_kind',
  'single_matter_scope',
  'duplicate_policy',
  'unsupported_type_policy',
  'zero_byte_policy',
  'large_object_policy',
  'cutover_policy',
];

const requiredWriteRefs = [
  'approval_ref',
  'dryrun_pass_ref',
  'write_window_ref',
  'db_snapshot_ref',
  'storage_containment_ref',
  'rollback_owner_ref',
  'import_lock_ref',
  'sanitized_receipt_destination_ref',
  'local_receipt_handling_ref',
  'operator_ref',
  'security_ref',
  'legal_data_ref',
  'customer_scope_ref',
];

const notClaimed = [
  'customer-wide import',
  'OneDrive connected state',
  'Office open/save/sync',
  'source-of-truth cutover',
  'Gemma indexing execution',
];

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'help') {
      args.help = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`missing value for --${key}`);
    index += 1;
    if (key === 'mode') args.mode = next;
    else if (key === 'mapping') args.mapping = next;
    else if (key === 'dryrun-report') args.dryrunReport = next;
    else if (key === 'synthetic-receipt') args.syntheticReceipt = next;
    else if (key === 'import-receipt') args.importReceipt = next;
    else if (key === 'reconciliation-report') args.reconciliationReport = next;
    else if (key === 'gemma-readiness') args.gemmaReadiness = next;
    else if (key === 'wave-plan') args.wavePlan = next;
    else if (key === 'sanitized-out') args.sanitizedOut = next;
    else if (key === 'run-id') args.runId = next;
    else if (key === 'candidate-id') args.candidateId = next;
    else throw new Error(`unknown option: --${key}`);
  }
  return args;
}

export function usage() {
  return [
    'usage: node tools/migration/onedrive-pilot-closeout.mjs --mode <write-preflight|reconcile|gemma-readiness|wave-plan> --sanitized-out <out.json> [inputs]',
    '',
    'Modes:',
    '  write-preflight  --mapping <json> --dryrun-report <json> --synthetic-receipt <json>',
    '  reconcile        --mapping <json> --dryrun-report <json> --import-receipt <json>',
    '  gemma-readiness  --mapping <json> --reconciliation-report <json>',
    '  wave-plan        --wave-plan <json> --reconciliation-report <json> --gemma-readiness <json>',
    '',
    'This tool validates gates only. It does not import customer documents or run Gemma indexing.',
  ].join('\n');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function isTruthyBoolean(value) {
  return value === true || value === 'true';
}

function statusCount(report, status) {
  return Number(report?.summary?.status_counts?.[status] ?? 0);
}

function itemMap(report) {
  const result = new Map();
  for (const item of report?.items ?? []) {
    if (typeof item.item_id === 'string') result.set(item.item_id, item);
  }
  return result;
}

function addMissingFieldBlockers(blockers, object, fields, prefix) {
  for (const field of fields) {
    if (object?.[field] === undefined || object?.[field] === null || object?.[field] === '') {
      blockers.push(`${prefix}_${field}`);
    }
  }
}

function validateWriteMapping(mapping, candidateId) {
  const blockers = [];
  addMissingFieldBlockers(blockers, mapping, requiredWriteMappingFields, 'missing_mapping');
  addMissingFieldBlockers(blockers, mapping, requiredWriteRefs, 'missing_write_ref');
  if (candidateId && mapping.candidate_id !== candidateId) blockers.push('candidate_id_mismatch');
  if (mapping.status !== 'ready_for_write_mode') blockers.push('mapping_status_not_ready_for_write_mode');
  if (mapping.scope_kind !== 'pilot_matter') blockers.push('scope_kind_not_pilot_matter');
  if (!isTruthyBoolean(mapping.single_matter_scope)) blockers.push('scope_not_single_matter');
  if (mapping.cutover_policy !== 'not_requested') blockers.push('cutover_policy_must_not_be_requested');
  if (mapping.ai_allowed_default === 'unknown') blockers.push('unknown_ai_allowed_default');
  return blockers;
}

export function runWritePreflight({ mapping, dryrunReport, syntheticReceipt, candidateId, runId }) {
  const blockers = validateWriteMapping(mapping, candidateId);
  if (dryrunReport.mode !== 'dry-run') blockers.push('dryrun_report_mode_invalid');
  if (dryrunReport.gate_status !== 'pass') blockers.push('dryrun_report_not_pass');
  if (dryrunReport.candidate_id !== mapping.candidate_id) blockers.push('dryrun_candidate_mismatch');
  if (statusCount(dryrunReport, 'blocked') > 0) blockers.push('dryrun_has_blocked_items');
  if (statusCount(dryrunReport, 'retryable') > 0) blockers.push('dryrun_has_retryable_items');
  if (statusCount(dryrunReport, 'ready') < 1) blockers.push('dryrun_has_no_ready_items');

  if (syntheticReceipt.mode !== 'synthetic-write') blockers.push('synthetic_receipt_mode_invalid');
  if (syntheticReceipt.gate_status !== 'pass') blockers.push('synthetic_receipt_not_pass');
  if (syntheticReceipt.fixture_store_kind !== 'local_synthetic_only') blockers.push('synthetic_fixture_kind_invalid');
  if (statusCount(syntheticReceipt, 'blocked') > 0) blockers.push('synthetic_receipt_has_blocked_items');
  if (statusCount(syntheticReceipt, 'imported') + statusCount(syntheticReceipt, 'already_imported') < 1) {
    blockers.push('synthetic_receipt_has_no_imported_item');
  }

  return {
    lc_id: 'LC-ONEDRIVE-06',
    mode: 'write-preflight',
    run_id: runId ?? dryrunReport.run_id ?? syntheticReceipt.run_id ?? 'unknown',
    candidate_id: mapping.candidate_id,
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    dryrun_counts: dryrunReport.summary?.status_counts ?? {},
    synthetic_counts: syntheticReceipt.summary?.status_counts ?? {},
    required_write_refs_present: requiredWriteRefs.filter((field) => mapping[field]),
    allowed_next_action: blockers.length === 0 ? 'schedule_one_pilot_matter_write_window' : 'fix_prewrite_blockers',
    execution_boundary: 'preflight_only_no_vault_write',
    not_claimed: ['pilot import executed', ...notClaimed],
    sanitization:
      'No raw file names, detailed source labels, source object keys, document contents, tenant identifiers, secrets, cookies, or tokens are included.',
  };
}

export function runReconciliation({ mapping, dryrunReport, importReceipt, candidateId, runId }) {
  const blockers = validateWriteMapping(mapping, candidateId);
  if (dryrunReport.gate_status !== 'pass') blockers.push('dryrun_report_not_pass');
  if (importReceipt.gate_status !== 'pass') blockers.push('import_receipt_not_pass');
  if (dryrunReport.candidate_id !== mapping.candidate_id) blockers.push('dryrun_candidate_mismatch');
  if (importReceipt.candidate_id !== mapping.candidate_id) blockers.push('import_candidate_mismatch');
  if (statusCount(dryrunReport, 'blocked') > 0) blockers.push('dryrun_has_blocked_items');
  if (statusCount(dryrunReport, 'retryable') > 0) blockers.push('dryrun_has_retryable_items');
  if (statusCount(importReceipt, 'blocked') > 0) blockers.push('import_has_blocked_items');
  if (statusCount(importReceipt, 'retryable') > 0) blockers.push('import_has_retryable_items');

  const imported = statusCount(importReceipt, 'imported') + statusCount(importReceipt, 'already_imported');
  const expectedReady = statusCount(dryrunReport, 'ready');
  if (imported !== expectedReady) blockers.push('imported_count_does_not_match_dryrun_ready_count');

  const dryrunItems = itemMap(dryrunReport);
  const importItems = itemMap(importReceipt);
  const mismatches = [];
  for (const [itemId, item] of dryrunItems) {
    const importedItem = importItems.get(itemId);
    if (item.status === 'ready' && !['imported', 'already_imported'].includes(importedItem?.status)) {
      mismatches.push({ item_id: itemId, expected: 'imported_or_already_imported', actual: importedItem?.status ?? 'missing' });
    }
    if (item.status === 'skipped' && importedItem?.status !== 'skipped') {
      mismatches.push({ item_id: itemId, expected: 'skipped', actual: importedItem?.status ?? 'missing' });
    }
  }
  for (const itemId of importItems.keys()) {
    if (!dryrunItems.has(itemId)) mismatches.push({ item_id: itemId, expected: 'known_from_dryrun', actual: 'unexpected_import_receipt_item' });
  }
  if (mismatches.length > 0) blockers.push('item_status_mismatch');

  return {
    lc_id: 'LC-ONEDRIVE-07',
    mode: 'reconcile',
    run_id: runId ?? importReceipt.run_id ?? dryrunReport.run_id ?? 'unknown',
    candidate_id: mapping.candidate_id,
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    dryrun_counts: dryrunReport.summary?.status_counts ?? {},
    import_counts: importReceipt.summary?.status_counts ?? {},
    expected_created_counts: importReceipt.summary?.expected_created_counts ?? {},
    mismatches: mismatches.slice(0, 25),
    mismatch_count: mismatches.length,
    rollback_boundary: 'containment_only_no_hard_delete',
    not_claimed: notClaimed,
    sanitization:
      'Reconciliation output contains counts, item ids, and status categories only; no raw customer source labels are included.',
  };
}

export function runGemmaReadiness({ mapping, reconciliationReport, runId }) {
  const blockers = [];
  if (reconciliationReport.gate_status !== 'pass') blockers.push('reconciliation_not_pass');
  if (reconciliationReport.candidate_id !== mapping.candidate_id) blockers.push('candidate_id_mismatch');
  if (mapping.ai_allowed_default === undefined || mapping.ai_allowed_default === null || mapping.ai_allowed_default === '') {
    blockers.push('missing_ai_allowed_default');
  }
  if (mapping.ai_allowed_default === 'unknown') blockers.push('unknown_ai_allowed_default');

  let queueEligibility = 'blocked_by_ai_policy_default';
  if (mapping.ai_allowed_default === true || mapping.ai_allowed_default === 'true') {
    queueEligibility = 'eligible_after_permission_before_ai_review';
    for (const field of ['ai_policy_ref', 'permission_source_ref', 'local_ai_ready_ref']) {
      if (!mapping[field]) blockers.push(`missing_ai_ref_${field}`);
    }
  }

  return {
    lc_id: 'LC-ONEDRIVE-08',
    mode: 'gemma-readiness',
    run_id: runId ?? reconciliationReport.run_id ?? 'unknown',
    candidate_id: mapping.candidate_id,
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    queue_eligibility: queueEligibility,
    permission_before_ai: true,
    indexing_execution: 'not_started',
    allowed_next_action:
      blockers.length === 0 && queueEligibility === 'eligible_after_permission_before_ai_review'
        ? 'operator_may_enqueue_ai_prep_after_permission_gate'
        : 'record_policy_block_or_collect_ai_refs',
    not_claimed: notClaimed,
    sanitization:
      'Readiness output contains policy refs and status categories only; it does not include prompts, source text, model output, or document contents.',
  };
}

export function runWavePlan({ wavePlan, reconciliationReport, gemmaReadiness, runId }) {
  const blockers = [];
  addMissingFieldBlockers(
    blockers,
    wavePlan,
    ['plan_id', 'pilot_validation_ref', 'customer_scope_ref', 'rollback_owner_ref', 'source_of_truth_policy', 'waves'],
    'missing_wave_plan',
  );
  if (reconciliationReport.gate_status !== 'pass') blockers.push('pilot_reconciliation_not_pass');
  if (gemmaReadiness.gate_status !== 'pass') blockers.push('gemma_readiness_not_pass');
  if (wavePlan.source_of_truth_policy !== 'onedrive_read_only_until_cutover_ref') {
    blockers.push('source_of_truth_policy_must_keep_onedrive_read_only_until_cutover');
  }
  if (!Array.isArray(wavePlan.waves) || wavePlan.waves.length === 0) blockers.push('missing_waves');

  const maxMatters = Number(wavePlan.max_matters_per_wave ?? 5);
  const waveSummaries = [];
  for (const [index, wave] of (wavePlan.waves ?? []).entries()) {
    const waveId = wave.wave_id ?? `wave_${index + 1}`;
    const matterCount = Number(wave.matter_count ?? 0);
    const waveBlockers = [];
    if (['customer_wide', 'full_corpus', 'all_matters'].includes(wave.scope_kind)) waveBlockers.push('customer_wide_scope_blocked');
    if (wave.scope_kind !== 'matter_batch') waveBlockers.push('scope_kind_must_be_matter_batch');
    if (!Number.isSafeInteger(matterCount) || matterCount < 1) waveBlockers.push('invalid_matter_count');
    if (Number.isSafeInteger(matterCount) && matterCount > maxMatters) waveBlockers.push('matter_count_exceeds_wave_limit');
    for (const field of ['freeze_window_ref', 'batch_mapping_ref', 'rollback_ref', 'reconciliation_required']) {
      if (wave[field] === undefined || wave[field] === null || wave[field] === '') waveBlockers.push(`missing_wave_${field}`);
    }
    if (wave.reconciliation_required !== true) waveBlockers.push('wave_reconciliation_must_be_required');
    if (wave.cutover_requested === true && !wave.cutover_approval_ref) waveBlockers.push('cutover_requested_without_approval_ref');
    if (waveBlockers.length > 0) blockers.push(`${waveId}:${waveBlockers.join(',')}`);
    waveSummaries.push({ wave_id: waveId, matter_count: matterCount, scope_kind: wave.scope_kind, blockers: waveBlockers });
  }

  return {
    lc_id: 'LC-ONEDRIVE-09',
    mode: 'wave-plan',
    run_id: runId ?? reconciliationReport.run_id ?? 'unknown',
    plan_id: wavePlan.plan_id ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    max_matters_per_wave: maxMatters,
    wave_count: Array.isArray(wavePlan.waves) ? wavePlan.waves.length : 0,
    wave_summaries: waveSummaries,
    first_allowed_scope: 'batch_after_pilot_validation',
    source_of_truth_policy: wavePlan.source_of_truth_policy,
    not_claimed: ['customer-wide import approved', 'source-of-truth cutover approved', ...notClaimed],
    sanitization:
      'Wave plan output contains bounded counts, opaque refs, and status categories only; no raw customer labels are included.',
  };
}

async function runFromArgs(args) {
  if (!args.mode || !args.sanitizedOut) throw new Error('required options: --mode and --sanitized-out');
  if (args.mode === 'write-preflight') {
    if (!args.mapping || !args.dryrunReport || !args.syntheticReceipt) {
      throw new Error('write-preflight requires --mapping, --dryrun-report, and --synthetic-receipt');
    }
    return runWritePreflight({
      mapping: await readJson(args.mapping),
      dryrunReport: await readJson(args.dryrunReport),
      syntheticReceipt: await readJson(args.syntheticReceipt),
      candidateId: args.candidateId,
      runId: args.runId,
    });
  }
  if (args.mode === 'reconcile') {
    if (!args.mapping || !args.dryrunReport || !args.importReceipt) {
      throw new Error('reconcile requires --mapping, --dryrun-report, and --import-receipt');
    }
    return runReconciliation({
      mapping: await readJson(args.mapping),
      dryrunReport: await readJson(args.dryrunReport),
      importReceipt: await readJson(args.importReceipt),
      candidateId: args.candidateId,
      runId: args.runId,
    });
  }
  if (args.mode === 'gemma-readiness') {
    if (!args.mapping || !args.reconciliationReport) {
      throw new Error('gemma-readiness requires --mapping and --reconciliation-report');
    }
    return runGemmaReadiness({
      mapping: await readJson(args.mapping),
      reconciliationReport: await readJson(args.reconciliationReport),
      runId: args.runId,
    });
  }
  if (args.mode === 'wave-plan') {
    if (!args.wavePlan || !args.reconciliationReport || !args.gemmaReadiness) {
      throw new Error('wave-plan requires --wave-plan, --reconciliation-report, and --gemma-readiness');
    }
    return runWavePlan({
      wavePlan: await readJson(args.wavePlan),
      reconciliationReport: await readJson(args.reconciliationReport),
      gemmaReadiness: await readJson(args.gemmaReadiness),
      runId: args.runId,
    });
  }
  throw new Error(`unsupported mode: ${args.mode}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = await runFromArgs(args);
  await writeJson(args.sanitizedOut, report);
  console.log(
    JSON.stringify({
      lc_id: report.lc_id,
      mode: report.mode,
      gate_status: report.gate_status,
      blockers: report.blockers.length,
    }),
  );
  if (report.gate_status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
