import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReceipt,
  parseArgs,
  validateLocalReceipts,
  validateTargetRefs,
} from './matter-app-identity-rollout-preflight.mjs';

const passingCloseout = {
  status: 'pass',
  acceptance_gate: {
    api_live: 'PASS',
    bridge_execute_pass: 'PASS',
  },
  leak_scan: { status: 'PASS', findings: [] },
};

const passingIdentityPreflight = {
  status: 'pass',
  acceptance_gate: {
    tenant_resolved: 'PASS',
    bridge_ready: 'PASS',
  },
  leak_scan: { status: 'PASS', findings: [] },
};

test('parses identity rollout preflight arguments without secret defaults', () => {
  const args = parseArgs([
    '--',
    '--dry-run',
    '--target-environment',
    'production',
    '--run-id',
    'matter-rollout-1',
    '--local-closeout',
    'local-closeout.sanitized.json',
    '--identity-preflight',
    'identity-preflight.sanitized.json',
    '--target-database-ref',
    'PROD/DB/REF-001',
    '--matter-app-bridge-ref',
    'PROD/MATTER-BRIDGE/REF-001',
    '--operator-ref',
    'PROD/OPERATOR/REF-001',
    '--approval-ref',
    'APPROVAL-MATTER-IDENTITY-PROD-001',
  ]);

  assert.equal(args.dryRun, true);
  assert.equal(args.targetEnvironment, 'production');
  assert.equal(args.runId, 'matter-rollout-1');
  assert.equal(args.targetDatabaseRef, 'PROD/DB/REF-001');
  assert.equal(args.matterAppBridgeRef, 'PROD/MATTER-BRIDGE/REF-001');
  assert.equal(args.operatorRef, 'PROD/OPERATOR/REF-001');
  assert.equal(args.approvalRef, 'APPROVAL-MATTER-IDENTITY-PROD-001');
});

test('validates target refs fail closed on missing or placeholder refs', () => {
  assert.deepEqual(
    validateTargetRefs({
      targetDatabaseRef: '',
      matterAppBridgeRef: '<matter-bridge-ref>',
      operatorRef: 'PENDING_EXTERNAL_REF',
      approvalRef: '',
    }).blockers,
    [
      'target_database_ref_missing',
      'matter_app_bridge_ref_invalid',
      'operator_ref_invalid',
    ],
  );
});

test('validates local receipts require pass, acceptance, and leak scan', () => {
  assert.deepEqual(
    validateLocalReceipts({
      localCloseout: passingCloseout,
      identityPreflight: passingIdentityPreflight,
    }).blockers,
    [],
  );
  assert.deepEqual(
    validateLocalReceipts({
      localCloseout: { ...passingCloseout, leak_scan: { status: 'FAIL' } },
      identityPreflight: { ...passingIdentityPreflight, status: 'blocked' },
    }).blockers,
    ['local_closeout_leak_scan_not_passed', 'identity_preflight_not_passed'],
  );
});

test('builds ready no-write receipt with hashed refs only', () => {
  const receipt = buildReceipt({
    args: {
      dryRun: true,
      runId: 'matter-rollout-1',
      targetEnvironment: 'production',
      localCloseout: 'local-closeout.sanitized.json',
      identityPreflight: 'identity-preflight.sanitized.json',
      targetDatabaseRef: 'PROD/DB/REF-001',
      matterAppBridgeRef: 'PROD/MATTER-BRIDGE/REF-001',
      operatorRef: 'PROD/OPERATOR/REF-001',
      approvalRef: 'APPROVAL-MATTER-IDENTITY-PROD-001',
    },
    localCloseout: passingCloseout,
    identityPreflight: passingIdentityPreflight,
  });

  const payload = JSON.stringify(receipt);
  assert.equal(receipt.status, 'ready_for_identity_dry_run');
  assert.equal(receipt.write_executed, false);
  assert.equal(receipt.leak_scan.status, 'PASS');
  assert.equal(receipt.target_refs.target_database_ref.present, true);
  assert.equal(receipt.target_refs.target_database_ref.hash_ref.length, 16);
  assert.equal(payload.includes('PROD/DB/REF-001'), false);
  assert.equal(payload.includes('PROD/MATTER-BRIDGE/REF-001'), false);
  assert.equal(payload.includes('PROD/OPERATOR/REF-001'), false);
});

test('builds blocked receipt when target refs are absent', () => {
  const receipt = buildReceipt({
    args: {
      dryRun: true,
      runId: 'matter-rollout-1',
      targetEnvironment: 'production',
      localCloseout: 'local-closeout.sanitized.json',
      identityPreflight: 'identity-preflight.sanitized.json',
      targetDatabaseRef: '',
      matterAppBridgeRef: '',
      operatorRef: '',
      approvalRef: '',
    },
    localCloseout: passingCloseout,
    identityPreflight: passingIdentityPreflight,
  });

  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, [
    'target_database_ref_missing',
    'matter_app_bridge_ref_missing',
    'operator_ref_missing',
  ]);
  assert.equal(receipt.write_executed, false);
  assert.equal(receipt.leak_scan.status, 'PASS');
});
