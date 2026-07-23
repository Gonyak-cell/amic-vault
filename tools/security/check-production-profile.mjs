#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXACT_TOP_LEVEL_KEYS = Object.freeze([
  'applicationNode',
  'backupAndRecovery',
  'capacity',
  'certificates',
  'database',
  'externalReceipts',
  'objectStorage',
  'profileId',
  'prohibitedTopology',
  'residency',
  'runtimeSecrets',
  'schemaVersion',
]);

const RECEIPT_IDS = Object.freeze([
  'domestic-region',
  'private-endpoints',
  'managed-database',
  'managed-object-storage',
  'encryption-and-key-ownership',
  'certificate-and-secret-ownership',
  'backup-set',
  'approved-host-and-staging',
]);

const PROHIBITED_TOPOLOGY = Object.freeze([
  'kubernetes',
  'service-mesh',
  'self-hosted-database',
  'public-database',
  'public-object-storage',
  'public-ingestion-worker',
  'provider-resource-creation',
  'multi-node-availability-claim',
]);

const EXTERNAL_BLOCKED = /^EXTERNAL_BLOCKED_[A-Z0-9_]+_REQUIRED$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;

export class ProductionProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionProfileError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionProfileError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function object(value, code, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code, `${label} missing`);
  return value;
}

function exactArray(actual, expected, code, label) {
  assert(Array.isArray(actual), code, `${label} must be an array`);
  assert(actual.length === expected.length, code, `${label} count mismatch`);
  assert(new Set(actual).size === actual.length, code, `${label} duplicates`);
  for (let index = 0; index < expected.length; index += 1) {
    assert(actual[index] === expected[index], code, `${label} mismatch`);
  }
}

function exactKeys(actual, expected, code, label) {
  exactArray(Object.keys(object(actual, code, label)).sort(), [...expected].sort(), code, label);
}

function decisionById(decisions, id) {
  const rows = decisions?.decisions;
  assert(Array.isArray(rows), 'OSS_DECISIONS_INVALID', 'OSS decisions missing');
  const matches = rows.filter((row) => row?.id === id);
  assert(matches.length === 1, 'OSS_DECISION_AMBIGUOUS', `${id} decision must be unique`);
  return matches[0];
}

function validateOssDecisions(decisions) {
  const ansible = decisionById(decisions, 'ansible');
  assert(ansible.decision === 'L1', 'ANSIBLE_DECISION_INVALID', 'Ansible must be L1');
  assert(
    ansible.status === 'APPROVED_FOR_PRODUCT_CHANGE',
    'ANSIBLE_DECISION_INVALID',
    'Ansible product change is not approved',
  );
  exactArray(
    ansible.approvedPaths,
    ['infra/ansible/playbooks/vault-host.yml', 'infra/ansible/roles/vault-host/tasks/main.yml'],
    'ANSIBLE_PATHS_INVALID',
    'Ansible approved paths',
  );
  assert(
    ansible.hardVeto?.some((value) => value.includes('GPL source and test code')),
    'ANSIBLE_NO_COPY_MISSING',
    'Ansible no-copy veto missing',
  );
  assert(
    ansible.reason?.includes('v2.21.2'),
    'ANSIBLE_PIN_MISSING',
    'Ansible exact release rationale missing',
  );

  const pgBackRest = decisionById(decisions, 'pgbackrest');
  assert(pgBackRest.decision === 'REJECTED', 'PGBACKREST_DECISION_INVALID', 'pgBackRest selected');
  assert(
    pgBackRest.status === 'REJECT_FOR_SF20_BASELINE',
    'PGBACKREST_DECISION_INVALID',
    'pgBackRest SF20 rejection missing',
  );
  for (const fragment of ['managed PITR', 'pg_dump', 'pg_restore']) {
    assert(
      pgBackRest.reason?.includes(fragment),
      'PGBACKREST_NATIVE_DECISION_MISSING',
      `pgBackRest decision missing ${fragment}`,
    );
  }
}

