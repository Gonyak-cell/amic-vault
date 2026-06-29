import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bridgeStatusFromPayload,
  buildIdentityDetails,
  buildReceipt,
  matterAppApiConfigured,
  normalizeIdentityLabel,
  parseArgs,
  receiptLeakFindings,
  sha256Hex,
  validateIdentitySnapshot,
} from './matter-app-identity-preflight.mjs';

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const matterId = '33333333-3333-4333-8333-333333333333';

test('parses Matter app identity preflight arguments without exposing secrets in args shape', () => {
  const args = parseArgs(
    [
      '--',
      '--tenant-id',
      tenantId,
      '--matter-app-api-base-url',
      'http://127.0.0.1:4180',
      '--matter-app-api-token',
      'bridge-secret',
      '--sanitized-out',
      'out.json',
      '--details',
      'details.local.ndjson.gz',
    ],
    {},
  );

  assert.equal(args.tenantId, tenantId);
  assert.equal(args.sanitizedOut, 'out.json');
  assert.equal(args.details, 'details.local.ndjson.gz');
  assert.equal(matterAppApiConfigured(args), true);
});

test('normalizes identity labels deterministically for duplicate checks', () => {
  assert.equal(normalizeIdentityLabel('  회계법인   창천  '), '회계법인 창천');
});

test('builds hashed identity detail rows without raw client or Matter Code labels', () => {
  const details = buildIdentityDetails({
    clients: [
      {
        client_id: clientId,
        name: 'SampleClient',
        status: 'active',
        metadata_json: {},
      },
    ],
    matters: [
      {
        matter_id: matterId,
        client_id: clientId,
        client_name: 'SampleClient',
        matter_code: 'SampleClient/Advisory/샘플계약',
        matter_name: 'SampleClient/Advisory/샘플계약',
        matter_type: 'advisory',
        status: 'open',
        metadata_json: {
          matterAppClientId: 'matter-app-client-ref',
          matterAppMatterId: 'matter-app-matter-ref',
          matterAppSourceRevision: 'rev-1',
        },
        active_document_count: 7,
      },
    ],
  });

  assert.equal(details.length, 1);
  assert.equal(details[0].matter_code_hash, sha256Hex('SampleClient/Advisory/샘플계약'));
  assert.deepEqual(details[0].blockers, []);
  const payload = JSON.stringify(details);
  assert.equal(payload.includes('SampleClient'), false);
  assert.equal(payload.includes('샘플계약'), false);
  assert.equal(payload.includes(matterId), false);
});

test('detects duplicate matter codes and ambiguous client labels before any write', () => {
  const details = buildIdentityDetails({
    clients: [
      { client_id: 'client-a', name: '알파', status: 'active', metadata_json: {} },
      { client_id: 'client-b', name: ' 알파 ', status: 'active', metadata_json: {} },
    ],
    matters: [
      {
        matter_id: 'matter-a',
        client_id: 'client-a',
        client_name: '알파',
        matter_code: '알파/Civil/분쟁',
        matter_name: '알파/Civil/분쟁',
        matter_type: 'litigation',
        status: 'open',
        metadata_json: {},
        active_document_count: 1,
      },
      {
        matter_id: 'matter-b',
        client_id: 'client-b',
        client_name: '알파',
        matter_code: ' 알파/Civil/분쟁 ',
        matter_name: '알파/Civil/분쟁',
        matter_type: 'tax',
        status: 'open',
        metadata_json: {},
        active_document_count: 1,
      },
    ],
  });

  assert.equal(details[0].blockers.includes('matter_code_duplicate'), true);
  assert.equal(details[0].blockers.includes('client_label_ambiguous'), true);
  assert.equal(details[1].blockers.includes('matter_type_unsupported'), true);
});

test('validates expected identity snapshot counts', () => {
  const args = {
    expectedClients: 1,
    expectedMatters: 1,
    expectedActiveDocuments: 7,
  };
  const gate = validateIdentitySnapshot(
    {
      counts: {
        clients: 1,
        matters: 1,
        matters_with_client: 1,
        matters_without_client: 0,
        active_documents: 7,
        docs_with_matter: 7,
        docs_without_matter: 0,
        document_matter_count: 1,
        matter_code_duplicate_rows: 0,
        client_ambiguous_rows: 0,
        unsupported_matter_type_rows: 0,
        archive_only_rows: 0,
        blocked_identity_rows: 0,
      },
    },
    args,
  );

  assert.equal(Object.values(gate).every(Boolean), true);
});

test('normalizes bridge status payloads to capability booleans', () => {
  const bridge = bridgeStatusFromPayload({
    ok: true,
    httpStatus: 200,
    payload: {
      outcome: 'passed',
      item: {
        source_mode: 'matter_app_api',
        source_revision: 'rev-1',
        supported_operations: ['clients/upsert', 'matters/upsert'],
      },
    },
  });

  assert.equal(bridge.bridge_ready, true);
  assert.equal(bridge.client_upsert_supported, true);
  assert.equal(bridge.matter_upsert_supported, true);
  assert.deepEqual(bridge.blockers, []);
});

test('normalizes bridge status path payloads to capability booleans', () => {
  const bridge = bridgeStatusFromPayload({
    ok: true,
    httpStatus: 200,
    payload: {
      outcome: 'passed',
      item: {
        source_mode: 'matter_app_api',
        client_upsert_path: '/api/matters/vault-bridge/clients/upsert',
        matter_upsert_path: '/api/matters/vault-bridge/matters/upsert',
        runtime_write_ready: true,
      },
    },
  });

  assert.equal(bridge.bridge_ready, true);
  assert.equal(bridge.client_upsert_supported, true);
  assert.equal(bridge.matter_upsert_supported, true);
  assert.deepEqual(bridge.blockers, []);
});

test('builds sanitized blocked receipt when bridge config is missing', () => {
  const receipt = buildReceipt({
    args: {
      runId: 'run-1',
      details: '/tmp/details.local.ndjson.gz',
      expectedClients: 1,
      expectedMatters: 1,
      expectedActiveDocuments: 1,
    },
    tenantResolution: { tenantId, blockers: [] },
    snapshot: {
      counts: {
        clients: 1,
        matters: 1,
        matters_with_client: 1,
        matters_without_client: 0,
        active_documents: 1,
        docs_with_matter: 1,
        docs_without_matter: 0,
        document_matter_count: 1,
        matter_code_duplicate_rows: 0,
        client_ambiguous_rows: 0,
        unsupported_matter_type_rows: 0,
        archive_only_rows: 0,
        matter_app_client_refs: 0,
        matter_app_matter_refs: 0,
        matter_app_source_revisions: 0,
        blocked_identity_rows: 0,
      },
    },
    bridge: {
      configured: false,
      checked: false,
      bridge_ready: false,
      client_upsert_supported: false,
      matter_upsert_supported: false,
      blockers: ['matter_app_api_config_missing'],
    },
  });

  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockers.includes('matter_app_api_config_missing'), true);
  assert.equal(receipt.not_executed.includes('Matter app client upsert'), true);
  assert.equal(receiptLeakFindings(receipt).length, 0);
});
