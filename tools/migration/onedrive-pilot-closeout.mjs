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

const requiredDryrunMappingFields = ['candidate_id', 'scope_kind', 'single_matter_scope', 'cutover_policy'];

const requiredDryrunRefs = [
  'tenant_ref',
  'client_ref',
  'matter_ref',
  'rollback_owner_ref',
  'operator_ref',
  'security_ref',
  'legal_data_ref',
  'customer_scope_ref',
];

const requiredNextWaveApprovalFields = [
  'plan_id',
  'scope_kind',
  'matter_count',
  'max_matters_per_wave',
  'dryrun_only',
  'vault_write_authorized',
  'customer_wide_import',
  'source_of_truth_cutover',
  'gemma_indexing',
  'onedrive_connected_state',
  'office_open_save_sync',
];

const requiredNextWaveApprovalRefs = [
  'customer_scope_ref',
  'freeze_window_ref',
  'batch_mapping_ref',
  'rollback_ref',
  'security_permission_ref',
  'legal_data_ref',
  'operator_dryrun_ref',
];

const requiredNextWaveDryrunInputFields = [
  'plan_id',
  'scope_kind',
  'matter_count',
  'max_matters_per_wave',
  'dryrun_only',
  'vault_write_authorized',
  'customer_wide_import',
  'source_of_truth_cutover',
  'gemma_indexing',
  'source_content_in_repo',
  'raw_paths_in_repo',
];

const requiredNextWaveDryrunInputRefs = [
  'manifest_ref',
  'batch_mapping_ref',
  'target_resolution_ref',
  'permission_review_ref',
  'legal_data_ref',
  'rollback_ref',
  'sanitized_receipt_destination_ref',
  'local_receipt_handling_ref',
  'operator_ref',
];

const requiredNextWaveWriteDecisionFields = [
  'plan_id',
  'scope_kind',
  'matter_count',
  'max_matters_per_wave',
  'decision_kind',
  'write_execution_authorized',
  'customer_wide_import',
  'source_of_truth_cutover',
  'gemma_indexing',
  'onedrive_connected_state',
  'office_open_save_sync',
];

const requiredNextWaveWriteDecisionRefs = [
  'dryrun_receipt_ref',
  'write_approval_request_ref',
  'db_snapshot_ref',
  'storage_containment_ref',
  'rollback_ref',
  'import_lock_ref',
  'sanitized_receipt_destination_ref',
  'local_receipt_handling_ref',
  'operator_ref',
  'security_permission_ref',
  'legal_data_ref',
];

const requiredNextWaveWriteApprovalFields = [
  'plan_id',
  'scope_kind',
  'matter_count',
  'max_matters_per_wave',
  'approval_kind',
  'write_execution_authorized',
  'execute_immediately',
  'customer_wide_import',
  'source_of_truth_cutover',
  'gemma_indexing',
  'onedrive_connected_state',
  'office_open_save_sync',
];

const requiredNextWaveWriteApprovalRefs = [
  'write_decision_ref',
  'write_execution_approval_ref',
  'write_window_ref',
  'db_snapshot_ref',
  'storage_containment_ref',
  'rollback_ref',
  'import_lock_ref',
  'sanitized_receipt_destination_ref',
  'local_receipt_handling_ref',
  'operator_ref',
  'security_permission_ref',
  'legal_data_ref',
];

const externalRefFields = ['tenant_ref', 'client_ref', 'matter_ref', ...requiredWriteRefs];

const refOwners = {
  tenant_ref: 'Operator / Infrastructure',
  client_ref: 'Customer-scope owner',
  matter_ref: 'Customer-scope owner',
  approval_ref: 'Customer-scope owner',
  dryrun_pass_ref: 'Operator',
  write_window_ref: 'Operator',
  db_snapshot_ref: 'Operator / Infrastructure',
  storage_containment_ref: 'Operator / Infrastructure',
  rollback_owner_ref: 'Rollback owner',
  import_lock_ref: 'Operator',
  sanitized_receipt_destination_ref: 'Operator',
  local_receipt_handling_ref: 'Operator / Security owner',
  operator_ref: 'Operator',
  security_ref: 'Security owner',
  security_permission_ref: 'Security owner',
  permission_review_ref: 'Security owner',
  legal_data_ref: 'Legal-data owner',
  customer_scope_ref: 'Customer-scope owner',
  freeze_window_ref: 'Operator',
  batch_mapping_ref: 'Operator',
  manifest_ref: 'Operator',
  target_resolution_ref: 'Operator / Infrastructure',
  rollback_ref: 'Rollback owner',
  dryrun_receipt_ref: 'Operator',
  write_approval_request_ref: 'Operator',
  write_decision_ref: 'Operator',
  write_execution_approval_ref: 'Operator',
  operator_dryrun_ref: 'Operator',
};

const notClaimed = [
  'customer-wide import',
  'OneDrive connected state',
  'Office open/save/sync',
  'source-of-truth cutover',
  'Gemma indexing execution',
];

