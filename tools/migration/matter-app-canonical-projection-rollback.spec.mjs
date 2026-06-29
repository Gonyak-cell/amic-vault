import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReceipt,
  parseArgs,
  validateExecuteReceipt,
  validateProjectionRows,
} from './matter-app-canonical-projection-rollback.mjs';
import { receiptLeakFindings } from './matter-app-identity-preflight.mjs';

const tenantId = '11111111-1111-4111-8111-111111111111';
const operatorUserId = '22222222-2222-4222-8222-222222222222';

const passingExecuteReceipt = {
  artifact: 'matter_app_canonical_upsert_sync_sanitized',
  status: 'pass',
  execute: true,
  leak_scan: { status: 'PASS' },
  result_counts: {
    matter_app_client_resolved: 80,
    vault_projection_synced: 123,
  },
  blocked_target_count: 0,
};

test('parses projection rollback args and pnpm separator', () => {
  const args = parseArgs(
    [
      '--',
      '--tenant-id',
      tenantId,
      '--operator-user-id',
      operatorUserId,
      '--bridge-execute-receipt',
      'canonical-upsert-sync.sanitized.json',
      '--rollback-approval-ref',
      'ROLLBACK-MATTER-BRIDGE-004',
      '--execute',
    ],
    {},
  );

  assert.equal(args.tenantId, tenantId);
  assert.equal(args.operatorUserId, operatorUserId);
  assert.equal(args.bridgeExecuteReceipt, 'canonical-upsert-sync.sanitized.json');
  assert.equal(args.rollbackApprovalRef, 'ROLLBACK-MATTER-BRIDGE-004');
  assert.equal(args.execute, true);
});

test('requires a passing canonical sync execute receipt before rollback', () => {
  assert.deepEqual(validateExecuteReceipt(null), ['bridge_execute_receipt_missing']);
  assert.deepEqual(
    validateExecuteReceipt({
      artifact: 'matter_app_canonical_upsert_sync_sanitized',
      status: 'blocked',
      execute: false,
      leak_scan: { status: 'FAIL' },
      result_counts: {},
      blocked_target_count: 1,
    }),
    [
      'bridge_execute_not_passed',
      'bridge_execute_mode_missing',
      'bridge_execute_leak_scan_not_passed',
      'bridge_execute_client_projection_count_mismatch',
      'bridge_execute_matter_projection_count_mismatch',
      'bridge_execute_blocked_rows_present',
    ],
  );
  assert.deepEqual(validateExecuteReceipt(passingExecuteReceipt), []);
});

test('validates expected projection rows before rollback execution', () => {
  assert.deepEqual(
    validateProjectionRows(
      { clients: Array.from({ length: 80 }), matters: Array.from({ length: 123 }) },
      { expectedClientRefs: 80, expectedMatterRefs: 123 },
    ),
    [],
  );
  assert.deepEqual(
    validateProjectionRows(
      { clients: Array.from({ length: 79 }), matters: Array.from({ length: 122 }) },
      { expectedClientRefs: 80, expectedMatterRefs: 123 },
    ),
    ['client_projection_ref_count_mismatch', 'matter_projection_ref_count_mismatch'],
  );
});

test('builds a sanitized rollback ready receipt without raw ids or labels', () => {
  const receipt = buildReceipt({
    args: {
      execute: false,
      migrationRunId: 'run-1',
      rollbackApprovalRef: 'ROLLBACK-MATTER-BRIDGE-004',
      bridgeExecuteReceipt: 'canonical-upsert-sync.sanitized.json',
      tenantId,
      operatorUserId,
    },
    executeReceiptBlockers: [],
    environmentBlockers: [],
    projectionBlockers: [],
    rows: {
      clients: Array.from({ length: 80 }),
      matters: Array.from({ length: 123 }),
    },
  });

  assert.equal(receipt.status, 'ready_for_execute');
  assert.equal(receipt.projection_counts.clients_with_projection_refs, 80);
  assert.equal(receipt.projection_counts.matters_with_projection_refs, 123);
  assert.equal(receipt.rollback_scope.includes('not deleted'), true);
  assert.equal(receiptLeakFindings(receipt).length, 0);
});

test('blocks rollback receipt when approval or projection proof is missing', () => {
  const receipt = buildReceipt({
    args: {
      execute: true,
      migrationRunId: 'run-1',
      rollbackApprovalRef: '',
      bridgeExecuteReceipt: 'canonical-upsert-sync.sanitized.json',
      tenantId,
      operatorUserId,
    },
    executeReceiptBlockers: ['bridge_execute_receipt_missing'],
    environmentBlockers: ['rollback_approval_ref_missing'],
    projectionBlockers: ['matter_projection_ref_count_mismatch'],
    rows: { clients: [], matters: [] },
  });

  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, [
    'bridge_execute_receipt_missing',
    'rollback_approval_ref_missing',
    'matter_projection_ref_count_mismatch',
  ]);
  assert.equal(receipt.leak_scan.status, 'PASS');
});
