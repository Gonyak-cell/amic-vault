import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { ProductionProfileError, validateProductionProfile } from './check-production-profile.mjs';

function json(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function fixture() {
  return {
    profile: json('infra/production/profile.yml'),
    decisions: json('security/oss-adoption-decisions.yml'),
  };
}

function fails(mutator, code) {
  const value = structuredClone(fixture());
  mutator(value);
  assert.throws(
    () => validateProductionProfile(value),
    (error) => error instanceof ProductionProfileError && error.code === code,
  );
}

test('canonical SF20 production profile passes without deployment claims', () => {
  assert.deepEqual(validateProductionProfile(fixture()), {
    schemaVersion: 'amic-vault.sf20-production-profile-report.v1',
    status: 'PASS',
    profileId: 'sf20-single-node-managed-state',
    maximumUsers: 20,
    applicationNodes: 1,
    country: 'KR',
    database: 'postgresql-16',
    managedStateServices: 2,
    externalBlockedReceiptCount: 8,
    pgBackRestDecision: 'REJECT_FOR_SF20_BASELINE',
    portableDatabaseBackup: 'pg_dump/pg_restore',
  });
});

test('capacity region and external receipt drift fail closed', () => {
  fails(({ profile }) => {
    profile.capacity.namedUsersMaximum = 21;
  }, 'CAPACITY_INVALID');
  fails(({ profile }) => {
    profile.residency.country = 'US';
  }, 'RESIDENCY_INVALID');
  fails(({ profile }) => {
    profile.externalReceipts[0].status = 'READY';
  }, 'EXTERNAL_RECEIPTS_INVALID');
  fails(({ profile }) => {
    profile.externalReceipts.pop();
  }, 'EXTERNAL_RECEIPTS_INVALID');
  fails(({ profile }) => {
    profile.externalReceipts[0].providerAccount = 'example';
  }, 'EXTERNAL_RECEIPTS_INVALID');
});

test('public state self-hosted database and weakened recovery fail closed', () => {
  fails(({ profile }) => {
    profile.database.selfHosted = true;
  }, 'DATABASE_PROFILE_INVALID');
  fails(({ profile }) => {
    profile.database.publicAccess = true;
  }, 'DATABASE_PROFILE_INVALID');
  fails(({ profile }) => {
    profile.objectStorage.publicAccess = true;
  }, 'OBJECT_STORAGE_PROFILE_INVALID');
  fails(({ profile }) => {
    profile.objectStorage.objectLock.required = false;
  }, 'OBJECT_STORAGE_PROFILE_INVALID');
  fails(({ profile }) => {
    profile.backupAndRecovery.maximumRpoMinutes = 61;
  }, 'RECOVERY_PROFILE_INVALID');
  fails(({ profile }) => {
    profile.prohibitedTopology.shift();
  }, 'PROHIBITED_TOPOLOGY_INVALID');
});

test('environment secrets provider values and unknown schema fields fail', () => {
  fails(({ profile }) => {
    profile.runtimeSecrets.valuesInEnvironment = true;
  }, 'SECRET_PROFILE_INVALID');
  fails(({ profile }) => {
    profile.databaseUrl = 'postgres://secret@example/db';
  }, 'PROFILE_SCHEMA_INVALID');
  fails(({ profile }) => {
    profile.profileId = 'sf20-single-node-managed-state';
    profile.externalReceipts[0].status =
      'EXTERNAL_BLOCKED_APPROVED_DOMESTIC_REGION_RECEIPT_REQUIRED';
    profile.runtimeSecrets.manifest = 'infra/production/secret-manifest.yml';
    profile.certificates.owner = 'platform-security';
    profile.capacity.availabilityModel = 'single-node-recoverable';
    profile.database.atRestEncryption = 'provider-managed-or-approved-customer-key';
    profile.objectStorage.atRestEncryption = 'provider-managed-or-approved-customer-key';
    profile.objectStorage.protocol = 's3-compatible';
    profile.database.portableBackup.tool = 'pgbackrest';
  }, 'DATABASE_PROFILE_INVALID');
});

test('Ansible no-copy and pgBackRest native-tooling decisions are mandatory', () => {
  fails(({ decisions }) => {
    decisions.decisions.find(({ id }) => id === 'ansible').approvedPaths.pop();
  }, 'ANSIBLE_PATHS_INVALID');
  fails(({ decisions }) => {
    decisions.decisions.find(({ id }) => id === 'ansible').reason = 'unpinned';
  }, 'ANSIBLE_PIN_MISSING');
  fails(({ decisions }) => {
    decisions.decisions.find(({ id }) => id === 'pgbackrest').status =
      'SOURCE_PINNED_RUNTIME_CONDITIONAL';
  }, 'PGBACKREST_DECISION_INVALID');
  fails(({ decisions }) => {
    decisions.decisions.find(({ id }) => id === 'pgbackrest').reason =
      'managed PITR without native tools';
  }, 'PGBACKREST_NATIVE_DECISION_MISSING');
});
