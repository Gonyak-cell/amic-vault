import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  outputsMatchManifest,
  renderMarkdown,
  validateNonOverlayGitSources,
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

test('committed v2 manifest validates complete overlay and Git-source coverage', async () => {
  const manifest = await fixture();
  assert.deepEqual(validateManifest(manifest), { ok: true, errors: [] });
  assert.deepEqual(validateNonOverlayGitSources(manifest), {
    ok: true,
    errors: [],
    commits: 20,
    paths: 9,
  });
  assert.equal(manifest.payload.unitUniverse.unitIds.length, 117);
  assert.equal(manifest.payload.pathDispositions.length, 893);
  assert.equal(manifest.payload.hunkAssignments.length, 4801);
  assert.equal(manifest.payload.migrations.length, 86);
  assert.equal(manifest.payload.quarantines.hunkOrdinals.length, 28);
  assert.equal(manifest.payload.quarantines.pathB64s.length, 22);
});

test('every PACK has three to eight TUWs, a unique branch, review, and earlier predecessors', async () => {
  const manifest = await fixture();
  const packs = manifest.payload.packs;
  assert.equal(new Set(packs.map((pack) => pack.branch)).size, packs.length);
  for (const pack of packs) {
    assert.ok(pack.tuwIds.length >= 3 && pack.tuwIds.length <= 8);
    assert.ok(pack.review.requiredReviewer);
    for (const predecessor of pack.predecessorPackIds) {
      if (['PACK-R14-03', 'PACK-R14-03-AMENDMENT-01'].includes(predecessor)) continue;
      assert.ok(packs.find((candidate) => candidate.packId === predecessor).sequence < pack.sequence);
    }
  }
});

test('every generated focused command is syntax-safe in bash and zsh', async () => {
  const manifest = await fixture();
  const commands = manifest.payload.packs.flatMap((pack) => pack.verification.commands)
    .filter((command) => command.startsWith('pnpm test -- ')
      || command.startsWith('pnpm test:integration -- '));
  assert.ok(commands.some((command) => command.includes('(app)')));
  for (const command of commands) {
    for (const shell of ['/bin/bash', '/bin/zsh']) {
      const result = spawnSync(shell, ['-n', '-c', command], { encoding: 'utf8' });
      assert.equal(result.status, 0, shell + ' rejected: ' + command + '\n' + result.stderr);
    }
  }
});

test('PACK-R14-04 reconstructs only the exact 19-commit five-path history source', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-04');
  const source = manifest.payload.nonOverlaySources.find(
    (item) => item.sourceId === 'TASK7-RELEASE-HISTORY-19',
  );
  assert.equal(source.commits.length, 19);
  assert.equal(source.pathActions.length, 5);
  assert.deepEqual(pack.hunkOrdinals, []);
  assert.deepEqual(pack.files.modify, []);
  assert.deepEqual(pack.files.create, source.pathActions.map((item) => item.path).sort());
  assert.deepEqual(pack.nonOverlaySourceIds, [source.sourceId]);
});

test('stale historical-base overlay records are quarantined instead of routed', async () => {
  const manifest = await fixture();
  const historical = manifest.payload.hunkAssignments.filter(
    (item) => item.sourceOwnerType === 'historical_base',
  );
  assert.equal(historical.length, 19);
  assert.ok(historical.every((item) => item.disposition === 'QUARANTINE'));
  assert.ok(historical.every((item) => item.packId === null));
  assert.ok(historical.every(
    (item) => item.quarantineReason
      === 'STALE_HISTORICAL_BASE_REPLACED_BY_REGISTERED_GIT_HISTORY_SOURCE',
  ));
});

test('PACK-R14-05 registers seven one-row transitions plus candidate bookkeeping', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-05');
  assert.deepEqual(pack.files.create, []);
  assert.deepEqual(pack.files.modify, []);
  assert.deepEqual(pack.controlPlane.transitionTuwIds, [
    'B15', 'B16', 'B17', 'C16', 'B18', 'B19', 'B20',
  ]);
  assert.equal(pack.controlPlane.transitionCommit.exactPaths.length, 4);
  assert.deepEqual(pack.controlPlane.candidateBookkeeping.create, [pack.repoSafeReceipt]);
  assert.deepEqual(pack.controlPlane.candidateBookkeeping.modify, ['docs/ledger/execution.md']);
});

test('PACK-R14-09 composes the exact LawOS source with only its owned later hunks', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-09');
  const source = manifest.payload.nonOverlaySources.find(
    (item) => item.sourceId === 'TASK8-LAWOS-REFLECTION-0B39414',
  );
  assert.equal(source.commits.length, 1);
  assert.deepEqual(pack.files.create, [
    'docs/release/lawos-canonical-matter-reflection-tuw-plan.md',
    'tools/migration/lawos-canonical-matter-reflection.mjs',
    'tools/migration/lawos-canonical-matter-reflection.spec.mjs',
  ]);
  assert.deepEqual(pack.files.modify, ['package.json']);
  assert.deepEqual(pack.files.overlayModify, [
    'tools/migration/lawos-canonical-matter-reflection.mjs',
    'tools/migration/lawos-canonical-matter-reflection.spec.mjs',
  ]);
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

test('removing a release-history commit is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.nonOverlaySources
    .find((item) => item.sourceId === 'TASK7-RELEASE-HISTORY-19')
    .commits.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'NON_OVERLAY_SOURCE_CONTRACT'), true);
});

