import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_SECRETS = {
  'database-runtime-url': {
    composeSecret: 'database_runtime_url',
    sourceFileVariable: 'DATABASE_RUNTIME_URL_SECRET_FILE',
  },
  'api-storage-access-key-id': {
    composeSecret: 's3_api_access_key_id',
    sourceFileVariable: 'S3_API_ACCESS_KEY_ID_SECRET_FILE',
  },
  'api-storage-secret-access-key': {
    composeSecret: 's3_api_secret_access_key',
    sourceFileVariable: 'S3_API_SECRET_ACCESS_KEY_SECRET_FILE',
  },
  'mfa-secret-encryption-key': {
    composeSecret: 'mfa_secret_encryption_key',
    sourceFileVariable: 'MFA_SECRET_ENCRYPTION_KEY_SECRET_FILE',
  },
  'ingestion-storage-access-key-id': {
    composeSecret: 's3_ingestion_access_key_id',
    sourceFileVariable: 'S3_INGESTION_ACCESS_KEY_ID_SECRET_FILE',
  },
  'ingestion-storage-secret-access-key': {
    composeSecret: 's3_ingestion_secret_access_key',
    sourceFileVariable: 'S3_INGESTION_SECRET_ACCESS_KEY_SECRET_FILE',
  },
  'ingestion-gateway-ca': {
    composeSecret: 'ingestion_gateway_ca',
    sourceFileVariable: 'INGESTION_GATEWAY_CA_FILE',
  },
  'ingestion-gateway-server-certificate': {
    composeSecret: 'ingestion_gateway_server_cert',
    sourceFileVariable: 'INGESTION_GATEWAY_SERVER_CERT_FILE',
  },
  'ingestion-gateway-server-key': {
    composeSecret: 'ingestion_gateway_server_key',
    sourceFileVariable: 'INGESTION_GATEWAY_SERVER_KEY_FILE',
  },
  'ingestion-api-client-certificate': {
    composeSecret: 'ingestion_api_client_cert',
    sourceFileVariable: 'INGESTION_GATEWAY_CLIENT_CERT_FILE',
  },
  'ingestion-api-client-key': {
    composeSecret: 'ingestion_api_client_key',
    sourceFileVariable: 'INGESTION_GATEWAY_CLIENT_KEY_FILE',
  },
};

const DIRECT_SECRET_ENVIRONMENT_KEYS = new Set([
  'APP_DATABASE_URL',
  'DATABASE_RUNTIME_URL',
  'DATABASE_URL',
  'MFA_SECRET_ENCRYPTION_KEY',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'INGESTION_STORAGE_ACCESS_KEY_ID',
  'INGESTION_STORAGE_SECRET_ACCESS_KEY',
]);

const ROTATION_RECEIPT_FIELDS = [
  'schemaVersion',
  'secretId',
  'currentReferenceId',
  'nextReferenceId',
  'overlapStartsAt',
  'overlapEndsAt',
  'currentVerified',
  'nextVerified',
  'revokedReferenceIds',
];

export class ProductionSecretsError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'ProductionSecretsError';
    this.code = code;
    this.detail = detail;
  }
}

function assert(condition, code, detail) {
  if (!condition) throw new ProductionSecretsError(code, detail);
}

function object(value, code, detail) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), code, detail);
  return value;
}

function exactSet(actual, expected, code, detail) {
  assert(
    actual.length === expected.length &&
      actual.every((value) => expected.includes(value)) &&
      expected.every((value) => actual.includes(value)),
    code,
    detail,
  );
}

function normalizedServiceSecrets(service) {
  return (service.secrets ?? []).map((entry) => {
    if (typeof entry === 'string') return { source: entry, target: entry };
    const value = object(entry, 'COMPOSE_SECRET_BINDING_INVALID', 'secret binding');
    return { source: value.source, target: value.target ?? value.source };
  });
}

function parseTimestamp(value, code) {
  assert(
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value),
    code,
    'timestamp must be canonical UTC',
  );
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds), code, 'timestamp is invalid');
  return milliseconds;
}

