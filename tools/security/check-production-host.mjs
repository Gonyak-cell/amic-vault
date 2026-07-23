#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_SERVICES = Object.freeze([
  'web',
  'api',
  'api-worker',
  'ingestion-gateway',
  'ingestion',
  'clamav',
]);

const EXPECTED_NETWORKS = Object.freeze([
  'application',
  'ingestion-client',
  'ingestion-worker',
  'ingestion-egress',
]);

const EXPECTED_VOLUMES = Object.freeze(['ingestion-replay', 'clamav-signatures']);

const SYNTHETIC_IMAGE_INPUTS = Object.freeze({
  VAULT_WEB_IMAGE:
    'registry.invalid/amic-vault/web@sha256:1111111111111111111111111111111111111111111111111111111111111111',
  VAULT_API_IMAGE:
    'registry.invalid/amic-vault/api@sha256:2222222222222222222222222222222222222222222222222222222222222222',
  VAULT_INGESTION_IMAGE:
    'registry.invalid/amic-vault/ingestion@sha256:3333333333333333333333333333333333333333333333333333333333333333',
});

const IMMUTABLE_IMAGE =
  /^(?:[a-z0-9][a-z0-9.-]*(?::[0-9]{1,5})?\/)?[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?@sha256:[a-f0-9]{64}$/u;
const IMAGE_EXPRESSION = /^\$\{([A-Z][A-Z0-9_]*):\?[^}]{1,160}\}$/u;

export class ProductionHostError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionHostError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionHostError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function object(value, code, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code, `${label} missing`);
  return value;
}

function exactSet(actual, expected, code, label) {
  assert(Array.isArray(actual), code, `${label} must be an array`);
  assert(actual.length === new Set(actual).size, code, `${label} duplicates`);
  assert(actual.length === expected.length, code, `${label} count mismatch`);
  for (const value of expected) assert(actual.includes(value), code, `${label} missing ${value}`);
}

function deepMerge(base, overlay) {
  if (overlay === null) return undefined;
  if (
    !base ||
    !overlay ||
    typeof base !== 'object' ||
    typeof overlay !== 'object' ||
    Array.isArray(base) ||
    Array.isArray(overlay)
  ) {
    return structuredClone(overlay);
  }
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(overlay)) {
    const next = deepMerge(merged[key], value);
    if (next === undefined) delete merged[key];
    else merged[key] = next;
  }
  return merged;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function renderImage(value, images, serviceName) {
  assert(typeof value === 'string', 'IMAGE_REQUIRED', `${serviceName} image missing`);
  const match = value.match(IMAGE_EXPRESSION);
  const rendered = match ? images[match[1]] : value;
  assert(
    typeof rendered === 'string' && IMMUTABLE_IMAGE.test(rendered),
    'IMMUTABLE_IMAGE_REQUIRED',
    `${serviceName} image is not immutable`,
  );
  assert(!/(?:^|[:/])latest(?:@|$)/iu.test(rendered), 'IMMUTABLE_IMAGE_REQUIRED', 'latest image');
  return rendered;
}

function validateServiceSecurity(name, service) {
  assert(service.read_only === true, 'SERVICE_SECURITY_INVALID', `${name} root must be read-only`);
  exactSet(service.cap_drop, ['ALL'], 'SERVICE_SECURITY_INVALID', `${name} cap_drop`);
  assert(
    service.security_opt?.includes('no-new-privileges:true'),
    'SERVICE_SECURITY_INVALID',
    `${name} no-new-privileges missing`,
  );
  for (const [key, minimum] of [
    ['pids_limit', 1],
    ['cpus', 0.1],
    ['mem_limit', 1],
  ]) {
    const value = service[key];
    const valid =
      key === 'mem_limit'
        ? typeof value === 'string' && /^[1-9][0-9]*(?:m|g)$/u.test(value)
        : Number(value) >= minimum;
    assert(valid, 'SERVICE_RESOURCE_INVALID', `${name} ${key} missing`);
  }
  assert(service.restart === 'unless-stopped', 'SERVICE_RESTART_INVALID', `${name} restart policy`);
  const health = object(service.healthcheck, 'SERVICE_HEALTH_INVALID', `${name} healthcheck`);
  assert(
    Array.isArray(health.test) && health.test.length >= 2,
    'SERVICE_HEALTH_INVALID',
    `${name} health command`,
  );
  for (const key of ['interval', 'timeout', 'retries']) {
    assert(health[key] !== undefined, 'SERVICE_HEALTH_INVALID', `${name} health ${key}`);
  }
  for (const key of [
    'privileged',
    'network_mode',
    'pid',
    'ipc',
    'devices',
    'device_cgroup_rules',
  ]) {
    assert(!Object.hasOwn(service, key), 'SERVICE_SECURITY_INVALID', `${name} uses ${key}`);
  }
  for (const mount of service.volumes ?? []) {
    assert(
      !/docker\.sock|\/proc(?:[:/]|$)|\/sys(?:[:/]|$)|\/dev(?:[:/]|$)/u.test(mount),
      'SERVICE_SECURITY_INVALID',
      `${name} unsafe mount`,
    );
  }
  if (name !== 'ingestion-gateway') {
    assert(
      !Object.hasOwn(service, 'cap_add'),
      'SERVICE_SECURITY_INVALID',
      `${name} adds capability`,
    );
  }
}

