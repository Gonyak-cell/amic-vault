import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  alertDrillContract,
  AlertDrillError,
  buildForStateSeed,
  DRILL_IMAGES,
  DRILL_SCENARIOS,
  main,
  sealAlertDrillResult,
  validateAlertDrillReceipt,
} from './small-firm-alert-drill.mjs';

const root = resolve(import.meta.dirname, '../..');
const cleanup = Object.freeze({
  containers: 0,
  networks: 0,
  volumes: 0,
  processes: 0,
  tempFiles: 0,
});
const states = Object.freeze([
  'HEALTHY_BASELINE',
  'INJECTED',
  'PROMETHEUS_FIRING',
  'ALERTMANAGER_DELIVERED',
  'ACKNOWLEDGED',
  'RECOVERED',
  'PROMETHEUS_INACTIVE',
  'RESOLVED_DELIVERED',
]);

function canonicalReceipt() {
  const contract = alertDrillContract(root);
  const runs = [1, 2].map((run) => ({
    run,
    officialValidation: 'PASS',
    sourceConfigHashes: contract.sourceConfigHashes,
    runtimeConfigHashes: contract.runtimeConfigHashes,
    scenarios: DRILL_SCENARIOS.map((scenario, scenarioIndex) => ({
      scenario: scenario.id,
      alertName: scenario.alertName,
      silenceSeconds: 60,
      silenceMaxSeconds: scenario.silenceMaxSeconds,
      transitions: states.map((state, index) => ({
        sequence: index + 1,
        state,
        at: new Date(Date.UTC(2026, 6, 23, 0, run, scenarioIndex * 10 + index)).toISOString(),
      })),
      durationMs: 8_000,
      deliveryCounts: { firing: 1, resolved: 1 },
    })),
    canaryCount: 0,
    cleanup,
  }));
  return sealAlertDrillResult({
    schemaVersion: 'amic-vault.sf20-alert-drill-result.v1',
    status: 'TECHNICAL_PASS',
    technicalReady: true,
    deploymentReady: false,
    scenarioCount: DRILL_SCENARIOS.length,
    runCount: 2,
    images: DRILL_IMAGES,
    runs,
    canaryCount: 0,
    cleanup,
    deploymentStatus: 'EXTERNAL_BLOCKED_APPROVED_STAGING_ALERT_DRILL_RECEIPT_REQUIRED',
    nonClaims: ['NO_EXTERNAL_NOTIFICATION', 'NO_STAGING_DRILL', 'NO_DEPLOYMENT_RELEASE_OR_GO_LIVE'],
  });
}

function reseal(receipt) {
  const { resultHash: _discarded, ...value } = receipt;
  return sealAlertDrillResult(value);
}

function rejects(receipt, code) {
  assert.throws(
    () => validateAlertDrillReceipt(reseal(receipt), { root }),
    (error) => error instanceof AlertDrillError && error.code === code,
  );
}

