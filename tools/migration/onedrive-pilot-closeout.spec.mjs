import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  runGemmaReadiness,
  runNextWaveApproval,
  runNextWaveDryrunInputs,
  runNextWaveDryrunReceipt,
  runNextWaveWriteApproval,
  runNextWaveWriteDecision,
  runNextWaveWriteExecutionPreflight,
  runPackageAudit,
  runReconciliation,
  runRefsIntake,
  runWavePlan,
  runWritePreflight,
} from './onedrive-pilot-closeout.mjs';

const mapping = {
  candidate_id: 'candidate-a',
  tenant_ref: 'TENANT-REF',
  client_ref: 'CLIENT-REF',
  matter_ref: 'MATTER-REF',
  status: 'ready_for_write_mode',
  scope_kind: 'pilot_matter',
  single_matter_scope: true,
  duplicate_policy: 'new_document',
  unsupported_type_policy: 'skip_with_receipt',
  zero_byte_policy: 'skip_with_receipt',
  large_object_policy: 'worker_stream_only',
  cutover_policy: 'not_requested',
  ai_allowed_default: false,
  approval_ref: 'APPROVAL-REF',
  dryrun_pass_ref: 'DRYRUN-PASS-REF',
  write_window_ref: 'WRITE-WINDOW-REF',
  db_snapshot_ref: 'DB-SNAPSHOT-REF',
  storage_containment_ref: 'STORAGE-CONTAINMENT-REF',
  rollback_owner_ref: 'ROLLBACK-OWNER-REF',
  import_lock_ref: 'IMPORT-LOCK-REF',
  sanitized_receipt_destination_ref: 'SANITIZED-RECEIPT-DESTINATION-REF',
  local_receipt_handling_ref: 'LOCAL-RECEIPT-HANDLING-REF',
  operator_ref: 'OPERATOR-REF',
  security_ref: 'SECURITY-REF',
  legal_data_ref: 'LEGAL-DATA-REF',
  customer_scope_ref: 'CUSTOMER-SCOPE-REF',
};

const dryrunReport = {
  run_id: 'run-a',
  mode: 'dry-run',
  gate_status: 'pass',
  candidate_id: 'candidate-a',
  summary: {
    total_items: 2,
    status_counts: { ready: 1, skipped: 1 },
    expected_write_counts: { documents: 1, file_objects: 1, initial_versions: 1, audit_events: 1 },
  },
  items: [
    { item_id: 'item-ready', status: 'ready', reasons: ['ready_for_import'], warnings: [], extension: '.docx', size_bytes: 1024 },
    { item_id: 'item-skip', status: 'skipped', reasons: ['zero_byte_skip_with_receipt'], warnings: [], extension: '.pdf', size_bytes: 0 },
  ],
  not_claimed: ['Vault import', 'Vault DB write', 'Vault storage write'],
};

const importReceipt = {
  run_id: 'run-a',
  mode: 'synthetic-write',
  gate_status: 'pass',
  candidate_id: 'candidate-a',
  fixture_store_kind: 'local_synthetic_only',
  summary: {
    status_counts: { imported: 1, skipped: 1 },
    expected_created_counts: { documents: 1, file_objects: 1, initial_versions: 1, audit_events: 1, storage_objects: 1 },
  },
  items: [
    { item_id: 'item-ready', status: 'imported', reasons: ['synthetic_write_imported'], warnings: [], extension: '.docx', size_bytes: 1024 },
    { item_id: 'item-skip', status: 'skipped', reasons: ['zero_byte_skip_with_receipt'], warnings: [], extension: '.pdf', size_bytes: 0 },
  ],
};

const nextWaveGate = {
  lc_id: 'LC-ONEDRIVE-09',
  mode: 'wave-plan',
  run_id: 'run-a',
  plan_id: 'wave-plan-a',
  gate_status: 'pass',
  blockers: [],
  max_matters_per_wave: 3,
  wave_count: 1,
  wave_summaries: [{ wave_id: 'wave-01', matter_count: 2, scope_kind: 'matter_batch', blockers: [] }],
};

const nextWaveApproval = {
  plan_id: 'wave-plan-a',
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  customer_scope_ref: 'CUSTOMER-SCOPE-APPROVED-20260625',
  freeze_window_ref: 'FREEZE-WINDOW-APPROVED-20260625',
  batch_mapping_ref: 'BATCH-MAPPING-APPROVED-20260625',
  rollback_ref: 'ROLLBACK-CONTAINMENT-APPROVED-20260625',
  security_permission_ref: 'SECURITY-PERMISSION-APPROVED-20260625',
  legal_data_ref: 'LEGAL-DATA-APPROVED-20260625',
  operator_dryrun_ref: 'OPERATOR-DRYRUN-APPROVED-20260625',
  dryrun_only: true,
  vault_write_authorized: false,
  customer_wide_import: false,
  source_of_truth_cutover: false,
  gemma_indexing: false,
  onedrive_connected_state: false,
  office_open_save_sync: false,
};

const nextWaveApprovalGate = {
  lc_id: 'LC-ONEDRIVE-09/PW-02',
  mode: 'next-wave-approval',
  run_id: 'run-a',
  plan_id: 'wave-plan-a',
  gate_status: 'pass',
  blockers: [],
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
};

const nextWaveDryrunInputs = {
  plan_id: 'wave-plan-a',
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  manifest_ref: 'MANIFEST-READY-20260625',
  batch_mapping_ref: 'BATCH-MAPPING-READY-20260625',
  target_resolution_ref: 'TARGET-RESOLUTION-READY-20260625',
  permission_review_ref: 'PERMISSION-REVIEW-READY-20260625',
  legal_data_ref: 'LEGAL-DATA-READY-20260625',
  rollback_ref: 'ROLLBACK-CONTAINMENT-READY-20260625',
  sanitized_receipt_destination_ref: 'SANITIZED-RECEIPT-READY-20260625',
  local_receipt_handling_ref: 'LOCAL-RECEIPT-HANDLING-READY-20260625',
  operator_ref: 'OPERATOR-READY-20260625',
  dryrun_only: true,
  vault_write_authorized: false,
  customer_wide_import: false,
  source_of_truth_cutover: false,
  gemma_indexing: false,
  source_content_in_repo: false,
  raw_paths_in_repo: false,
};

