import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { validateIngestionContainer } from './check-ingestion-container.mjs';

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function fixture() {
  return {
    compose: json('infra/production/compose.yml'),
    policy: json('infra/policies/ingestion-container-policy.yml'),
    dockerfile: readFileSync(resolve('workers/ingestion/Dockerfile'), 'utf8'),
  };
}

function fails(mutator, pattern) {
  const value = structuredClone(fixture());
  mutator(value);
  assert.throws(() => validateIngestionContainer(value), pattern);
}

test('canonical ingestion container profile passes', () => {
  assert.deepEqual(validateIngestionContainer(fixture()), {
    schemaVersion: 'amic-vault.ingestion-container-report.v1',
    status: 'PASS',
    service: 'ingestion',
    user: '10001:10001',
    readOnly: true,
    capabilityCount: 0,
    pidsLimit: 96,
    cpus: '2.0',
    memory: '2g',
    tmpfsCount: 2,
    writableVolumeCount: 1,
    baseImage:
      'docker.io/library/python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de',
    accessLog: 'disabled',
  });
});

test('root writable privileged and capability drift fail', () => {
  fails(({ compose }) => {
    compose.services.ingestion.user = '0:0';
  }, /fixed user mismatch/u);
  fails(({ compose }) => {
    compose.services.ingestion.read_only = false;
  }, /read-only rootfs mismatch/u);
  fails(({ compose }) => {
    compose.services.ingestion.privileged = true;
  }, /worker uses prohibited privileged/u);
  fails(({ compose }) => {
    compose.services.ingestion.cap_add = ['NET_ADMIN'];
  }, /must not add capabilities/u);
});

test('unbounded PID CPU memory and scratch drift fail', () => {
  for (const [key, value, pattern] of [
    ['pids_limit', undefined, /PID limit mismatch/u],
    ['cpus', '8.0', /CPU limit mismatch/u],
    ['mem_limit', '8g', /memory limit mismatch/u],
    ['tmpfs', ['/tmp'], /tmpfs count mismatch/u],
  ]) {
    fails(({ compose }) => {
      if (value === undefined) delete compose.services.ingestion[key];
      else compose.services.ingestion[key] = value;
    }, pattern);
  }
});

test('host socket device path and extra writable mount fail', () => {
  fails(({ compose }) => {
    compose.services.ingestion.volumes.push('/var/run/docker.sock:/var/run/docker.sock');
  }, /writable volumes count mismatch/u);
  fails(({ compose }) => {
    compose.services.ingestion.devices = ['/dev/null:/dev/null'];
  }, /worker uses prohibited devices/u);
  fails(({ compose }) => {
    compose.services.ingestion.network_mode = 'host';
  }, /worker uses prohibited network_mode/u);
});

test('unpinned base non-root USER and replay ownership drift fail', () => {
  for (const [from, to, pattern] of [
    [
      'FROM docker.io/library/python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de',
      'FROM python:3.12-slim',
      /digest-pinned Python base mismatch/u,
    ],
    ['USER 10001:10001', 'USER root', /Dockerfile fixed USER missing/u],
    [
      'mkdir -p /var/lib/amic-vault/replay',
      'mkdir -p /tmp/replay',
      /replay directory ownership bootstrap missing/u,
    ],
  ]) {
    const value = fixture();
    value.dockerfile = value.dockerfile.replace(from, to);
    assert.throws(() => validateIngestionContainer(value), pattern);
  }
});

test('Uvicorn access-log drift fails', () => {
  const value = fixture();
  value.dockerfile = value.dockerfile.replace(', "--no-access-log"', '');

  assert.throws(() => validateIngestionContainer(value), /Uvicorn access log must be disabled/u);
});
