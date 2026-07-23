import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateIngestionNetwork } from './check-ingestion-network.mjs';

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function fixture() {
  return {
    compose: json('infra/production/compose.yml'),
    policy: json('infra/policies/ingestion-network-policy.yml'),
    nginx: readFileSync(resolve('infra/ingestion-gateway/nginx.conf'), 'utf8'),
    fixture: json('tests/fixtures/ingestion-gateway/identity-policy.json'),
    sourceMap: json('security/oss-source-map.yml'),
    developmentCompose: readFileSync(resolve('infra/docker-compose.dev.yml'), 'utf8'),
  };
}

function fails(mutator, pattern) {
  const value = structuredClone(fixture());
  mutator(value);
  assert.throws(() => validateIngestionNetwork(value), pattern);
}

test('canonical private gateway network and NGINX identity boundary passes', () => {
  assert.deepEqual(validateIngestionNetwork(fixture()), {
    schemaVersion: 'amic-vault.ingestion-network-report.v1',
    status: 'PASS',
    serviceCount: 4,
    internalNetworkCount: 3,
    publicGatewayOrWorkerPorts: 0,
    gatewayImage:
      'docker.io/library/nginx:1.30.4-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46',
  });
});

test('public gateway and worker ports fail', () => {
  fails(({ compose }) => {
    compose.services.ingestion.ports = ['8000:8000'];
  }, /ingestion must not publish ports/u);
  fails(({ compose }) => {
    compose.services['ingestion-gateway'].ports = ['8443:8443'];
  }, /ingestion-gateway must not publish ports/u);
});

test('any API-to-worker shared network path fails', () => {
  fails(({ compose }) => {
    compose.services.api.networks.push('ingestion-worker');
  }, /api networks count mismatch/u);
  fails(({ compose }) => {
    compose.services.ingestion.networks.push('ingestion-client');
  }, /ingestion networks count mismatch/u);
});

test('non-internal, host, extra-host, and link bypasses fail', () => {
  fails(({ compose }) => {
    compose.networks['ingestion-worker'].internal = false;
  }, /ingestion-worker must be internal/u);
  for (const [key, value] of [
    ['network_mode', 'host'],
    ['extra_hosts', ['ingestion:127.0.0.1']],
    ['links', ['ingestion']],
  ]) {
    fails(({ compose }) => {
      compose.services.api[key] = value;
    }, new RegExp(`api uses prohibited ${key}`, 'u'));
  }
});

test('unpinned gateway and weak TLS or identity mapping fail', () => {
  fails(({ compose }) => {
    compose.services['ingestion-gateway'].image = 'nginx:latest';
  }, /NGINX image digest mismatch/u);
  fails((value) => {
    value.nginx = value.nginx.replace('ssl_verify_client on;', 'ssl_verify_client optional;');
  }, /client certificate verification missing/u);
  fails((value) => {
    value.nginx = value.nginx.replace(
      'X-Amic-Gateway-Audience "amic-vault-ingestion"',
      'X-Amic-Gateway-Audience $http_x_amic_gateway_audience',
    );
  }, /fixed X-Amic-Gateway-Audience injection missing/u);
});

test('durable replay volume or production private profile removal fails', () => {
  fails(({ compose }) => {
    compose.services.ingestion.volumes = [];
  }, /worker durable replay volume mismatch/u);
  fails(({ compose }) => {
    compose.services.ingestion.environment.INGESTION_WORKER_IDENTITY_PROFILE = 'loopback-dev';
  }, /worker private identity profile missing/u);
});