export function validateRotationReceipt({ manifest, receipt, now = new Date() }) {
  const contract = object(
    manifest.rotationReceiptContract,
    'ROTATION_CONTRACT_INVALID',
    'rotation receipt contract',
  );
  assert(
    contract.schemaVersion === 'amic-vault.sf20-secret-rotation-receipt.v1' &&
      contract.referenceIdsAreOpaque === true &&
      contract.valuesForbidden === true,
    'ROTATION_CONTRACT_INVALID',
    'closed rotation contract required',
  );
  exactSet(contract.slots ?? [], ['current', 'next'], 'ROTATION_CONTRACT_INVALID', 'slots');
  exactSet(
    contract.requiredFields ?? [],
    ROTATION_RECEIPT_FIELDS.filter((field) => field !== 'schemaVersion'),
    'ROTATION_CONTRACT_INVALID',
    'required fields',
  );
  exactSet(
    Object.keys(receipt),
    ROTATION_RECEIPT_FIELDS,
    'ROTATION_RECEIPT_INVALID',
    'receipt must be closed',
  );
  assert(
    receipt.schemaVersion === contract.schemaVersion,
    'ROTATION_RECEIPT_INVALID',
    'schema mismatch',
  );
  const secret = manifest.secrets.find((entry) => entry.id === receipt.secretId);
  assert(secret, 'ROTATION_SECRET_UNKNOWN', 'unknown secret id');
  const referencePattern = /^ref-[A-Za-z0-9][A-Za-z0-9._-]{7,119}$/u;
  assert(
    referencePattern.test(receipt.currentReferenceId) &&
      referencePattern.test(receipt.nextReferenceId) &&
      receipt.currentReferenceId !== receipt.nextReferenceId,
    'ROTATION_REFERENCE_INVALID',
    'current and next opaque references required',
  );
  assert(
    receipt.currentVerified === true && receipt.nextVerified === true,
    'ROTATION_PROOF_REQUIRED',
    'both slots must verify',
  );
  assert(
    Array.isArray(receipt.revokedReferenceIds) &&
      receipt.revokedReferenceIds.every((value) => referencePattern.test(value)),
    'ROTATION_REVOCATION_INVALID',
    'revocation list invalid',
  );
  assert(
    !receipt.revokedReferenceIds.includes(receipt.currentReferenceId) &&
      !receipt.revokedReferenceIds.includes(receipt.nextReferenceId),
    'ROTATION_REFERENCE_REVOKED',
    'active slot is revoked',
  );
  const startsAt = parseTimestamp(receipt.overlapStartsAt, 'ROTATION_WINDOW_INVALID');
  const endsAt = parseTimestamp(receipt.overlapEndsAt, 'ROTATION_WINDOW_INVALID');
  const nowMilliseconds = now instanceof Date ? now.getTime() : Number.NaN;
  assert(
    Number.isFinite(nowMilliseconds) &&
      startsAt < endsAt &&
      nowMilliseconds >= startsAt &&
      nowMilliseconds <= endsAt &&
      endsAt - startsAt <= secret.overlapMinutes * 60_000,
    'ROTATION_WINDOW_INVALID',
    'outside bounded overlap',
  );
  return {
    secretId: secret.id,
    current: receipt.currentReferenceId,
    next: receipt.nextReferenceId,
    overlapMinutes: (endsAt - startsAt) / 60_000,
  };
}