const nextWaveDryrunInputGate = {
  lc_id: 'LC-ONEDRIVE-09/PW-04',
  mode: 'next-wave-dryrun-inputs',
  run_id: 'run-a',
  plan_id: 'wave-plan-a',
  gate_status: 'pass',
  blockers: [],
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
};

const nextWaveDryrunReceiptGate = {
  lc_id: 'LC-ONEDRIVE-09/PW-05',
  mode: 'next-wave-dryrun-receipt',
  run_id: 'run-a',
  plan_id: 'wave-plan-a',
  gate_status: 'pass',
  blockers: [],
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  dryrun_counts: { ready: 1, skipped: 1 },
  expected_write_counts: { documents: 1, file_objects: 1, initial_versions: 1, audit_events: 1 },
};

const nextWaveWriteDecision = {
  plan_id: 'wave-plan-a',
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  decision_kind: 'request_write_approval',
  dryrun_receipt_ref: 'DRYRUN-RECEIPT-READY-20260625',
  write_approval_request_ref: 'WRITE-APPROVAL-REQUEST-READY-20260625',
  db_snapshot_ref: 'DB-SNAPSHOT-READY-20260625',
  storage_containment_ref: 'STORAGE-CONTAINMENT-READY-20260625',
  rollback_ref: 'ROLLBACK-CONTAINMENT-READY-20260625',
  import_lock_ref: 'IMPORT-LOCK-READY-20260625',
  sanitized_receipt_destination_ref: 'SANITIZED-RECEIPT-READY-20260625',
  local_receipt_handling_ref: 'LOCAL-RECEIPT-HANDLING-READY-20260625',
  operator_ref: 'OPERATOR-READY-20260625',
  security_permission_ref: 'SECURITY-PERMISSION-READY-20260625',
  legal_data_ref: 'LEGAL-DATA-READY-20260625',
  write_execution_authorized: false,
  customer_wide_import: false,
  source_of_truth_cutover: false,
  gemma_indexing: false,
  onedrive_connected_state: false,
  office_open_save_sync: false,
};

const nextWaveWriteDecisionGate = {
  lc_id: 'LC-ONEDRIVE-09/PW-06',
  mode: 'next-wave-write-decision',
  run_id: 'run-a',
  plan_id: 'wave-plan-a',
  gate_status: 'pass',
  blockers: [],
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  dryrun_counts: { ready: 1, skipped: 1 },
  expected_write_counts: { documents: 1, file_objects: 1, initial_versions: 1, audit_events: 1 },
};

const nextWaveWriteApproval = {
  plan_id: 'wave-plan-a',
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  approval_kind: 'authorize_bounded_write_execution',
  write_decision_ref: 'WRITE-DECISION-READY-20260625',
  write_execution_approval_ref: 'WRITE-EXECUTION-APPROVED-20260625',
  write_window_ref: 'WRITE-WINDOW-READY-20260625',
  db_snapshot_ref: 'DB-SNAPSHOT-READY-20260625',
  storage_containment_ref: 'STORAGE-CONTAINMENT-READY-20260625',
  rollback_ref: 'ROLLBACK-CONTAINMENT-READY-20260625',
  import_lock_ref: 'IMPORT-LOCK-READY-20260625',
  sanitized_receipt_destination_ref: 'SANITIZED-RECEIPT-READY-20260625',
  local_receipt_handling_ref: 'LOCAL-RECEIPT-HANDLING-READY-20260625',
  operator_ref: 'OPERATOR-READY-20260625',
  security_permission_ref: 'SECURITY-PERMISSION-READY-20260625',
  legal_data_ref: 'LEGAL-DATA-READY-20260625',
  write_execution_authorized: true,
  execute_immediately: false,
  customer_wide_import: false,
  source_of_truth_cutover: false,
  gemma_indexing: false,
  onedrive_connected_state: false,
  office_open_save_sync: false,
};

const nextWaveWriteApprovalGate = {
  lc_id: 'LC-ONEDRIVE-09/PW-07',
  mode: 'next-wave-write-approval',
  run_id: 'run-a',
  plan_id: 'wave-plan-a',
  gate_status: 'pass',
  blockers: [],
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  dryrun_counts: { ready: 1, skipped: 1 },
  expected_write_counts: { documents: 1, file_objects: 1, initial_versions: 1, audit_events: 1 },
};

const nextWaveWriteExecutionPreflight = {
  plan_id: 'wave-plan-a',
  scope_kind: 'matter_batch',
  matter_count: 2,
  max_matters_per_wave: 3,
  preflight_kind: 'bounded_write_execution_preflight',
  write_approval_gate_ref: 'WRITE-APPROVAL-GATE-READY-20260625',
  write_window_ref: 'WRITE-WINDOW-READY-20260625',
  db_snapshot_ref: 'DB-SNAPSHOT-READY-20260625',
  storage_containment_ref: 'STORAGE-CONTAINMENT-READY-20260625',
  rollback_ref: 'ROLLBACK-CONTAINMENT-READY-20260625',
  import_lock_ref: 'IMPORT-LOCK-READY-20260625',
  target_resolution_ref: 'TARGET-RESOLUTION-READY-20260625',
  upload_preflight_ref: 'UPLOAD-PREFLIGHT-READY-20260625',
  sanitized_receipt_destination_ref: 'SANITIZED-RECEIPT-READY-20260625',
  local_receipt_handling_ref: 'LOCAL-RECEIPT-HANDLING-READY-20260625',
  operator_ref: 'OPERATOR-READY-20260625',
  security_permission_ref: 'SECURITY-PERMISSION-READY-20260625',
  legal_data_ref: 'LEGAL-DATA-READY-20260625',
  write_execution_authorized: true,
  execute_now: false,
  vault_write_executed: false,
  vault_storage_write_executed: false,
  customer_wide_import: false,
  source_of_truth_cutover: false,
  gemma_indexing: false,
  onedrive_connected_state: false,
  office_open_save_sync: false,
};