export function validateProductionProfile({ profile, decisions }) {
  exactKeys(profile, EXACT_TOP_LEVEL_KEYS, 'PROFILE_SCHEMA_INVALID', 'profile');
  assert(
    profile.schemaVersion === 'amic-vault.sf20-production-profile.v1',
    'PROFILE_SCHEMA_INVALID',
    'profile schema mismatch',
  );
  assert(
    profile.profileId === 'sf20-single-node-managed-state',
    'PROFILE_ID_INVALID',
    'profile ID mismatch',
  );

  const capacity = object(profile.capacity, 'CAPACITY_INVALID', 'capacity');
  assert(capacity.namedUsersMaximum === 20, 'CAPACITY_INVALID', 'maximum users must be 20');
  assert(capacity.applicationNodes === 1, 'CAPACITY_INVALID', 'application nodes must be one');
  assert(
    capacity.availabilityModel === 'single-node-recoverable',
    'CAPACITY_INVALID',
    'availability model must be recoverable single node',
  );

  const residency = object(profile.residency, 'RESIDENCY_INVALID', 'residency');
  assert(residency.country === 'KR', 'RESIDENCY_INVALID', 'country must be KR');
  assert(
    residency.regionSelection === 'operator-receipt-required',
    'RESIDENCY_INVALID',
    'region must remain an operator receipt',
  );
  assert(residency.crossRegionCopiesAllowed === false, 'RESIDENCY_INVALID', 'cross-region copy');
  exactArray(
    residency.coLocatedSurfaces,
    ['application', 'database', 'object-storage', 'backup', 'secret-and-key-service', 'telemetry'],
    'RESIDENCY_INVALID',
    'co-located surfaces',
  );

  const app = object(profile.applicationNode, 'APPLICATION_NODE_INVALID', 'application node');
  assert(app.operatingSystem === 'linux', 'APPLICATION_NODE_INVALID', 'OS must be Linux');
  assert(
    app.orchestrator === 'docker-compose-v2',
    'APPLICATION_NODE_INVALID',
    'orchestrator must be Compose v2',
  );
  exactArray(
    app.publicEntrypoints,
    ['web', 'api'],
    'PUBLIC_ENTRYPOINT_INVALID',
    'public entrypoints',
  );
  exactArray(
    app.privateOnlyServices,
    ['api-worker', 'ingestion-gateway', 'ingestion', 'clamav', 'prometheus', 'alertmanager'],
    'PRIVATE_SERVICE_INVALID',
    'private services',
  );
  assert(
    app.monitoringActivation === 'PACK-SF20-04',
    'MONITORING_SCOPE_INVALID',
    'monitoring belongs to SF20-04',
  );
  assert(
    app.approvedHostReceipt === 'EXTERNAL_BLOCKED_APPROVED_HOST_RECEIPT_REQUIRED',
    'HOST_RECEIPT_INVALID',
    'approved host receipt must remain blocked',
  );

  const database = object(profile.database, 'DATABASE_PROFILE_INVALID', 'database');
  assert(database.engine === 'postgresql', 'DATABASE_PROFILE_INVALID', 'database engine');
  assert(database.majorVersion === 16, 'DATABASE_PROFILE_INVALID', 'PostgreSQL major');
  assert(database.serviceModel === 'managed', 'DATABASE_PROFILE_INVALID', 'database service model');
  assert(database.selfHosted === false, 'DATABASE_PROFILE_INVALID', 'self-hosted database');
  assert(database.network === 'private-endpoint', 'DATABASE_PROFILE_INVALID', 'database network');
  assert(database.publicAccess === false, 'DATABASE_PROFILE_INVALID', 'public database access');
  assert(database.tls === 'required', 'DATABASE_PROFILE_INVALID', 'database TLS');
  assert(
    database.atRestEncryption === 'provider-managed-or-approved-customer-key',
    'DATABASE_PROFILE_INVALID',
    'database encryption',
  );
  assert(database.pitr?.required === true, 'DATABASE_PROFILE_INVALID', 'PITR required');
  assert(database.pitr?.maximumRpoMinutes === 60, 'DATABASE_PROFILE_INVALID', 'database RPO');
  assert(database.portableBackup?.tool === 'pg_dump', 'DATABASE_PROFILE_INVALID', 'backup tool');
  assert(database.portableBackup?.format === 'custom', 'DATABASE_PROFILE_INVALID', 'backup format');
  assert(
    database.portableBackup?.restoreTool === 'pg_restore',
    'DATABASE_PROFILE_INVALID',
    'restore tool',
  );

  const storage = object(profile.objectStorage, 'OBJECT_STORAGE_PROFILE_INVALID', 'object storage');
  assert(storage.protocol === 's3-compatible', 'OBJECT_STORAGE_PROFILE_INVALID', 'S3 protocol');
  assert(storage.serviceModel === 'managed', 'OBJECT_STORAGE_PROFILE_INVALID', 'storage service');
  assert(
    storage.network === 'private-endpoint',
    'OBJECT_STORAGE_PROFILE_INVALID',
    'storage network',
  );
  assert(storage.publicAccess === false, 'OBJECT_STORAGE_PROFILE_INVALID', 'public object storage');
  assert(storage.tls === 'required', 'OBJECT_STORAGE_PROFILE_INVALID', 'storage TLS');
  assert(
    storage.atRestEncryption === 'provider-managed-or-approved-customer-key',
    'OBJECT_STORAGE_PROFILE_INVALID',
    'storage encryption',
  );
  assert(storage.versioning === true, 'OBJECT_STORAGE_PROFILE_INVALID', 'versioning required');
  assert(
    storage.exactVersionRead === true,
    'OBJECT_STORAGE_PROFILE_INVALID',
    'exact-version reads required',
  );
  assert(storage.objectLock?.required === true, 'OBJECT_STORAGE_PROFILE_INVALID', 'Object Lock');
  exactArray(
    storage.objectLock?.allowedModes,
    ['governance', 'compliance'],
    'OBJECT_STORAGE_PROFILE_INVALID',
    'Object Lock modes',
  );

  const secrets = object(profile.runtimeSecrets, 'SECRET_PROFILE_INVALID', 'runtime secrets');
  assert(
    secrets.delivery === 'file-or-provider-mounted-file',
    'SECRET_PROFILE_INVALID',
    'secret delivery',
  );
  assert(secrets.mountRoot === '/run/secrets', 'SECRET_PROFILE_INVALID', 'secret mount root');
  assert(secrets.valuesInEnvironment === false, 'SECRET_PROFILE_INVALID', 'environment secrets');
  assert(secrets.valuesInCommandArguments === false, 'SECRET_PROFILE_INVALID', 'argument secrets');
  assert(secrets.valuesInImages === false, 'SECRET_PROFILE_INVALID', 'image secrets');
  assert(
    secrets.manifest === 'infra/production/secret-manifest.yml',
    'SECRET_PROFILE_INVALID',
    'secret manifest path',
  );

  const certificates = object(profile.certificates, 'CERTIFICATE_PROFILE_INVALID', 'certificates');
  assert(
    certificates.owner === 'platform-security',
    'CERTIFICATE_PROFILE_INVALID',
    'certificate owner',
  );
  assert(
    certificates.delivery === 'file-or-provider-mounted-file',
    'CERTIFICATE_PROFILE_INVALID',
    'certificate delivery',
  );
  assert(certificates.minimumTlsVersion === '1.2', 'CERTIFICATE_PROFILE_INVALID', 'minimum TLS');
  assert(
    certificates.rotationOverlapMinutes === 60,
    'CERTIFICATE_PROFILE_INVALID',
    'certificate overlap',
  );

  const recovery = object(
    profile.backupAndRecovery,
    'RECOVERY_PROFILE_INVALID',
    'backup and recovery',
  );
  for (const key of [
    'providerPitrRequired',
    'portableDatabaseBackupRequired',
    'objectVersionInventoryRequired',
    'isolatedRestoreRequired',
  ]) {
    assert(recovery[key] === true, 'RECOVERY_PROFILE_INVALID', `${key} must be true`);
  }
  assert(
    recovery.canonicalManifestSignature === 'ed25519',
    'RECOVERY_PROFILE_INVALID',
    'manifest signature',
  );
  assert(
    recovery.maximumBackupCaptureWindowMinutes === 60,
    'RECOVERY_PROFILE_INVALID',
    'capture window',
  );
  assert(recovery.maximumRpoMinutes === 60, 'RECOVERY_PROFILE_INVALID', 'RPO ceiling');
  assert(recovery.maximumRtoMinutes === 240, 'RECOVERY_PROFILE_INVALID', 'RTO ceiling');

  exactArray(
    profile.prohibitedTopology,
    PROHIBITED_TOPOLOGY,
    'PROHIBITED_TOPOLOGY_INVALID',
    'prohibited topology',
  );

  const receipts = profile.externalReceipts;
  assert(Array.isArray(receipts), 'EXTERNAL_RECEIPTS_INVALID', 'external receipts missing');
  exactArray(
    receipts.map(({ id }) => id),
    RECEIPT_IDS,
    'EXTERNAL_RECEIPTS_INVALID',
    'external receipt IDs',
  );
  for (const receipt of receipts) {
    exactKeys(
      receipt,
      ['id', 'requiredFor', 'status'],
      'EXTERNAL_RECEIPTS_INVALID',
      `external receipt ${receipt.id}`,
    );
    assert(SAFE_ID.test(receipt.id), 'EXTERNAL_RECEIPTS_INVALID', 'receipt ID invalid');
    assert(EXTERNAL_BLOCKED.test(receipt.status), 'EXTERNAL_RECEIPTS_INVALID', 'receipt status');
    assert(
      receipt.requiredFor === 'DEPLOYMENT_READY',
      'EXTERNAL_RECEIPTS_INVALID',
      'receipt boundary',
    );
  }

  validateOssDecisions(decisions);

  const serialized = JSON.stringify(profile);
  for (const forbidden of [
    /postgres(?:ql)?:\/\//iu,
    /(?:access|secret)[_-]?key/iu,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    /\b(?:aws|azure|gcp)[_-]?(?:account|project|subscription)\b/iu,
  ]) {
    assert(!forbidden.test(serialized), 'PROFILE_SECRET_OR_PROVIDER_VALUE', 'unsafe profile value');
  }

  return {
    schemaVersion: 'amic-vault.sf20-production-profile-report.v1',
    status: 'PASS',
    profileId: profile.profileId,
    maximumUsers: capacity.namedUsersMaximum,
    applicationNodes: capacity.applicationNodes,
    country: residency.country,
    database: `${database.engine}-${database.majorVersion}`,
    managedStateServices: 2,
    externalBlockedReceiptCount: receipts.length,
    pgBackRestDecision: 'REJECT_FOR_SF20_BASELINE',
    portableDatabaseBackup: `${database.portableBackup.tool}/${database.portableBackup.restoreTool}`,
  };
}

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const report = validateProductionProfile({
      profile: json('infra/production/profile.yml'),
      decisions: json('security/oss-adoption-decisions.yml'),
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    const code = error instanceof ProductionProfileError ? error.code : 'UNEXPECTED_FAILURE';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