function validateManifest(manifest) {
  assert(
    manifest.schemaVersion === 'amic-vault.sf20-production-secrets.v1' &&
      manifest.mountRoot === '/run/secrets',
    'SECRET_MANIFEST_INVALID',
    'manifest identity or mount root',
  );
  assert(Array.isArray(manifest.secrets), 'SECRET_MANIFEST_INVALID', 'secrets missing');
  exactSet(
    manifest.secrets.map((secret) => secret.id),
    Object.keys(EXPECTED_SECRETS),
    'SECRET_SET_INVALID',
    'logical secret set',
  );
  const composeNames = new Set();
  const sourceVariables = new Set();
  let consumerBindingCount = 0;
  for (const secret of manifest.secrets) {
    const expected = EXPECTED_SECRETS[secret.id];
    assert(
      secret.composeSecret === expected.composeSecret &&
        secret.sourceFileVariable === expected.sourceFileVariable,
      'SECRET_IDENTITY_INVALID',
      secret.id,
    );
    assert(
      !composeNames.has(secret.composeSecret),
      'SECRET_IDENTITY_INVALID',
      'duplicate compose id',
    );
    assert(
      !sourceVariables.has(secret.sourceFileVariable),
      'SECRET_IDENTITY_INVALID',
      'duplicate source variable',
    );
    composeNames.add(secret.composeSecret);
    sourceVariables.add(secret.sourceFileVariable);
    assert(
      secret.containerPath === `${manifest.mountRoot}/${secret.composeSecret}` &&
        secret.providerReferenceClass === 'host-or-provider-mounted-file-path',
      'SECRET_PATH_INVALID',
      secret.id,
    );
    assert(
      ['confidential', 'public-certificate'].includes(secret.classification),
      'SECRET_CLASSIFICATION_INVALID',
      secret.id,
    );
    assert(
      secret.mode === (secret.classification === 'confidential' ? '0400' : '0444'),
      'SECRET_MODE_INVALID',
      secret.id,
    );
    assert(
      Number.isSafeInteger(secret.ownerUid) &&
        secret.ownerUid >= 0 &&
        /^[a-z][a-z0-9-]{2,63}$/u.test(secret.owner),
      'SECRET_OWNER_INVALID',
      secret.id,
    );
    assert(
      Number.isSafeInteger(secret.maximumBytes) &&
        secret.maximumBytes >= 1 &&
        secret.maximumBytes <= 65_536 &&
        Number.isSafeInteger(secret.rotationDays) &&
        secret.rotationDays >= 1 &&
        Number.isSafeInteger(secret.overlapMinutes) &&
        secret.overlapMinutes >= 1 &&
        secret.overlapMinutes <= 1_440 &&
        /^[a-z][a-z0-9-]{2,100}$/u.test(secret.revocationAction),
      'SECRET_LIFECYCLE_INVALID',
      secret.id,
    );
    assert(
      Array.isArray(secret.consumers) && secret.consumers.length > 0,
      'SECRET_CONSUMER_INVALID',
      secret.id,
    );
    const seenConsumers = new Set();
    for (const consumer of secret.consumers) {
      assert(
        ['api', 'api-worker', 'ingestion', 'ingestion-gateway'].includes(consumer.service) &&
          (consumer.runtimeFileVariable === null ||
            /^[A-Z][A-Z0-9_]+_FILE$/u.test(consumer.runtimeFileVariable)),
        'SECRET_CONSUMER_INVALID',
        secret.id,
      );
      assert(!seenConsumers.has(consumer.service), 'SECRET_CONSUMER_INVALID', 'duplicate consumer');
      seenConsumers.add(consumer.service);
      consumerBindingCount += 1;
    }
  }
  const sessionDesign = manifest.nonSecretDesigns?.find((entry) => entry.id === 'session-token');
  assert(
    sessionDesign?.design === 'server-generated-opaque-token-hash-in-database' &&
      /SHA-256 hash is stored/u.test(sessionDesign.reason) &&
      /No static cookie signing secret exists/u.test(sessionDesign.reason),
    'SESSION_SECRET_DESIGN_INVALID',
    'session token must not introduce a static key',
  );
  validateRotationReceipt({
    manifest,
    receipt: {
      schemaVersion: manifest.rotationReceiptContract?.schemaVersion,
      secretId: 'ingestion-api-client-key',
      currentReferenceId: 'ref-current-client-key',
      nextReferenceId: 'ref-next-client-key',
      overlapStartsAt: '2026-07-23T00:00:00Z',
      overlapEndsAt: '2026-07-23T01:00:00Z',
      currentVerified: true,
      nextVerified: true,
      revokedReferenceIds: [],
    },
    now: new Date('2026-07-23T00:30:00Z'),
  });
  return { composeNames, consumerBindingCount };
}