describe('SF20 exact-image alert drill receipt', () => {
  it('accepts two clean runs of all six ordered scenarios', () => {
    const receipt = canonicalReceipt();

    assert.deepEqual(validateAlertDrillReceipt(receipt, { root }), {
      status: 'PASS',
      scenarioCount: 6,
      runCount: 2,
      canaryCount: 0,
      cleanup,
      deploymentStatus: 'EXTERNAL_BLOCKED_APPROVED_STAGING_ALERT_DRILL_RECEIPT_REQUIRED',
    });
  });

  it('builds upstream for-state seeds with the real scrape identity', () => {
    for (const scenario of DRILL_SCENARIOS) {
      const seed = buildForStateSeed(scenario, Date.UTC(2026, 6, 23, 0, 10));

      assert.match(seed, /ALERTS_FOR_STATE\{alertname="/u);
      assert.match(seed, /instance="synthetic:8080",job="sf20-synthetic"/u);
      assert.ok(seed.endsWith('# EOF\n'));
      assert.equal(seed.includes('11111111-1111-4111-8111-111111111111'), false);
      assert.equal(seed.includes('s3://'), false);
    }
  });

  it('rejects missing, duplicate, and reordered scenarios', () => {
    const missing = canonicalReceipt();
    missing.runs[0].scenarios.pop();
    rejects(missing, 'DRILL_SCENARIO_SET_INVALID');

    const duplicate = canonicalReceipt();
    duplicate.runs[0].scenarios[1] = structuredClone(duplicate.runs[0].scenarios[0]);
    rejects(duplicate, 'DRILL_SCENARIO_INVALID');

    const reordered = canonicalReceipt();
    [reordered.runs[0].scenarios[0], reordered.runs[0].scenarios[1]] = [
      reordered.runs[0].scenarios[1],
      reordered.runs[0].scenarios[0],
    ];
    rejects(reordered, 'DRILL_SCENARIO_INVALID');
  });

  it('rejects skipped, duplicate, and out-of-order transitions', () => {
    const skipped = canonicalReceipt();
    skipped.runs[0].scenarios[0].transitions.splice(3, 1);
    rejects(skipped, 'DRILL_TRANSITION_INVALID');

    const duplicate = canonicalReceipt();
    duplicate.runs[0].scenarios[0].transitions[4].state = 'ALERTMANAGER_DELIVERED';
    rejects(duplicate, 'DRILL_TRANSITION_INVALID');

    const outOfOrder = canonicalReceipt();
    outOfOrder.runs[0].scenarios[0].transitions[5].at =
      outOfOrder.runs[0].scenarios[0].transitions[0].at;
    rejects(outOfOrder, 'DRILL_TRANSITION_INVALID');
  });

  it('rejects excessive silence and missing firing or resolved delivery', () => {
    const excessive = canonicalReceipt();
    excessive.runs[0].scenarios[0].silenceSeconds =
      excessive.runs[0].scenarios[0].silenceMaxSeconds + 1;
    rejects(excessive, 'DRILL_SCENARIO_INVALID');

    for (const key of ['firing', 'resolved']) {
      const missing = canonicalReceipt();
      missing.runs[0].scenarios[0].deliveryCounts[key] = 0;
      rejects(missing, 'DRILL_DELIVERY_INVALID');
    }
  });

  it('rejects wrong exact image, source hash, and generated runtime hash', () => {
    const image = canonicalReceipt();
    image.images.prometheus =
      'docker.io/prom/prometheus:v3.13.1@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    rejects(image, 'DRILL_IMAGE_INVALID');

    const source = canonicalReceipt();
    source.runs[0].sourceConfigHashes.alerts = 'a'.repeat(64);
    rejects(source, 'DRILL_SOURCE_HASH_INVALID');

    const runtime = canonicalReceipt();
    runtime.runs[0].runtimeConfigHashes.alerts = 'b'.repeat(64);
    rejects(runtime, 'DRILL_RUNTIME_HASH_INVALID');
  });

  it('rejects raw canaries, false external readiness, and incomplete cleanup', () => {
    const canary = canonicalReceipt();
    canary.runs[0].officialValidation = '11111111-1111-4111-8111-111111111111';
    rejects(canary, 'DRILL_RAW_CANARY_FOUND');

    const external = canonicalReceipt();
    external.deploymentReady = true;
    rejects(external, 'DRILL_DEPLOYMENT_BOUNDARY_INVALID');

    const cleanupDrift = canonicalReceipt();
    cleanupDrift.runs[1].cleanup.containers = 1;
    rejects(cleanupDrift, 'DRILL_CLEANUP_INCOMPLETE');
  });

  it('rejects a stale result hash even when every bounded field is valid', () => {
    const receipt = canonicalReceipt();
    receipt.resultHash = 'f'.repeat(64);

    assert.throws(
      () => validateAlertDrillReceipt(receipt, { root }),
      (error) => error instanceof AlertDrillError && error.code === 'DRILL_RESULT_HASH_INVALID',
    );
  });

  it('keeps CLI failures bounded and does not expose receipt canaries', async () => {
    const receipt = canonicalReceipt();
    receipt.runs[0].officialValidation = '11111111-1111-4111-8111-111111111111';
    let stdout = '';
    let stderr = '';

    const exitCode = await main([], {
      root,
      receipt: reseal(receipt),
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: (value) => (stderr += value) },
    });

    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
    assert.deepEqual(JSON.parse(stderr), {
      status: 'FAILED',
      code: 'DRILL_RAW_CANARY_FOUND',
    });
    assert.equal(stderr.includes('11111111-1111-4111-8111-111111111111'), false);
  });
});
