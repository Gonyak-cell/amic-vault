#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_NGINX_IMAGE =
  'docker.io/library/nginx:1.30.4-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46';

function fail(message) {
  throw new Error(`ingestion network check failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function exactSet(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(actual.length === new Set(actual).size, `${label} contains duplicates`);
  assert(actual.length === expected.length, `${label} count mismatch`);
  for (const value of expected) assert(actual.includes(value), `${label} missing ${value}`);
}

function object(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} missing`);
  return value;
}

function noPublishedPort(service, name) {
  assert(!Object.hasOwn(service, 'ports'), `${name} must not publish ports`);
  assert(!Object.hasOwn(service, 'expose'), `${name} must not expose ports`);
}

function validateNginx(nginx, fixture, policy) {
  assert(/ssl_verify_client\s+on\s*;/u.test(nginx), 'client certificate verification missing');
  assert(/ssl_verify_depth\s+2\s*;/u.test(nginx), 'client verify depth mismatch');
  assert(
    /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3\s*;/u.test(nginx),
    'TLS protocol floor mismatch',
  );
  assert(
    nginx.includes('if ($ssl_client_s_dn != "CN=amic-vault-api")'),
    'exact client subject denial missing',
  );
  assert(
    /proxy_pass\s+http:\/\/ingestion_backend\s*;/u.test(nginx) &&
      /server\s+ingestion:8000\s*;/u.test(nginx),
    'fixed worker upstream missing',
  );
  for (const [header, value] of Object.entries(fixture.injectedHeaders)) {
    assert(
      nginx.includes(`proxy_set_header ${header} "${value}";`),
      `fixed ${header} injection missing`,
    );
  }
  for (const header of fixture.clearedHeaders) {
    assert(nginx.includes(`proxy_set_header ${header} "";`), `${header} clear missing`);
  }
  assert(/access_log\s+off\s*;/u.test(nginx), 'gateway access log must remain off');
  assert(!/ssl_verify_client\s+(?:optional|optional_no_ca|off)\s*;/u.test(nginx), 'weak client verification');
  assert(!/\$http_x_amic_gateway/iu.test(nginx), 'caller gateway identity header is trusted');
  assert(fixture.approvedClientSubject === policy.gateway.approvedClientSubject, 'subject fixture drift');
  exactSet(fixture.tlsProtocols, policy.gateway.tlsProtocols, 'TLS fixture');
}

export function validateIngestionNetwork({
  compose,
  policy,
  nginx,
  fixture,
  sourceMap,
  developmentCompose,
}) {
  assert(
    policy.schemaVersion === 'amic-vault.ingestion-network-policy.v1',
    'policy schema mismatch',
  );
  const services = object(compose.services, 'compose services');
  for (const [name, expected] of Object.entries(policy.services)) {
    const service = object(services[name], `service ${name}`);
    exactSet(service.networks, expected.networks, `${name} networks`);
    for (const key of policy.prohibitedServiceKeys) {
      assert(!Object.hasOwn(service, key), `${name} uses prohibited ${key}`);
    }
  }
  for (const name of policy.unpublishedServices) {
    noPublishedPort(object(services[name], `service ${name}`), name);
  }
  const networks = object(compose.networks, 'compose networks');
  for (const name of policy.internalNetworks) {
    assert(object(networks[name], `network ${name}`).internal === true, `${name} must be internal`);
  }

  const gateway = object(services['ingestion-gateway'], 'gateway service');
  const worker = object(services.ingestion, 'ingestion service');
  assert(gateway.image === EXPECTED_NGINX_IMAGE, 'NGINX image digest mismatch');
  assert(gateway.read_only === true, 'gateway root filesystem must be read-only');
  exactSet(gateway.cap_drop, ['ALL'], 'gateway dropped capabilities');
  assert(
    gateway.security_opt?.includes('no-new-privileges:true'),
    'gateway no-new-privileges missing',
  );
  assert(
    worker.environment?.INGESTION_NONCE_STORE_PATH === policy.durableReplay.databasePath,
    'worker durable replay path mismatch',
  );
  assert(
    worker.volumes?.includes(
      `${policy.durableReplay.volume}:${policy.durableReplay.containerPath}`,
    ),
    'worker durable replay volume mismatch',
  );
  assert(Object.hasOwn(compose.volumes ?? {}, policy.durableReplay.volume), 'replay volume missing');

  for (const name of ['api', 'api-worker']) {
    const service = services[name];
    assert(
      service.environment?.INGESTION_WORKER_URL === 'https://ingestion-gateway:8443',
      `${name} gateway URL mismatch`,
    );
    assert(
      service.environment?.INGESTION_WORKER_IDENTITY_PROFILE === 'private-gateway-mtls',
      `${name} private identity profile missing`,
    );
  }
  assert(
    worker.environment?.INGESTION_WORKER_IDENTITY_PROFILE === 'private-gateway-mtls',
    'worker private identity profile missing',
  );
  assert(
    worker.environment?.INGESTION_GATEWAY_DIRECT_WORKER_ACCESS === 'blocked',
    'worker direct access block missing',
  );

  const sourceNginx = sourceMap.components.find(({ id }) => id === 'nginx');
  assert(sourceNginx?.artifact?.reference === gateway.image, 'source-map NGINX artifact drift');
  validateNginx(nginx, fixture, policy);
  assert(
    /INGESTION_WORKER_IDENTITY_PROFILE:\s*loopback-dev/u.test(developmentCompose),
    'development loopback profile missing',
  );
  assert(
    /127\.0\.0\.1:\$\{INGESTION_WORKER_PORT:-8000\}:8000/u.test(developmentCompose),
    'development worker port is not loopback-only',
  );

  return {
    schemaVersion: 'amic-vault.ingestion-network-report.v1',
    status: 'PASS',
    serviceCount: Object.keys(policy.services).length,
    internalNetworkCount: policy.internalNetworks.length,
    publicGatewayOrWorkerPorts: 0,
    gatewayImage: gateway.image,
  };
}

function parseJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const report = validateIngestionNetwork({
      compose: parseJson('infra/production/compose.yml'),
      policy: parseJson('infra/policies/ingestion-network-policy.yml'),
      nginx: readFileSync(resolve('infra/ingestion-gateway/nginx.conf'), 'utf8'),
      fixture: parseJson('tests/fixtures/ingestion-gateway/identity-policy.json'),
      sourceMap: parseJson('security/oss-source-map.yml'),
      developmentCompose: readFileSync(resolve('infra/docker-compose.dev.yml'), 'utf8'),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
