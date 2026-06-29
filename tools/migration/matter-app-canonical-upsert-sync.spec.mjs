import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClientRequest,
  buildMatterRequest,
  buildReceipt,
  matterAppApiConfigured,
  matterTypeToMatterApp,
  parseArgs,
  summarizeDetails,
  validateIdentityPreflightReceipt,
  validateMatterAppResults,
  validateVaultIdentityRows,
} from './matter-app-canonical-upsert-sync.mjs';
import { receiptLeakFindings, sha256Hex } from './matter-app-identity-preflight.mjs';

const tenantId = '11111111-1111-4111-8111-111111111111';
const operatorUserId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const matterId = '44444444-4444-4444-8444-444444444444';

test('parses canonical upsert sync args and pnpm separator', () => {
  const args = parseArgs(
    [
      '--',
      '--tenant-id',
      tenantId,
      '--operator-user-id',
      operatorUserId,
      '--identity-preflight',
      'identity-preflight.sanitized.json',
      '--approval-ref',
      'APPROVAL-MATTER-BRIDGE-004',
      '--matter-app-api-base-url',
      'http://127.0.0.1:4180',
      '--matter-app-api-token',
      'bridge-token',
      '--execute',
    ],
    {},
  );

  assert.equal(args.tenantId, tenantId);
  assert.equal(args.operatorUserId, operatorUserId);
  assert.equal(args.identityPreflight, 'identity-preflight.sanitized.json');
  assert.equal(args.execute, true);
  assert.equal(matterAppApiConfigured(args), true);
});

test('maps Vault matter type enum to Matter app type label', () => {
  assert.equal(matterTypeToMatterApp('investigation'), 'Criminal');
  assert.equal(matterTypeToMatterApp('litigation'), 'Civil');
  assert.equal(matterTypeToMatterApp('advisory'), 'Advisory');
  assert.equal(matterTypeToMatterApp('ma'), 'M&A');
  assert.equal(matterTypeToMatterApp('tax'), null);
});

test('requires a passing identity preflight receipt before sync', () => {
  const blockers = validateIdentityPreflightReceipt({
    artifact: 'matter_app_identity_preflight_sanitized',
    status: 'blocked',
    leak_scan: { status: 'PASS' },
    counts: { clients: 80, matters: 123, blocked_identity_rows: 0 },
    blockers: ['matter_app_api_config_missing'],
    matter_app_bridge: {
      bridge_ready: false,
      client_upsert_supported: false,
      matter_upsert_supported: false,
    },
  });

  assert.deepEqual(blockers, [
    'identity_preflight_not_passed',
    'identity_preflight_blockers_present',
    'identity_preflight_bridge_not_ready',
    'identity_preflight_client_upsert_not_supported',
    'identity_preflight_matter_upsert_not_supported',
  ]);
});

test('builds reference-only Matter app upsert payloads from current Vault identity', () => {
  const args = { tenantId, operatorUserId, approvalRef: 'APPROVAL-MATTER-BRIDGE-004' };
  const client = { client_id: clientId, name: 'SampleClient' };
  const matter = {
    matter_id: matterId,
    client_id: clientId,
    client_name: 'SampleClient',
    matter_code: 'SampleClient/Advisory/샘플계약',
    matter_name: 'SampleClient/Advisory/샘플계약',
    matter_type: 'advisory',
    metadata_json: { matter_detail_type_korean: '샘플계약' },
  };
  const clientRequest = buildClientRequest({ args, client });
  const matterRequest = buildMatterRequest({
    args,
    matter,
    clientResult: {
      clientId: 'matter-app-client-id',
      clientDisplayName: 'SampleClient',
      clientShortName: 'SampleClient',
      sourceRevision: 'client-rev-1',
    },
  });

  assert.equal(clientRequest.tenantRef, tenantId);
  assert.match(clientRequest.supportingEvidenceRefs[0], /^vault-client:[0-9a-f]{64}$/);
  assert.equal(matterRequest.clientId, 'matter-app-client-id');
  assert.equal(matterRequest.matterTypeEnglish, 'Advisory');
  assert.equal(matterRequest.matterDetailTypeKorean, '샘플계약');
  assert.match(matterRequest.supportingEvidenceRefs[0], /^vault-matter:[0-9a-f]{64}$/);
});

test('detects local identity blockers before Matter app writes', () => {
  const blockers = validateVaultIdentityRows(
    {
      clients: [{ client_id: clientId, name: 'SampleClient' }],
      matters: [
        {
          matter_id: matterId,
          client_id: 'missing-client',
          matter_code: '',
          matter_type: 'tax',
          metadata_json: {},
        },
      ],
    },
    { expectedClients: 1, expectedMatters: 1 },
  );

  assert.deepEqual(blockers, [
    'matter_client_missing',
    'matter_code_missing',
    'matter_type_unsupported',
    'matter_detail_type_missing',
  ]);
});

test('blocks Matter app result mismatches before Vault projection sync', () => {
  const blockers = validateMatterAppResults({
    matter: { matter_code: 'SampleClient/Advisory/샘플계약' },
    clientResult: { clientId: 'client-1', sourceRevision: 'client-rev-1' },
    matterResult: {
      matterAppMatterId: 'matter-1',
      clientId: 'client-2',
      matterCode: 'SampleClient/Advisory/다른계약',
      sourceRevision: '',
    },
  });

  assert.deepEqual(blockers, [
    'matter_app_matter_source_revision_missing',
    'matter_app_matter_code_mismatch',
    'matter_app_client_id_mismatch',
  ]);
});

test('summarizes sanitized details and builds leak-free blocked receipt', () => {
  const details = [
    {
      target: 'matter',
      state: 'vault_projection_synced',
      action: 'matter_app_matter_upsert_and_projection_sync',
      blockers: [],
      matter_app_client_ref_hash: sha256Hex('client-ref'),
      matter_app_matter_ref_hash: sha256Hex('matter-ref'),
      matter_app_source_revision_hash: sha256Hex('rev-1'),
    },
    {
      target: 'matter',
      state: 'blocked',
      action: 'none',
      blockers: ['matter_app_client_id_mismatch'],
    },
  ];

  assert.deepEqual(summarizeDetails(details), {
    states: { vault_projection_synced: 1, blocked: 1 },
    actions: { matter_app_matter_upsert_and_projection_sync: 1, none: 1 },
    blocked: 1,
    matterAppResolvedCounts: { clients: 1, matters: 1, source_revisions: 1 },
  });

  const receipt = buildReceipt({
    args: {
      execute: false,
      migrationRunId: 'run-1',
      approvalRef: 'APPROVAL-MATTER-BRIDGE-004',
      tenantId,
      operatorUserId,
      identityPreflight: 'identity-preflight.sanitized.json',
      details: 'canonical-upsert-sync.local.ndjson.gz',
    },
    preflightBlockers: [],
    environmentBlockers: ['matter_app_api_config_missing'],
    identityBlockers: [],
    details,
  });

  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.blockers.includes('matter_app_api_config_missing'), true);
  assert.equal(receipt.blockers.includes('target_rows_blocked'), true);
  assert.equal(receiptLeakFindings(receipt).length, 0);
});
