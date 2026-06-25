import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  runGemmaReadiness,
  runNextWaveApproval,
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
    status_counts: { ready: 1, skipped: 1 },
    expected_write_counts: { documents: 1, file_objects: 1, initial_versions: 1, audit_events: 1 },
  },
  items: [
    { item_id: 'item-ready', status: 'ready', reasons: ['ready_for_import'], warnings: [], extension: '.docx', size_bytes: 1024 },
    { item_id: 'item-skip', status: 'skipped', reasons: ['zero_byte_skip_with_receipt'], warnings: [], extension: '.pdf', size_bytes: 0 },
  ],
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
