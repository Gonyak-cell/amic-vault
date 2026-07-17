import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  validateManifest,
} from './build-post-r14-recovery-pack-manifest.mjs';

const manifestPath = new URL('../../docs/execution/POST_R14_RECOVERY_PACK_MANIFEST.json', import.meta.url);

async function fixture() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function resign(manifest) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
  };
  manifest.payloadSha256 = createHash('sha256')
    .update(JSON.stringify(canonical(manifest.payload)))
    .digest('hex');
  return manifest;
}

test('committed Task 6B manifest validates complete coverage', async () => {
  const manifest = await fixture();
  assert.deepEqual(validateManifest(manifest), { ok: true, errors: [] });
  assert.equal(manifest.payload.unitUniverse.unitIds.length, 117);
  assert.equal(manifest.payload.pathDispositions.length, 893);
  assert.equal(manifest.payload.hunkAssignments.length, 4801);
  assert.equal(manifest.payload.migrations.length, 86);
});

test('every PACK has three to eight TUWs, a unique branch, review, and earlier predecessors', async () => {
  const manifest = await fixture();
  const packs = manifest.payload.packs;
  assert.equal(new Set(packs.map((pack) => pack.branch)).size, packs.length);
  for (const pack of packs) {
    assert.ok(pack.tuwIds.length >= 3 && pack.tuwIds.length <= 8);
    assert.ok(pack.review.requiredReviewer);
    for (const predecessor of pack.predecessorPackIds) {
      if (predecessor === 'PACK-R14-03') continue;
      assert.ok(packs.find((candidate) => candidate.packId === predecessor).sequence < pack.sequence);
    }
  }
});

test('removing one primary TUW is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.unitUniverse.primaryAssignments.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PRIMARY_ASSIGNMENT_COVERAGE'), true);
});

test('assigning one hunk to two PACKs is rejected', async () => {
  const manifest = await fixture();
  const hunk = manifest.payload.hunkAssignments.find((item) => item.disposition === 'PACK');
  const other = manifest.payload.packs.find((pack) => pack.packId !== hunk.packId);
  other.hunkOrdinals.push(hunk.ordinal);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'HUNK_MULTI_PACK'), true);
});

test('bare-letter dependency is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.unitUniverse.dependencies.A1.push({
    id: 'B',
    kind: 'hard',
    sourceText: 'B',
    resolutionRef: null,
  });
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'DEPENDENCY_ID'), true);
});

test('nine-TUW PACK without an authority exception is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[0].tuwIds.push(
    'RECOVERY-OVERFLOW-TUW-001',
    'RECOVERY-OVERFLOW-TUW-002',
    'RECOVERY-OVERFLOW-TUW-003',
    'RECOVERY-OVERFLOW-TUW-004',
    'RECOVERY-OVERFLOW-TUW-005',
    'RECOVERY-OVERFLOW-TUW-006',
  );
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PACK_SIZE'), true);
});

test('active D9 without written approval is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.conditionalTriggers.find((item) => item.unitId === 'D9').state = 'ACTIVE';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'TRIGGER_APPROVAL'), true);
});

test('current manifest rejects D9 activation even with an unregistered approval string', async () => {
  const manifest = await fixture();
  const trigger = manifest.payload.conditionalTriggers.find((item) => item.unitId === 'D9');
  trigger.state = 'ACTIVE';
  trigger.approvalRef = 'UNREGISTERED-REF';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'TRIGGER_STATE'), true);
});

test('Risk C without a reviewer is rejected', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.review.risk === 'C');
  pack.review.requiredReviewer = '';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'RISK_C_REVIEWER'), true);
});

test('duplicate branch is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[1].branch = manifest.payload.packs[0].branch;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'BRANCH_DUPLICATE'), true);
});

test('migration target gap is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.migrations[0].targetOrdinal = 180;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'MIGRATION_TARGET_SET'), true);
});

test('missing authority is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.governance.authorityRef = null;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'AUTHORITY_REF'), true);
});

test('sealed source hash drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.sourceInputs.ownership.sha256 = '0'.repeat(64);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'SOURCE_HASH'), true);
});

test('sealed source and active-ledger ID-set digest drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.sourceInputs.units117.idSetSha256 = '0'.repeat(64);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'UNIT_ID_SET_HASH'), true);
});

test('substituting a hunk ordinal outside 1-4801 is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.hunkAssignments.at(-1).ordinal = 4802;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'HUNK_ORDINAL_SET'), true);
});

test('removing a hard-dependency predecessor is rejected', async () => {
  const manifest = await fixture();
  const routes = manifest.payload.unitUniverse.hunkExecutionPackByUnit;
  const edge = Object.entries(manifest.payload.unitUniverse.dependencies)
    .flatMap(([unitId, rows]) => rows.map((row) => ({
      unitId,
      dependencyId: row.id,
      kind: row.kind,
    })))
    .find((row) => row.kind === 'hard'
      && routes[row.dependencyId]
      && routes[row.unitId] !== routes[row.dependencyId]);
  assert.ok(edge);
  const dependentPack = manifest.payload.packs.find((pack) => pack.packId === routes[edge.unitId]);
  dependentPack.predecessorPackIds = dependentPack.predecessorPackIds
    .filter((packId) => packId !== routes[edge.dependencyId]);
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'HARD_DEPENDENCY_PREDECESSOR'), true);
});

test('path reverse mapping drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.pathDispositions[0].hunkOrdinals.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PATH_REVERSE_MAPPING'), true);
});

test('a hunk path outside the 893-path universe is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.hunkAssignments.at(-1).pathB64 = Buffer.from('outside.txt').toString('base64');
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'HUNK_PATH_SET'), true);
});

test('PACK file mapping drift is rejected', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.files.create.length > 0);
  pack.files.create.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'PACK_FILE_SET'), true);
});

test('migration owner-to-PACK drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.migrations[0].packId = manifest.payload.packs.at(-1).packId;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'MIGRATION_UNIT_PACK'), true);
});

test('registration allowlist drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.registrationPack.allowedModify.push('apps/api/src/forbidden.ts');
  resign(manifest);
  assert.equal(validateManifest(manifest).errors.some((error) => error.code === 'REGISTRATION_PACK'), true);
});