const packageRepoFiles = [
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

const lcIds = Array.from({ length: 10 }, (_, index) => `LC-ONEDRIVE-${String(index).padStart(2, '0')}`);

async function packageFixture(options = {}) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'onedrive-package-test-'));
  const evidenceRoot = path.join(repoRoot, '.omo/evidence');
  for (const file of packageRepoFiles) {
    const filePath = path.join(repoRoot, file);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `safe package fixture for ${file}\n`, 'utf8');
  }
  for (const lcId of lcIds) {
    const lcDir = path.join(evidenceRoot, lcId);
    await mkdir(lcDir, { recursive: true });
    for (const file of ['executor.md', 'manual-qa.md', 'review.md']) {
      if (options.omit === `${lcId}/${file}`) continue;
      await writeFile(path.join(lcDir, file), `# ${lcId} ${file}\nResult: PASS\n`, 'utf8');
    }
    if (options.omit !== `${lcId}/gate-review.md`) {
      const boundary =
        lcId === 'LC-ONEDRIVE-06'
          ? '\nactual pilot write is not complete\n'
          : lcId === 'LC-ONEDRIVE-08'
            ? '\nNo Gemma execution\n'
            : '';
      await writeFile(path.join(lcDir, 'gate-review.md'), `# ${lcId} Gate Review\nDecision: APPROVED\n${boundary}`, 'utf8');
    }
  }
  return { repoRoot, evidenceRoot };
}

