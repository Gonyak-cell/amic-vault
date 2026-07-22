import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateTestReuse } from './verify-test-reuse.mjs';

const licenseHash = `sha256:${'c'.repeat(64)}`;
const scenarios = ['OSS-04', 'OSS-05', 'OSS-06'].map((portfolio, index) => ({ component: `candidate-${index}`, portfolio, sourceBlob: String.fromCharCode(97 + index).repeat(40), testBlob: String.fromCharCode(100 + index).repeat(40) }));
const sourceMap = { components: scenarios.map(({ component }) => ({ id: component, state: 'PINNED', licenseHash })), sourceTestTargets: scenarios };

function entry(scenario, overrides = {}) {
  return { id: `${scenario.component}-scenario`, component: scenario.component, classification: 'BEHAVIORAL_SCENARIO', sourceBlob: scenario.sourceBlob, testBlob: scenario.testBlob, sourceLicenseHash: licenseHash, canonicalSuite: 'tests/integration/candidate.spec.ts', scenario: 'safe scenario', assertions: ['permission-deny', 'fault-reconciliation'], fixturePolicy: 'NO_COPY', ...overrides };
}

function entries(overrides = {}) {
  return scenarios.map((scenario, index) => entry(scenario, index === 0 ? overrides : {}));
}

function withRoot(run) {
  const root = mkdtempSync(join(tmpdir(), 'amic-test-reuse-'));
  try {
    mkdirSync(join(root, 'tests', 'integration'), { recursive: true });
    writeFileSync(join(root, 'tests', 'integration', 'candidate.spec.ts'), 'fixture');
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts exact no-copy parity scenarios', () => {
  withRoot((root) => {
    const result = validateTestReuse({ manifest: { schemaVersion: 'amic-vault.oss-test-reuse.v1', entries: entries() }, sourceMap, repoRoot: root });
    assert.equal(result.entryCount, 3);
    assert.equal(result.copiedFixtureCount, 0);
  });
});

test('rejects wrong hashes, missing license provenance, and missing canonical suite', () => {
  withRoot((root) => {
    assert.throws(() => validateTestReuse({ manifest: { schemaVersion: 'amic-vault.oss-test-reuse.v1', entries: entries({ sourceBlob: 'f'.repeat(40) }) }, sourceMap, repoRoot: root }), /target absent/);
    assert.throws(() => validateTestReuse({ manifest: { schemaVersion: 'amic-vault.oss-test-reuse.v1', entries: entries({ sourceLicenseHash: 'sha256:bad' }) }, sourceMap, repoRoot: root }), /license provenance/);
    assert.throws(() => validateTestReuse({ manifest: { schemaVersion: 'amic-vault.oss-test-reuse.v1', entries: entries({ canonicalSuite: 'tests/integration/missing.spec.ts' }) }, sourceMap, repoRoot: root }), /canonical integration suite/);
  });
});

test('rejects copied fixtures without L2 provenance and rollback', () => {
  withRoot((root) => {
    assert.throws(() => validateTestReuse({ manifest: { schemaVersion: 'amic-vault.oss-test-reuse.v1', entries: entries({ classification: 'FIXTURE_REUSE', fixturePolicy: 'COPY' }) }, sourceMap, repoRoot: root }), /copied fixture/);
  });
});