function validateCompose(manifest, baseCompose, imageOverlay) {
  const services = object(baseCompose.services, 'COMPOSE_INVALID', 'services');
  const composeSecrets = object(baseCompose.secrets, 'COMPOSE_INVALID', 'top-level secrets');
  exactSet(
    Object.keys(composeSecrets),
    manifest.secrets.map((secret) => secret.composeSecret),
    'COMPOSE_SECRET_SET_INVALID',
    'top-level secret set',
  );
  for (const secret of manifest.secrets) {
    const expectedFile = `\${${secret.sourceFileVariable}:?set ${secret.sourceFileVariable}}`;
    assert(
      composeSecrets[secret.composeSecret]?.file === expectedFile,
      'COMPOSE_SECRET_SOURCE_INVALID',
      secret.id,
    );
    for (const consumer of secret.consumers) {
      const service = object(
        services[consumer.service],
        'COMPOSE_SECRET_CONSUMER_INVALID',
        consumer.service,
      );
      const bindings = normalizedServiceSecrets(service);
      assert(
        bindings.some(
          (binding) =>
            binding.source === secret.composeSecret && binding.target === secret.composeSecret,
        ),
        'COMPOSE_SECRET_CONSUMER_INVALID',
        `${secret.id}:${consumer.service}`,
      );
      if (consumer.runtimeFileVariable !== null) {
        assert(
          service.environment?.[consumer.runtimeFileVariable] === secret.containerPath,
          'COMPOSE_RUNTIME_FILE_INVALID',
          `${secret.id}:${consumer.service}`,
        );
      }
    }
  }
  for (const serviceName of ['api', 'api-worker', 'ingestion']) {
    const environment = object(
      services[serviceName]?.environment,
      'COMPOSE_ENVIRONMENT_INVALID',
      serviceName,
    );
    for (const [key, value] of Object.entries(environment)) {
      assert(
        !DIRECT_SECRET_ENVIRONMENT_KEYS.has(key),
        'DIRECT_SECRET_ENVIRONMENT_FORBIDDEN',
        `${serviceName}:${key}`,
      );
      if (key.endsWith('_FILE')) {
        assert(
          typeof value === 'string' && value.startsWith('/run/secrets/'),
          'COMPOSE_RUNTIME_FILE_INVALID',
          `${serviceName}:${key}`,
        );
      }
      assert(
        !/-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?:\/\/[^@\s]+@/u.test(String(value)),
        'SECRET_VALUE_IN_COMPOSE',
        `${serviceName}:${key}`,
      );
    }
  }
  for (const service of Object.values(imageOverlay?.services ?? {})) {
    for (const key of Object.keys(service.environment ?? {})) {
      assert(
        !DIRECT_SECRET_ENVIRONMENT_KEYS.has(key),
        'DIRECT_SECRET_ENVIRONMENT_FORBIDDEN',
        `overlay:${key}`,
      );
    }
  }
}

