import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAWOS_SOURCE_REVISION,
  buildReceipt,
  buildReflectionManifest,
  matterTypeToVault,
  parseArgs,
  planReflection,
  summarizeDetails,
  validateLawOsMatterCode,
  validateManifest,
  validateProjectionInvariants,
  validateReplayIdempotency,
} from './lawos-canonical-matter-reflection.mjs';
import { receiptLeakFindings, sha256Hex } from './matter-app-identity-preflight.mjs';

const tenantId = '11111111-1111-4111-8111-111111111111';
const operatorUserId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const matterId = '44444444-4444-4444-8444-444444444444';

function sourceMatter(overrides = {}) {
  return {
    matter_id: 'matter_rp05_amic_current_001',
    tenant_id: 'tenant_rp05_synthetic',
    client_id: 'client_rp05_amic_current_001',
    client_display_name: '샘플고객',
    client_short_name: '샘플고객',
    matter_code: '샘플고객/Advisory/retainer',
    matter_number: 'AMIC-MC-001',
    matter_name: '샘플고객/Advisory/retainer',
    title: '샘플고객/Advisory/retainer',
    matter_axis: 'Advisory',
    matter_litigation_axis: null,
    matter_type_english: 'Advisory',
    matter_litigation_axis_english: null,
    matter_detail_type_korean: 'retainer',
    source_lane: '4. 기업 자문',
    source_ref: '4. 기업 자문-샘플고객',
    client_case_role: null,
    client_case_role_confidence: null,
    source_revision: LAWOS_SOURCE_REVISION,
    status: 'opening',
    confidence: 'sample',
    review_required: false,
    ...overrides,
  };
}

function sourceClient(overrides = {}) {
  return {
    client_id: 'client_rp05_amic_current_001',
    client_display_name: '샘플고객',
    client_short_name: '샘플고객',
    canonical_display_name: '샘플고객',
    legal_form: null,
    candidate_type: 'sample',
    source_lanes: ['4. 기업 자문'],
    source_revision: LAWOS_SOURCE_REVISION,
    ...overrides,
  };
}

function sampleSource() {
  return {
    generated_at: '2026-07-01T00:00:00.000+09:00',
    source_revision: LAWOS_SOURCE_REVISION,
    client_count: 1,
    matter_count: 4,
    axis_counts: { Advisory: 1, LIT: 1, Dispute: 1, DEAL: 1 },
    clients: [sourceClient()],
    matters: [
      sourceMatter(),
      sourceMatter({
        matter_id: 'matter_rp05_amic_current_002',
        matter_code: '샘플고객/LIT/CIV/손해배상청구',
        matter_name: '샘플고객/LIT/CIV/손해배상청구',
        title: '샘플고객/LIT/CIV/손해배상청구',
        matter_axis: 'LIT',
        matter_litigation_axis: 'CIV',
        matter_type_english: 'Litigation',
        matter_litigation_axis_english: 'Civil',
        matter_detail_type_korean: '손해배상청구',
        source_lane: '1. 민사',
        status: 'open',
      }),
      sourceMatter({
        matter_id: 'matter_rp05_amic_current_003',
        matter_code: '샘플고객/Dispute/분쟁자문',
        matter_name: '샘플고객/Dispute/분쟁자문',
        title: '샘플고객/Dispute/분쟁자문',
        matter_axis: 'Dispute',
        matter_detail_type_korean: '분쟁자문',
        source_lane: '1. 민사',
      }),
      sourceMatter({
        matter_id: 'matter_rp05_amic_current_004',
        matter_code: '샘플고객/DEAL/Project Alpha',
        matter_name: '샘플고객/DEAL/Project Alpha',
        title: '샘플고객/DEAL/Project Alpha',
        matter_axis: 'DEAL',
        matter_type_english: 'DEAL',
        matter_detail_type_korean: 'Project Alpha',
        source_lane: '5. 기업 인수&합병',
      }),
    ],
  };
}