test('substituting a release-history path is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.nonOverlaySources
    .find((item) => item.sourceId === 'TASK7-RELEASE-HISTORY-19')
    .pathActions[0].path = 'docs/release/unregistered.md';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'NON_OVERLAY_SOURCE_CONTRACT'), true);
});

test('reassigning a stale historical-base hunk to a PACK is rejected', async () => {
  const manifest = await fixture();
  const hunk = manifest.payload.hunkAssignments.find(
    (item) => item.sourceOwnerType === 'historical_base',
  );
  hunk.disposition = 'PACK';
  hunk.packId = 'PACK-R14-04';
  hunk.quarantineReason = null;
  manifest.payload.packs.find((item) => item.packId === 'PACK-R14-04')
    .hunkOrdinals.push(hunk.ordinal);
  resign(manifest);
  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('QUARANTINE_MAPPING') || codes.includes('PACK_FILE_SOURCE_SET'));
});

test('fully synchronized stale historical-base reactivation is rejected by the sealed source contract', async () => {
  const manifest = await fixture();
  const hunk = manifest.payload.hunkAssignments.find((item) => item.ordinal === 4695);
  const path = manifest.payload.pathDispositions.find((item) => item.pathB64 === hunk.pathB64);
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-04');
  const decodedPath = Buffer.from(hunk.pathB64, 'base64').toString('utf8');

  hunk.disposition = 'PACK';
  hunk.packId = pack.packId;
  hunk.quarantineReason = null;
  path.disposition = 'PACK';
  path.packIds = [pack.packId];
  pack.hunkOrdinals.push(hunk.ordinal);
  pack.files.overlayCreate.push(decodedPath);
  pack.files.create.push(decodedPath);
  manifest.payload.quarantines.hunkOrdinals = manifest.payload.quarantines.hunkOrdinals
    .filter((ordinal) => ordinal !== hunk.ordinal);
  manifest.payload.quarantines.pathB64s = manifest.payload.quarantines.pathB64s
    .filter((pathB64) => pathB64 !== hunk.pathB64);
  resign(manifest);

  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('HISTORICAL_BASE_QUARANTINE_CONTRACT'));
  assert.ok(codes.includes('CANONICAL_PAYLOAD_HASH'));
});

test('omitting one transition control-plane path is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[1].controlPlane.transitionCommit.exactPaths.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_CONTROL_PLANE_CONTRACT'), true);
});

test('moving A14 from a row role to support cannot remove its transition', async () => {
  const manifest = await fixture();
  const pack = manifest.payload.packs.find((item) => item.packId === 'PACK-R14-09');
  pack.secondaryTuwIds = pack.secondaryTuwIds.filter((id) => id !== 'A14');
  pack.supportTuwIds.unshift('A14');
  pack.controlPlane.transitionTuwIds = pack.controlPlane.transitionTuwIds
    .filter((id) => id !== 'A14');
  resign(manifest);

  const codes = validateManifest(manifest).errors.map((error) => error.code);
  assert.ok(codes.includes('PACK_TUW_ROLE_CONTRACT'));
  assert.ok(codes.includes('PACK_CONTROL_PLANE_CONTRACT'));
  assert.ok(codes.includes('CANONICAL_PAYLOAD_HASH'));
});

test('allowing candidate bookkeeping after transitions is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[1].controlPlane.candidateBookkeeping.mustPrecedeTransitions = false;
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_CONTROL_PLANE_CONTRACT'), true);
});

test('omitting a repo-safe receipt from candidate bookkeeping is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[0].controlPlane.candidateBookkeeping.create = [];
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_CONTROL_PLANE_CONTRACT'), true);
});

test('amendment registration drift is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.amendmentRegistration.allowedModify.pop();
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'AMENDMENT_REGISTRATION'), true);
});

test('stale G003 evidence-target routing is rejected', async () => {
  const manifest = await fixture();
  manifest.payload.packs[0].evidenceTarget = '.omo/evidence/ulw/stale/PACK-R14-04.txt';
  resign(manifest);
  assert.equal(validateManifest(manifest).errors
    .some((error) => error.code === 'PACK_EVIDENCE_CONTRACT'), true);
});

test('source-less output validation rejects committed Markdown drift', async () => {
  const manifest = await fixture();
  const json = JSON.stringify(manifest, null, 2) + '\n';
  const markdown = renderMarkdown(manifest);
  assert.equal(outputsMatchManifest(manifest, { json, markdown }), true);
  assert.equal(outputsMatchManifest(manifest, { json, markdown: markdown + '\nDRIFT\n' }), false);
});
