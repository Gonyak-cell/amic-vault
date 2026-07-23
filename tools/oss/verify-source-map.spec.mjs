import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateSourceMap } from './verify-source-map.mjs';

function fixture() {
  return {
    sourceMap: JSON.parse(readFileSync('security/oss-source-map.yml', 'utf8')),
    decisions: JSON.parse(readFileSync('security/oss-adoption-decisions.yml', 'utf8')),
    reuseManifest: JSON.parse(readFileSync('security/oss-test-reuse.yml', 'utf8')),
    dlpBaseline: JSON.parse(readFileSync('security/dlp-korean-pii-baseline.json', 'utf8')),
    productBlobHashes: new Set(),
  };
}

function setPresidioOutcome(value, outcome) {
  const decision = value.decisions.decisions.find((row) => row.id === 'presidio');
  decision.status = outcome;
  decision.activation.outcome = outcome;
  decision.activation.followOnPackRequired = outcome === 'FOLLOW_ON_PACK_REQUIRED';
  value.sourceMap.noCandidateTargets.find((row) => row.component === 'presidio').result = outcome;
}

test('accepts current static source map and decisions', () => {
  const value = fixture();
  const report = validateSourceMap(value);
  assert.equal(report.authorityTargetsVerified, 11);
  assert.equal(report.presidio.outcome, 'DEFERRED_BY_PROFILE');
  assert.equal(report.presidio.productTreeNoCopy, 'VERIFIED');
  assert.equal(report.sourceLab.status, 'NOT_RUN_STATIC_CI');
});

test('rejects fake source hash, missing decision, and adopted conditional candidate', () => {
  const wrongHash = fixture();
  wrongHash.sourceMap.sourceTestTargets[0].sourceBlob = 'f'.repeat(40);
  assert.throws(() => validateSourceMap(wrongHash), /copied or invalid reuse classification/);
  const missingDecision = fixture();
  missingDecision.decisions.decisions = missingDecision.decisions.decisions.filter((row) => row.id !== 'tusd');
  assert.throws(() => validateSourceMap(missingDecision), /decision missing/);
  const adopted = fixture();
  adopted.sourceMap.operationalNoCandidateTargets[0].state = 'ADOPTION_READY';
  assert.throws(() => validateSourceMap(adopted), /operational row must be conditional/);
});

test('allows L1 adoption only when its product paths are explicit', () => {
  const approved = fixture();
  const clamav = approved.decisions.decisions.find((row) => row.id === 'clamav');
  assert.equal(clamav.status, 'APPROVED_FOR_PRODUCT_CHANGE');
  assert.ok(clamav.approvedPaths.length > 0);
  assert.doesNotThrow(() => validateSourceMap(approved));

  clamav.approvedPaths = [];
  assert.throws(() => validateSourceMap(approved), /L1 must remain blocked or be explicitly path-scoped/);
});

test('requires the exact Presidio pin, Korean source/test blobs, and NO_COPY boundary', () => {
  for (const [key, value] of [
    ['commit', 'f'.repeat(40)],
    ['tree', 'e'.repeat(40)],
    ['licenseHash', `sha256:${'d'.repeat(64)}`],
    ['clonePath', 'clones/not-presidio'],
  ]) {
    const wrongPin = fixture();
    wrongPin.sourceMap.components.find((row) => row.id === 'presidio')[key] = value;
    assert.throws(() => validateSourceMap(wrongPin), new RegExp(`presidio: ${key} mismatch`, 'u'));
  }

  const wrongBlob = fixture();
  wrongBlob.sourceMap.sourceTestTargets.find((row) => row.component === 'presidio').sourceBlob = 'c'.repeat(40);
  assert.throws(() => validateSourceMap(wrongBlob), /presidio: sourceBlob mismatch/);

  const copiedPolicy = fixture();
  copiedPolicy.sourceMap.sourceTestTargets.find((row) => row.component === 'presidio').fixturePolicy = 'COPY';
  assert.throws(() => validateSourceMap(copiedPolicy), /presidio: NO_COPY policy required/);

  const copiedBlob = fixture();
  copiedBlob.productBlobHashes.add(
    copiedBlob.sourceMap.sourceTestTargets.find((row) => row.component === 'presidio').sourceBlob,
  );
  assert.throws(() => validateSourceMap(copiedBlob), /upstream source copied into product tree/);
});

test('opens a follow-on PACK on a metric miss without approving Presidio runtime', () => {
  const belowRecall = fixture();
  belowRecall.dlpBaseline.aggregate.microRecall = 0.89;
  assert.throws(
    () => validateSourceMap(belowRecall),
    /measured outcome must be FOLLOW_ON_PACK_REQUIRED/,
  );
  setPresidioOutcome(belowRecall, 'FOLLOW_ON_PACK_REQUIRED');
  assert.doesNotThrow(() => validateSourceMap(belowRecall));
  assert.equal(
    belowRecall.decisions.decisions.find((row) => row.id === 'presidio').decision,
    'REJECTED',
  );

  const missingClass = fixture();
  missingClass.decisions.decisions.find(
    (row) => row.id === 'presidio',
  ).activation.requiredEntityClassMissing = true;
  assert.throws(
    () => validateSourceMap(missingClass),
    /measured outcome must be FOLLOW_ON_PACK_REQUIRED/,
  );
  setPresidioOutcome(missingClass, 'FOLLOW_ON_PACK_REQUIRED');
  assert.doesNotThrow(() => validateSourceMap(missingClass));
});
