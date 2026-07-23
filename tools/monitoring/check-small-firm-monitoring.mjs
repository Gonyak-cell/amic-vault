#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNBOOK_PATH = 'docs/release/small-firm-operations-runbook.md';
const ALERT_OWNER = 'vault-operator';

const RECORDING_RULES = Object.freeze({
  'sf20:availability:ratio30m':
    'clamp_min(1 - (sum(rate(http_requests_total{status=~"5.."}[30m])) / clamp_min(sum(rate(http_requests_total[30m])), 0.001)), 0)',
  'sf20:api_http_duration_ms:p95_5m':
    'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket[5m])))',
  'sf20:search_http_duration_ms:p95_5m':
    'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket{path=~"/v1/search(?:/.*)?"}[5m])))',
  'sf20:audit_write_success:ratio5m':
    'sum(rate(audit_writes_total{outcome="success"}[5m])) / clamp_min(sum(rate(audit_writes_total[5m])), 0.001)',
});

const ALERTS = Object.freeze({
  Sf20AvailabilitySloBreach: {
    expr: 'sf20:availability:ratio30m < 0.995',
    for: '10m',
    severity: 'critical',
    firstAction: 'Confirm API health and recent 5xx rate',
    silenceMax: '30m',
  },
  Sf20ApiLatencyHigh: {
    expr: 'sf20:api_http_duration_ms:p95_5m > 1000',
    for: '10m',
    severity: 'warning',
    firstAction: 'Check database waits and queue age',
    silenceMax: '30m',
  },
  Sf20SearchLatencyHigh: {
    expr: 'sf20:search_http_duration_ms:p95_5m > 2000',
    for: '10m',
    severity: 'warning',
    firstAction: 'Check permission-scoped search latency',
    silenceMax: '30m',
  },
  Sf20AuditWriteFailure: {
    expr: 'sum(increase(audit_writes_total{outcome="failure"}[5m])) > 0',
    for: '2m',
    severity: 'critical',
    firstAction: 'Stop affected writes and verify audit database health',
    silenceMax: '15m',
  },
  Sf20IngestionFailure: {
    expr: 'sum(increase(document_ingestion_results_total{outcome="failure"}[10m])) > 0',
    for: '2m',
    severity: 'warning',
    firstAction: 'Check gateway and worker health',
    silenceMax: '30m',
  },
  Sf20QueueAgeHigh: {
    expr: 'max(pgboss_queue_oldest_age_seconds) > 300',
    for: '5m',
    severity: 'warning',
    firstAction: 'Identify the oldest registered queue',
    silenceMax: '30m',
  },
  Sf20ScannerUnavailable: {
    expr: 'sf20_scanner_signature_available == 0',
    for: '5m',
    severity: 'critical',
    firstAction: 'Keep files quarantined and check ClamAV',
    silenceMax: '15m',
  },
  Sf20ScannerSignatureStale: {
    expr: 'sf20_scanner_signature_available == 1 and sf20_scanner_signature_age_seconds > 86400',
    for: '5m',
    severity: 'critical',
    firstAction: 'Keep files quarantined and refresh signatures',
    silenceMax: '15m',
  },
  Sf20QuarantineAgeHigh: {
    expr: 'sf20_quarantine_objects > 0 and sf20_oldest_quarantine_age_seconds > 3600',
    for: '5m',
    severity: 'warning',
    firstAction: 'Inspect scanner and promotion backlog',
    silenceMax: '30m',
  },
  Sf20DatabaseUnavailable: {
    expr: 'sf20_database_available == 0',
    for: '2m',
    severity: 'critical',
    firstAction: 'Stop writes and verify managed database health',
    silenceMax: '15m',
  },
  Sf20DatabasePoolWaiting: {
    expr: 'max(sf20_database_pool_connections{state="waiting"}) > 0',
    for: '5m',
    severity: 'warning',
    firstAction: 'Check slow requests before changing limits',
    silenceMax: '30m',
  },
  Sf20StorageFailure: {
    expr: 'sum(increase(storage_failures_total[5m])) > 0',
    for: '2m',
    severity: 'critical',
    firstAction: 'Stop mutations and verify exact-version storage access',
    silenceMax: '15m',
  },
  Sf20BackupStatusUnavailable: {
    expr: 'sf20_backup_status_available == 0',
    for: '5m',
    severity: 'critical',
    firstAction: 'Verify the sealed backup status input',
    silenceMax: '15m',
  },
  Sf20BackupStale: {
    expr: 'sf20_backup_status_available == 1 and sf20_backup_age_seconds > 3600',
    for: '5m',
    severity: 'critical',
    firstAction: 'Run the approved backup procedure',
    silenceMax: '15m',
  },
  Sf20RestoreRtoExceeded: {
    expr: 'sf20_last_restore_duration_seconds > 14400',
    for: '2m',
    severity: 'warning',
    firstAction: 'Review the latest isolated restore receipt',
    silenceMax: '60m',
  },
  Sf20DiskStatsUnavailable: {
    expr: 'sf20_monitored_disk_available == 0',
    for: '5m',
    severity: 'warning',
    firstAction: 'Verify the bounded monitored filesystem',
    silenceMax: '30m',
  },
  Sf20DiskPressure: {
    expr: 'sf20_monitored_disk_available == 1 and sf20_monitored_disk_free_ratio < 0.15',
    for: '5m',
    severity: 'critical',
    firstAction: 'Stop nonessential work and reclaim bounded storage',
    silenceMax: '15m',
  },
});

