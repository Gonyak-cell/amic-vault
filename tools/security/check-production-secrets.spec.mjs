import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ProductionSecretsError,
  validateProductionSecrets,
  validateRotationReceipt,
} from './check-production-secrets.mjs';

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function text(path) {
  return readFileSync(resolve(path), 'utf8');
}

function fixture() {
  return {
    manifest: json('infra/production/secret-manifest.yml'),
    baseCompose: json('infra/production/compose.yml'),
    imageOverlay: json('infra/production/compose.images.yml'),
    ansible: text('infra/ansible/roles/vault-host/tasks/main.yml'),
    runtimeSources: {
      typescript: text('apps/api/src/common/config/runtime-secret.ts'),
      python: text('workers/ingestion/app/runtime_secret.py'),
      consumers: [
        text('apps/api/src/common/db/database.module.ts'),
        text('apps/api/src/common/db/runtime-role.assertion.ts'),
        text('apps/api/src/common/queue/queue.registry.ts'),
        text('apps/api/src/modules/health/health.controller.ts'),
        text('apps/api/src/modules/storage/s3-storage.adapter.ts'),
        text('apps/api/src/modules/auth/mfa.service.ts'),
        text('apps/api/src/modules/document/extraction/private-gateway.transport.ts'),
        text('workers/ingestion/app/storage_client.py'),
      ].join('\n'),
    },
    dockerfiles: {
      'apps/api/Dockerfile': text('apps/api/Dockerfile'),
      'apps/web/Dockerfile': text('apps/web/Dockerfile'),
      'workers/ingestion/Dockerfile': text('workers/ingestion/Dockerfile'),
      'infra/clamav.Dockerfile': text('infra/clamav.Dockerfile'),
    },
  };
}

function fails(mutator, code) {
  const value = structuredClone(fixture());
  mutator(value);
  assert.throws(
    () => validateProductionSecrets(value),
    (error) => error instanceof ProductionSecretsError && error.code === code,
  );
}

function rotationReceipt(overrides = {}) {
  return {
    schemaVersion: 'amic-vault.sf20-secret-rotation-receipt.v1',
    secretId: 'ingestion-api-client-key',
    currentReferenceId: 'ref-current-client-key',
    nextReferenceId: 'ref-next-client-key',
    overlapStartsAt: '2026-07-23T00:00:00Z',
    overlapEndsAt: '2026-07-23T01:00:00Z',
    currentVerified: true,
    nextVerified: true,
    revokedReferenceIds: [],
    ...overrides,
  };
}

test('canonical production model has eleven file-only secrets and no static session key', () => {
  const first = validateProductionSecrets(fixture());
  const second = validateProductionSecrets(fixture());
  assert.deepEqual(first, second);
  assert.equal(first.status, 'PASS');
  assert.equal(first.secretCount, 11);
  assert.equal(first.confidentialCount, 8);
  assert.equal(first.publicCertificateCount, 3);
  assert.equal(first.consumerBindingCount, 19);
  assert.equal(first.directEnvironmentValueCount, 0);
  assert.equal(first.secretCanaryOccurrenceCount, 0);
  assert.equal(first.rotationContractValidated, true);
  assert.equal(first.sessionStaticSecret, false);
});

test('logical set paths provider class modes and lifecycle metadata are closed', () => {
  fails(({ manifest }) => {
    manifest.secrets.pop();
  }, 'SECRET_SET_INVALID');
  fails(({ manifest }) => {
    manifest.secrets[0].containerPath = '/tmp/database';
  }, 'SECRET_PATH_INVALID');
  fails(({ manifest }) => {
    manifest.secrets[0].providerReferenceClass = 'inline-value';
  }, 'SECRET_PATH_INVALID');
  fails(({ manifest }) => {
    manifest.secrets[0].mode = '0444';
  }, 'SECRET_MODE_INVALID');
  fails(({ manifest }) => {
    manifest.secrets[0].rotationDays = 0;
  }, 'SECRET_LIFECYCLE_INVALID');
  fails(({ manifest }) => {
    manifest.secrets[0].maximumBytes = 70_000;
  }, 'SECRET_LIFECYCLE_INVALID');
});

test('Compose source references consumer mounts and runtime file paths are exact', () => {
  fails(({ baseCompose }) => {
    baseCompose.secrets.database_runtime_url.file = '/tmp/database-url';
  }, 'COMPOSE_SECRET_SOURCE_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.api.secrets = baseCompose.services.api.secrets.filter(
      (value) => value !== 'database_runtime_url',
    );
  }, 'COMPOSE_SECRET_CONSUMER_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.api.environment.DATABASE_RUNTIME_URL_FILE = '/tmp/database-url';
  }, 'COMPOSE_RUNTIME_FILE_INVALID');
  fails(({ baseCompose }) => {
    baseCompose.services.ingestion.environment.INGESTION_STORAGE_ACCESS_KEY_ID =
      'synthetic-direct-value';
  }, 'DIRECT_SECRET_ENVIRONMENT_FORBIDDEN');
  fails(({ baseCompose }) => {
    baseCompose.services.api.environment.DATABASE_URL =
      'postgres://vault_app:synthetic@database.invalid/vault';
  }, 'DIRECT_SECRET_ENVIRONMENT_FORBIDDEN');
});