function manifestArgs(mode = 'dry-run') {
  return {
    mode,
    sourceArtifact: '/tmp/amic-matter-code-candidates-2026-07-01.json',
    sourceRevision: LAWOS_SOURCE_REVISION,
    expectedClients: 1,
    expectedMatters: 4,
    runId: 'run-1',
    details: 'lawos.local.ndjson.gz',
  };
}

function emptySnapshot() {
  return {
    clients: [],
    matters: [],
    members: [],
    users: [],
    wallMemberships: [],
    defaultAiPolicyId: null,
  };
}

test('parses reflection args and convenience mode flags', () => {
  const args = parseArgs(
    [
      '--',
      '--tenant-id',
      tenantId,
      '--operator-user-id',
      operatorUserId,
      '--approval-ref',
      'APPROVAL-LAWOS-001',
      '--dry-run',
      '--source-revision',
      LAWOS_SOURCE_REVISION,
    ],
    {},
  );

  assert.equal(args.tenantId, tenantId);
  assert.equal(args.operatorUserId, operatorUserId);
  assert.equal(args.approvalRef, 'APPROVAL-LAWOS-001');
  assert.equal(args.mode, 'dry-run');
});

test('validates Law Firm OS matter code format without alias rewrites', () => {
  assert.deepEqual(validateLawOsMatterCode(sourceMatter()).blockers, []);
  assert.deepEqual(
    validateLawOsMatterCode(
      sourceMatter({
        matter_code: '샘플고객/LIT/CIV/손해배상청구',
        matter_axis: 'LIT',
        matter_litigation_axis: 'CIV',
        matter_detail_type_korean: '손해배상청구',
      }),
    ).blockers,
    [],
  );

  assert.equal(
    validateLawOsMatterCode(
      sourceMatter({
        matter_code: '샘플고객/ADV/retainer',
        matter_axis: 'Advisory',
      }),
    ).blockers.includes('adv_alias_not_source_format'),
    true,
  );
  assert.equal(
    validateLawOsMatterCode(
      sourceMatter({
        matter_code: '샘플고객/LIT/손해배상청구',
        matter_axis: 'LIT',
        matter_litigation_axis: 'CIV',
        matter_detail_type_korean: '손해배상청구',
      }),
    ).blockers.includes('lit_matter_code_requires_litigation_axis'),
    true,
  );
});

test('maps Law Firm OS axes to current Vault matter type enum', () => {
  assert.equal(matterTypeToVault(sourceMatter({ matter_axis: 'Advisory' })), 'advisory');
  assert.equal(matterTypeToVault(sourceMatter({ matter_axis: 'DEAL' })), 'ma');
  assert.equal(matterTypeToVault(sourceMatter({ matter_axis: 'Dispute' })), 'litigation');
  assert.equal(
    matterTypeToVault(sourceMatter({ matter_axis: 'LIT', matter_litigation_axis: 'CRM' })),
    'investigation',
  );
  assert.equal(
    matterTypeToVault(sourceMatter({ matter_axis: 'LIT', matter_litigation_axis: 'ADM' })),
    'litigation',
  );
});

test('builds manifest and blocks unexpected source counts or format drift', () => {
  const manifest = buildReflectionManifest({
    source: sampleSource(),
    sourceArtifactHash: sha256Hex('sample'),
    args: manifestArgs(),
  });

  assert.equal(manifest.counts.clients, 1);
  assert.equal(manifest.counts.matters, 4);
  assert.equal(manifest.counts.invalid_format_rows, 0);
  assert.deepEqual(validateManifest(manifest, manifestArgs()), [
    'source_axis_Advisory_count_mismatch',
    'source_axis_LIT_count_mismatch',
    'source_axis_Dispute_count_mismatch',
    'source_axis_DEAL_count_mismatch',
  ]);
});

