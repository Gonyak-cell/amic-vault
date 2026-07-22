import assert from 'node:assert/strict';
import test from 'node:test';
import { createReproductionReport, validateStaticSourceMap } from './verify-upstream-baseline.mjs';

const baseline = { command: ['go', 'test', './...'], timeoutMs: 180000, outcome: 'ENVIRONMENT_BLOCKED', exitCode: null, timedOut: false, logs: { stdoutSha256: `sha256:${'a'.repeat(64)}`, stderrSha256: `sha256:${'b'.repeat(64)}`, stdoutBytes: 0, stderrBytes: 0 } };
const component = { id: 'candidate', officialUrl: 'https://github.com/example/candidate', release: 'v1.0.0', commit: 'c'.repeat(40), tree: 'd'.repeat(40), licensePath: 'LICENSE', licenseHash: `sha256:${'e'.repeat(64)}`, clonePath: 'clones/candidate', owner: 'engineering', state: 'PINNED', baseline };

test('validates static pinned, blocked, and bounded baseline records', () => {
  const report = validateStaticSourceMap({ schemaVersion: 'oss-source-map-v1', sourceLab: { rootEnvironment: 'OSS_RESEARCH_ROOT' }, components: [component, { id: 'later', officialUrl: 'https://github.com/example/later', release: 'pending', owner: 'engineering', state: 'BLOCKED', blockedReason: 'source pin pending' }] });
  assert.deepEqual(report, { schema: 'amic-vault.upstream-baseline-static.v1', componentCount: 2, pinnedCount: 1, blockedCount: 1 });
  assert.throws(() => validateStaticSourceMap({ schemaVersion: 'oss-source-map-v1', sourceLab: { rootEnvironment: 'OSS_RESEARCH_ROOT' }, components: [{ ...component, baseline: { ...baseline, logs: { ...baseline.logs, stdoutSha256: 'bad' } } }] }), /stdoutSha256/);
});

test('requires a second clone to reproduce the baseline result exactly', () => {
  const reproduction = { outcome: baseline.outcome, exitCode: baseline.exitCode, timedOut: baseline.timedOut, logs: { ...baseline.logs } };
  assert.equal(createReproductionReport({ component, reproduction }).result, 'REPRODUCED');
  assert.equal(createReproductionReport({ component, reproduction: { ...reproduction, outcome: 'TEST_FAILURE' } }).result, 'DRIFT_DETECTED');
});
