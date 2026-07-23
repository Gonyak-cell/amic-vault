import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ProductionHostError, validateProductionHost } from './check-production-host.mjs';

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function fixture() {
  return {
    baseCompose: json('infra/production/compose.yml'),
    imageOverlay: json('infra/production/compose.images.yml'),
    profile: json('infra/production/profile.yml'),
    playbook: readFileSync(resolve('infra/ansible/playbooks/vault-host.yml'), 'utf8'),
    role: readFileSync(resolve('infra/ansible/roles/vault-host/tasks/main.yml'), 'utf8'),
  };
}

function fails(mutator, code) {
  const value = structuredClone(fixture());
  mutator(value);
  assert.throws(
    () => validateProductionHost(value),
    (error) => error instanceof ProductionHostError && error.code === code,
  );
}

test('canonical base plus image overlay produces one deterministic host model', () => {
  const first = validateProductionHost(fixture());
  const second = validateProductionHost(fixture());
  assert.deepEqual(first, second);
  assert.equal(first.status, 'PASS');
  assert.equal(first.serviceCount, 6);
  assert.equal(first.imageCount, 5);
  assert.equal(first.internalNetworkCount, 4);
  assert.equal(first.publicLoopbackPortCount, 2);
  assert.equal(first.publicGatewayOrWorkerPortCount, 0);
  assert.match(first.configurationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    first.externalHostStatus,
    'EXTERNAL_BLOCKED_APPROVED_HOST_AND_IMAGE_RECEIPT_REQUIRED',
  );
});

test('floating missing or build-capable effective images fail', () => {
  fails(({ imageOverlay }) => {
    imageOverlay.services.web.image = 'registry.invalid/amic-vault/web:latest';
  }, 'IMMUTABLE_IMAGE_REQUIRED');
  fails(({ imageOverlay }) => {
    delete imageOverlay.services.api.image;
  }, 'IMAGE_REQUIRED');
  fails(({ imageOverlay }) => {
    imageOverlay.services.ingestion.build = {
      context: '../..',
      dockerfile: 'workers/ingestion/Dockerfile',
    };
  }, 'BUILD_IN_HOST_MODEL');
});

test('extra service network port and mutable host boundary fail', () => {
  fails(({ baseCompose }) => {
    baseCompose.services.debug = { image: 'example.invalid/debug@sha256:'.padEnd(93, '1') };
  }, 'SERVICE_GRAPH_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.ingestion.ports = ['8000:8000'];
  }, 'PUBLIC_PORT_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.networks['ingestion-worker'].internal = false;
  }, 'NETWORK_GRAPH_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.api.ports = ['0.0.0.0:3001:3001'];
  }, 'PUBLIC_PORT_INVALID');
});

test('privileged writable unbounded or unhealthy services fail', () => {
  fails(({ baseCompose }) => {
    baseCompose.services.web.read_only = false;
  }, 'SERVICE_SECURITY_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.api.privileged = true;
  }, 'SERVICE_SECURITY_INVALID');
  fails(({ baseCompose }) => {
    delete baseCompose.services['api-worker'].pids_limit;
  }, 'SERVICE_RESOURCE_INVALID');
  fails(({ baseCompose }) => {
    delete baseCompose.services.clamav.healthcheck;
  }, 'SERVICE_HEALTH_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services['ingestion-gateway'].restart = 'no';
  }, 'SERVICE_RESTART_INVALID');
});

test('health ordering and fixed network membership are mandatory', () => {
  fails(({ baseCompose }) => {
    delete baseCompose.services.web.depends_on;
  }, 'HEALTH_ORDER_INVALID');
  fails(({ imageOverlay }) => {
    delete imageOverlay.services.ingestion.depends_on;
  }, 'HEALTH_ORDER_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.api.networks.push('ingestion-worker');
  }, 'NETWORK_GRAPH_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.clamav.networks = ['application'];
  }, 'NETWORK_GRAPH_INVALID');
});

test('Ansible must remain exact-version bounded built-in and no-log', () => {
  fails((value) => {
    value.playbook = value.playbook.replace('"2.21.2"', '"2.21.3"');
  }, 'ANSIBLE_VERSION_INVALID');
  fails((value) => {
    value.role = value.role.replace('ansible.builtin.command:', 'ansible.builtin.shell:');
  }, 'ANSIBLE_MODULE_INVALID');
  fails((value) => {
    value.role = value.role.replace('no_log: true', 'no_log: false');
  }, 'ANSIBLE_LOGGING_INVALID');
  fails((value) => {
    value.role += '\n- name: bootstrap\n  ansible.builtin.command: curl https://example.invalid\n';
  }, 'ANSIBLE_FORBIDDEN_BEHAVIOR');
});

test('a changed immutable image changes the canonical configuration hash', () => {
  const first = validateProductionHost(fixture());
  const changed = fixture();
  changed.images = {
    VAULT_WEB_IMAGE:
      'registry.invalid/amic-vault/web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    VAULT_API_IMAGE:
      'registry.invalid/amic-vault/api@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    VAULT_INGESTION_IMAGE:
      'registry.invalid/amic-vault/ingestion@sha256:3333333333333333333333333333333333333333333333333333333333333333',
  };
  const second = validateProductionHost(changed);
  assert.notEqual(first.configurationSha256, second.configurationSha256);
});