const lcPackageSteps = [
  ['LC-ONEDRIVE-00', 'isolated_worktree_and_control_baseline'],
  ['LC-ONEDRIVE-01', 'sanitized_manifest_profiler'],
  ['LC-ONEDRIVE-02', 'pilot_mapping_packet'],
  ['LC-ONEDRIVE-03', 'worker_contract_and_runbook'],
  ['LC-ONEDRIVE-04', 'dryrun_validator'],
  ['LC-ONEDRIVE-05', 'synthetic_import_worker'],
  ['LC-ONEDRIVE-06', 'pilot_write_preflight_only'],
  ['LC-ONEDRIVE-07', 'reconciliation_gate'],
  ['LC-ONEDRIVE-08', 'gemma_indexing_readiness_only'],
  ['LC-ONEDRIVE-09', 'bulk_wave_plan_gate'],
];

const requiredPackageRepoFiles = [
  'docs/release/onedrive-migration-post-launch-plan.md',
  'docs/release/onedrive-pilot-mapping-template.md',
  'docs/release/onedrive-pilot-approval-checklist.md',
  'docs/release/onedrive-pilot-import-worker-design.md',
  'docs/release/onedrive-pilot-import-runbook.md',
  'docs/release/onedrive-bulk-wave-plan.md',
  'docs/release/onedrive-next-wave-readiness-packet.md',
  'docs/release/onedrive-lazycodex-execution-package.md',
  'docs/release/onedrive-pilot-ops-register.md',
  'docs/release/onedrive-pilot-real-run-plan.md',
  'docs/release/onedrive-pilot-real-refs.example.json',
  'tools/migration/onedrive-profile-manifest.mjs',
  'tools/migration/onedrive-profile-manifest.spec.mjs',
  'tools/migration/onedrive-pilot-dryrun.mjs',
  'tools/migration/onedrive-pilot-dryrun.spec.mjs',
  'tools/migration/onedrive-pilot-import.mjs',
  'tools/migration/onedrive-pilot-import.spec.mjs',
  'tools/migration/onedrive-pilot-closeout.mjs',
  'tools/migration/onedrive-pilot-closeout.spec.mjs',
];

const forbiddenPackagePatterns = [
  /AKIA[0-9A-Z]{16}/,
  /BEGIN .*PRIVATE KEY/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /xox[baprs]-/,
  /OneDrive-공유라이브러리/,
  /AMIC - 1\. AMIC/,
  /migration-runs\/.+?\/source-tree\//,
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
    else if (key === 'dryrun-input-gate') args.dryrunInputGate = next;
    else if (key === 'dryrun-receipt-gate') args.dryrunReceiptGate = next;
    else if (key === 'write-decision') args.writeDecision = next;
    else if (key === 'write-decision-gate') args.writeDecisionGate = next;
    else if (key === 'write-approval') args.writeApproval = next;
    else if (key === 'synthetic-receipt') args.syntheticReceipt = next;
    else if (key === 'import-receipt') args.importReceipt = next;
    else if (key === 'reconciliation-report') args.reconciliationReport = next;
    else if (key === 'gemma-readiness') args.gemmaReadiness = next;
    else if (key === 'wave-plan') args.wavePlan = next;
    else if (key === 'approval') args.approval = next;
    else if (key === 'approval-gate') args.approvalGate = next;
    else if (key === 'dryrun-inputs') args.dryrunInputs = next;
    else if (key === 'wave-gate') args.waveGate = next;
    else if (key === 'evidence-root') args.evidenceRoot = next;
    else if (key === 'repo-root') args.repoRoot = next;
    else if (key === 'sanitized-out') args.sanitizedOut = next;
    else if (key === 'run-id') args.runId = next;
    else if (key === 'candidate-id') args.candidateId = next;
    else if (key === 'phase') args.phase = next;
    else throw new Error(`unknown option: --${key}`);
  }
  return args;
}

export function usage() {
  return [
    'usage: node tools/migration/onedrive-pilot-closeout.mjs --mode <refs-intake|write-preflight|reconcile|gemma-readiness|wave-plan|next-wave-approval|next-wave-dryrun-inputs|next-wave-dryrun-receipt|next-wave-write-decision|next-wave-write-approval> --sanitized-out <out.json> [inputs]',
    '',
    'Modes:',
    '  refs-intake      --mapping <json> [--phase <dryrun|write>]',
    '  write-preflight  --mapping <json> --dryrun-report <json> --synthetic-receipt <json>',
    '  reconcile        --mapping <json> --dryrun-report <json> --import-receipt <json>',
    '  gemma-readiness  --mapping <json> --reconciliation-report <json>',
    '  wave-plan        --wave-plan <json> --reconciliation-report <json> --gemma-readiness <json>',
    '  next-wave-approval --approval <json> --wave-gate <json>',
    '  next-wave-dryrun-inputs --dryrun-inputs <json> --approval-gate <json>',
    '  next-wave-dryrun-receipt --dryrun-report <json> --dryrun-input-gate <json>',
    '  next-wave-write-decision --write-decision <json> --dryrun-receipt-gate <json>',
    '  next-wave-write-approval --write-approval <json> --write-decision-gate <json>',
    '  package-audit    [--repo-root <dir>] [--evidence-root <dir>]',
    '',
    'This tool validates gates only. It does not import customer documents or run Gemma indexing.',
  ].join('\n');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readTextOrNull(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
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
    } else if (isPlaceholderRef(object[field])) {
      blockers.push(`${prefix}_placeholder_${field}`);
    }
  }
}