test('plans create then idempotent replay update against reflected Vault rows', () => {
  const args = manifestArgs();
  const manifest = buildReflectionManifest({
    source: sampleSource(),
    sourceArtifactHash: sha256Hex('sample'),
    args,
  });
  const initialPlan = planReflection({ manifest, snapshot: emptySnapshot(), args });

  assert.equal(initialPlan.summary.actions.would_create_client, 1);
  assert.equal(initialPlan.summary.actions.would_create_matter, 4);
  assert.equal(validateReplayIdempotency({ plan: initialPlan }).planned_creates, 5);

  const reflectedSnapshot = {
    ...emptySnapshot(),
    clients: [
      {
        client_id: clientId,
        name: '샘플고객',
        status: 'active',
        metadata_json: {
          lawosClientId: 'client_rp05_amic_current_001',
          lawosSourceRevision: LAWOS_SOURCE_REVISION,
        },
      },
    ],
    matters: sampleSource().matters.map((matter, index) => ({
      matter_id: index === 0 ? matterId : `55555555-5555-4555-8555-55555555555${index}`,
      client_id: clientId,
      matter_code: matter.matter_code,
      matter_name: matter.matter_name,
      matter_type: 'litigation',
      status: 'proposed',
      active_document_count: 0,
      metadata_json: {
        lawosMatterId: matter.matter_id,
        lawosSourceRevision: LAWOS_SOURCE_REVISION,
      },
    })),
  };
  const replayPlan = planReflection({ manifest, snapshot: reflectedSnapshot, args });
  const replayProof = validateReplayIdempotency({ plan: replayPlan });

  assert.equal(replayProof.proof, 'idempotent_replay_no_creates');
  assert.equal(replayProof.planned_creates, 0);
  assert.equal(replayProof.planned_updates, 5);
});

test('checks projection invariants for the exact Law Firm OS source revision', () => {
  const args = manifestArgs();
  const manifest = buildReflectionManifest({
    source: sampleSource(),
    sourceArtifactHash: sha256Hex('sample'),
    args,
  });
  const snapshot = {
    ...emptySnapshot(),
    clients: [
      {
        client_id: clientId,
        name: '샘플고객',
        status: 'active',
        metadata_json: {
          lawosClientId: 'client_rp05_amic_current_001',
          lawosSourceRevision: LAWOS_SOURCE_REVISION,
        },
      },
    ],
    matters: sampleSource().matters.map((matter, index) => ({
      matter_id: index === 0 ? matterId : `55555555-5555-4555-8555-55555555555${index}`,
      client_id: clientId,
      matter_code: matter.matter_code,
      matter_name: matter.matter_name,
      matter_type: 'litigation',
      status: 'proposed',
      active_document_count: 0,
      metadata_json: {
        lawosMatterId: matter.matter_id,
        lawosSourceRevision: LAWOS_SOURCE_REVISION,
      },
    })),
  };

  assert.deepEqual(validateProjectionInvariants({ manifest, snapshot }), []);
});

test('summarizes details and builds sanitized receipt without raw identity leaks', () => {
  const details = [
    {
      target: 'matter',
      action: 'would_create_matter',
      state: 'planned_matter_create',
      blockers: [],
    },
    {
      target: 'matter',
      action: 'none',
      state: 'blocked',
      blockers: ['vault_matter_client_projection_mismatch'],
    },
  ];
  assert.deepEqual(summarizeDetails(details), {
    states: { planned_matter_create: 1, blocked: 1 },
    actions: { would_create_matter: 1, none: 1 },
    blockers: { vault_matter_client_projection_mismatch: 1 },
    blocked: 1,
    target_rows: 2,
  });

  const args = { ...manifestArgs(), tenantId, operatorUserId, approvalRef: 'APPROVAL-LAWOS-001' };
  const manifest = buildReflectionManifest({
    source: sampleSource(),
    sourceArtifactHash: sha256Hex('sample'),
    args,
  });
  const plan = {
    summary: summarizeDetails(details),
    details,
    clients: [],
    matters: [],
  };
  const receipt = buildReceipt({
    args,
    tenantResolution: { tenantId, blockers: [] },
    manifest,
    manifestBlockers: [],
    environmentBlockers: [],
    plan,
  });

  assert.equal(receipt.artifact, 'lawos_canonical_matter_reflection_sanitized');
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.leak_scan.status, 'PASS');
  assert.equal(receiptLeakFindings(receipt).length, 0);
  assert.equal(JSON.stringify(receipt).includes('샘플고객'), false);
});
