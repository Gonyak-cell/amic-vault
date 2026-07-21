import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluateLicensePolicy, renderNotice } from './check-oss-license-policy.mjs';

const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const NOW = new Date('2026-07-21T12:00:00.000Z');

function externalComponent(overrides = {}) {
  return {
    spdxExpression: 'MIT',
    sourceType: 'registry',
    adoptionMode: 'L1',
    deliveryProfiles: ['SAAS'],
    shipped: true,
    approval: {
      decision: 'APPROVED', owner: 'legal-oss', issuedAt: '2026-07-01', expiresAt: '2026-08-01', sourceOffer: null, fileMap: null, exitPlan: null,
    },
    ...overrides,
  };
}

function fixture(component = externalComponent()) {
  const root = mkdtempSync(join(tmpdir(), 'amic-oss-license-'));
  mkdirSync(join(root, 'apps/api'), { recursive: true });
  mkdirSync(join(root, 'workers/ingestion'), { recursive: true });
  mkdirSync(join(root, 'security'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { alpha: '1.0.0' } }));
  writeFileSync(join(root, 'apps/api/package.json'), JSON.stringify({ dependencies: { '@local/api': 'workspace:*' } }));
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  writeFileSync(join(root, 'workers/ingestion/pyproject.toml'), '[project]\ndependencies = []\n');
  writeFileSync(join(root, 'Dockerfile'), 'FROM node@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\n');
  writeFileSync(join(root, 'provenance.json'), JSON.stringify({
    schemaVersion: 'oss-provenance-v1', baseline: { sourceSha: SHA, sourceTree: TREE },
    inventory: { nodePackageManifests: ['package.json', 'apps/api/package.json'], nodeLockfile: 'pnpm-lock.yaml', pythonProject: 'workers/ingestion/pyproject.toml', dockerfiles: ['Dockerfile'] },
    upstreamDefaults: Object.fromEntries(['npm', 'python', 'image'].map((kind) => [kind, { upstreamUrl: 'unresolved', upstreamSha: 'unresolved', upstreamTree: 'unresolved', licenseHash: 'unresolved', artifactDigest: 'unresolved', owner: 'security', evidenceState: 'UNRESOLVED', modifier: 'none' }]).concat([['workspace', { upstreamUrl: 'repository', upstreamSha: SHA, upstreamTree: TREE, licenseHash: 'policy', artifactDigest: 'tree', owner: 'engineering', evidenceState: 'VERIFIED', modifier: 'none' }]])),
    overrides: {},
  }));
  writeFileSync(join(root, 'security/oss-evidence-schema.json'), JSON.stringify({ required: ['pack', 'tuw', 'sourceSha', 'sourceTree', 'upstreamInputs', 'commands', 'artifacts', 'truthState', 'syntheticOnly', 'externalEvidence'], upstreamInputRequired: ['inputKey', 'kind', 'manifestPath', 'fileInclusion', 'upstreamUrl', 'upstreamSha', 'upstreamTree', 'licenseHash', 'artifactDigest', 'owner', 'evidenceState', 'modifier'], truthStates: ['SOURCE_IMPLEMENTED', 'EXTERNAL_BLOCKED'] }));
  writeFileSync(join(root, 'allowlist.json'), JSON.stringify({ schemaVersion: 'oss-license-allowlist-v1', allowedSpdx: ['MIT'], reviewRequiredSpdx: ['AGPL-3.0-only'], deniedSpdx: [], approvalMaxAgeDays: 90 }));
  writeFileSync(join(root, 'policy.json'), JSON.stringify({
    schemaVersion: 'oss-license-policy-v1', deliveryProfiles: ['SAAS', 'ON_PREM', 'NETWORK_SERVICE'],
    defaults: { external: component, workspace: { spdxExpression: 'INTERNAL', sourceType: 'internal', adoptionMode: 'L0', deliveryProfiles: ['SAAS'], shipped: false, approval: { decision: 'INTERNAL', owner: 'engineering', issuedAt: null, expiresAt: null, sourceOffer: null, fileMap: null, exitPlan: null } } }, components: {},
  }));
  return root;
}

function run(root) {
  return evaluateLicensePolicy({ repoRoot: root, provenancePath: 'provenance.json', policyPath: 'policy.json', allowlistPath: 'allowlist.json', now: NOW });
}

test('accepts an approved permissive component and notices only shipped approved rows', () => {
  const root = fixture();
  try {
    const result = run(root);
    assert.equal(result.approved, 2);
    assert.equal(result.internal, 1);
    assert.match(renderNotice(result.rows), /npm:package.json:alpha: MIT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects approval of an unknown license', () => {
  const root = fixture(externalComponent({ spdxExpression: 'UNKNOWN' }));
  try { assert.throws(() => run(root), /unknown or custom license/); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects AGPL on-premises delivery without a source offer', () => {
  const root = fixture(externalComponent({ spdxExpression: 'AGPL-3.0-only', deliveryProfiles: ['ON_PREM'] }));
  try { assert.throws(() => run(root), /AGPL delivery requires sourceOffer/); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects L2 without a file map', () => {
  const root = fixture(externalComponent({ adoptionMode: 'L2', approval: { decision: 'APPROVED', owner: 'legal-oss', issuedAt: '2026-07-01', expiresAt: '2026-08-01', sourceOffer: 'source-offer', fileMap: null, exitPlan: 'exit-plan' } }));
  try { assert.throws(() => run(root), /L2 requires fileMap/); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects an expired approval', () => {
  const root = fixture(externalComponent({ approval: { decision: 'APPROVED', owner: 'legal-oss', issuedAt: '2026-01-01', expiresAt: '2026-07-20', sourceOffer: null, fileMap: null, exitPlan: null } }));
  try { assert.throws(() => run(root), /approval expired/); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects a research-only candidate marked as shipped', () => {
  const root = fixture(externalComponent({ adoptionMode: 'L4', shipped: true }));
  try { assert.throws(() => run(root), /L4 research candidate cannot be shipped/); } finally { rmSync(root, { recursive: true, force: true }); }
});
