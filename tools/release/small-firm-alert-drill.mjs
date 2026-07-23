#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { stableStringify } from './build-backup-set-manifest.mjs';

const execFile = promisify(execFileCallback);
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const HASH = /^[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SAFE_IMAGE_REFERENCE = /^docker\.io\/[a-z0-9._/-]+:[A-Za-z0-9._-]+@sha256:[a-f0-9]{64}$/u;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const EXTERNAL_BOUNDARY = 'EXTERNAL_BLOCKED_APPROVED_STAGING_ALERT_DRILL_RECEIPT_REQUIRED';
const EXPECTED_STATES = Object.freeze([
  'HEALTHY_BASELINE',
  'INJECTED',
  'PROMETHEUS_FIRING',
  'ALERTMANAGER_DELIVERED',
  'ACKNOWLEDGED',
  'RECOVERED',
  'PROMETHEUS_INACTIVE',
  'RESOLVED_DELIVERED',
]);
const RAW_CANARY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|s3:\/\/|\/Users\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|client-contract\.docx|confidential contract body|\b(?:authorization|cookie|credential|password|secret|token)\b/iu;

export const DRILL_IMAGES = Object.freeze({
  prometheus:
    'docker.io/prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893',
  alertmanager:
    'docker.io/prom/alertmanager:v0.33.1@sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d',
  synthetic:
    'docker.io/library/python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de',
});

export const DRILL_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'database-unavailable',
    alertName: 'Sf20DatabaseUnavailable',
    holdSeconds: 120,
    silenceMaxSeconds: 900,
    seedMetrics: Object.freeze(['sf20_database_available 0']),
  }),
  Object.freeze({
    id: 'queue-age',
    alertName: 'Sf20QueueAgeHigh',
    holdSeconds: 300,
    silenceMaxSeconds: 1800,
    seedMetrics: Object.freeze(['pgboss_queue_oldest_age_seconds{queue="document.extract"} 600']),
  }),
  Object.freeze({
    id: 'scanner-signature-stale',
    alertName: 'Sf20ScannerSignatureStale',
    holdSeconds: 300,
    silenceMaxSeconds: 900,
    seedMetrics: Object.freeze([
      'sf20_scanner_signature_available 1',
      'sf20_scanner_signature_age_seconds 90000',
    ]),
  }),
  Object.freeze({
    id: 'audit-write-failure',
    alertName: 'Sf20AuditWriteFailure',
    holdSeconds: 120,
    silenceMaxSeconds: 900,
    seedMetrics: Object.freeze([
      'audit_writes_total{outcome="failure"} 0',
      'audit_writes_total{outcome="failure"} 1',
    ]),
  }),
  Object.freeze({
    id: 'backup-stale',
    alertName: 'Sf20BackupStale',
    holdSeconds: 300,
    silenceMaxSeconds: 900,
    seedMetrics: Object.freeze(['sf20_backup_status_available 1', 'sf20_backup_age_seconds 4000']),
  }),
  Object.freeze({
    id: 'disk-pressure',
    alertName: 'Sf20DiskPressure',
    holdSeconds: 300,
    silenceMaxSeconds: 900,
    seedMetrics: Object.freeze([
      'sf20_monitored_disk_available 1',
      'sf20_monitored_disk_free_ratio 0.1',
    ]),
  }),
]);

export class AlertDrillError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AlertDrillError';
    this.code = code;
  }
}

function fail(code) {
  throw new AlertDrillError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function exactKeys(value, expected, code) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  const actual = Object.keys(value);
  assert(
    actual.length === expected.length &&
      actual.every((key) => expected.includes(key)) &&
      expected.every((key) => actual.includes(key)),
    code,
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashFile(path) {
  return sha256(readFileSync(path));
}

function canonicalInstant(value, code) {
  assert(typeof value === 'string' && INSTANT.test(value), code);
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds), code);
  return milliseconds;
}

function sourceConfigHashes(root = ROOT) {
  return {
    prometheus: hashFile(resolve(root, 'infra/monitoring/prometheus.yml')),
    alerts: hashFile(resolve(root, 'infra/monitoring/alerts.yml')),
    alertmanager: hashFile(resolve(root, 'infra/monitoring/alertmanager.yml')),
    runbook: hashFile(resolve(root, 'docs/release/small-firm-operations-runbook.md')),
  };
}

function runtimeBundle(root = ROOT) {
  const alerts = JSON.parse(readFileSync(resolve(root, 'infra/monitoring/alerts.yml'), 'utf8'));
  assert(
    Array.isArray(alerts.groups) &&
      alerts.groups.length === 1 &&
      alerts.groups[0]?.name === 'sf20.operations' &&
      alerts.groups[0]?.interval === '15s',
    'DRILL_SOURCE_RULES_INVALID',
  );
  const sourceRules = alerts.groups[0].rules;
  for (const scenario of DRILL_SCENARIOS) {
    const sourceRule = sourceRules.find((candidate) => candidate.alert === scenario.alertName);
    assert(
      sourceRule &&
        sourceRule.for === `${scenario.holdSeconds / 60}m` &&
        sourceRule.annotations?.silence_max === `${scenario.silenceMaxSeconds / 60}m`,
      'DRILL_SOURCE_RULES_INVALID',
    );
  }

  // Prometheus persists pending time through ALERTS_FOR_STATE. The drill imports
  // that public upstream state format and changes only the disposable group's
  // evaluation cadence; alert expressions, labels, annotations, and hold
  // durations stay byte-equivalent to the canonical rule objects.
  const drillAlerts = structuredClone(alerts);
  drillAlerts.groups[0].interval = '1s';
  assert(
    stableStringify(drillAlerts.groups[0].rules) === stableStringify(sourceRules),
    'DRILL_RULE_MUTATION_INVALID',
  );

  const prometheus = {
    global: {
      scrape_interval: '1s',
      scrape_timeout: '1s',
      evaluation_interval: '1s',
    },
    alerting: {
      alertmanagers: [
        {
          scheme: 'http',
          static_configs: [{ targets: ['alertmanager:9093'] }],
        },
      ],
    },
    rule_files: ['/etc/prometheus/alerts.yml'],
    scrape_configs: [
      {
        job_name: 'sf20-synthetic',
        metrics_path: '/metrics',
        scheme: 'http',
        static_configs: [{ targets: ['synthetic:8080'] }],
      },
    ],
  };
  const alertmanager = {
    global: { resolve_timeout: '5s' },
    route: {
      receiver: 'local-drill',
      group_by: ['alertname', 'severity'],
      group_wait: '0s',
      group_interval: '1s',
      repeat_interval: '1h',
    },
    receivers: [
      {
        name: 'local-drill',
        webhook_configs: [
          {
            url: 'http://synthetic:8080/alerts',
            send_resolved: true,
            max_alerts: 20,
          },
        ],
      },
    ],
  };
  return {
    prometheus,
    alerts: drillAlerts,
    alertmanager,
    syntheticServer: SYNTHETIC_SERVER,
  };
}