function validatePorts(services) {
  const allowed = {
    web: ['127.0.0.1:${VAULT_WEB_LOOPBACK_PORT:-3000}:3000'],
    api: ['127.0.0.1:${VAULT_API_LOOPBACK_PORT:-3001}:3001'],
  };
  for (const [name, service] of Object.entries(services)) {
    if (Object.hasOwn(allowed, name)) {
      exactSet(service.ports, allowed[name], 'PUBLIC_PORT_INVALID', `${name} ports`);
    } else {
      assert(!Object.hasOwn(service, 'ports'), 'PUBLIC_PORT_INVALID', `${name} publishes a port`);
      assert(!Object.hasOwn(service, 'expose'), 'PUBLIC_PORT_INVALID', `${name} exposes a port`);
    }
  }
}

function dependency(service, name, dependencyName) {
  assert(
    service.depends_on?.[dependencyName]?.condition === 'service_healthy',
    'HEALTH_ORDER_INVALID',
    `${name} must wait for ${dependencyName}`,
  );
}

function validateAnsible(playbook, role) {
  assert(
    playbook.includes('vault_required_ansible_version: "2.21.2"') &&
      playbook.includes('ansible_version.full == vault_required_ansible_version'),
    'ANSIBLE_VERSION_INVALID',
    'exact Ansible version gate missing',
  );
  assert(
    playbook.includes("vault_approved_host_receipt is match('^HOST-") &&
      playbook.includes('fail_msg: APPROVED_HOST_RECEIPT_REQUIRED'),
    'ANSIBLE_HOST_BOUNDARY_INVALID',
    'approved-host receipt gate missing',
  );
  assert(playbook.includes('role: vault-host'), 'ANSIBLE_ROLE_INVALID', 'vault-host role missing');

  for (const path of [
    'infra/production/profile.yml',
    'infra/production/compose.yml',
    'infra/production/compose.images.yml',
    'infra/production/secret-manifest.yml',
    'infra/ingestion-gateway/nginx.conf',
  ]) {
    assert(role.includes(path), 'ANSIBLE_SOURCE_INVALID', `Ansible source missing ${path}`);
  }
  for (const value of [
    'vault_config_sha256',
    'vault_web_image',
    'vault_api_image',
    'vault_ingestion_image',
    "vault_secret_root == '/run/secrets'",
    'DATABASE_RUNTIME_URL_SECRET_FILE',
    'S3_API_ACCESS_KEY_ID_SECRET_FILE',
    'S3_API_SECRET_ACCESS_KEY_SECRET_FILE',
    'MFA_SECRET_ENCRYPTION_KEY_SECRET_FILE',
    'S3_INGESTION_ACCESS_KEY_ID_SECRET_FILE',
    'S3_INGESTION_SECRET_ACCESS_KEY_SECRET_FILE',
    'INGESTION_GATEWAY_SERVER_KEY_FILE',
    '--remove-orphans',
    '--wait',
  ]) {
    assert(role.includes(value), 'ANSIBLE_INPUT_INVALID', `Ansible input missing ${value}`);
  }
  const modules = [...`${playbook}\n${role}`.matchAll(/ansible\.builtin\.([a-z_]+)\s*:/gu)].map(
    (match) => match[1],
  );
  const allowedModules = new Set(['assert', 'file', 'copy', 'command']);
  assert(modules.length >= 8, 'ANSIBLE_MODULE_INVALID', 'Ansible task set incomplete');
  for (const moduleName of modules) {
    assert(
      allowedModules.has(moduleName),
      'ANSIBLE_MODULE_INVALID',
      `Ansible module ${moduleName} is not allowed`,
    );
  }
  for (const forbidden of [
    /ansible\.builtin\.(?:shell|raw|script|get_url|uri|package|apt|yum|pip|git)\s*:/u,
    /\b(?:curl|wget)\b/iu,
    /lookup\s*\(\s*['"]env/iu,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    /\b(?:password|secret|token)\s*:/iu,
    /(?:^|[:/])latest(?:\s|$)/imu,
  ]) {
    assert(
      !forbidden.test(`${playbook}\n${role}`),
      'ANSIBLE_FORBIDDEN_BEHAVIOR',
      'Ansible contains forbidden behavior',
    );
  }
  assert(
    (role.match(/no_log:\s*true/gu) ?? []).length === 3,
    'ANSIBLE_LOGGING_INVALID',
    'Compose commands must be no-log',
  );
}

export function validateProductionHost({
  baseCompose,
  imageOverlay,
  profile,
  playbook,
  role,
  images = SYNTHETIC_IMAGE_INPUTS,
}) {
  assert(
    profile?.schemaVersion === 'amic-vault.sf20-production-profile.v1' &&
      profile?.applicationNode?.orchestrator === 'docker-compose-v2',
    'PROFILE_CONTRACT_INVALID',
    'production profile mismatch',
  );
  const services = object(baseCompose.services, 'COMPOSE_INVALID', 'base services');
  exactSet(Object.keys(services), EXPECTED_SERVICES, 'SERVICE_GRAPH_INVALID', 'base services');
  const overlayServices = object(
    imageOverlay.services,
    'COMPOSE_INVALID',
    'image overlay services',
  );
  exactSet(
    Object.keys(overlayServices),
    EXPECTED_SERVICES,
    'SERVICE_GRAPH_INVALID',
    'overlay services',
  );

  const effective = deepMerge(baseCompose, imageOverlay);
  const effectiveServices = object(effective.services, 'COMPOSE_INVALID', 'effective services');
  for (const name of EXPECTED_SERVICES) {
    const service = object(
      effectiveServices[name],
      'SERVICE_GRAPH_INVALID',
      `effective service ${name}`,
    );
    assert(!Object.hasOwn(service, 'build'), 'BUILD_IN_HOST_MODEL', `${name} retains build`);
    service.image = renderImage(service.image, images, name);
    validateServiceSecurity(name, service);
  }
  assert(
    new Set(EXPECTED_SERVICES.map((name) => effectiveServices[name].image)).size === 5,
    'IMAGE_SET_INVALID',
    'API and API worker must share one of five exact images',
  );

  validatePorts(effectiveServices);
  dependency(effectiveServices.web, 'web', 'api');
  dependency(effectiveServices.api, 'api', 'ingestion-gateway');
  dependency(effectiveServices['api-worker'], 'api-worker', 'ingestion-gateway');
  dependency(effectiveServices['ingestion-gateway'], 'ingestion-gateway', 'ingestion');
  dependency(effectiveServices.ingestion, 'ingestion', 'clamav');

  const networks = object(effective.networks, 'NETWORK_GRAPH_INVALID', 'networks');
  exactSet(Object.keys(networks), EXPECTED_NETWORKS, 'NETWORK_GRAPH_INVALID', 'networks');
  for (const name of EXPECTED_NETWORKS) {
    assert(networks[name]?.internal === true, 'NETWORK_GRAPH_INVALID', `${name} is not internal`);
  }
  exactSet(
    Object.keys(object(effective.volumes, 'VOLUME_GRAPH_INVALID', 'volumes')),
    EXPECTED_VOLUMES,
    'VOLUME_GRAPH_INVALID',
    'volumes',
  );

  const expectedNetworks = {
    web: ['application'],
    api: ['application', 'ingestion-client'],
    'api-worker': ['application', 'ingestion-client'],
    'ingestion-gateway': ['ingestion-client', 'ingestion-worker'],
    ingestion: ['ingestion-worker', 'ingestion-egress'],
    clamav: ['ingestion-egress'],
  };
  for (const [name, expected] of Object.entries(expectedNetworks)) {
    exactSet(
      effectiveServices[name].networks,
      expected,
      'NETWORK_GRAPH_INVALID',
      `${name} networks`,
    );
  }

  validateAnsible(playbook, role);

  const canonical = stableStringify(effective);
  const configurationSha256 = createHash('sha256').update(canonical).digest('hex');
  return {
    schemaVersion: 'amic-vault.sf20-production-host-report.v1',
    status: 'PASS',
    serviceCount: EXPECTED_SERVICES.length,
    imageCount: new Set(EXPECTED_SERVICES.map((name) => effectiveServices[name].image)).size,
    internalNetworkCount: EXPECTED_NETWORKS.length,
    namedVolumeCount: EXPECTED_VOLUMES.length,
    publicLoopbackPortCount: 2,
    publicGatewayOrWorkerPortCount: 0,
    configurationSha256,
    externalHostStatus: 'EXTERNAL_BLOCKED_APPROVED_HOST_AND_IMAGE_RECEIPT_REQUIRED',
  };
}

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const report = validateProductionHost({
      baseCompose: json('infra/production/compose.yml'),
      imageOverlay: json('infra/production/compose.images.yml'),
      profile: json('infra/production/profile.yml'),
      playbook: readFileSync(resolve('infra/ansible/playbooks/vault-host.yml'), 'utf8'),
      role: readFileSync(resolve('infra/ansible/roles/vault-host/tasks/main.yml'), 'utf8'),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    const code = error instanceof ProductionHostError ? error.code : 'UNEXPECTED_FAILURE';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