test('runtime readers Ansible and image sources retain bounded file-only primitives', () => {
  fails(({ runtimeSources }) => {
    runtimeSources.typescript = runtimeSources.typescript.replace(
      'constants.O_NOFOLLOW',
      'constants.O_RDONLY',
    );
  }, 'TYPESCRIPT_SECRET_READER_INVALID');
  fails(({ runtimeSources }) => {
    runtimeSources.python = runtimeSources.python.replace('os.O_NOFOLLOW', 'os.O_RDONLY');
  }, 'PYTHON_SECRET_READER_INVALID');
  fails((value) => {
    value.ansible = value.ansible.replace(
      'infra/production/secret-manifest.yml',
      'infra/production/missing-manifest.yml',
    );
  }, 'ANSIBLE_SECRET_CONTRACT_INVALID');
  fails(({ dockerfiles }) => {
    dockerfiles['apps/api/Dockerfile'] += '\nENV DATABASE_RUNTIME_URL=synthetic\n';
  }, 'SECRET_IMAGE_DECLARATION_FORBIDDEN');
});

test('resolved values cannot be copied into process environment', () => {
  fails(({ runtimeSources }) => {
    runtimeSources.consumers += "\nenv['DATABASE_RUNTIME_URL'] = resolved;\n";
  }, 'RESOLVED_SECRET_ENV_MUTATION');
  fails(({ runtimeSources }) => {
    runtimeSources.consumers += '\nprocess.env.MFA_SECRET_ENCRYPTION_KEY;\n';
  }, 'DIRECT_SECRET_SOURCE_READ');
});

test('synthetic canaries are absent from image history process logs errors and evidence', () => {
  const canary = 'SF20_SYNTHETIC_SECRET_CANARY_9917';
  const value = fixture();
  value.secretCanaries = [canary];
  value.runtimeSurfaces = [
    { name: 'image-history', content: 'COPY /app' },
    { name: 'process-arguments', content: 'node dist/main.js' },
    { name: 'stdout', content: 'startup complete' },
    { name: 'stderr', content: 'PERMISSION_DENIED' },
    { name: 'evidence', content: '{"status":"PASS"}' },
  ];
  assert.equal(validateProductionSecrets(value).secretCanaryOccurrenceCount, 0);
  value.runtimeSurfaces[3].content = `failure ${canary}`;
  assert.throws(
    () => validateProductionSecrets(value),
    (error) => error instanceof ProductionSecretsError && error.code === 'SECRET_CANARY_EXPOSED',
  );
});

test('current and next opaque references verify only inside the bounded overlap', () => {
  const manifest = fixture().manifest;
  const result = validateRotationReceipt({
    manifest,
    receipt: rotationReceipt(),
    now: new Date('2026-07-23T00:30:00Z'),
  });
  assert.equal(result.secretId, 'ingestion-api-client-key');
  assert.equal(result.overlapMinutes, 60);

  for (const [overrides, code, now] of [
    [{ nextReferenceId: '' }, 'ROTATION_REFERENCE_INVALID', '2026-07-23T00:30:00Z'],
    [{ nextVerified: false }, 'ROTATION_PROOF_REQUIRED', '2026-07-23T00:30:00Z'],
    [
      { revokedReferenceIds: ['ref-current-client-key'] },
      'ROTATION_REFERENCE_REVOKED',
      '2026-07-23T00:30:00Z',
    ],
    [{}, 'ROTATION_WINDOW_INVALID', '2026-07-23T02:00:00Z'],
    [{ overlapEndsAt: '2026-07-23T02:00:00Z' }, 'ROTATION_WINDOW_INVALID', '2026-07-23T00:30:00Z'],
  ]) {
    assert.throws(
      () =>
        validateRotationReceipt({
          manifest,
          receipt: rotationReceipt(overrides),
          now: new Date(now),
        }),
      (error) => error instanceof ProductionSecretsError && error.code === code,
    );
  }
});

test('rotation receipts reject unknown old-only revoked or value-bearing material', () => {
  const manifest = fixture().manifest;
  assert.throws(
    () =>
      validateRotationReceipt({
        manifest,
        receipt: rotationReceipt({ secretId: 'unknown-secret' }),
        now: new Date('2026-07-23T00:30:00Z'),
      }),
    (error) => error instanceof ProductionSecretsError && error.code === 'ROTATION_SECRET_UNKNOWN',
  );
  const valueBearing = { ...rotationReceipt(), value: 'synthetic-secret-value' };
  assert.throws(
    () =>
      validateRotationReceipt({
        manifest,
        receipt: valueBearing,
        now: new Date('2026-07-23T00:30:00Z'),
      }),
    (error) => error instanceof ProductionSecretsError && error.code === 'ROTATION_RECEIPT_INVALID',
  );
});
