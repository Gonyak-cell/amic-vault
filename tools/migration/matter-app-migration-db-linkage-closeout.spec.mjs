import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReceipt,
  parseArgs,
  receiptLeakFindings,
  validateApiSmoke,
  validateBaseline,
  validateBridgeWriteReceipt,
} from './matter-app-migration-db-linkage-closeout.mjs';

const passingCounts = {
  clients: 80,
  matters: 123,
  mattersWithClient: 123,
  activeDocuments: 22299,
  docsWithMatter: 22299,
  documentMatterCount: 123,
  canonicalExtractionReady: 22299,
  searchIndexedDocuments: 22299,
  aiAllowedDocuments: 22299,
  docsWithAll4RealGemma: 22299,
  realGemmaOutputs: 89196,
  fallbackPayloads: 0,
  matterAppMatterRefs: 123,
  matterAppClientRefs: 123,
  matterAppSourceRevisions: 123,
  clientMatterAppRefs: 80,
};

const passingApiSmoke = {
  sessions: {
    operator_role: 'firm_admin',
    negative_actor_role: 'security_admin',
    tenant_ref_hash: 'a'.repeat(64),
    operator_ref_hash: 'b'.repeat(64),
    negative_actor_ref_hash: 'c'.repeat(64),
  },
  health: { status: 200, pass: true },
  unauth_status: { status: 401, code: 'AUTH_REQUIRED', pass: true },
  auth_me: { status: 200, role: 'firm_admin', pass: true },
  auth_status: {
    status: 200,
    mode: 'matter_app_api',
    requested_mode: 'matter_app_api',
    source_available: true,
    upload_authoritative: true,
    source_contract_ready: true,
    source_stale: false,
    production_runtime: false,
  },
  lookups: {
    matter_code: {
      status: 200,
      lookup_available: true,
      total_count: 1,
      matched_sample: true,
    },
    matter_name: {
      status: 200,
      lookup_available: true,
      total_count: 1,
      matched_sample: true,
    },
    client_name: {
      status: 200,
      lookup_available: true,
      total_count: 2,
      matched_sample: true,
      fallback_label_from_client: true,
    },
    negative_non_member: {
      status: 200,
      lookup_available: true,
      total_count: 0,
      target_hidden: true,
    },
  },
  preflight: {
    owner: {
      status: 201,
      upload_eligible: true,
      source_mode: 'matter_app_api',
      has_preflight_ref: true,
      has_permission_decision_ref: true,
    },
    negative_non_member: {
      status: 403,
      code: 'PERMISSION_DENIED',
      blocked: true,
    },
  },
  document_read: {
    matter_documents: {
      status: 200,
      item_count: 5,
      sample_document_visible: true,
    },
    global_documents_by_matter_code: {
      status: 200,
      item_count: 5,
      sample_document_visible: true,
    },
  },
  sample_refs: {
    matter_ref_hash: 'd'.repeat(64),
    client_ref_hash: 'e'.repeat(64),
    document_ref_hash: 'f'.repeat(64),
    matter_code_hash: '1'.repeat(64),
    matter_name_hash: '2'.repeat(64),
    client_name_hash: '3'.repeat(64),
    metadata_client_label_absent: true,
  },
  role_control: {
    pre_role: 'firm_admin',
    active_role: 'matter_owner',
    post_role: 'firm_admin',
    temporary_role_requested: 'matter_owner',
    restored: true,
  },
};

const passingBridgeReceipt = {
  artifact: 'matter_app_canonical_upsert_sync_sanitized',
  status: 'pass',
  execute: true,
  target_rows: 203,
  result_counts: { matter_app_client_resolved: 80, vault_projection_synced: 123 },
  action_counts: {
    matter_app_client_upsert_and_projection_sync: 80,
    matter_app_matter_upsert_and_projection_sync: 123,
  },
  matter_app_resolved_counts: { clients: 80, matters: 123, source_revisions: 1 },
  blocked_target_count: 0,
  environment_blockers: [],
  preflight_blockers: [],
  identity_blockers: [],
};

test('parses closeout runner arguments without secret defaults', () => {
  const args = parseArgs([
    '--',
    '--api-base-url',
    'http://localhost:3001/v1',
    '--operator-email',
    'operator@example.test',
    '--negative-actor-email',
    'negative@example.test',
    '--session-ttl-minutes',
    '5',
    '--temporary-operator-role',
    'matter_owner',
    '--allow-non-api-mode',
  ]);

  assert.equal(args.apiBaseUrl, 'http://localhost:3001/v1');
  assert.equal(args.operatorEmail, 'operator@example.test');
  assert.equal(args.negativeActorEmail, 'negative@example.test');
  assert.equal(args.sessionTtlMinutes, 5);
  assert.equal(args.temporaryOperatorRole, 'matter_owner');
  assert.equal(args.requireMatterAppApi, false);
});

test('validates the migrated corpus baseline counts exactly', () => {
  const gate = validateBaseline(passingCounts);

  assert.equal(Object.values(gate).every(Boolean), true);
  assert.equal(validateBaseline({ ...passingCounts, matters: 122 }).matters, false);
});

test('validates authenticated matter app API smoke requirements', () => {
  const gate = validateApiSmoke(passingApiSmoke);

  assert.equal(Object.values(gate).every(Boolean), true);
  assert.equal(
    validateApiSmoke({
      ...passingApiSmoke,
      auth_status: { ...passingApiSmoke.auth_status, mode: 'vault_projection_only' },
    }).runtime_mode,
    false,
  );
});

test('validates bridge execute and replay receipts', () => {
  const gate = validateBridgeWriteReceipt(passingBridgeReceipt);

  assert.equal(Object.values(gate).every(Boolean), true);
  assert.equal(validateBridgeWriteReceipt({ ...passingBridgeReceipt, target_rows: 202 }).target_rows, false);
});

test('blocks receipts that contain forbidden raw values', () => {
  assert.deepEqual(receiptLeakFindings({ safe: 'hash-only' }), []);
  assert.deepEqual(receiptLeakFindings({ cookie: 'amic_session=secret' }), [
    'cookie_or_session_token',
  ]);
  assert.deepEqual(receiptLeakFindings({ id: '11111111-1111-4111-8111-111111111111' }), [
    'raw_uuid',
  ]);
});

test('builds a passing sanitized receipt from passing gates', () => {
  const receipt = buildReceipt({
    args: {
      runId: 'run-id',
      requireMatterAppApi: true,
      bridgeExecuteReceipt: 'bridge-execute/canonical-upsert-sync.sanitized.json',
      bridgeReplayReceipt: 'bridge-replay/canonical-upsert-sync.sanitized.json',
    },
    counts: passingCounts,
    apiSmoke: passingApiSmoke,
    bridgeExecuteReceipt: passingBridgeReceipt,
    bridgeReplayReceipt: passingBridgeReceipt,
    gitSha: 'abc123',
  });

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.leak_scan.status, 'PASS');
  assert.equal(receipt.acceptance_gate.runtime_mode, 'PASS');
  assert.equal(receipt.acceptance_gate.bridge_execute_pass, 'PASS');
  assert.equal(receipt.acceptance_gate.bridge_replay_pass, 'PASS');
  assert.equal(receipt.acceptance_gate.operator_role_restored, 'PASS');
  assert.equal(receipt.not_executed.includes('new Vault storage write'), true);
});
