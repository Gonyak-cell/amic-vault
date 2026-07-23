#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(`ingestion container check failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function object(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} missing`);
  return value;
}

function exactArray(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(actual.length === expected.length, `${label} count mismatch`);
  assert(new Set(actual).size === actual.length, `${label} contains duplicates`);
  for (let index = 0; index < expected.length; index += 1) {
    assert(actual[index] === expected[index], `${label} mismatch at ${index}`);
  }
}

export function validateIngestionContainer({ compose, policy, dockerfile }) {
  assert(
    policy.schemaVersion === 'amic-vault.ingestion-container-policy.v1',
    'policy schema mismatch',
  );
  const services = object(compose.services, 'compose services');
  const worker = object(services[policy.service], `service ${policy.service}`);
  const runtime = object(policy.runtime, 'runtime policy');

  assert(worker.user === runtime.user, 'fixed user mismatch');
  assert(worker.read_only === runtime.readOnly, 'read-only rootfs mismatch');
  exactArray(worker.cap_drop, runtime.capDrop, 'dropped capabilities');
  assert(!Object.hasOwn(worker, 'cap_add'), 'worker must not add capabilities');
  exactArray(worker.security_opt, runtime.securityOpt, 'security options');
  assert(worker.pids_limit === runtime.pidsLimit, 'PID limit mismatch');
  assert(String(worker.cpus) === runtime.cpus, 'CPU limit mismatch');
  assert(String(worker.mem_limit).toLowerCase() === runtime.memory, 'memory limit mismatch');
  exactArray(worker.tmpfs, runtime.tmpfs, 'tmpfs');
  exactArray(worker.volumes, runtime.writableVolumes, 'writable volumes');
  assert(worker.stop_grace_period === runtime.stopGracePeriod, 'stop grace period mismatch');

  for (const key of policy.prohibitedKeys) {
    assert(!Object.hasOwn(worker, key), `worker uses prohibited ${key}`);
  }
  for (const mount of worker.volumes ?? []) {
    for (const fragment of policy.prohibitedMountFragments) {
      assert(!mount.includes(fragment), `worker mount contains prohibited ${fragment}`);
    }
  }
  assert(!Object.hasOwn(worker, 'ports'), 'worker must not publish ports');
  assert(!Object.hasOwn(worker, 'expose'), 'worker must not expose ports');

  assert(dockerfile.includes(`FROM ${policy.image.base}`), 'digest-pinned Python base mismatch');
  assert(
    new RegExp(`^USER\\s+${policy.image.uid}:${policy.image.gid}\\s*$`, 'mu').test(dockerfile),
    'Dockerfile fixed USER missing',
  );
  assert(
    dockerfile.includes('mkdir -p /var/lib/amic-vault/replay') &&
      dockerfile.includes(`chown -R ${policy.image.uid}:${policy.image.gid}`),
    'replay directory ownership bootstrap missing',
  );
  for (const variable of [
    'HOME=/tmp/amic-home',
    'XDG_CACHE_HOME=/tmp/amic-cache',
    'XDG_CONFIG_HOME=/tmp/amic-config',
    'TMPDIR=/tmp',
  ]) {
    assert(dockerfile.includes(variable), `scratch environment missing ${variable}`);
  }

  return {
    schemaVersion: 'amic-vault.ingestion-container-report.v1',
    status: 'PASS',
    service: policy.service,
    user: worker.user,
    readOnly: worker.read_only,
    capabilityCount: 0,
    pidsLimit: worker.pids_limit,
    cpus: String(worker.cpus),
    memory: String(worker.mem_limit),
    tmpfsCount: worker.tmpfs.length,
    writableVolumeCount: worker.volumes.length,
    baseImage: policy.image.base,
  };
}

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const report = validateIngestionContainer({
      compose: json('infra/production/compose.yml'),
      policy: json('infra/policies/ingestion-container-policy.yml'),
      dockerfile: readFileSync(resolve('workers/ingestion/Dockerfile'), 'utf8'),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