function validateSources({ ansible, runtimeSources, dockerfiles }) {
  assert(
    ansible.includes('infra/production/secret-manifest.yml') &&
      ansible.includes("vault_secret_root == '/run/secrets'"),
    'ANSIBLE_SECRET_CONTRACT_INVALID',
    'secret manifest or mount root missing',
  );
  for (const expected of Object.values(EXPECTED_SECRETS)) {
    assert(
      ansible.includes(expected.sourceFileVariable),
      'ANSIBLE_SECRET_CONTRACT_INVALID',
      expected.sourceFileVariable,
    );
  }
  const forbiddenMaterial =
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?:\/\/[^@\s]+@|amic_vault_dev_password|vault_app_dev_password/u;
  assert(!forbiddenMaterial.test(ansible), 'SECRET_VALUE_IN_ANSIBLE', 'embedded material');

  const typescript = runtimeSources.typescript ?? '';
  assert(
    typescript.includes('constants.O_NOFOLLOW') &&
      typescript.includes('constants.O_NONBLOCK') &&
      typescript.includes('fstatSync') &&
      typescript.includes("productionSecretRoot = '/run/secrets'") &&
      typescript.includes('_DIRECT_ENV_FORBIDDEN'),
    'TYPESCRIPT_SECRET_READER_INVALID',
    'bounded TypeScript reader missing',
  );
  const python = runtimeSources.python ?? '';
  assert(
    python.includes('os.O_NOFOLLOW') &&
      python.includes('os.O_NONBLOCK') &&
      python.includes('os.fstat') &&
      python.includes('stat.S_ISREG') &&
      python.includes('PRODUCTION_SECRET_ROOT = Path("/run/secrets")') &&
      python.includes('DIRECT_ENV_FORBIDDEN'),
    'PYTHON_SECRET_READER_INVALID',
    'bounded Python reader missing',
  );
  const consumers = runtimeSources.consumers ?? '';
  for (const directRead of [
    'process.env.DATABASE_RUNTIME_URL',
    'process.env.S3_ACCESS_KEY_ID',
    'process.env.S3_SECRET_ACCESS_KEY',
    'process.env.MFA_SECRET_ENCRYPTION_KEY',
  ]) {
    assert(!consumers.includes(directRead), 'DIRECT_SECRET_SOURCE_READ', directRead);
  }
  assert(
    !/\benv\[['"]DATABASE_RUNTIME_URL['"]\]\s*=/u.test(consumers),
    'RESOLVED_SECRET_ENV_MUTATION',
    'database URL copied into environment',
  );
  for (const [path, source] of Object.entries(dockerfiles)) {
    assert(!forbiddenMaterial.test(source), 'SECRET_VALUE_IN_IMAGE_SOURCE', path);
    for (const key of DIRECT_SECRET_ENVIRONMENT_KEYS) {
      assert(
        !new RegExp(`^(?:ARG|ENV)\\s+${key}(?:[=\\s]|$)`, 'mu').test(source),
        'SECRET_IMAGE_DECLARATION_FORBIDDEN',
        `${path}:${key}`,
      );
    }
  }
}

function validateRuntimeSurfaces(runtimeSurfaces, secretCanaries) {
  for (const canary of secretCanaries) {
    assert(
      typeof canary === 'string' && canary.length >= 12,
      'SECRET_CANARY_INVALID',
      'canary must be synthetic and bounded',
    );
    for (const surface of runtimeSurfaces) {
      assert(
        !String(surface.content ?? '').includes(canary),
        'SECRET_CANARY_EXPOSED',
        surface.name ?? 'runtime surface',
      );
    }
  }
}

export function validateProductionSecrets({
  manifest,
  baseCompose,
  imageOverlay = {},
  ansible,
  runtimeSources,
  dockerfiles,
  runtimeSurfaces = [],
  secretCanaries = [],
}) {
  const { consumerBindingCount } = validateManifest(manifest);
  validateCompose(manifest, baseCompose, imageOverlay);
  validateSources({ ansible, runtimeSources, dockerfiles });
  validateRuntimeSurfaces(runtimeSurfaces, secretCanaries);
  const confidentialCount = manifest.secrets.filter(
    (secret) => secret.classification === 'confidential',
  ).length;
  return {
    schemaVersion: 'amic-vault.sf20-production-secrets-report.v1',
    status: 'PASS',
    secretCount: manifest.secrets.length,
    confidentialCount,
    publicCertificateCount: manifest.secrets.length - confidentialCount,
    consumerBindingCount,
    directEnvironmentValueCount: 0,
    secretCanaryOccurrenceCount: 0,
    rotationContractValidated: true,
    sessionStaticSecret: false,
    externalRuntimeStatus: 'EXTERNAL_BLOCKED_APPROVED_SECRET_PROVIDER_RECEIPT_REQUIRED',
  };
}

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function text(path) {
  return readFileSync(resolve(path), 'utf8');
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const report = validateProductionSecrets({
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
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
