import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import test from 'node:test';
import { validateIngestionEgress } from './check-ingestion-egress.mjs';

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function pythonFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) files.push(...pythonFiles(absolute));
    else if (entry.endsWith('.py')) files.push(absolute);
  }
  return files;
}

function fixture() {
  const root = resolve('workers/ingestion/app');
  return {
    compose: json('infra/production/compose.yml'),
    policy: json('infra/policies/ingestion-egress-policy.yml'),
    contracts: readFileSync(resolve('workers/ingestion/app/contracts.py'), 'utf8'),
    pythonSources: Object.fromEntries(
      pythonFiles(root).map((absolute) => [
        relative(process.cwd(), absolute),
        readFileSync(absolute, 'utf8'),
      ]),
    ),
  };
}

function fails(mutator, pattern) {
  const value = structuredClone(fixture());
  mutator(value);
  assert.throws(() => validateIngestionEgress(value), pattern);
}

test('canonical fixed-destination private egress profile passes', () => {
  const report = validateIngestionEgress(fixture());
  assert.equal(report.status, 'PASS');
  assert.equal(report.enforcement, 'required');
  assert.equal(report.destinationCount, 2);
  assert.equal(report.requiredInputCount, 6);
  assert.equal(report.unapprovedSocketSourceCount, 0);
  assert(report.inspectedPythonFileCount > 10);
});

test('missing or source-defaulted deployment inputs fail', () => {
  for (const name of Object.keys(fixture().policy.configuration)) {
    fails(
      ({ compose }) => {
        compose.services.ingestion.environment[name] = 'storage.private.test:443';
      },
      new RegExp(`${name} is not an explicit required input`, 'u'),
    );
  }
  fails(({ compose }) => {
    compose.services.ingestion.environment.INGESTION_EGRESS_ENFORCEMENT = 'optional';
  }, /fail-closed enforcement missing/u);
});

test('public route and host-side bypasses fail', () => {
  fails(({ compose }) => {
    compose.networks['ingestion-egress'].internal = false;
  }, /egress network must be internal/u);
  for (const [key, value] of [
    ['ports', ['8000:8000']],
    ['network_mode', 'host'],
    ['extra_hosts', ['storage.private.test:169.254.169.254']],
    ['dns', ['8.8.8.8']],
    ['privileged', true],
  ]) {
    fails(
      ({ compose }) => {
        compose.services.ingestion[key] = value;
      },
      new RegExp(`worker uses prohibited ${key}`, 'u'),
    );
  }
});

test('API peers cannot override worker destination configuration', () => {
  fails(({ compose }) => {
    compose.services.api.environment.INGESTION_STORAGE_ENDPOINT = 'https://attacker.invalid';
  }, /api can override INGESTION_STORAGE_ENDPOINT/u);
});

test('request-controlled network fields and new socket sources fail', () => {
  for (const declaration of [
    '\n    endpoint: str\n',
    '\n    storage_url = "https://attacker.invalid"\n',
    '\n    host: str\n',
  ]) {
    const value = fixture();
    value.contracts += declaration;
    assert.throws(() => validateIngestionEgress(value), /envelope declares network field/u);
  }
  fails(({ pythonSources }) => {
    pythonSources['workers/ingestion/app/parsers/network.py'] =
      'import socket\nsocket.create_connection(("attacker.invalid", 443))\n';
  }, /unapproved socket source/u);
});