function isPlaceholderRef(value) {
  if (typeof value !== 'string') return false;
  return (
    value === 'PENDING_EXTERNAL_REF' ||
    /^<[^>]+>$/.test(value) ||
    /^ONEDRIVE-[A-Z0-9-]+-REF$/.test(value)
  );
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

function validateDryrunRefMapping(mapping, candidateId) {
  const blockers = [];
  addMissingFieldBlockers(blockers, mapping, requiredDryrunMappingFields, 'missing_mapping');
  addMissingFieldBlockers(blockers, mapping, requiredDryrunRefs, 'missing_dryrun_ref');
  if (candidateId && mapping.candidate_id !== candidateId) blockers.push('candidate_id_mismatch');
  if (mapping.scope_kind !== 'pilot_matter') blockers.push('scope_kind_not_pilot_matter');
  if (!isTruthyBoolean(mapping.single_matter_scope)) blockers.push('scope_not_single_matter');
  if (mapping.cutover_policy !== 'not_requested') blockers.push('cutover_policy_must_not_be_requested');
  if (mapping.ai_allowed_default === 'unknown') blockers.push('unknown_ai_allowed_default');
  return blockers;
}

function fieldGateStatus(mapping, field) {
  const value = mapping?.[field];
  if (value === undefined || value === null || value === '') return 'missing';
  if (isPlaceholderRef(value)) return 'placeholder';
  return 'present';
}

function summarizeOwnerStatuses(rows) {
  const byOwner = new Map();
  for (const row of rows) {
    const current = byOwner.get(row.owner) ?? { owner: row.owner, required: 0, present: 0, blocked: 0 };
    current.required += 1;
    if (row.status === 'present') current.present += 1;
    else current.blocked += 1;
    byOwner.set(row.owner, current);
  }
  return Array.from(byOwner.values()).sort((left, right) => left.owner.localeCompare(right.owner));
}

export function runRefsIntake({ mapping, candidateId, runId, phase = 'write' }) {
  if (!['dryrun', 'write'].includes(phase)) throw new Error(`unsupported refs-intake phase: ${phase}`);
  const dryrunPhase = phase === 'dryrun';
  const requiredRefs = dryrunPhase ? requiredDryrunRefs : externalRefFields;
  const requiredMappingFields = dryrunPhase ? requiredDryrunMappingFields : requiredWriteMappingFields;
  const blockers = dryrunPhase ? validateDryrunRefMapping(mapping, candidateId) : validateWriteMapping(mapping, candidateId);
  const refRows = requiredRefs
    .filter((field, index, fields) => fields.indexOf(field) === index)
    .map((field) => ({
      field,
      owner: refOwners[field] ?? 'Operator',
      status: fieldGateStatus(mapping, field),
      required_for: dryrunPhase ? 'LC-ONEDRIVE-04' : requiredWriteRefs.includes(field) ? 'LC-ONEDRIVE-06' : 'mapping',
    }));
  const mappingRows = requiredMappingFields
    .filter((field) => !requiredRefs.includes(field))
    .map((field) => ({
      field,
      status: fieldGateStatus(mapping, field),
      required_for: 'mapping',
    }));

  return {
    lc_id: dryrunPhase ? 'LC-ONEDRIVE-02/04' : 'LC-ONEDRIVE-02/06',
    mode: 'refs-intake',
    phase,
    run_id: runId ?? 'unknown',
    candidate_id: mapping.candidate_id ?? candidateId ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    owner_summary: summarizeOwnerStatuses(refRows),
    required_ref_statuses: refRows,
    mapping_field_statuses: mappingRows,
    allowed_next_action:
      blockers.length === 0
        ? dryrunPhase
          ? 'prepare_lc04_dryrun_mapping'
          : 'run_real_lc04_dryrun_before_write_preflight'
        : dryrunPhase
          ? 'collect_real_dryrun_refs'
          : 'collect_real_external_refs',
    execution_boundary: 'refs_validation_only_no_vault_write',
    not_claimed: ['dry-run executed', 'pilot import executed', ...notClaimed],
    sanitization:
      'Refs-intake output includes field-level status categories only; ref values, customer labels, raw paths, document names, source keys, secrets, cookies, and tokens are not emitted.',
  };
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

export function runNextWaveApproval({ approval, waveGate, runId }) {
  approval = approval ?? {};
  waveGate = waveGate ?? {};
  const blockers = [];
  addMissingFieldBlockers(blockers, approval, requiredNextWaveApprovalFields, 'missing_next_wave_approval');
  addMissingFieldBlockers(blockers, approval, requiredNextWaveApprovalRefs, 'missing_next_wave_ref');

  if (waveGate.gate_status !== 'pass') blockers.push('wave_plan_gate_not_pass');
  if (approval.plan_id !== waveGate.plan_id) blockers.push('plan_id_mismatch');
  if (approval.scope_kind !== 'matter_batch') blockers.push('scope_kind_must_be_matter_batch');

  const matterCount = Number(approval.matter_count ?? 0);
  const maxMatters = Number(approval.max_matters_per_wave ?? waveGate.max_matters_per_wave ?? 5);
  if (!Number.isSafeInteger(matterCount) || matterCount < 1) blockers.push('invalid_matter_count');
  if (!Number.isSafeInteger(maxMatters) || maxMatters < 1) blockers.push('invalid_max_matters_per_wave');
  if (Number.isSafeInteger(matterCount) && Number.isSafeInteger(maxMatters) && matterCount > maxMatters) {
    blockers.push('matter_count_exceeds_wave_limit');
  }
  if (Number.isSafeInteger(maxMatters) && Number(waveGate.max_matters_per_wave ?? maxMatters) !== maxMatters) {
    blockers.push('max_matters_per_wave_mismatch');
  }

  const plannedMatterCount = Number(
    Array.isArray(waveGate.wave_summaries)
      ? waveGate.wave_summaries.reduce((sum, wave) => sum + Number(wave.matter_count ?? 0), 0)
      : 0,
  );
  if (plannedMatterCount > 0 && plannedMatterCount !== matterCount) blockers.push('matter_count_mismatch');

  if (approval.dryrun_only !== true) blockers.push('dryrun_only_must_be_true');
  if (approval.vault_write_authorized !== false) blockers.push('vault_write_must_not_be_authorized');
  if (approval.customer_wide_import !== false) blockers.push('customer_wide_import_must_be_false');
  if (approval.source_of_truth_cutover !== false) blockers.push('source_of_truth_cutover_must_be_false');
  if (approval.gemma_indexing !== false) blockers.push('gemma_indexing_must_be_false');
  if (approval.onedrive_connected_state !== false) blockers.push('onedrive_connected_state_must_be_false');
  if (approval.office_open_save_sync !== false) blockers.push('office_open_save_sync_must_be_false');

  const refStatuses = requiredNextWaveApprovalRefs.map((field) => ({
    field,
    owner: refOwners[field] ?? 'Operator',
    status: fieldGateStatus(approval, field),
  }));

  return {
    lc_id: 'LC-ONEDRIVE-09/PW-02',
    mode: 'next-wave-approval',
    run_id: runId ?? waveGate.run_id ?? 'unknown',
    plan_id: approval.plan_id ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    scope_kind: approval.scope_kind,
    matter_count: matterCount,
    max_matters_per_wave: maxMatters,
    ref_statuses: refStatuses,
    owner_summary: summarizeOwnerStatuses(refStatuses),
    dryrun_execution_state: 'not_started',
    actual_execution_state: {
      vault_write: 'not_authorized',
      customer_wide_import: 'not_authorized',
      source_of_truth_cutover: 'not_authorized',
      gemma_indexing: 'not_authorized',
      onedrive_connected_state: 'not_claimed',
      office_open_save_sync: 'not_claimed',
    },
    allowed_next_action: blockers.length === 0 ? 'prepare_local_next_wave_dryrun_inputs' : 'collect_exact_next_wave_approval_refs',
    not_claimed: ['Vault write/import approved', 'next-wave dry-run executed', ...notClaimed],
    sanitization:
      'Next-wave approval output contains ref statuses, counts, and blocker codes only; it does not include raw approval text, source labels, paths, object keys, or document contents.',
  };
}

export function runNextWaveDryrunInputs({ dryrunInputs, approvalGate, runId }) {
  dryrunInputs = dryrunInputs ?? {};
  approvalGate = approvalGate ?? {};
  const blockers = [];
  addMissingFieldBlockers(blockers, dryrunInputs, requiredNextWaveDryrunInputFields, 'missing_dryrun_input');
  addMissingFieldBlockers(blockers, dryrunInputs, requiredNextWaveDryrunInputRefs, 'missing_dryrun_input_ref');

  if (approvalGate.mode !== 'next-wave-approval') blockers.push('approval_gate_mode_invalid');
  if (approvalGate.gate_status !== 'pass') blockers.push('approval_gate_not_pass');
  if (dryrunInputs.plan_id !== approvalGate.plan_id) blockers.push('plan_id_mismatch');
  if (dryrunInputs.scope_kind !== 'matter_batch') blockers.push('scope_kind_must_be_matter_batch');

  const matterCount = Number(dryrunInputs.matter_count ?? 0);
  const maxMatters = Number(dryrunInputs.max_matters_per_wave ?? approvalGate.max_matters_per_wave ?? 5);
  if (!Number.isSafeInteger(matterCount) || matterCount < 1) blockers.push('invalid_matter_count');
  if (!Number.isSafeInteger(maxMatters) || maxMatters < 1) blockers.push('invalid_max_matters_per_wave');
  if (Number.isSafeInteger(matterCount) && Number.isSafeInteger(maxMatters) && matterCount > maxMatters) {
    blockers.push('matter_count_exceeds_wave_limit');
  }
  if (Number.isSafeInteger(matterCount) && Number(approvalGate.matter_count ?? matterCount) !== matterCount) {
    blockers.push('matter_count_mismatch');
  }
  if (Number.isSafeInteger(maxMatters) && Number(approvalGate.max_matters_per_wave ?? maxMatters) !== maxMatters) {
    blockers.push('max_matters_per_wave_mismatch');
  }

  if (dryrunInputs.dryrun_only !== true) blockers.push('dryrun_only_must_be_true');
  if (dryrunInputs.vault_write_authorized !== false) blockers.push('vault_write_must_not_be_authorized');
  if (dryrunInputs.customer_wide_import !== false) blockers.push('customer_wide_import_must_be_false');
  if (dryrunInputs.source_of_truth_cutover !== false) blockers.push('source_of_truth_cutover_must_be_false');
  if (dryrunInputs.gemma_indexing !== false) blockers.push('gemma_indexing_must_be_false');
  if (dryrunInputs.source_content_in_repo !== false) blockers.push('source_content_must_not_enter_repo');
  if (dryrunInputs.raw_paths_in_repo !== false) blockers.push('raw_paths_must_not_enter_repo');

  const refStatuses = requiredNextWaveDryrunInputRefs.map((field) => ({
    field,
    owner: refOwners[field] ?? 'Operator',
    status: fieldGateStatus(dryrunInputs, field),
  }));

  return {
    lc_id: 'LC-ONEDRIVE-09/PW-04',
    mode: 'next-wave-dryrun-inputs',
    run_id: runId ?? approvalGate.run_id ?? 'unknown',
    plan_id: dryrunInputs.plan_id ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    scope_kind: dryrunInputs.scope_kind,
    matter_count: matterCount,
    max_matters_per_wave: maxMatters,
    ref_statuses: refStatuses,
    owner_summary: summarizeOwnerStatuses(refStatuses),
    dryrun_execution_state: 'not_started',
    actual_execution_state: {
      vault_db_write: 'not_executed',
      vault_storage_write: 'not_executed',
      vault_write: 'not_authorized',
      customer_wide_import: 'not_authorized',
      source_of_truth_cutover: 'not_authorized',
      gemma_indexing: 'not_authorized',
    },
    allowed_next_action: blockers.length === 0 ? 'run_next_wave_dryrun_only_with_local_inputs' : 'fix_next_wave_dryrun_input_refs',
    not_claimed: ['next-wave dry-run executed', 'Vault write/import approved', ...notClaimed],
    sanitization:
      'Next-wave dry-run input output contains ref statuses, counts, and blocker codes only; it does not include raw source paths, document names, source object keys, tenant-private values, document text, OCR excerpts, screenshots, or ref values.',
  };
}

export function runNextWaveDryrunReceipt({ dryrunReport, dryrunInputGate, runId }) {
  dryrunReport = dryrunReport ?? {};
  dryrunInputGate = dryrunInputGate ?? {};
  const blockers = [];

  if (dryrunInputGate.mode !== 'next-wave-dryrun-inputs') blockers.push('dryrun_input_gate_mode_invalid');
  if (dryrunInputGate.gate_status !== 'pass') blockers.push('dryrun_input_gate_not_pass');
  if (dryrunReport.mode !== 'dry-run') blockers.push('dryrun_report_mode_invalid');
  if (dryrunReport.gate_status !== 'pass') blockers.push('dryrun_report_not_pass');

  const statusCounts = dryrunReport.summary?.status_counts ?? {};
  const expectedWriteCounts = dryrunReport.summary?.expected_write_counts ?? {};
  const totalItems = Number(dryrunReport.summary?.total_items ?? 0);
  const readyCount = Number(statusCounts.ready ?? 0);
  if (!Number.isSafeInteger(totalItems) || totalItems < 1) blockers.push('dryrun_has_no_items');
  if (statusCount(dryrunReport, 'blocked') > 0) blockers.push('dryrun_has_blocked_items');
  if (statusCount(dryrunReport, 'retryable') > 0) blockers.push('dryrun_has_retryable_items');

  for (const field of ['documents', 'file_objects', 'initial_versions', 'audit_events']) {
    if (Number(expectedWriteCounts[field] ?? 0) !== readyCount) blockers.push(`expected_write_count_mismatch_${field}`);
  }

  const notClaimedList = Array.isArray(dryrunReport.not_claimed) ? dryrunReport.not_claimed : [];
  for (const claim of ['Vault DB write', 'Vault storage write', 'Vault import']) {
    if (!notClaimedList.includes(claim)) blockers.push(`missing_not_claimed_${claim.toLowerCase().replaceAll(' ', '_')}`);
  }

  return {
    lc_id: 'LC-ONEDRIVE-09/PW-05',
    mode: 'next-wave-dryrun-receipt',
    run_id: runId ?? dryrunReport.run_id ?? dryrunInputGate.run_id ?? 'unknown',
    plan_id: dryrunInputGate.plan_id ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    scope_kind: dryrunInputGate.scope_kind,
    matter_count: Number(dryrunInputGate.matter_count ?? 0),
    max_matters_per_wave: Number(dryrunInputGate.max_matters_per_wave ?? 0),
    dryrun_counts: statusCounts,
    expected_write_counts: expectedWriteCounts,
    dryrun_execution_state: blockers.length === 0 ? 'receipt_passed_dryrun_only' : 'receipt_blocked',
    actual_execution_state: {
      vault_db_write: 'not_executed_by_dryrun_report',
      vault_storage_write: 'not_executed_by_dryrun_report',
      vault_import: 'not_executed_by_dryrun_report',
      customer_wide_import: 'not_authorized',
      source_of_truth_cutover: 'not_authorized',
      gemma_indexing: 'not_authorized',
    },
    allowed_next_action: blockers.length === 0 ? 'prepare_next_wave_write_decision_packet' : 'resolve_next_wave_dryrun_blockers',
    not_claimed: ['Vault write/import approved', ...notClaimed],
    sanitization:
      'Next-wave dry-run receipt output contains bounded counts and blocker codes only; it does not include raw source paths, document names, source object keys, tenant-private values, document text, OCR excerpts, screenshots, or item ids.',
  };
}

export function runNextWaveWriteDecision({ writeDecision, dryrunReceiptGate, runId }) {
  writeDecision = writeDecision ?? {};
  dryrunReceiptGate = dryrunReceiptGate ?? {};
  const blockers = [];
  addMissingFieldBlockers(blockers, writeDecision, requiredNextWaveWriteDecisionFields, 'missing_write_decision');
  addMissingFieldBlockers(blockers, writeDecision, requiredNextWaveWriteDecisionRefs, 'missing_write_decision_ref');

  if (dryrunReceiptGate.mode !== 'next-wave-dryrun-receipt') blockers.push('dryrun_receipt_gate_mode_invalid');
  if (dryrunReceiptGate.gate_status !== 'pass') blockers.push('dryrun_receipt_gate_not_pass');
  if (writeDecision.plan_id !== dryrunReceiptGate.plan_id) blockers.push('plan_id_mismatch');
  if (writeDecision.scope_kind !== 'matter_batch') blockers.push('scope_kind_must_be_matter_batch');
  if (writeDecision.decision_kind !== 'request_write_approval') blockers.push('decision_kind_must_request_write_approval');

  const matterCount = Number(writeDecision.matter_count ?? 0);
  const maxMatters = Number(writeDecision.max_matters_per_wave ?? dryrunReceiptGate.max_matters_per_wave ?? 5);
  if (!Number.isSafeInteger(matterCount) || matterCount < 1) blockers.push('invalid_matter_count');
  if (!Number.isSafeInteger(maxMatters) || maxMatters < 1) blockers.push('invalid_max_matters_per_wave');
  if (Number.isSafeInteger(matterCount) && Number.isSafeInteger(maxMatters) && matterCount > maxMatters) {
    blockers.push('matter_count_exceeds_wave_limit');
  }
  if (Number.isSafeInteger(matterCount) && Number(dryrunReceiptGate.matter_count ?? matterCount) !== matterCount) {
    blockers.push('matter_count_mismatch');
  }
  if (Number.isSafeInteger(maxMatters) && Number(dryrunReceiptGate.max_matters_per_wave ?? maxMatters) !== maxMatters) {
    blockers.push('max_matters_per_wave_mismatch');
  }

  if (writeDecision.write_execution_authorized !== false) blockers.push('write_execution_must_not_be_authorized_by_decision_packet');
  if (writeDecision.customer_wide_import !== false) blockers.push('customer_wide_import_must_be_false');
  if (writeDecision.source_of_truth_cutover !== false) blockers.push('source_of_truth_cutover_must_be_false');
  if (writeDecision.gemma_indexing !== false) blockers.push('gemma_indexing_must_be_false');
  if (writeDecision.onedrive_connected_state !== false) blockers.push('onedrive_connected_state_must_be_false');
  if (writeDecision.office_open_save_sync !== false) blockers.push('office_open_save_sync_must_be_false');

  const refStatuses = requiredNextWaveWriteDecisionRefs.map((field) => ({
    field,
    owner: refOwners[field] ?? 'Operator',
    status: fieldGateStatus(writeDecision, field),
  }));

  return {
    lc_id: 'LC-ONEDRIVE-09/PW-06',
    mode: 'next-wave-write-decision',
    run_id: runId ?? dryrunReceiptGate.run_id ?? 'unknown',
    plan_id: writeDecision.plan_id ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    scope_kind: writeDecision.scope_kind,
    matter_count: matterCount,
    max_matters_per_wave: maxMatters,
    dryrun_counts: dryrunReceiptGate.dryrun_counts ?? {},
    expected_write_counts: dryrunReceiptGate.expected_write_counts ?? {},
    ref_statuses: refStatuses,
    owner_summary: summarizeOwnerStatuses(refStatuses),
    decision_state: blockers.length === 0 ? 'ready_for_separate_write_approval_request' : 'decision_packet_blocked',
    actual_execution_state: {
      vault_write: 'not_authorized',
      vault_import: 'not_authorized',
      vault_db_write: 'not_executed',
      vault_storage_write: 'not_executed',
      customer_wide_import: 'not_authorized',
      source_of_truth_cutover: 'not_authorized',
      gemma_indexing: 'not_authorized',
    },
    allowed_next_action: blockers.length === 0 ? 'request_separate_operator_write_approval' : 'fix_write_decision_packet',
    not_claimed: ['Vault write/import approved', 'Vault write/import executed', ...notClaimed],
    sanitization:
      'Next-wave write decision output contains bounded counts, field statuses, and blocker codes only; it does not include approval text, raw source paths, document names, source object keys, tenant-private values, document text, OCR excerpts, screenshots, item ids, or ref values.',
  };
}

export function runNextWaveWriteApproval({ writeApproval, writeDecisionGate, runId }) {
  writeApproval = writeApproval ?? {};
  writeDecisionGate = writeDecisionGate ?? {};
  const blockers = [];
  addMissingFieldBlockers(blockers, writeApproval, requiredNextWaveWriteApprovalFields, 'missing_write_approval');
  addMissingFieldBlockers(blockers, writeApproval, requiredNextWaveWriteApprovalRefs, 'missing_write_approval_ref');

  if (writeDecisionGate.mode !== 'next-wave-write-decision') blockers.push('write_decision_gate_mode_invalid');
  if (writeDecisionGate.gate_status !== 'pass') blockers.push('write_decision_gate_not_pass');
  if (writeApproval.plan_id !== writeDecisionGate.plan_id) blockers.push('plan_id_mismatch');
  if (writeApproval.scope_kind !== 'matter_batch') blockers.push('scope_kind_must_be_matter_batch');
  if (writeApproval.approval_kind !== 'authorize_bounded_write_execution') {
    blockers.push('approval_kind_must_authorize_bounded_write_execution');
  }

  const matterCount = Number(writeApproval.matter_count ?? 0);
  const maxMatters = Number(writeApproval.max_matters_per_wave ?? writeDecisionGate.max_matters_per_wave ?? 5);
  if (!Number.isSafeInteger(matterCount) || matterCount < 1) blockers.push('invalid_matter_count');
  if (!Number.isSafeInteger(maxMatters) || maxMatters < 1) blockers.push('invalid_max_matters_per_wave');
  if (Number.isSafeInteger(matterCount) && Number.isSafeInteger(maxMatters) && matterCount > maxMatters) {
    blockers.push('matter_count_exceeds_wave_limit');
  }
  if (Number.isSafeInteger(matterCount) && Number(writeDecisionGate.matter_count ?? matterCount) !== matterCount) {
    blockers.push('matter_count_mismatch');
  }
  if (Number.isSafeInteger(maxMatters) && Number(writeDecisionGate.max_matters_per_wave ?? maxMatters) !== maxMatters) {
    blockers.push('max_matters_per_wave_mismatch');
  }

  if (writeApproval.write_execution_authorized !== true) blockers.push('write_execution_must_be_explicitly_authorized');
  if (writeApproval.execute_immediately !== false) blockers.push('execute_immediately_must_be_false');
  if (writeApproval.customer_wide_import !== false) blockers.push('customer_wide_import_must_be_false');
  if (writeApproval.source_of_truth_cutover !== false) blockers.push('source_of_truth_cutover_must_be_false');
  if (writeApproval.gemma_indexing !== false) blockers.push('gemma_indexing_must_be_false');
  if (writeApproval.onedrive_connected_state !== false) blockers.push('onedrive_connected_state_must_be_false');
  if (writeApproval.office_open_save_sync !== false) blockers.push('office_open_save_sync_must_be_false');

  const refStatuses = requiredNextWaveWriteApprovalRefs.map((field) => ({
    field,
    owner: refOwners[field] ?? 'Operator',
    status: fieldGateStatus(writeApproval, field),
  }));

  return {
    lc_id: 'LC-ONEDRIVE-09/PW-07',
    mode: 'next-wave-write-approval',
    run_id: runId ?? writeDecisionGate.run_id ?? 'unknown',
    plan_id: writeApproval.plan_id ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    scope_kind: writeApproval.scope_kind,
    matter_count: matterCount,
    max_matters_per_wave: maxMatters,
    dryrun_counts: writeDecisionGate.dryrun_counts ?? {},
    expected_write_counts: writeDecisionGate.expected_write_counts ?? {},
    ref_statuses: refStatuses,
    owner_summary: summarizeOwnerStatuses(refStatuses),
    approval_state: blockers.length === 0 ? 'bounded_write_authorized_pending_execution_preflight' : 'write_approval_blocked',
    actual_execution_state: {
      vault_write: blockers.length === 0 ? 'authorized_not_executed' : 'not_authorized',
      vault_import: blockers.length === 0 ? 'authorized_not_executed' : 'not_authorized',
      vault_db_write: 'not_executed',
      vault_storage_write: 'not_executed',
      customer_wide_import: 'not_authorized',
      source_of_truth_cutover: 'not_authorized',
      gemma_indexing: 'not_authorized',
    },
    allowed_next_action: blockers.length === 0 ? 'prepare_bounded_write_execution_preflight' : 'fix_write_approval_packet',
    not_claimed: ['Vault write/import executed', 'source-of-truth cutover approved', ...notClaimed],
    sanitization:
      'Next-wave write approval output contains bounded counts, field statuses, and blocker codes only; it does not include approval text, raw source paths, document names, source object keys, tenant-private values, document text, OCR excerpts, screenshots, item ids, or ref values.',
  };
}

export async function runPackageAudit({ repoRoot = process.cwd(), evidenceRoot = '.omo/evidence', runId }) {
  const blockers = [];
  const lc_status = [];
  const scannedFiles = [];
  const resolvedEvidenceRoot = path.isAbsolute(evidenceRoot) ? evidenceRoot : path.join(repoRoot, evidenceRoot);

  for (const [lcId, purpose] of lcPackageSteps) {
    const lcDir = path.join(resolvedEvidenceRoot, lcId);
    const missingEvidence = [];
    for (const file of ['executor.md', 'manual-qa.md', 'review.md', 'gate-review.md']) {
      const filePath = path.join(lcDir, file);
      const content = await readTextOrNull(filePath);
      if (content === null) {
        missingEvidence.push(file);
        continue;
      }
      scannedFiles.push(filePath);
      scanForbidden(content, filePath, blockers);
    }
    const gatePath = path.join(lcDir, 'gate-review.md');
    const gateReview = await readTextOrNull(gatePath);
    const gateApproved = gateReview?.includes('Decision: APPROVED') ?? false;
    if (missingEvidence.length > 0) blockers.push(`${lcId}:missing_evidence:${missingEvidence.join(',')}`);
    if (!gateApproved) blockers.push(`${lcId}:gate_not_approved`);
    if (lcId === 'LC-ONEDRIVE-06' && !gateReview?.includes('actual pilot write is not complete')) {
      blockers.push('LC-ONEDRIVE-06:missing_preflight_only_boundary');
    }
    if (lcId === 'LC-ONEDRIVE-08' && !gateReview?.includes('No Gemma execution')) {
      blockers.push('LC-ONEDRIVE-08:missing_no_gemma_execution_boundary');
    }
    lc_status.push({
      lc_id: lcId,
      purpose,
      evidence_files_present: missingEvidence.length === 0,
      gate_approved: gateApproved,
      status:
        lcId === 'LC-ONEDRIVE-06'
          ? 'preflight_ready_actual_write_not_executed'
          : lcId === 'LC-ONEDRIVE-08'
            ? 'readiness_ready_indexing_not_started'
            : gateApproved && missingEvidence.length === 0
              ? 'prepared'
              : 'blocked',
    });
  }

  const repoFiles = [];
  for (const relativePath of requiredPackageRepoFiles) {
    const filePath = path.join(repoRoot, relativePath);
    const content = await readTextOrNull(filePath);
    if (content === null) {
      blockers.push(`missing_repo_file:${relativePath}`);
      repoFiles.push({ path: relativePath, present: false });
      continue;
    }
    scannedFiles.push(filePath);
    const scanSkippedReason = relativePath === 'tools/migration/onedrive-pilot-closeout.mjs' ? 'scanner_source_contains_marker_patterns' : undefined;
    if (!scanSkippedReason) scanForbidden(content, relativePath, blockers);
    repoFiles.push({ path: relativePath, present: true, scan_skipped_reason: scanSkippedReason });
  }

  return {
    lc_id: 'LC-ONEDRIVE-00-09',
    mode: 'package-audit',
    run_id: runId ?? 'unknown',
    gate_status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    lc_status,
    repo_files: repoFiles,
    scanned_file_count: scannedFiles.length,
    final_state:
      blockers.length === 0
        ? 'prepared_for_one_post_launch_pilot_matter_with_external_refs'
        : 'blocked_until_package_gaps_are_resolved',
    actual_execution_state: {
      customer_wide_import: 'not_executed',
      pilot_write: 'not_executed_by_package_audit',
      gemma_indexing: 'not_started',
      source_of_truth_cutover: 'not_approved',
    },
    not_claimed: notClaimed,
    sanitization:
      'Package audit scans required repo files and local evidence for forbidden secret/source markers and emits only bounded status metadata.',
  };
}

function scanForbidden(content, label, blockers) {
  for (const pattern of forbiddenPackagePatterns) {
    if (pattern.test(content)) blockers.push(`forbidden_marker:${label}`);
  }
}

async function runFromArgs(args) {
  if (!args.mode || !args.sanitizedOut) throw new Error('required options: --mode and --sanitized-out');
  if (args.mode === 'refs-intake') {
    if (!args.mapping) throw new Error('refs-intake requires --mapping');
    return runRefsIntake({
      mapping: await readJson(args.mapping),
      candidateId: args.candidateId,
      runId: args.runId,
      phase: args.phase ?? 'write',
    });
  }
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
  if (args.mode === 'next-wave-approval') {
    if (!args.approval || !args.waveGate) {
      throw new Error('next-wave-approval requires --approval and --wave-gate');
    }
    return runNextWaveApproval({
      approval: await readJson(args.approval),
      waveGate: await readJson(args.waveGate),
      runId: args.runId,
    });
  }
  if (args.mode === 'next-wave-dryrun-inputs') {
    if (!args.dryrunInputs || !args.approvalGate) {
      throw new Error('next-wave-dryrun-inputs requires --dryrun-inputs and --approval-gate');
    }
    return runNextWaveDryrunInputs({
      dryrunInputs: await readJson(args.dryrunInputs),
      approvalGate: await readJson(args.approvalGate),
      runId: args.runId,
    });
  }
  if (args.mode === 'next-wave-dryrun-receipt') {
    if (!args.dryrunReport || !args.dryrunInputGate) {
      throw new Error('next-wave-dryrun-receipt requires --dryrun-report and --dryrun-input-gate');
    }
    return runNextWaveDryrunReceipt({
      dryrunReport: await readJson(args.dryrunReport),
      dryrunInputGate: await readJson(args.dryrunInputGate),
      runId: args.runId,
    });
  }
  if (args.mode === 'next-wave-write-decision') {
    if (!args.writeDecision || !args.dryrunReceiptGate) {
      throw new Error('next-wave-write-decision requires --write-decision and --dryrun-receipt-gate');
    }
    return runNextWaveWriteDecision({
      writeDecision: await readJson(args.writeDecision),
      dryrunReceiptGate: await readJson(args.dryrunReceiptGate),
      runId: args.runId,
    });
  }
  if (args.mode === 'next-wave-write-approval') {
    if (!args.writeApproval || !args.writeDecisionGate) {
      throw new Error('next-wave-write-approval requires --write-approval and --write-decision-gate');
    }
    return runNextWaveWriteApproval({
      writeApproval: await readJson(args.writeApproval),
      writeDecisionGate: await readJson(args.writeDecisionGate),
      runId: args.runId,
    });
  }
  if (args.mode === 'package-audit') {
    return runPackageAudit({
      repoRoot: args.repoRoot ?? process.cwd(),
      evidenceRoot: args.evidenceRoot ?? '.omo/evidence',
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