describe('onedrive-pilot-closeout', () => {
  it('passes refs intake when all real external refs are present', () => {
    const report = runRefsIntake({ mapping, candidateId: 'candidate-a', runId: 'run-a' });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-02/06');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.execution_boundary, 'refs_validation_only_no_vault_write');
    assert.equal(report.required_ref_statuses.some((row) => row.status !== 'present'), false);
    assert.equal(JSON.stringify(report).includes('APPROVAL-REF'), false);
  });

  it('blocks refs intake when required refs are placeholders', () => {
    const report = runRefsIntake({
      mapping: {
        ...mapping,
        matter_ref: 'ONEDRIVE-PILOT-MATTER-REF',
        approval_ref: 'PENDING_EXTERNAL_REF',
        operator_ref: '',
      },
      candidateId: 'candidate-a',
      runId: 'run-a',
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_mapping_placeholder_matter_ref'));
    assert.ok(report.blockers.includes('missing_write_ref_placeholder_approval_ref'));
    assert.ok(report.blockers.includes('missing_write_ref_operator_ref'));
    assert.ok(report.owner_summary.find((row) => row.owner === 'Operator')?.blocked);
  });

  it('passes dryrun-phase refs intake without post-dryrun write refs', () => {
    const report = runRefsIntake({
      mapping: {
        ...mapping,
        approval_ref: 'PENDING_EXTERNAL_REF',
        dryrun_pass_ref: 'ONEDRIVE-DRYRUN-PASS-REF',
        write_window_ref: 'ONEDRIVE-WRITE-WINDOW-REF',
        db_snapshot_ref: 'ONEDRIVE-DB-SNAPSHOT-REF',
        storage_containment_ref: 'ONEDRIVE-STORAGE-CONTAINMENT-REF',
        import_lock_ref: 'ONEDRIVE-IMPORT-LOCK-REF',
      },
      candidateId: 'candidate-a',
      runId: 'run-a',
      phase: 'dryrun',
    });
    const postDryrunRefs = [
      'approval_ref',
      'dryrun_pass_ref',
      'write_window_ref',
      'db_snapshot_ref',
      'storage_containment_ref',
      'import_lock_ref',
    ];
    assert.equal(report.lc_id, 'LC-ONEDRIVE-02/04');
    assert.equal(report.phase, 'dryrun');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.allowed_next_action, 'prepare_lc04_dryrun_mapping');
    assert.equal(report.required_ref_statuses.some((row) => postDryrunRefs.includes(row.field)), false);
  });

  it('blocks dryrun-phase refs intake when a dry-run owner ref is placeholder', () => {
    const report = runRefsIntake({
      mapping: { ...mapping, security_ref: 'ONEDRIVE-PERMISSION-REF' },
      candidateId: 'candidate-a',
      runId: 'run-a',
      phase: 'dryrun',
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_dryrun_ref_placeholder_security_ref'));
    assert.equal(report.allowed_next_action, 'collect_real_dryrun_refs');
  });

  it('passes LC06 write preflight when all refs and synthetic checks are present', () => {
    const report = runWritePreflight({ mapping, dryrunReport, syntheticReceipt: importReceipt, candidateId: 'candidate-a', runId: 'run-a' });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-06');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.execution_boundary, 'preflight_only_no_vault_write');
  });

  it('blocks LC06 preflight when a write ref is missing or dry-run has retryable rows', () => {
    const report = runWritePreflight({
      mapping: { ...mapping, write_window_ref: '' },
      dryrunReport: { ...dryrunReport, summary: { status_counts: { ready: 1, retryable: 1 } } },
      syntheticReceipt: importReceipt,
      candidateId: 'candidate-a',
      runId: 'run-a',
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_write_ref_write_window_ref'));
    assert.ok(report.blockers.includes('dryrun_has_retryable_items'));
  });

  it('blocks LC06 preflight when refs are placeholders', () => {
    const report = runWritePreflight({
      mapping: { ...mapping, matter_ref: 'ONEDRIVE-PILOT-MATTER-REF', approval_ref: 'PENDING_EXTERNAL_REF' },
      dryrunReport,
      syntheticReceipt: importReceipt,
      candidateId: 'candidate-a',
      runId: 'run-a',
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_mapping_placeholder_matter_ref'));
    assert.ok(report.blockers.includes('missing_write_ref_placeholder_approval_ref'));
  });

  it('passes LC07 reconciliation for aligned dry-run and import receipts', () => {
    const report = runReconciliation({ mapping, dryrunReport, importReceipt, candidateId: 'candidate-a', runId: 'run-a' });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-07');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.mismatch_count, 0);
  });

  it('blocks LC07 reconciliation when import receipt has unexpected items', () => {
    const report = runReconciliation({
      mapping,
      dryrunReport,
      importReceipt: { ...importReceipt, items: [...importReceipt.items, { item_id: 'unexpected', status: 'imported' }] },
      candidateId: 'candidate-a',
      runId: 'run-a',
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('item_status_mismatch'));
  });

  it('passes LC08 readiness while blocking queue eligibility by default AI policy', () => {
    const reconciliation = runReconciliation({ mapping, dryrunReport, importReceipt, candidateId: 'candidate-a', runId: 'run-a' });
    const report = runGemmaReadiness({ mapping, reconciliationReport: reconciliation, runId: 'run-a' });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-08');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.queue_eligibility, 'blocked_by_ai_policy_default');
    assert.equal(report.indexing_execution, 'not_started');
  });

  it('requires AI refs when AI policy allows queue eligibility', () => {
    const reconciliation = runReconciliation({ mapping, dryrunReport, importReceipt, candidateId: 'candidate-a', runId: 'run-a' });
    const report = runGemmaReadiness({ mapping: { ...mapping, ai_allowed_default: true }, reconciliationReport: reconciliation, runId: 'run-a' });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_ai_ref_ai_policy_ref'));
    assert.ok(report.blockers.includes('missing_ai_ref_local_ai_ready_ref'));
  });

  it('passes LC09 wave plan for bounded post-pilot batches', () => {
    const reconciliation = runReconciliation({ mapping, dryrunReport, importReceipt, candidateId: 'candidate-a', runId: 'run-a' });
    const readiness = runGemmaReadiness({ mapping, reconciliationReport: reconciliation, runId: 'run-a' });
    const report = runWavePlan({
      reconciliationReport: reconciliation,
      gemmaReadiness: readiness,
      runId: 'run-a',
      wavePlan: {
        plan_id: 'wave-plan-a',
        pilot_validation_ref: 'PILOT-VALIDATION-REF',
        customer_scope_ref: 'CUSTOMER-SCOPE-REF',
        rollback_owner_ref: 'ROLLBACK-OWNER-REF',
        source_of_truth_policy: 'onedrive_read_only_until_cutover_ref',
        max_matters_per_wave: 3,
        waves: [
          {
            wave_id: 'wave-01',
            scope_kind: 'matter_batch',
            matter_count: 2,
            freeze_window_ref: 'FREEZE-WINDOW-REF',
            batch_mapping_ref: 'BATCH-MAPPING-REF',
            rollback_ref: 'ROLLBACK-REF',
            reconciliation_required: true,
          },
        ],
      },
    });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-09');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.wave_count, 1);
  });

  it('blocks LC09 customer-wide or over-limit waves', () => {
    const reconciliation = runReconciliation({ mapping, dryrunReport, importReceipt, candidateId: 'candidate-a', runId: 'run-a' });
    const readiness = runGemmaReadiness({ mapping, reconciliationReport: reconciliation, runId: 'run-a' });
    const report = runWavePlan({
      reconciliationReport: reconciliation,
      gemmaReadiness: readiness,
      runId: 'run-a',
      wavePlan: {
        plan_id: 'wave-plan-a',
        pilot_validation_ref: 'PILOT-VALIDATION-REF',
        customer_scope_ref: 'CUSTOMER-SCOPE-REF',
        rollback_owner_ref: 'ROLLBACK-OWNER-REF',
        source_of_truth_policy: 'onedrive_read_only_until_cutover_ref',
        max_matters_per_wave: 3,
        waves: [
          {
            wave_id: 'wave-01',
            scope_kind: 'customer_wide',
            matter_count: 25,
            freeze_window_ref: 'FREEZE-WINDOW-REF',
            batch_mapping_ref: 'BATCH-MAPPING-REF',
            rollback_ref: 'ROLLBACK-REF',
            reconciliation_required: true,
          },
        ],
      },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.match(report.blockers.join(','), /customer_wide_scope_blocked/);
    assert.match(report.blockers.join(','), /matter_count_exceeds_wave_limit/);
  });

  it('passes next-wave approval gate without serializing approval refs', () => {
    const report = runNextWaveApproval({ approval: nextWaveApproval, waveGate: nextWaveGate, runId: 'run-a' });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-09/PW-02');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.allowed_next_action, 'prepare_local_next_wave_dryrun_inputs');
    assert.equal(report.actual_execution_state.vault_write, 'not_authorized');
    assert.equal(report.ref_statuses.some((row) => row.status !== 'present'), false);
    assert.equal(JSON.stringify(report).includes('OPERATOR-DRYRUN-APPROVED-20260625'), false);
  });

  it('blocks next-wave approval gate on placeholders, write flags, and scope drift', () => {
    const report = runNextWaveApproval({
      waveGate: nextWaveGate,
      runId: 'run-a',
      approval: {
        ...nextWaveApproval,
        plan_id: 'different-plan',
        scope_kind: 'customer_wide',
        matter_count: 4,
        operator_dryrun_ref: 'ONEDRIVE-OPERATOR-REF',
        dryrun_only: false,
        vault_write_authorized: true,
      },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_next_wave_ref_placeholder_operator_dryrun_ref'));
    assert.ok(report.blockers.includes('plan_id_mismatch'));
    assert.ok(report.blockers.includes('scope_kind_must_be_matter_batch'));
    assert.ok(report.blockers.includes('matter_count_exceeds_wave_limit'));
    assert.ok(report.blockers.includes('dryrun_only_must_be_true'));
    assert.ok(report.blockers.includes('vault_write_must_not_be_authorized'));
  });

  it('blocks next-wave approval gate when approval input is empty', () => {
    const report = runNextWaveApproval({ approval: {}, waveGate: nextWaveGate, runId: 'run-a' });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_next_wave_approval_plan_id'));
    assert.ok(report.blockers.includes('missing_next_wave_ref_customer_scope_ref'));
  });

  it('passes next-wave dry-run input gate without serializing input refs', () => {
    const report = runNextWaveDryrunInputs({
      dryrunInputs: nextWaveDryrunInputs,
      approvalGate: nextWaveApprovalGate,
      runId: 'run-a',
    });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-09/PW-04');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.allowed_next_action, 'run_next_wave_dryrun_only_with_local_inputs');
    assert.equal(report.dryrun_execution_state, 'not_started');
    assert.equal(report.actual_execution_state.vault_db_write, 'not_executed');
    assert.equal(report.ref_statuses.some((row) => row.status !== 'present'), false);
    assert.equal(JSON.stringify(report).includes('MANIFEST-READY-20260625'), false);
    assert.equal(JSON.stringify(report).includes('OPERATOR-READY-20260625'), false);
  });

  it('blocks next-wave dry-run input gate on approval, scope, write, and repo-content drift', () => {
    const report = runNextWaveDryrunInputs({
      approvalGate: { ...nextWaveApprovalGate, gate_status: 'blocked' },
      runId: 'run-a',
      dryrunInputs: {
        ...nextWaveDryrunInputs,
        plan_id: 'different-plan',
        scope_kind: 'customer_wide',
        matter_count: 4,
        manifest_ref: 'ONEDRIVE-MANIFEST-REF',
        vault_write_authorized: true,
        source_content_in_repo: true,
        raw_paths_in_repo: true,
      },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('approval_gate_not_pass'));
    assert.ok(report.blockers.includes('plan_id_mismatch'));
    assert.ok(report.blockers.includes('scope_kind_must_be_matter_batch'));
    assert.ok(report.blockers.includes('matter_count_exceeds_wave_limit'));
    assert.ok(report.blockers.includes('missing_dryrun_input_ref_placeholder_manifest_ref'));
    assert.ok(report.blockers.includes('vault_write_must_not_be_authorized'));
    assert.ok(report.blockers.includes('source_content_must_not_enter_repo'));
    assert.ok(report.blockers.includes('raw_paths_must_not_enter_repo'));
  });

  it('blocks next-wave dry-run input gate when input is empty', () => {
    const report = runNextWaveDryrunInputs({ dryrunInputs: {}, approvalGate: nextWaveApprovalGate, runId: 'run-a' });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_dryrun_input_plan_id'));
    assert.ok(report.blockers.includes('missing_dryrun_input_ref_manifest_ref'));
  });

  it('passes next-wave dry-run receipt gate without serializing item ids', () => {
    const report = runNextWaveDryrunReceipt({
      dryrunReport,
      dryrunInputGate: nextWaveDryrunInputGate,
      runId: 'run-a',
    });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-09/PW-05');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.allowed_next_action, 'prepare_next_wave_write_decision_packet');
    assert.equal(report.actual_execution_state.vault_db_write, 'not_executed_by_dryrun_report');
    assert.deepEqual(report.dryrun_counts, { ready: 1, skipped: 1 });
    assert.equal(JSON.stringify(report).includes('item-ready'), false);
    assert.equal(JSON.stringify(report).includes('item-skip'), false);
  });

  it('blocks next-wave dry-run receipt gate on missing input gate, blocked rows, and count drift', () => {
    const report = runNextWaveDryrunReceipt({
      dryrunInputGate: { ...nextWaveDryrunInputGate, gate_status: 'blocked' },
      runId: 'run-a',
      dryrunReport: {
        ...dryrunReport,
        gate_status: 'blocked',
        summary: {
          ...dryrunReport.summary,
          total_items: 2,
          status_counts: { ready: 1, blocked: 1, retryable: 1 },
          expected_write_counts: { documents: 2, file_objects: 1, initial_versions: 1, audit_events: 1 },
        },
      },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('dryrun_input_gate_not_pass'));
    assert.ok(report.blockers.includes('dryrun_report_not_pass'));
    assert.ok(report.blockers.includes('dryrun_has_blocked_items'));
    assert.ok(report.blockers.includes('dryrun_has_retryable_items'));
    assert.ok(report.blockers.includes('expected_write_count_mismatch_documents'));
  });

  it('blocks next-wave dry-run receipt gate when no-write not_claimed markers are absent', () => {
    const report = runNextWaveDryrunReceipt({
      dryrunInputGate: nextWaveDryrunInputGate,
      runId: 'run-a',
      dryrunReport: { ...dryrunReport, not_claimed: [] },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_not_claimed_vault_db_write'));
    assert.ok(report.blockers.includes('missing_not_claimed_vault_storage_write'));
    assert.ok(report.blockers.includes('missing_not_claimed_vault_import'));
  });

  it('passes next-wave write decision gate without authorizing a write', () => {
    const report = runNextWaveWriteDecision({
      writeDecision: nextWaveWriteDecision,
      dryrunReceiptGate: nextWaveDryrunReceiptGate,
      runId: 'run-a',
    });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-09/PW-06');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.allowed_next_action, 'request_separate_operator_write_approval');
    assert.equal(report.actual_execution_state.vault_write, 'not_authorized');
    assert.equal(report.ref_statuses.some((row) => row.status !== 'present'), false);
    assert.equal(JSON.stringify(report).includes('WRITE-APPROVAL-REQUEST-READY-20260625'), false);
    assert.equal(JSON.stringify(report).includes('DRYRUN-RECEIPT-READY-20260625'), false);
  });

  it('blocks next-wave write decision gate on missing receipt, write authorization, and bundled cutover', () => {
    const report = runNextWaveWriteDecision({
      dryrunReceiptGate: { ...nextWaveDryrunReceiptGate, gate_status: 'blocked' },
      runId: 'run-a',
      writeDecision: {
        ...nextWaveWriteDecision,
        plan_id: 'different-plan',
        scope_kind: 'customer_wide',
        matter_count: 4,
        decision_kind: 'execute_write',
        write_approval_request_ref: 'ONEDRIVE-WRITE-APPROVAL-REF',
        write_execution_authorized: true,
        source_of_truth_cutover: true,
        gemma_indexing: true,
      },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('dryrun_receipt_gate_not_pass'));
    assert.ok(report.blockers.includes('plan_id_mismatch'));
    assert.ok(report.blockers.includes('scope_kind_must_be_matter_batch'));
    assert.ok(report.blockers.includes('matter_count_exceeds_wave_limit'));
    assert.ok(report.blockers.includes('decision_kind_must_request_write_approval'));
    assert.ok(report.blockers.includes('missing_write_decision_ref_placeholder_write_approval_request_ref'));
    assert.ok(report.blockers.includes('write_execution_must_not_be_authorized_by_decision_packet'));
    assert.ok(report.blockers.includes('source_of_truth_cutover_must_be_false'));
    assert.ok(report.blockers.includes('gemma_indexing_must_be_false'));
  });

  it('blocks next-wave write decision gate when input is empty', () => {
    const report = runNextWaveWriteDecision({ writeDecision: {}, dryrunReceiptGate: nextWaveDryrunReceiptGate, runId: 'run-a' });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_write_decision_plan_id'));
    assert.ok(report.blockers.includes('missing_write_decision_ref_dryrun_receipt_ref'));
  });

  it('passes next-wave write approval gate without executing a write', () => {
    const report = runNextWaveWriteApproval({
      writeApproval: nextWaveWriteApproval,
      writeDecisionGate: nextWaveWriteDecisionGate,
      runId: 'run-a',
    });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-09/PW-07');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.allowed_next_action, 'prepare_bounded_write_execution_preflight');
    assert.equal(report.actual_execution_state.vault_write, 'authorized_not_executed');
    assert.equal(report.actual_execution_state.vault_db_write, 'not_executed');
    assert.equal(report.ref_statuses.some((row) => row.status !== 'present'), false);
    assert.equal(JSON.stringify(report).includes('WRITE-EXECUTION-APPROVED-20260625'), false);
    assert.equal(JSON.stringify(report).includes('WRITE-DECISION-READY-20260625'), false);
  });

  it('blocks next-wave write approval gate on missing decision, immediate execution, and bundled cutover', () => {
    const report = runNextWaveWriteApproval({
      writeDecisionGate: { ...nextWaveWriteDecisionGate, gate_status: 'blocked' },
      runId: 'run-a',
      writeApproval: {
        ...nextWaveWriteApproval,
        plan_id: 'different-plan',
        scope_kind: 'customer_wide',
        matter_count: 4,
        approval_kind: 'approve_everything',
        write_execution_approval_ref: 'ONEDRIVE-WRITE-APPROVAL-REF',
        write_execution_authorized: false,
        execute_immediately: true,
        source_of_truth_cutover: true,
        gemma_indexing: true,
      },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('write_decision_gate_not_pass'));
    assert.ok(report.blockers.includes('plan_id_mismatch'));
    assert.ok(report.blockers.includes('scope_kind_must_be_matter_batch'));
    assert.ok(report.blockers.includes('matter_count_exceeds_wave_limit'));
    assert.ok(report.blockers.includes('approval_kind_must_authorize_bounded_write_execution'));
    assert.ok(report.blockers.includes('missing_write_approval_ref_placeholder_write_execution_approval_ref'));
    assert.ok(report.blockers.includes('write_execution_must_be_explicitly_authorized'));
    assert.ok(report.blockers.includes('execute_immediately_must_be_false'));
    assert.ok(report.blockers.includes('source_of_truth_cutover_must_be_false'));
    assert.ok(report.blockers.includes('gemma_indexing_must_be_false'));
  });

  it('blocks next-wave write approval gate when input is empty', () => {
    const report = runNextWaveWriteApproval({ writeApproval: {}, writeDecisionGate: nextWaveWriteDecisionGate, runId: 'run-a' });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_write_approval_plan_id'));
    assert.ok(report.blockers.includes('missing_write_approval_ref_write_decision_ref'));
  });

  it('passes next-wave write execution preflight without executing a write', () => {
    const report = runNextWaveWriteExecutionPreflight({
      executionPreflight: nextWaveWriteExecutionPreflight,
      writeApprovalGate: nextWaveWriteApprovalGate,
      runId: 'run-a',
    });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-09/PW-08');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.allowed_next_action, 'operator_may_run_bounded_write_execute_command');
    assert.equal(report.actual_execution_state.vault_write, 'authorized_not_executed');
    assert.equal(report.actual_execution_state.vault_db_write, 'not_executed');
    assert.equal(report.actual_execution_state.gemma_indexing, 'not_authorized');
    assert.equal(report.ref_statuses.some((row) => row.status !== 'present'), false);
    assert.equal(JSON.stringify(report).includes('WRITE-APPROVAL-GATE-READY-20260625'), false);
    assert.equal(JSON.stringify(report).includes('UPLOAD-PREFLIGHT-READY-20260625'), false);
  });

  it('blocks next-wave write execution preflight on missing approval, immediate execution, and bundled cutover', () => {
    const report = runNextWaveWriteExecutionPreflight({
      writeApprovalGate: { ...nextWaveWriteApprovalGate, gate_status: 'blocked' },
      runId: 'run-a',
      executionPreflight: {
        ...nextWaveWriteExecutionPreflight,
        plan_id: 'different-plan',
        scope_kind: 'customer_wide',
        matter_count: 4,
        preflight_kind: 'execute_now',
        write_approval_gate_ref: 'ONEDRIVE-WRITE-APPROVAL-GATE-REF',
        execute_now: true,
        vault_write_executed: true,
        vault_storage_write_executed: true,
        source_of_truth_cutover: true,
        gemma_indexing: true,
      },
    });
    assert.equal(report.gate_status, 'blocked');
    assert.equal(report.actual_execution_state.vault_write, 'not_authorized');
    assert.ok(report.blockers.includes('write_approval_gate_not_pass'));
    assert.ok(report.blockers.includes('plan_id_mismatch'));
    assert.ok(report.blockers.includes('scope_kind_must_be_matter_batch'));
    assert.ok(report.blockers.includes('matter_count_exceeds_wave_limit'));
    assert.ok(report.blockers.includes('preflight_kind_must_be_bounded_write_execution_preflight'));
    assert.ok(report.blockers.includes('missing_execution_preflight_ref_placeholder_write_approval_gate_ref'));
    assert.ok(report.blockers.includes('execute_now_must_be_false'));
    assert.ok(report.blockers.includes('vault_write_executed_must_be_false'));
    assert.ok(report.blockers.includes('vault_storage_write_executed_must_be_false'));
    assert.ok(report.blockers.includes('source_of_truth_cutover_must_be_false'));
    assert.ok(report.blockers.includes('gemma_indexing_must_be_false'));
  });

  it('blocks next-wave write execution preflight when input is empty', () => {
    const report = runNextWaveWriteExecutionPreflight({
      executionPreflight: {},
      writeApprovalGate: nextWaveWriteApprovalGate,
      runId: 'run-a',
    });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('missing_execution_preflight_plan_id'));
    assert.ok(report.blockers.includes('missing_execution_preflight_ref_write_approval_gate_ref'));
  });

  it('CLI writes sanitized reports without source labels', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-closeout-test-'));
    const mappingPath = path.join(dir, 'mapping.json');
    const dryrunPath = path.join(dir, 'dryrun.json');
    const receiptPath = path.join(dir, 'receipt.json');
    const outPath = path.join(dir, 'out.json');
    await writeFile(mappingPath, `${JSON.stringify(mapping)}\n`, 'utf8');
    await writeFile(dryrunPath, `${JSON.stringify(dryrunReport)}\n`, 'utf8');
    await writeFile(receiptPath, `${JSON.stringify(importReceipt)}\n`, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        'tools/migration/onedrive-pilot-closeout.mjs',
        '--mode',
        'reconcile',
        '--mapping',
        mappingPath,
        '--dryrun-report',
        dryrunPath,
        '--import-receipt',
        receiptPath,
        '--sanitized-out',
        outPath,
        '--run-id',
        'run-a',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = await readFile(outPath, 'utf8');
    assert.equal(serialized.includes('source-tree'), false);
    assert.equal(serialized.includes('Client Alpha'), false);
    assert.equal(serialized.includes('secret.docx'), false);
  });

  it('CLI writes next-wave approval reports without approval ref values', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-next-wave-approval-test-'));
    const approvalPath = path.join(dir, 'approval.json');
    const gatePath = path.join(dir, 'wave-gate.json');
    const outPath = path.join(dir, 'approval-out.json');
    await writeFile(approvalPath, `${JSON.stringify(nextWaveApproval)}\n`, 'utf8');
    await writeFile(gatePath, `${JSON.stringify(nextWaveGate)}\n`, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        'tools/migration/onedrive-pilot-closeout.mjs',
        '--mode',
        'next-wave-approval',
        '--approval',
        approvalPath,
        '--wave-gate',
        gatePath,
        '--sanitized-out',
        outPath,
        '--run-id',
        'run-a',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = await readFile(outPath, 'utf8');
    assert.equal(serialized.includes('CUSTOMER-SCOPE-APPROVED-20260625'), false);
    assert.equal(serialized.includes('OPERATOR-DRYRUN-APPROVED-20260625'), false);
    assert.match(serialized, /next-wave-approval/);
  });

  it('CLI writes next-wave dry-run input reports without input ref values', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-next-wave-dryrun-inputs-test-'));
    const inputsPath = path.join(dir, 'inputs.json');
    const gatePath = path.join(dir, 'approval-gate.json');
    const outPath = path.join(dir, 'dryrun-inputs-out.json');
    await writeFile(inputsPath, `${JSON.stringify(nextWaveDryrunInputs)}\n`, 'utf8');
    await writeFile(gatePath, `${JSON.stringify(nextWaveApprovalGate)}\n`, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        'tools/migration/onedrive-pilot-closeout.mjs',
        '--mode',
        'next-wave-dryrun-inputs',
        '--dryrun-inputs',
        inputsPath,
        '--approval-gate',
        gatePath,
        '--sanitized-out',
        outPath,
        '--run-id',
        'run-a',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = await readFile(outPath, 'utf8');
    assert.equal(serialized.includes('MANIFEST-READY-20260625'), false);
    assert.equal(serialized.includes('OPERATOR-READY-20260625'), false);
    assert.match(serialized, /next-wave-dryrun-inputs/);
  });

  it('CLI writes next-wave dry-run receipt reports without item ids', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-next-wave-dryrun-receipt-test-'));
    const dryrunPath = path.join(dir, 'dryrun.json');
    const gatePath = path.join(dir, 'dryrun-input-gate.json');
    const outPath = path.join(dir, 'dryrun-receipt-out.json');
    await writeFile(dryrunPath, `${JSON.stringify(dryrunReport)}\n`, 'utf8');
    await writeFile(gatePath, `${JSON.stringify(nextWaveDryrunInputGate)}\n`, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        'tools/migration/onedrive-pilot-closeout.mjs',
        '--mode',
        'next-wave-dryrun-receipt',
        '--dryrun-report',
        dryrunPath,
        '--dryrun-input-gate',
        gatePath,
        '--sanitized-out',
        outPath,
        '--run-id',
        'run-a',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = await readFile(outPath, 'utf8');
    assert.equal(serialized.includes('item-ready'), false);
    assert.equal(serialized.includes('item-skip'), false);
    assert.match(serialized, /next-wave-dryrun-receipt/);
  });

  it('CLI writes next-wave write decision reports without approval ref values', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-next-wave-write-decision-test-'));
    const decisionPath = path.join(dir, 'write-decision.json');
    const gatePath = path.join(dir, 'dryrun-receipt-gate.json');
    const outPath = path.join(dir, 'write-decision-out.json');
    await writeFile(decisionPath, `${JSON.stringify(nextWaveWriteDecision)}\n`, 'utf8');
    await writeFile(gatePath, `${JSON.stringify(nextWaveDryrunReceiptGate)}\n`, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        'tools/migration/onedrive-pilot-closeout.mjs',
        '--mode',
        'next-wave-write-decision',
        '--write-decision',
        decisionPath,
        '--dryrun-receipt-gate',
        gatePath,
        '--sanitized-out',
        outPath,
        '--run-id',
        'run-a',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = await readFile(outPath, 'utf8');
    assert.equal(serialized.includes('WRITE-APPROVAL-REQUEST-READY-20260625'), false);
    assert.equal(serialized.includes('DRYRUN-RECEIPT-READY-20260625'), false);
    assert.match(serialized, /next-wave-write-decision/);
  });

  it('CLI writes next-wave write approval reports without approval ref values', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-next-wave-write-approval-test-'));
    const approvalPath = path.join(dir, 'write-approval.json');
    const gatePath = path.join(dir, 'write-decision-gate.json');
    const outPath = path.join(dir, 'write-approval-out.json');
    await writeFile(approvalPath, `${JSON.stringify(nextWaveWriteApproval)}\n`, 'utf8');
    await writeFile(gatePath, `${JSON.stringify(nextWaveWriteDecisionGate)}\n`, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        'tools/migration/onedrive-pilot-closeout.mjs',
        '--mode',
        'next-wave-write-approval',
        '--write-approval',
        approvalPath,
        '--write-decision-gate',
        gatePath,
        '--sanitized-out',
        outPath,
        '--run-id',
        'run-a',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = await readFile(outPath, 'utf8');
    assert.equal(serialized.includes('WRITE-EXECUTION-APPROVED-20260625'), false);
    assert.equal(serialized.includes('WRITE-DECISION-READY-20260625'), false);
    assert.match(serialized, /next-wave-write-approval/);
  });

  it('CLI writes next-wave write execution preflight reports without preflight ref values', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-next-wave-write-execution-preflight-test-'));
    const preflightPath = path.join(dir, 'write-execution-preflight.json');
    const gatePath = path.join(dir, 'write-approval-gate.json');
    const outPath = path.join(dir, 'write-execution-preflight-out.json');
    await writeFile(preflightPath, `${JSON.stringify(nextWaveWriteExecutionPreflight)}\n`, 'utf8');
    await writeFile(gatePath, `${JSON.stringify(nextWaveWriteApprovalGate)}\n`, 'utf8');

    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        'tools/migration/onedrive-pilot-closeout.mjs',
        '--mode',
        'next-wave-write-execution-preflight',
        '--execution-preflight',
        preflightPath,
        '--write-approval-gate',
        gatePath,
        '--sanitized-out',
        outPath,
        '--run-id',
        'run-a',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = await readFile(outPath, 'utf8');
    assert.equal(serialized.includes('WRITE-APPROVAL-GATE-READY-20260625'), false);
    assert.equal(serialized.includes('UPLOAD-PREFLIGHT-READY-20260625'), false);
    assert.match(serialized, /next-wave-write-execution-preflight/);
  });

  it('passes package audit when LC00-LC09 evidence and repo files are present', async () => {
    const fixture = await packageFixture();
    const report = await runPackageAudit({ repoRoot: fixture.repoRoot, evidenceRoot: fixture.evidenceRoot, runId: 'run-a' });
    assert.equal(report.lc_id, 'LC-ONEDRIVE-00-09');
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.lc_status.length, 10);
    assert.equal(report.actual_execution_state.customer_wide_import, 'not_executed');
    assert.equal(report.actual_execution_state.gemma_indexing, 'not_started');
    assert.ok(report.lc_status.find((row) => row.lc_id === 'LC-ONEDRIVE-06').status.includes('actual_write_not_executed'));
  });

  it('blocks package audit when required evidence is missing', async () => {
    const fixture = await packageFixture({ omit: 'LC-ONEDRIVE-07/gate-review.md' });
    const report = await runPackageAudit({ repoRoot: fixture.repoRoot, evidenceRoot: fixture.evidenceRoot, runId: 'run-a' });
    assert.equal(report.gate_status, 'blocked');
    assert.ok(report.blockers.includes('LC-ONEDRIVE-07:missing_evidence:gate-review.md'));
    assert.ok(report.blockers.includes('LC-ONEDRIVE-07:gate_not_approved'));
  });
});
