import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReceipt,
  parseArgs,
  validateApprovalRef,
  validateTargetPreflightReceipt,
} from './matter-app-identity-dry-run.mjs';

const passingTargetPreflight = {
  artifact: 'matter_app_identity_rollout_preflight_sanitized',
  status: 'ready_for_identity_dry_run',
  target_environment: 'staging',
  write_executed: false,
  blockers: [],
  leak_scan: { status: 'PASS', findings: [] },
  target_ref_gate: {
    target_database_ref_present: 'PASS',
    target_database_ref_safe: 'PASS',
    matter_app_bridge_ref_present: 'PASS',
    matter_app_bridge_ref_safe: 'PASS',
    operator_ref_present: 'PASS',
    operator_ref_safe: 'PASS',
    approval_ref_optional_or_present: 'PASS',
    approval_ref_safe: 'PASS',
  },
};

const passingIdentityPreflight = {
  artifact: 'matter_app_identity_preflight_sanitized',
  status: 'pass',
  counts: {
    clients: 80,
    matters: 123,
    active_documents: 22299,
    blocked_identity_rows: 0,
  },
  matter_app_bridge: {
    bridge_ready: true,
    client_upsert_supported: true,
    matter_upsert_supported: true,
  },
  blockers: [],
  leak_scan: { status: 'PASS', findings: [] },
};

test('parses staging identity dry-run arguments', () => {
  const args = parseArgs([
    '--',
    '--dry-run',
    '--target-environment',
    'staging',
    '--run-id',
    'matter-identity-dry-run-1',
    '--target-preflight',
    'staging-identity-rollout-preflight.approved-refs.sanitized.json',
    '--identity-preflight',
    'local-identity-preflight.sanitized.json',
    '--approval-ref',
    'APPROVAL-MATTER-IDENTITY-STAGING-DRYRUN-001',
  ]);

  assert.equal(args.dryRun, true);
  assert.equal(args.targetEnvironment, 'staging');
  assert.equal(args.runId, 'matter-identity-dry-run-1');
  assert.equal(args.approvalRef, 'APPROVAL-MATTER-IDENTITY-STAGING-DRYRUN-001');
  assert.equal(args.sanitizedOut, '.omo/evidence/MATTER-APP-IDENTITY-DRY-RUN/staging-identity-dry-run.sanitized.json');
});

test('requires a safe explicit dry-run approval ref', () => {
  assert.deepEqual(validateApprovalRef(''), ['approval_ref_missing']);
  assert.deepEqual(validateApprovalRef('<approval-ref>'), ['approval_ref_invalid']);
  assert.deepEqual(validateApprovalRef('APPROVAL-MATTER-IDENTITY-STAGING-DRYRUN-001'), []);
});

test('validates approved target-ref receipt for the same environment', () => {
  assert.deepEqual(validateTargetPreflightReceipt(passingTargetPreflight, 'staging'), []);
  assert.deepEqual(
    validateTargetPreflightReceipt({ ...passingTargetPreflight, target_environment: 'production' }, 'staging'),
    ['target_preflight_environment_mismatch'],
  );
  assert.deepEqual(
    validateTargetPreflightReceipt({ ...passingTargetPreflight, status: 'blocked' }, 'staging'),
    ['target_preflight_not_ready_for_identity_dry_run'],
  );
});

test('builds no-write dry-run receipt with hashed approval only', () => {
  const receipt = buildReceipt({
    args: {
      dryRun: true,
      runId: 'matter-identity-dry-run-1',
      targetEnvironment: 'staging',
      targetPreflight: 'staging-identity-rollout-preflight.approved-refs.sanitized.json',
      identityPreflight: 'local-identity-preflight.sanitized.json',
      approvalRef: 'APPROVAL-MATTER-IDENTITY-STAGING-DRYRUN-001',
      expectedClients: 80,
      expectedMatters: 123,
    },
    targetPreflight: passingTargetPreflight,
    identityPreflight: passingIdentityPreflight,
  });

  const payload = JSON.stringify(receipt);
  assert.equal(receipt.status, 'ready_for_identity_execute_approval');
  assert.equal(receipt.write_executed, false);
  assert.equal(receipt.matter_app_client_matter_upsert_executed, false);
  assert.equal(receipt.vault_projection_sync_executed, false);
  assert.deepEqual(receipt.planned_identity_rows, {
    clients: 80,
    matters: 123,
    total_identity_rows: 203,
    active_documents_context: 22299,
  });
  assert.equal(receipt.approval_ref_hash.length, 64);
  assert.equal(payload.includes('APPROVAL-MATTER-IDENTITY-STAGING-DRYRUN-001'), false);
  assert.equal(receipt.leak_scan.status, 'PASS');
});

test('blocks when identity preflight counts do not match', () => {
  const receipt = buildReceipt({
    args: {
      dryRun: true,
      runId: 'matter-identity-dry-run-1',
      targetEnvironment: 'staging',
      targetPreflight: 'staging-identity-rollout-preflight.approved-refs.sanitized.json',
      identityPreflight: 'local-identity-preflight.sanitized.json',
      approvalRef: 'APPROVAL-MATTER-IDENTITY-STAGING-DRYRUN-001',
      expectedClients: 80,
      expectedMatters: 123,
    },
    targetPreflight: passingTargetPreflight,
    identityPreflight: {
      ...passingIdentityPreflight,
      counts: { ...passingIdentityPreflight.counts, matters: 122 },
    },
  });

  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, ['identity_preflight_matter_count_mismatch']);
  assert.equal(receipt.write_executed, false);
});