function runtimeConfigHashes(root = ROOT) {
  const bundle = runtimeBundle(root);
  return Object.fromEntries(
    Object.entries(bundle).map(([key, value]) => [
      key,
      sha256(typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`),
    ]),
  );
}

export function alertDrillContract(root = ROOT) {
  return {
    sourceConfigHashes: sourceConfigHashes(root),
    runtimeConfigHashes: runtimeConfigHashes(root),
  };
}

function validateCleanup(cleanup, code = 'DRILL_CLEANUP_INCOMPLETE') {
  exactKeys(cleanup, ['containers', 'networks', 'volumes', 'processes', 'tempFiles'], code);
  assert(
    cleanup.containers === 0 &&
      cleanup.networks === 0 &&
      cleanup.volumes === 0 &&
      cleanup.processes === 0 &&
      cleanup.tempFiles === 0,
    code,
  );
}

function validateScenario(result, expected) {
  exactKeys(
    result,
    [
      'scenario',
      'alertName',
      'silenceSeconds',
      'silenceMaxSeconds',
      'transitions',
      'durationMs',
      'deliveryCounts',
    ],
    'DRILL_SCENARIO_SCHEMA_INVALID',
  );
  assert(
    result.scenario === expected.id &&
      result.alertName === expected.alertName &&
      Number.isSafeInteger(result.silenceSeconds) &&
      result.silenceSeconds >= 1 &&
      result.silenceSeconds <= expected.silenceMaxSeconds &&
      result.silenceMaxSeconds === expected.silenceMaxSeconds &&
      Number.isSafeInteger(result.durationMs) &&
      result.durationMs >= 0 &&
      result.durationMs <= 120_000,
    'DRILL_SCENARIO_INVALID',
  );
  exactKeys(result.deliveryCounts, ['firing', 'resolved'], 'DRILL_DELIVERY_INVALID');
  assert(
    Number.isSafeInteger(result.deliveryCounts.firing) &&
      result.deliveryCounts.firing >= 1 &&
      result.deliveryCounts.firing <= 10 &&
      Number.isSafeInteger(result.deliveryCounts.resolved) &&
      result.deliveryCounts.resolved >= 1 &&
      result.deliveryCounts.resolved <= 10,
    'DRILL_DELIVERY_INVALID',
  );
  assert(
    Array.isArray(result.transitions) && result.transitions.length === EXPECTED_STATES.length,
    'DRILL_TRANSITION_INVALID',
  );
  let previous = 0;
  for (let index = 0; index < EXPECTED_STATES.length; index += 1) {
    const transition = result.transitions[index];
    exactKeys(transition, ['sequence', 'state', 'at'], 'DRILL_TRANSITION_INVALID');
    const observedAt = canonicalInstant(transition.at, 'DRILL_TRANSITION_INVALID');
    assert(
      transition.sequence === index + 1 &&
        transition.state === EXPECTED_STATES[index] &&
        observedAt >= previous,
      'DRILL_TRANSITION_INVALID',
    );
    previous = observedAt;
  }
}

function validateRun(run, expectedRun, expectedSourceHashes, expectedRuntimeHashes) {
  exactKeys(
    run,
    [
      'run',
      'officialValidation',
      'sourceConfigHashes',
      'runtimeConfigHashes',
      'scenarios',
      'canaryCount',
      'cleanup',
    ],
    'DRILL_RUN_SCHEMA_INVALID',
  );
  assert(
    run.run === expectedRun && run.officialValidation === 'PASS' && run.canaryCount === 0,
    'DRILL_RUN_INVALID',
  );
  assert(
    stableStringify(run.sourceConfigHashes) === stableStringify(expectedSourceHashes),
    'DRILL_SOURCE_HASH_INVALID',
  );
  assert(
    stableStringify(run.runtimeConfigHashes) === stableStringify(expectedRuntimeHashes),
    'DRILL_RUNTIME_HASH_INVALID',
  );
  assert(
    Array.isArray(run.scenarios) && run.scenarios.length === DRILL_SCENARIOS.length,
    'DRILL_SCENARIO_SET_INVALID',
  );
  for (let index = 0; index < DRILL_SCENARIOS.length; index += 1) {
    validateScenario(run.scenarios[index], DRILL_SCENARIOS[index]);
  }
  validateCleanup(run.cleanup);
}

export function sealAlertDrillResult(value) {
  const result = structuredClone(value);
  return {
    ...result,
    resultHash: sha256(stableStringify(result)),
  };
}

export function validateAlertDrillReceipt(receipt, { root = ROOT } = {}) {
  exactKeys(
    receipt,
    [
      'schemaVersion',
      'status',
      'technicalReady',
      'deploymentReady',
      'scenarioCount',
      'runCount',
      'images',
      'runs',
      'canaryCount',
      'cleanup',
      'deploymentStatus',
      'nonClaims',
      'resultHash',
    ],
    'DRILL_RECEIPT_SCHEMA_INVALID',
  );
  assert(!RAW_CANARY.test(JSON.stringify(receipt)), 'DRILL_RAW_CANARY_FOUND');
  assert(
    receipt.schemaVersion === 'amic-vault.sf20-alert-drill-result.v1' &&
      receipt.status === 'TECHNICAL_PASS' &&
      receipt.technicalReady === true &&
      receipt.deploymentReady === false &&
      receipt.scenarioCount === DRILL_SCENARIOS.length &&
      receipt.runCount === 2 &&
      receipt.canaryCount === 0 &&
      receipt.deploymentStatus === EXTERNAL_BOUNDARY &&
      stableStringify(receipt.nonClaims) ===
        stableStringify([
          'NO_EXTERNAL_NOTIFICATION',
          'NO_STAGING_DRILL',
          'NO_DEPLOYMENT_RELEASE_OR_GO_LIVE',
        ]),
    'DRILL_DEPLOYMENT_BOUNDARY_INVALID',
  );
  exactKeys(receipt.images, Object.keys(DRILL_IMAGES), 'DRILL_IMAGE_INVALID');
  assert(
    Object.entries(DRILL_IMAGES).every(
      ([key, value]) =>
        receipt.images[key] === value && SAFE_IMAGE_REFERENCE.test(receipt.images[key]),
    ),
    'DRILL_IMAGE_INVALID',
  );
  const expectedSourceHashes = sourceConfigHashes(root);
  const expectedRuntimeHashes = runtimeConfigHashes(root);
  assert(Array.isArray(receipt.runs) && receipt.runs.length === 2, 'DRILL_RUN_SET_INVALID');
  for (let index = 0; index < receipt.runs.length; index += 1) {
    validateRun(receipt.runs[index], index + 1, expectedSourceHashes, expectedRuntimeHashes);
  }
  validateCleanup(receipt.cleanup);
  const { resultHash, ...unsigned } = receipt;
  assert(
    HASH.test(resultHash) && resultHash === sha256(stableStringify(unsigned)),
    'DRILL_RESULT_HASH_INVALID',
  );
  return {
    status: 'PASS',
    scenarioCount: receipt.scenarioCount,
    runCount: receipt.runCount,
    canaryCount: receipt.canaryCount,
    cleanup: receipt.cleanup,
    deploymentStatus: receipt.deploymentStatus,
  };
}

const SYNTHETIC_SERVER = String.raw`from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Lock

STATE = Path("/state/state.json")
DELIVERIES = Path("/state/deliveries.ndjson")
RAW_DELIVERIES = Path("/state/raw-deliveries.ndjson")
LOCK = Lock()
MAX_BODY = 1024 * 1024


def metrics() -> bytes:
    active = json.loads(STATE.read_text(encoding="utf-8")).get("active")
    values = {
        "database": 0 if active == "database-unavailable" else 1,
        "queue_age": 600 if active == "queue-age" else 0,
        "scanner_age": 90000 if active == "scanner-signature-stale" else 0,
        "audit_failure": 1 if active == "audit-write-failure" else 0,
        "backup_age": 4000 if active == "backup-stale" else 0,
        "disk_ratio": 0.1 if active == "disk-pressure" else 0.5,
    }
    lines = [
        "sf20_database_available " + str(values["database"]),
        'pgboss_queue_oldest_age_seconds{queue="document.extract"} ' + str(values["queue_age"]),
        "sf20_scanner_signature_available 1",
        "sf20_scanner_signature_age_seconds " + str(values["scanner_age"]),
        "sf20_quarantine_objects 0",
        "sf20_oldest_quarantine_age_seconds 0",
        'sf20_database_pool_connections{state="waiting"} 0',
        'audit_writes_total{outcome="success"} 1',
        'audit_writes_total{outcome="failure"} ' + str(values["audit_failure"]),
        'document_ingestion_results_total{outcome="failure"} 0',
        'storage_failures_total{error_class="timeout"} 0',
        "sf20_backup_status_available 1",
        "sf20_backup_age_seconds " + str(values["backup_age"]),
        "sf20_last_restore_duration_seconds 0",
        "sf20_monitored_disk_available 1",
        "sf20_monitored_disk_free_ratio " + str(values["disk_ratio"]),
    ]
    return ("\n".join(lines) + "\n").encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def do_GET(self):
        if self.path not in {"/metrics", "/health"}:
            self.send_response(404)
            self.end_headers()
            return
        body = metrics() if self.path == "/metrics" else b'{"status":"ok"}\n'
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/alerts":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("content-length", "0"))
        if length < 1 or length > MAX_BODY:
            self.send_response(413)
            self.end_headers()
            return
        payload = json.loads(self.rfile.read(length))
        projections = []
        for alert in payload.get("alerts", []):
            projections.append(
                {
                    "alertname": alert.get("labels", {}).get("alertname", ""),
                    "status": alert.get("status", ""),
                    "severity": alert.get("labels", {}).get("severity", ""),
                    "owner": alert.get("labels", {}).get("owner", ""),
                    "silenceMax": alert.get("annotations", {}).get("silence_max", ""),
                    "startsAt": alert.get("startsAt", ""),
                    "endsAt": alert.get("endsAt", ""),
                }
            )
        with LOCK:
            with RAW_DELIVERIES.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n")
            with DELIVERIES.open("a", encoding="utf-8") as stream:
                for projection in projections:
                    stream.write(json.dumps(projection, sort_keys=True, separators=(",", ":")) + "\n")
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
`;

function parseLines(value) {
  return value.trim().split(/\r?\n/gu).filter(Boolean);
}

function deliveryLines(path) {
  if (!existsSync(path)) return [];
  return parseLines(readFileSync(path, 'utf8')).map((line) => JSON.parse(line));
}

function writeJson(path, value, mode = 0o644) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode });
  chmodSync(path, mode);
}

function writeState(directory, active) {
  const temporary = resolve(directory, 'state.next.json');
  writeJson(temporary, { active }, 0o666);
  renameSync(temporary, resolve(directory, 'state.json'));
}

function withScrapeIdentity(metric) {
  const separator = metric.lastIndexOf(' ');
  assert(separator > 0, 'DRILL_SEED_METRIC_INVALID');
  const series = metric.slice(0, separator);
  const value = metric.slice(separator + 1);
  const labeled = series.endsWith('}')
    ? `${series.slice(0, -1)},instance="synthetic:8080",job="sf20-synthetic"}`
    : `${series}{instance="synthetic:8080",job="sf20-synthetic"}`;
  return `${labeled} ${value}`;
}

export function buildForStateSeed(scenario, now = Date.now()) {
  const downAt = (now - 2_000) / 1000;
  const activeAt = Math.floor(downAt - scenario.holdSeconds - 60);
  const sourceMetrics = scenario.seedMetrics.map(withScrapeIdentity);
  const metricLines =
    scenario.id === 'audit-write-failure'
      ? [
          `${sourceMetrics[0]} ${(now - 122_000) / 1000}`,
          `${sourceMetrics[1]} ${(now - 62_000) / 1000}`,
        ]
      : sourceMetrics.map((metric) => `${metric} ${downAt.toFixed(3)}`);
  const inputLabels = new Set([
    'database-unavailable',
    'scanner-signature-stale',
    'backup-stale',
    'disk-pressure',
  ]).has(scenario.id)
    ? ',instance="synthetic:8080",job="sf20-synthetic"'
    : '';
  return [
    ...metricLines,
    `ALERTS_FOR_STATE{alertname="${scenario.alertName}",owner="vault-operator",severity="${
      scenario.alertName === 'Sf20QueueAgeHigh' ? 'warning' : 'critical'
    }"${inputLabels}} ${activeAt} ${downAt.toFixed(3)}`,
    '# EOF',
    '',
  ].join('\n');
}

function createRuntimeFiles(directory, root = ROOT) {
  mkdirSync(directory, { recursive: true, mode: 0o777 });
  chmodSync(directory, 0o777);
  const bundle = runtimeBundle(root);
  for (const [name, value] of [
    ['prometheus.yml', bundle.prometheus],
    ['alerts.yml', bundle.alerts],
    ['alertmanager.yml', bundle.alertmanager],
  ]) {
    writeJson(resolve(directory, name), value);
  }
  writeFileSync(resolve(directory, 'synthetic-server.py'), bundle.syntheticServer, {
    mode: 0o444,
  });
  writeState(directory, null);
  writeFileSync(resolve(directory, 'deliveries.ndjson'), '', { mode: 0o666 });
  writeFileSync(resolve(directory, 'raw-deliveries.ndjson'), '', { mode: 0o666 });
  chmodSync(resolve(directory, 'deliveries.ndjson'), 0o666);
  chmodSync(resolve(directory, 'raw-deliveries.ndjson'), 0o666);
  return bundle;
}

async function waitFor(check, code, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      if (error instanceof AlertDrillError && Date.now() + 250 >= deadline) throw error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  fail(code);
}

const INTERNAL_GET_SCRIPT = String.raw`import json
import sys
from urllib.request import urlopen

with urlopen(sys.argv[1], timeout=5) as response:
    payload = json.load(response)
sys.stdout.write(json.dumps(payload, sort_keys=True, separators=(",", ":")))
`;

const INTERNAL_STATUS_SCRIPT = String.raw`import sys
from urllib.request import urlopen

with urlopen(sys.argv[1], timeout=5) as response:
    if response.status != 200:
        raise SystemExit(1)
sys.stdout.write("READY")
`;

const INTERNAL_POST_SCRIPT = String.raw`import sys
from urllib.request import Request, urlopen

with urlopen(Request(sys.argv[1], method="POST"), timeout=5) as response:
    if response.status < 200 or response.status >= 300:
        raise SystemExit(1)
sys.stdout.write("OK")
`;

const INTERNAL_SILENCE_SCRIPT = String.raw`import json
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen

base_url, alert_name, starts_at, ends_at = sys.argv[1:]
body = json.dumps(
    {
        "matchers": [{"name": "alertname", "value": alert_name, "isRegex": False}],
        "startsAt": starts_at,
        "endsAt": ends_at,
        "createdBy": "sf20-drill",
        "comment": "bounded synthetic acknowledgement",
    },
    separators=(",", ":"),
).encode("utf-8")
created_request = Request(
    base_url + "/api/v2/silences",
    data=body,
    headers={"content-type": "application/json"},
    method="POST",
)
with urlopen(created_request, timeout=5) as response:
    silence_id = json.load(response).get("silenceID")
if not isinstance(silence_id, str) or not silence_id:
    raise SystemExit(1)
silence_url = base_url + "/api/v2/silence/" + quote(silence_id, safe="")
with urlopen(silence_url, timeout=5) as response:
    state = json.load(response).get("status", {}).get("state")
if state != "active":
    raise SystemExit(1)
with urlopen(Request(silence_url, method="DELETE"), timeout=5) as response:
    if response.status < 200 or response.status >= 300:
        raise SystemExit(1)
sys.stdout.write('{"state":"active"}')
`;

async function internalCommand(context, script, arguments_, code) {
  assert(typeof context.syntheticName === 'string', 'DRILL_SYNTHETIC_NOT_READY');
  return command(
    context,
    ['exec', context.syntheticName, 'python', '-I', '-c', script, ...arguments_],
    code,
  );
}

async function internalGetJson(context, url, code) {
  const output = await internalCommand(context, INTERNAL_GET_SCRIPT, [url], code);
  try {
    return JSON.parse(output);
  } catch {
    fail(code);
  }
}

async function internalReady(context, url) {
  return (
    (await internalCommand(
      context,
      INTERNAL_STATUS_SCRIPT,
      [url],
      'DRILL_INTERNAL_READINESS_FAILED',
    )) === 'READY'
  );
}

async function internalPost(context, url, code) {
  const output = await internalCommand(context, INTERNAL_POST_SCRIPT, [url], code);
  assert(output === 'OK', code);
}

function transition(sequence, state) {
  return { sequence, state, at: new Date().toISOString() };
}

function activeScenarioAlerts(payload) {
  const alerts = payload?.data?.alerts;
  assert(Array.isArray(alerts), 'DRILL_PROMETHEUS_API_INVALID');
  return alerts.filter(
    (alert) =>
      DRILL_SCENARIOS.some((scenario) => scenario.alertName === alert.labels?.alertname) &&
      ['pending', 'firing'].includes(alert.state),
  );
}

async function pollAlert(context, scenario, state) {
  return waitFor(
    async () => {
      const payload = await internalGetJson(
        context,
        'http://prometheus:9090/api/v1/alerts',
        'DRILL_PROMETHEUS_API_INVALID',
      );
      const active = activeScenarioAlerts(payload);
      if (state === 'inactive')
        return active.every((alert) => alert.labels.alertname !== scenario.alertName);
      const unexpected = active.filter((alert) => alert.labels.alertname !== scenario.alertName);
      assert(unexpected.length === 0, 'DRILL_UNEXPECTED_ALERT_FIRED');
      return active.some(
        (alert) => alert.labels.alertname === scenario.alertName && alert.state === state,
      );
    },
    state === 'firing' ? 'DRILL_ALERT_DID_NOT_FIRE' : 'DRILL_ALERT_DID_NOT_RECOVER',
  );
}

async function observeHealthyBaseline(context) {
  return waitFor(async () => {
    const [targets, alerts] = await Promise.all([
      internalGetJson(
        context,
        'http://prometheus:9090/api/v1/query?query=up%7Bjob%3D%22sf20-synthetic%22%7D',
        'DRILL_PROMETHEUS_API_INVALID',
      ),
      internalGetJson(
        context,
        'http://prometheus:9090/api/v1/alerts',
        'DRILL_PROMETHEUS_API_INVALID',
      ),
    ]);
    const results = targets?.data?.result;
    return (
      Array.isArray(results) &&
      results.length === 1 &&
      results[0]?.value?.[1] === '1' &&
      activeScenarioAlerts(alerts).length === 0
    );
  }, 'DRILL_HEALTHY_BASELINE_NOT_OBSERVED');
}

async function waitForDelivery(deliveriesPath, startIndex, scenario, status) {
  return waitFor(
    () => {
      const relevant = deliveryLines(deliveriesPath)
        .slice(startIndex)
        .filter(
          (delivery) =>
            delivery.alertname === scenario.alertName &&
            delivery.status === status &&
            delivery.owner === 'vault-operator' &&
            delivery.silenceMax === `${scenario.silenceMaxSeconds / 60}m`,
        );
      return relevant.length > 0 ? relevant : false;
    },
    status === 'firing' ? 'DRILL_ALERT_NOT_DELIVERED' : 'DRILL_RESOLUTION_NOT_DELIVERED',
  );
}

async function acknowledgeAlert(context, scenario, silenceSeconds = 60) {
  assert(silenceSeconds <= scenario.silenceMaxSeconds, 'DRILL_SILENCE_LIMIT_EXCEEDED');
  const now = Date.now();
  const output = await internalCommand(
    context,
    INTERNAL_SILENCE_SCRIPT,
    [
      'http://alertmanager:9093',
      scenario.alertName,
      new Date(now - 1_000).toISOString(),
      new Date(now + silenceSeconds * 1000).toISOString(),
    ],
    'DRILL_SILENCE_WORKFLOW_FAILED',
  );
  assert(output === '{"state":"active"}', 'DRILL_SILENCE_WORKFLOW_FAILED');
  return silenceSeconds;
}

async function clearAuditFailure(context) {
  const selector = encodeURIComponent('audit_writes_total{outcome="failure"}');
  for (const endpoint of [
    `/api/v1/admin/tsdb/delete_series?match%5B%5D=${selector}`,
    '/api/v1/admin/tsdb/clean_tombstones',
  ]) {
    await internalPost(
      context,
      `http://prometheus:9090${endpoint}`,
      'DRILL_AUDIT_SERIES_RESET_FAILED',
    );
  }
}

async function command(context, args, code = 'DRILL_DOCKER_COMMAND_FAILED') {
  try {
    const result = await execFile('docker', args, {
      encoding: 'utf8',
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      timeout: 60_000,
    });
    context.outputs.push(result.stdout ?? '', result.stderr ?? '');
    return (result.stdout ?? '').trim();
  } catch {
    fail(code);
  }
}

async function bestEffortCommand(context, args) {
  try {
    const result = await execFile('docker', args, {
      encoding: 'utf8',
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      timeout: 30_000,
    });
    context.outputs.push(result.stdout ?? '', result.stderr ?? '');
    return (result.stdout ?? '').trim();
  } catch {
    return '';
  }
}

async function ensureImages(context) {
  for (const reference of Object.values(DRILL_IMAGES)) {
    let identifier = await bestEffortCommand(context, [
      'image',
      'inspect',
      reference,
      '--format',
      '{{.Id}}',
    ]);
    if (!identifier) {
      await command(context, ['pull', reference], 'DRILL_IMAGE_PULL_FAILED');
      identifier = await command(
        context,
        ['image', 'inspect', reference, '--format', '{{.Id}}'],
        'DRILL_IMAGE_INVALID',
      );
    }
    assert(identifier === reference.slice(reference.indexOf('@') + 1), 'DRILL_IMAGE_INVALID');
  }
}

async function officialValidation(context, root = ROOT) {
  const monitoring = resolve(root, 'infra/monitoring');
  const prometheusPrefix = [
    'run',
    '--rm',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--mount',
    `type=bind,source=${monitoring},target=/etc/prometheus,readonly`,
    '--entrypoint',
    '/bin/promtool',
    DRILL_IMAGES.prometheus,
  ];
  await command(
    context,
    [...prometheusPrefix, 'check', 'config', '/etc/prometheus/prometheus.yml'],
    'DRILL_OFFICIAL_VALIDATION_FAILED',
  );
  await command(
    context,
    [...prometheusPrefix, 'check', 'rules', '/etc/prometheus/alerts.yml'],
    'DRILL_OFFICIAL_VALIDATION_FAILED',
  );
  await command(
    context,
    [...prometheusPrefix, 'test', 'rules', '/etc/prometheus/alerts.test.yml'],
    'DRILL_OFFICIAL_VALIDATION_FAILED',
  );
  await command(
    context,
    [
      'run',
      '--rm',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16m',
      '--mount',
      `type=bind,source=${monitoring},target=/etc/alertmanager,readonly`,
      '--entrypoint',
      '/bin/amtool',
      DRILL_IMAGES.alertmanager,
      'check-config',
      '/etc/alertmanager/alertmanager.yml',
    ],
    'DRILL_OFFICIAL_VALIDATION_FAILED',
  );
}

function commonContainerArguments(context, name) {
  return [
    '--detach',
    '--name',
    name,
    '--label',
    `${context.labelKey}=${context.labelValue}`,
    '--network',
    context.network,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '96',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
  ];
}

async function createVolume(context, suffix) {
  const name = `${context.prefix}-${suffix}`;
  await command(
    context,
    ['volume', 'create', '--label', `${context.labelKey}=${context.labelValue}`, name],
    'DRILL_VOLUME_CREATE_FAILED',
  );
  context.volumes.add(name);
  return name;
}

async function failContainerReadiness(context, name, component) {
  const state = await bestEffortCommand(context, [
    'inspect',
    name,
    '--format',
    '{{.State.Status}} {{.State.ExitCode}}',
  ]);
  const logs = await bestEffortCommand(context, ['logs', name]);
  context.outputs.push(logs);
  const normalized = `${state}\n${logs}`.toLowerCase();
  if (/permission denied|operation not permitted/u.test(normalized)) {
    fail(`DRILL_${component}_STORAGE_PERMISSION_DENIED`);
  }
  if (
    /error loading config|failed to load configuration|yaml:|field .* not found/u.test(normalized)
  ) {
    fail(`DRILL_${component}_CONFIG_INVALID`);
  }
  if (/address already in use|port is already allocated/u.test(normalized)) {
    fail(`DRILL_${component}_PORT_UNAVAILABLE`);
  }
  if (/^exited /u.test(state)) fail(`DRILL_${component}_EXITED`);
  fail(`DRILL_${component}_NOT_REACHABLE`);
}

async function startSynthetic(context) {
  const name = `${context.prefix}-synthetic`;
  await command(
    context,
    [
      'run',
      ...commonContainerArguments(context, name),
      '--network-alias',
      'synthetic',
      '--user',
      '65534:65534',
      '--cpus',
      '0.25',
      '--memory',
      '128m',
      '--mount',
      `type=bind,source=${resolve(context.directory, 'synthetic-server.py')},target=/synthetic/server.py,readonly`,
      '--mount',
      `type=bind,source=${context.directory},target=/state`,
      DRILL_IMAGES.synthetic,
      'python',
      '-I',
      '-u',
      '/synthetic/server.py',
    ],
    'DRILL_SYNTHETIC_START_FAILED',
  );
  context.containers.add(name);
  context.syntheticName = name;
  try {
    await waitFor(
      () => internalReady(context, 'http://127.0.0.1:8080/health'),
      'DRILL_SYNTHETIC_NOT_READY',
    );
  } catch {
    await failContainerReadiness(context, name, 'SYNTHETIC');
  }
  return name;
}

async function startAlertmanager(context) {
  const name = `${context.prefix}-alertmanager`;
  const volume = await createVolume(context, 'alertmanager-data');
  await command(
    context,
    [
      'run',
      ...commonContainerArguments(context, name),
      '--network-alias',
      'alertmanager',
      '--user',
      '65534:65534',
      '--cpus',
      '0.5',
      '--memory',
      '256m',
      '--mount',
      `type=bind,source=${context.directory},target=/etc/alertmanager,readonly`,
      '--mount',
      `type=volume,source=${volume},target=/alertmanager`,
      DRILL_IMAGES.alertmanager,
      '--config.file=/etc/alertmanager/alertmanager.yml',
      '--storage.path=/alertmanager',
      '--data.retention=1h',
      '--web.listen-address=0.0.0.0:9093',
      '--log.level=warn',
    ],
    'DRILL_ALERTMANAGER_START_FAILED',
  );
  context.containers.add(name);
  try {
    await waitFor(
      () => internalReady(context, 'http://alertmanager:9093/-/ready'),
      'DRILL_ALERTMANAGER_NOT_READY',
    );
  } catch {
    await failContainerReadiness(context, name, 'ALERTMANAGER');
  }
  return { name };
}

async function seedPrometheusVolume(context, scenario, volume) {
  const seedPath = resolve(context.directory, `seed-${scenario.id}.prom`);
  const seed = buildForStateSeed(scenario);
  writeFileSync(seedPath, seed, { mode: 0o444 });
  context.scanInputs.push(seed);
  await command(
    context,
    [
      'run',
      '--rm',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '65534:65534',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=128m',
      '--mount',
      `type=bind,source=${seedPath},target=/seed/input.prom,readonly`,
      '--mount',
      `type=volume,source=${volume},target=/prometheus`,
      '--entrypoint',
      '/bin/promtool',
      DRILL_IMAGES.prometheus,
      'tsdb',
      'create-blocks-from',
      'openmetrics',
      '/seed/input.prom',
      '/prometheus',
    ],
    'DRILL_FOR_STATE_IMPORT_FAILED',
  );
}

async function startPrometheus(context, scenario = undefined) {
  const suffix = scenario?.id ?? 'healthy-baseline';
  const name = `${context.prefix}-prometheus-${suffix}`;
  const volume = await createVolume(context, `prometheus-${suffix}`);
  if (scenario) await seedPrometheusVolume(context, scenario, volume);
  await command(
    context,
    [
      'run',
      ...commonContainerArguments(context, name),
      '--user',
      '65534:65534',
      '--cpus',
      '0.75',
      '--memory',
      '512m',
      '--network-alias',
      'prometheus',
      '--mount',
      `type=bind,source=${context.directory},target=/etc/prometheus,readonly`,
      '--mount',
      `type=volume,source=${volume},target=/prometheus`,
      DRILL_IMAGES.prometheus,
      '--config.file=/etc/prometheus/prometheus.yml',
      '--storage.tsdb.path=/prometheus',
      '--storage.tsdb.retention.time=1h',
      '--storage.tsdb.retention.size=128MB',
      '--web.listen-address=0.0.0.0:9090',
      '--web.enable-admin-api',
      '--rules.alert.for-outage-tolerance=1h',
      '--rules.alert.for-grace-period=0s',
      '--log.level=warn',
    ],
    'DRILL_PROMETHEUS_START_FAILED',
  );
  context.containers.add(name);
  try {
    await waitFor(
      () => internalReady(context, 'http://prometheus:9090/-/ready'),
      'DRILL_PROMETHEUS_NOT_READY',
    );
  } catch {
    await failContainerReadiness(context, name, 'PROMETHEUS');
  }
  await inspectNoPublishedPorts(context);
  return { name, volume };
}

async function removePrometheus(context, runtime) {
  context.outputs.push(await bestEffortCommand(context, ['logs', runtime.name]));
  await bestEffortCommand(context, ['rm', '--force', runtime.name]);
  context.containers.delete(runtime.name);
  await bestEffortCommand(context, ['volume', 'rm', '--force', runtime.volume]);
  context.volumes.delete(runtime.volume);
}

async function runScenario(context, scenario) {
  const startedAt = Date.now();
  const deliveriesPath = resolve(context.directory, 'deliveries.ndjson');
  const deliveryStart = deliveryLines(deliveriesPath).length;
  const transitions = [
    {
      sequence: 1,
      state: 'HEALTHY_BASELINE',
      at: context.lastHealthyAt,
    },
  ];
  writeState(context.directory, scenario.id);
  transitions.push(transition(2, 'INJECTED'));
  const runtime = await startPrometheus(context, scenario);
  try {
    await pollAlert(context, scenario, 'firing');
    transitions.push(transition(3, 'PROMETHEUS_FIRING'));
    const firing = await waitForDelivery(deliveriesPath, deliveryStart, scenario, 'firing');
    transitions.push(transition(4, 'ALERTMANAGER_DELIVERED'));
    const silenceSeconds = await acknowledgeAlert(context, scenario);
    transitions.push(transition(5, 'ACKNOWLEDGED'));
    writeState(context.directory, null);
    if (scenario.id === 'audit-write-failure') {
      await clearAuditFailure(context);
    }
    transitions.push(transition(6, 'RECOVERED'));
    await pollAlert(context, scenario, 'inactive');
    const inactive = transition(7, 'PROMETHEUS_INACTIVE');
    transitions.push(inactive);
    context.lastHealthyAt = inactive.at;
    const resolved = await waitForDelivery(deliveriesPath, deliveryStart, scenario, 'resolved');
    transitions.push(transition(8, 'RESOLVED_DELIVERED'));
    return {
      scenario: scenario.id,
      alertName: scenario.alertName,
      silenceSeconds,
      silenceMaxSeconds: scenario.silenceMaxSeconds,
      transitions,
      durationMs: Date.now() - startedAt,
      deliveryCounts: {
        firing: firing.length,
        resolved: resolved.length,
      },
    };
  } finally {
    writeState(context.directory, null);
    await removePrometheus(context, runtime);
  }
}

async function inspectNoPublishedPorts(context) {
  for (const name of context.containers) {
    const published = await command(
      context,
      ['inspect', name, '--format', '{{json .HostConfig.PortBindings}}'],
      'DRILL_CONTAINER_INSPECT_FAILED',
    );
    const bindings = JSON.parse(published);
    assert(Object.keys(bindings ?? {}).length === 0, 'DRILL_PUBLIC_PORT_EXPOSED');
  }
}

function canaryCount(values) {
  return values.reduce((count, value) => count + (RAW_CANARY.test(String(value)) ? 1 : 0), 0);
}

async function cleanup(context) {
  for (const name of [...context.containers].reverse()) {
    context.outputs.push(await bestEffortCommand(context, ['logs', name]));
    await bestEffortCommand(context, ['rm', '--force', name]);
  }
  context.containers.clear();
  for (const volume of [...context.volumes].reverse()) {
    await bestEffortCommand(context, ['volume', 'rm', '--force', volume]);
  }
  context.volumes.clear();
  if (context.network) {
    await bestEffortCommand(context, ['network', 'rm', context.network]);
  }

  rmSync(context.tempRoot, { recursive: true, force: true });
  const containerIds = parseLines(
    await command(
      context,
      ['ps', '--all', '--quiet', '--filter', `label=${context.labelKey}=${context.labelValue}`],
      'DRILL_CLEANUP_INSPECTION_FAILED',
    ),
  );
  const networkIds = parseLines(
    await command(
      context,
      ['network', 'ls', '--quiet', '--filter', `label=${context.labelKey}=${context.labelValue}`],
      'DRILL_CLEANUP_INSPECTION_FAILED',
    ),
  );
  const volumeIds = parseLines(
    await command(
      context,
      ['volume', 'ls', '--quiet', '--filter', `label=${context.labelKey}=${context.labelValue}`],
      'DRILL_CLEANUP_INSPECTION_FAILED',
    ),
  );
  return {
    containers: containerIds.length,
    networks: networkIds.length,
    volumes: volumeIds.length,
    processes: containerIds.length,
    tempFiles: existsSync(context.tempRoot) ? 1 : 0,
  };
}

async function runOnce(run, { root = ROOT, officialValidationPassed }) {
  const token = randomBytes(6).toString('hex');
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'amic-sf20-alert-drill-'));
  chmodSync(tempRoot, 0o777);
  const directory = resolve(tempRoot, 'runtime');
  const context = {
    run,
    tempRoot,
    directory,
    prefix: `amic-sf20-${token}`,
    labelKey: 'com.amic-vault.sf20-alert-drill',
    labelValue: token,
    network: `amic-sf20-${token}-network`,
    containers: new Set(),
    volumes: new Set(),
    outputs: [],
    scanInputs: [],
    syntheticName: '',
    lastHealthyAt: '',
  };
  let result;
  let cleanupResult;
  try {
    const bundle = createRuntimeFiles(directory, root);
    context.scanInputs.push(
      JSON.stringify(bundle.prometheus),
      JSON.stringify(bundle.alerts),
      JSON.stringify(bundle.alertmanager),
    );
    await command(
      context,
      [
        'network',
        'create',
        '--internal',
        '--label',
        `${context.labelKey}=${context.labelValue}`,
        context.network,
      ],
      'DRILL_NETWORK_CREATE_FAILED',
    );
    await startSynthetic(context);
    await startAlertmanager(context);
    await inspectNoPublishedPorts(context);
    writeState(context.directory, null);
    const baseline = await startPrometheus(context);
    try {
      await observeHealthyBaseline(context);
      context.lastHealthyAt = new Date().toISOString();
    } finally {
      await removePrometheus(context, baseline);
    }
    const scenarios = [];
    for (const scenario of DRILL_SCENARIOS) {
      scenarios.push(await runScenario(context, scenario));
    }
    context.scanInputs.push(
      readFileSync(resolve(directory, 'state.json'), 'utf8'),
      readFileSync(resolve(directory, 'deliveries.ndjson'), 'utf8'),
      readFileSync(resolve(directory, 'raw-deliveries.ndjson'), 'utf8'),
      ...context.outputs,
    );
    const observedCanaries = canaryCount(context.scanInputs);
    assert(observedCanaries === 0, 'DRILL_RAW_CANARY_FOUND');
    result = {
      run,
      officialValidation: officialValidationPassed ? 'PASS' : 'FAILED',
      sourceConfigHashes: sourceConfigHashes(root),
      runtimeConfigHashes: runtimeConfigHashes(root),
      scenarios,
      canaryCount: observedCanaries,
    };
  } finally {
    cleanupResult = await cleanup(context);
  }
  validateCleanup(cleanupResult);
  return {
    ...result,
    cleanup: cleanupResult,
  };
}

