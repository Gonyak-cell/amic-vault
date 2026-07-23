import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  loadMonitoringBundle,
  SmallFirmMonitoringError,
  validateMonitoringBundle,
} from './check-small-firm-monitoring.mjs';

const root = resolve(import.meta.dirname, '../..');

function bundle() {
  return structuredClone(loadMonitoringBundle(root));
}

function rejectsWithCode(run, code) {
  assert.throws(run, (error) => error instanceof SmallFirmMonitoringError && error.code === code);
}

test('accepts the canonical bounded SF20 monitoring bundle', () => {
  assert.deepEqual(validateMonitoringBundle(bundle()), {
    status: 'PASS',
    recordingRuleCount: 4,
    alertCount: 17,
    fireVectorCount: 17,
    recoveryVectorCount: 17,
    externalReceiverCount: 0,
  });
});

test('rejects an unknown Prometheus top-level field', () => {
  const value = bundle();
  value.prometheus.remote_write = [];
  rejectsWithCode(() => validateMonitoringBundle(value), 'PROMETHEUS_SCHEMA_INVALID');
});

test('rejects unbounded Prometheus retention', () => {
  const value = bundle();
  value.prometheus.storage.tsdb.retention.time = '3650d';
  rejectsWithCode(() => validateMonitoringBundle(value), 'PROMETHEUS_RETENTION_INVALID');
});

test('rejects a missing alert', () => {
  const value = bundle();
  value.alerts.groups[0].rules = value.alerts.groups[0].rules.filter(
    (rule) => rule.alert !== 'Sf20DiskPressure',
  );
  rejectsWithCode(() => validateMonitoringBundle(value), 'ALERT_SET_INVALID');
});

test('rejects threshold weakening', () => {
  const value = bundle();
  const rule = value.alerts.groups[0].rules.find(
    (candidate) => candidate.alert === 'Sf20AvailabilitySloBreach',
  );
  rule.expr = 'sf20:availability:ratio30m < 0.90';
  rejectsWithCode(() => validateMonitoringBundle(value), 'ALERT_EXPR_INVALID');
});

test('rejects an external receiver in the repository baseline', () => {
  const value = bundle();
  value.alertmanager.receivers[0].webhook_configs = [{ url: 'https://receiver.invalid/alerts' }];
  rejectsWithCode(() => validateMonitoringBundle(value), 'ALERTMANAGER_RECEIVER_INVALID');
});

test('rejects a missing positive vector', () => {
  const value = bundle();
  for (const group of value.tests.tests) {
    for (const vector of group.alert_rule_test) {
      if (vector.alertname === 'Sf20QueueAgeHigh') vector.exp_alerts = [];
    }
  }
  rejectsWithCode(() => validateMonitoringBundle(value), 'VECTOR_FIRE_MISSING');
});

test('rejects a raw identifier canary in synthetic vectors', () => {
  const value = bundle();
  value.tests.tests[0].input_series.push({
    series: 'sf20_database_available{document_id="11111111-1111-4111-8111-111111111111"}',
    values: '1x20',
  });
  rejectsWithCode(() => validateMonitoringBundle(value), 'VECTOR_CANARY_INVALID');
});

test('rejects a missing alert runbook section', () => {
  const value = bundle();
  value.runbook = value.runbook.replace('## Sf20StorageFailure\n', '## RemovedStorageAlert\n');
  rejectsWithCode(() => validateMonitoringBundle(value), 'RUNBOOK_SECTION_MISSING');
});
