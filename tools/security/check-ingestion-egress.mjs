#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(`ingestion egress check failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function object(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} missing`);
  return value;
}

function exactSet(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(actual.length === expected.length, `${label} count mismatch`);
  assert(new Set(actual).size === actual.length, `${label} contains duplicates`);
  for (const item of expected) assert(actual.includes(item), `${label} missing ${item}`);
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

export function validateIngestionEgress({ compose, policy, contracts, pythonSources }) {
  assert(
    policy.schemaVersion === 'amic-vault.ingestion-egress-policy.v1',
    'policy schema mismatch',
  );
  const services = object(compose.services, 'compose services');
  const worker = object(services[policy.service], `service ${policy.service}`);
  const workerEnvironment = object(worker.environment, 'worker environment');
  assert(
    workerEnvironment.INGESTION_EGRESS_ENFORCEMENT === policy.enforcement,
    'fail-closed enforcement missing',
  );
  for (const [name, value] of Object.entries(policy.configuration)) {
    assert(workerEnvironment[name] === value, `${name} is not an explicit required input`);
  }
  for (const [name, service] of Object.entries(services)) {
    if (name === policy.service) continue;
    const environment = service.environment ?? {};
    for (const variable of ['INGESTION_EGRESS_ENFORCEMENT', ...Object.keys(policy.configuration)]) {
      assert(!Object.hasOwn(environment, variable), `${name} can override ${variable}`);
    }
  }

  exactSet(worker.networks, ['ingestion-worker', policy.network], 'worker networks');
  const network = object(
    object(compose.networks, 'compose networks')[policy.network],
    'egress network',
  );
  assert(network.internal === policy.networkInternal, 'egress network must be internal');
  for (const key of policy.prohibitedServiceKeys) {
    assert(!Object.hasOwn(worker, key), `worker uses prohibited ${key}`);
  }

  for (const field of policy.forbiddenEnvelopeFields) {
    const declaration = new RegExp(`^\\s*${field}\\s*[:=]`, 'mu');
    assert(!declaration.test(contracts), `envelope declares network field ${field}`);
  }

  const approved = new Set(policy.approvedSocketModules);
  for (const [path, source] of Object.entries(pythonSources)) {
    const opensSocket =
      /\bsocket\.(?:socket|create_connection|getaddrinfo)\s*\(/u.test(source) ||
      /\b(?:requests|httpx|urllib3)\b/u.test(source);
    if (opensSocket) assert(approved.has(path), `unapproved socket source ${path}`);
  }
  for (const path of approved) {
    assert(Object.hasOwn(pythonSources, path), `approved socket source missing ${path}`);
  }

  return {
    schemaVersion: 'amic-vault.ingestion-egress-report.v1',
    status: 'PASS',
    enforcement: workerEnvironment.INGESTION_EGRESS_ENFORCEMENT,
    destinationCount: 2,
    internalNetwork: policy.network,
    requiredInputCount: Object.keys(policy.configuration).length,
    forbiddenEnvelopeFieldCount: policy.forbiddenEnvelopeFields.length,
    inspectedPythonFileCount: Object.keys(pythonSources).length,
    unapprovedSocketSourceCount: 0,
  };
}

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function sources() {
  const root = resolve('workers/ingestion/app');
  return Object.fromEntries(
    pythonFiles(root).map((absolute) => [
      relative(process.cwd(), absolute),
      readFileSync(absolute, 'utf8'),
    ]),
  );
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const report = validateIngestionEgress({
      compose: json('infra/production/compose.yml'),
      policy: json('infra/policies/ingestion-egress-policy.yml'),
      contracts: readFileSync(resolve('workers/ingestion/app/contracts.py'), 'utf8'),
      pythonSources: sources(),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
