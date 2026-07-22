import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateSourceMap } from './verify-source-map.mjs';

function fixture() {
  return {
    sourceMap: JSON.parse(readFileSync('security/oss-source-map.yml', 'utf8')),
    decisions: JSON.parse(readFileSync('security/oss-adoption-decisions.yml', 'utf8')),
    reuseManifest: JSON.parse(readFileSync('security/oss-test-reuse.yml', 'utf8')),
  };
}

test('accepts current static source map and decisions', () => {
  const value = fixture();
  const report = validateSourceMap(value);
  assert.equal(report.authorityTargetsVerified, 11);
  assert.equal(report.sourceLab.status, 'NOT_RUN_STATIC_CI');
});

test('rejects fake source hash, missing decision, and adopted conditional candidate', () => {
  const wrongHash = fixture();
  wrongHash.sourceMap.sourceTestTargets[0].sourceBlob = 'f'.repeat(40);
  assert.throws(() => validateSourceMap(wrongHash), /reuse provenance mismatch/);
  const missingDecision = fixture();
  missingDecision.decisions.decisions = missingDecision.decisions.decisions.filter((row) => row.id !== 'tusd');
  assert.throws(() => validateSourceMap(missingDecision), /decision missing/);
  const adopted = fixture();
  adopted.sourceMap.operationalNoCandidateTargets[0].state = 'ADOPTION_READY';
  assert.throws(() => validateSourceMap(adopted), /operational row must be conditional/);
});