const RAW_CANARY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|s3:\/\/|\/Users\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|cookie|credential|password|secret|token)\b/iu;

export class SmallFirmMonitoringError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SmallFirmMonitoringError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new SmallFirmMonitoringError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function object(value, code, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code, `${label} missing`);
  return value;
}

function exactArray(actual, expected, code, label) {
  assert(Array.isArray(actual), code, `${label} must be an array`);
  assert(actual.length === expected.length, code, `${label} count mismatch`);
  assert(new Set(actual).size === actual.length, code, `${label} duplicates`);
  for (let index = 0; index < expected.length; index += 1) {
    assert(actual[index] === expected[index], code, `${label} mismatch`);
  }
}

function exactKeys(actual, expected, code, label) {
  exactArray(Object.keys(object(actual, code, label)).sort(), [...expected].sort(), code, label);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadMonitoringBundle(root) {
  return {
    prometheus: readJson(resolve(root, 'infra/monitoring/prometheus.yml')),
    alerts: readJson(resolve(root, 'infra/monitoring/alerts.yml')),
    tests: readJson(resolve(root, 'infra/monitoring/alerts.test.yml')),
    alertmanager: readJson(resolve(root, 'infra/monitoring/alertmanager.yml')),
    runbook: readFileSync(resolve(root, RUNBOOK_PATH), 'utf8'),
  };
}

function validatePrometheus(config) {
  exactKeys(
    config,
    ['global', 'alerting', 'rule_files', 'scrape_configs', 'storage'],
    'PROMETHEUS_SCHEMA_INVALID',
    'Prometheus config',
  );
  exactKeys(
    config.global,
    ['scrape_interval', 'scrape_timeout', 'evaluation_interval'],
    'PROMETHEUS_GLOBAL_INVALID',
    'Prometheus global',
  );
  assert(config.global.scrape_interval === '15s', 'PROMETHEUS_GLOBAL_INVALID', 'scrape interval');
  assert(config.global.scrape_timeout === '10s', 'PROMETHEUS_GLOBAL_INVALID', 'scrape timeout');
  assert(
    config.global.evaluation_interval === '15s',
    'PROMETHEUS_GLOBAL_INVALID',
    'evaluation interval',
  );
  exactArray(
    config.rule_files,
    ['/etc/prometheus/alerts.yml'],
    'PROMETHEUS_RULE_FILE_INVALID',
    'rule files',
  );
  assert(
    config.storage?.tsdb?.retention?.time === '15d' &&
      config.storage?.tsdb?.retention?.size === '1GB',
    'PROMETHEUS_RETENTION_INVALID',
    'finite TSDB retention required',
  );
  assert(
    Array.isArray(config.scrape_configs) && config.scrape_configs.length === 1,
    'PROMETHEUS_SCRAPE_INVALID',
    'one scrape target required',
  );
  const scrape = config.scrape_configs[0];
  exactKeys(
    scrape,
    ['job_name', 'metrics_path', 'scheme', 'static_configs'],
    'PROMETHEUS_SCRAPE_INVALID',
    'API scrape',
  );
  assert(
    scrape.job_name === 'amic-vault-api' &&
      scrape.metrics_path === '/metrics' &&
      scrape.scheme === 'http',
    'PROMETHEUS_SCRAPE_INVALID',
    'API scrape contract',
  );
  exactArray(
    scrape.static_configs?.[0]?.targets,
    ['api:3001'],
    'PROMETHEUS_SCRAPE_INVALID',
    'API targets',
  );
  exactArray(
    config.alerting?.alertmanagers?.[0]?.static_configs?.[0]?.targets,
    ['alertmanager:9093'],
    'PROMETHEUS_ALERTMANAGER_INVALID',
    'Alertmanager targets',
  );
}

function validateAlertmanager(config) {
  exactKeys(
    config,
    ['global', 'route', 'receivers'],
    'ALERTMANAGER_SCHEMA_INVALID',
    'Alertmanager config',
  );
  assert(config.global?.resolve_timeout === '5m', 'ALERTMANAGER_GLOBAL_INVALID', 'resolve timeout');
  exactKeys(
    config.route,
    ['receiver', 'group_by', 'group_wait', 'group_interval', 'repeat_interval'],
    'ALERTMANAGER_ROUTE_INVALID',
    'Alertmanager route',
  );
  assert(config.route.receiver === 'local-null', 'ALERTMANAGER_ROUTE_INVALID', 'receiver');
  exactArray(
    config.route.group_by,
    ['alertname', 'severity'],
    'ALERTMANAGER_ROUTE_INVALID',
    'group labels',
  );
  assert(
    config.route.group_wait === '30s' &&
      config.route.group_interval === '5m' &&
      config.route.repeat_interval === '4h',
    'ALERTMANAGER_ROUTE_INVALID',
    'finite routing intervals required',
  );
  assert(
    Array.isArray(config.receivers) && config.receivers.length === 1,
    'ALERTMANAGER_RECEIVER_INVALID',
    'one baseline receiver required',
  );
  exactKeys(config.receivers[0], ['name'], 'ALERTMANAGER_RECEIVER_INVALID', 'baseline receiver');
  assert(
    config.receivers[0].name === 'local-null',
    'ALERTMANAGER_RECEIVER_INVALID',
    'baseline receiver name',
  );
}

function validateRules(alerts) {
  exactKeys(alerts, ['groups'], 'ALERT_RULE_SCHEMA_INVALID', 'alert rules');
  assert(
    Array.isArray(alerts.groups) && alerts.groups.length === 1,
    'ALERT_GROUP_INVALID',
    'one rule group required',
  );
  const group = alerts.groups[0];
  exactKeys(group, ['name', 'interval', 'rules'], 'ALERT_GROUP_INVALID', 'rule group');
  assert(
    group.name === 'sf20.operations' && group.interval === '15s',
    'ALERT_GROUP_INVALID',
    'rule group identity',
  );
  const records = group.rules.filter((rule) => typeof rule.record === 'string');
  const alertRules = group.rules.filter((rule) => typeof rule.alert === 'string');
  assert(
    records.length + alertRules.length === group.rules.length,
    'ALERT_RULE_SCHEMA_INVALID',
    'unknown rule kind',
  );
  exactArray(
    records.map((rule) => rule.record).sort(),
    Object.keys(RECORDING_RULES).sort(),
    'RECORDING_RULE_SET_INVALID',
    'recording rules',
  );
  for (const rule of records) {
    exactKeys(rule, ['record', 'expr'], 'RECORDING_RULE_SCHEMA_INVALID', rule.record);
    assert(
      rule.expr === RECORDING_RULES[rule.record],
      'RECORDING_RULE_EXPR_INVALID',
      `${rule.record} expression`,
    );
  }
  exactArray(
    alertRules.map((rule) => rule.alert).sort(),
    Object.keys(ALERTS).sort(),
    'ALERT_SET_INVALID',
    'alert rules',
  );
  for (const rule of alertRules) {
    const expected = ALERTS[rule.alert];
    exactKeys(
      rule,
      ['alert', 'expr', 'for', 'labels', 'annotations'],
      'ALERT_RULE_SCHEMA_INVALID',
      rule.alert,
    );
    assert(rule.expr === expected.expr, 'ALERT_EXPR_INVALID', `${rule.alert} expression`);
    assert(rule.for === expected.for, 'ALERT_DURATION_INVALID', `${rule.alert} duration`);
    exactKeys(rule.labels, ['severity', 'owner'], 'ALERT_LABELS_INVALID', rule.alert);
    assert(
      rule.labels.severity === expected.severity && rule.labels.owner === ALERT_OWNER,
      'ALERT_LABELS_INVALID',
      `${rule.alert} labels`,
    );
    exactKeys(
      rule.annotations,
      ['runbook', 'first_action', 'silence_max'],
      'ALERT_ANNOTATIONS_INVALID',
      rule.alert,
    );
    assert(
      rule.annotations.runbook === `${RUNBOOK_PATH}#${rule.alert.toLowerCase()}`,
      'ALERT_RUNBOOK_INVALID',
      `${rule.alert} runbook`,
    );
    assert(
      rule.annotations.first_action === expected.firstAction &&
        rule.annotations.silence_max === expected.silenceMax,
      'ALERT_ANNOTATIONS_INVALID',
      `${rule.alert} actions`,
    );
    assert(
      !RAW_CANARY.test(JSON.stringify({ labels: rule.labels, annotations: rule.annotations })),
      'ALERT_CANARY_INVALID',
      `${rule.alert} contains sensitive data`,
    );
  }
  return alertRules;
}

function validateVectors(tests) {
  exactKeys(
    tests,
    ['rule_files', 'evaluation_interval', 'group_eval_order', 'tests'],
    'VECTOR_SCHEMA_INVALID',
    'rule tests',
  );
  exactArray(
    tests.rule_files,
    ['/etc/prometheus/alerts.yml'],
    'VECTOR_SCHEMA_INVALID',
    'test rule files',
  );
  assert(tests.evaluation_interval === '15s', 'VECTOR_SCHEMA_INVALID', 'test interval');
  exactArray(tests.group_eval_order, ['sf20.operations'], 'VECTOR_SCHEMA_INVALID', 'group order');
  assert(Array.isArray(tests.tests) && tests.tests.length === 5, 'VECTOR_SCHEMA_INVALID', 'tests');
  const fires = new Set();
  const recovers = new Set();
  for (const group of tests.tests) {
    assert(
      typeof group.name === 'string' && Array.isArray(group.alert_rule_test),
      'VECTOR_SCHEMA_INVALID',
      'test group',
    );
    for (const vector of group.alert_rule_test) {
      assert(Object.hasOwn(ALERTS, vector.alertname), 'VECTOR_ALERT_INVALID', 'unknown alert');
      assert(Array.isArray(vector.exp_alerts), 'VECTOR_SCHEMA_INVALID', 'expected alerts');
      if (vector.exp_alerts.length > 0) fires.add(vector.alertname);
      else recovers.add(vector.alertname);
    }
  }
  exactArray(
    [...fires].sort(),
    Object.keys(ALERTS).sort(),
    'VECTOR_FIRE_MISSING',
    'firing vectors',
  );
  exactArray(
    [...recovers].sort(),
    Object.keys(ALERTS).sort(),
    'VECTOR_RECOVERY_MISSING',
    'recovery vectors',
  );
  assert(!RAW_CANARY.test(JSON.stringify(tests)), 'VECTOR_CANARY_INVALID', 'raw canary in vectors');
}

function validateRunbook(runbook) {
  assert(
    runbook.startsWith('# AMIC Vault SF20 operations runbook\n'),
    'RUNBOOK_SCHEMA_INVALID',
    'runbook title',
  );
  for (const [alertName, expected] of Object.entries(ALERTS)) {
    const marker = `## ${alertName}\n`;
    const start = runbook.indexOf(marker);
    assert(start >= 0, 'RUNBOOK_SECTION_MISSING', `${alertName} section`);
    const next = runbook.indexOf('\n## ', start + marker.length);
    const section = runbook.slice(start, next < 0 ? undefined : next);
    for (const value of [
      `첫 조치: ${expected.firstAction}`,
      `침묵 상한: ${expected.silenceMax}`,
      '복구 조건:',
      '에스컬레이션:',
      '증적:',
    ]) {
      assert(section.includes(value), 'RUNBOOK_SECTION_INVALID', `${alertName} missing ${value}`);
    }
  }
  assert(
    runbook.includes('EXTERNAL_BLOCKED_APPROVED_STAGING_ALERT_DRILL_RECEIPT_REQUIRED'),
    'RUNBOOK_EXTERNAL_BOUNDARY_MISSING',
    'staging boundary',
  );
}

export function validateMonitoringBundle(bundle) {
  validatePrometheus(bundle.prometheus);
  validateAlertmanager(bundle.alertmanager);
  const alertRules = validateRules(bundle.alerts);
  validateVectors(bundle.tests);
  validateRunbook(bundle.runbook);
  return {
    status: 'PASS',
    recordingRuleCount: Object.keys(RECORDING_RULES).length,
    alertCount: alertRules.length,
    fireVectorCount: Object.keys(ALERTS).length,
    recoveryVectorCount: Object.keys(ALERTS).length,
    externalReceiverCount: 0,
  };
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (isMain) {
  try {
    const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
    process.stdout.write(
      `${JSON.stringify(validateMonitoringBundle(loadMonitoringBundle(root)))}\n`,
    );
  } catch (error) {
    const code = error instanceof SmallFirmMonitoringError ? error.code : 'MONITORING_CHECK_FAILED';
    process.stderr.write(`${code}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