export async function runSmallFirmAlertDrill({ root = ROOT } = {}) {
  const bootstrap = { outputs: [] };
  await ensureImages(bootstrap);
  await officialValidation(bootstrap, root);
  assert(canaryCount(bootstrap.outputs) === 0, 'DRILL_RAW_CANARY_FOUND');
  const runs = [];
  for (let run = 1; run <= 2; run += 1) {
    runs.push(
      await runOnce(run, {
        root,
        officialValidationPassed: true,
      }),
    );
  }
  const value = {
    schemaVersion: 'amic-vault.sf20-alert-drill-result.v1',
    status: 'TECHNICAL_PASS',
    technicalReady: true,
    deploymentReady: false,
    scenarioCount: DRILL_SCENARIOS.length,
    runCount: runs.length,
    images: DRILL_IMAGES,
    runs,
    canaryCount: 0,
    cleanup: {
      containers: 0,
      networks: 0,
      volumes: 0,
      processes: 0,
      tempFiles: 0,
    },
    deploymentStatus: EXTERNAL_BOUNDARY,
    nonClaims: ['NO_EXTERNAL_NOTIFICATION', 'NO_STAGING_DRILL', 'NO_DEPLOYMENT_RELEASE_OR_GO_LIVE'],
  };
  const receipt = sealAlertDrillResult(value);
  validateAlertDrillReceipt(receipt, { root });
  return receipt;
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  return values;
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  try {
    const options = parseCli(argv);
    if (options.help) {
      stdout.write('Usage: small-firm-alert-drill.mjs\n');
      return 0;
    }
    const receipt = deps.receipt ?? (await runSmallFirmAlertDrill({ root: deps.root ?? ROOT }));
    validateAlertDrillReceipt(receipt, { root: deps.root ?? ROOT });
    stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `${JSON.stringify({
        status: 'FAILED',
        code: error instanceof AlertDrillError ? error.code : 'DRILL_FAILED',
      })}\n`,
    );
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exitCode = await main();
