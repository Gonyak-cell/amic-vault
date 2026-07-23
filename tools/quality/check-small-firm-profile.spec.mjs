import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  loadRuntimeManifestFiles,
  scanRuntimeExpansion,
  validateSmallFirmProfile,
} from './check-small-firm-profile.mjs';

const profile = JSON.parse(readFileSync('security/small-firm-20-profile.yml', 'utf8'));
const sourceMap = JSON.parse(readFileSync('security/oss-source-map.yml', 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function validate(changedProfile, runtimeFiles = []) {
  return validateSmallFirmProfile({
    profile: changedProfile,
    sourceMap,
    runtimeFiles,
  });
}

test('accepts the canonical 19-outcome, seven-PACK, 33-TUW profile', () => {
  const report = validate(profile, loadRuntimeManifestFiles({ profile }));
  assert.deepEqual(
    {
      status: report.status,
      outcomes: report.originalImmediateOutcomeCount,
      packs: report.packCount,
      tuws: report.testableTuwCount,
      sources: report.sourcePinsVerified,
      artifacts: report.pinnedArtifacts,
    },
    { status: 'PASS', outcomes: 19, packs: 7, tuws: 33, sources: 5, artifacts: 3 },
  );
});

test('rejects a missing constitutional or recovery invariant', () => {
  for (const invariant of [
    'permission-before-search',
    'audit-by-default',
    'immutable-original',
    'private-gateway-mtls',
    'restore-direct-readback',
  ]) {
    const changed = clone(profile);
    changed.mandatoryInvariants = changed.mandatoryInvariants.filter(
      (value) => value !== invariant,
    );
    assert.throws(() => validate(changed), new RegExp(`mandatory invariants missing ${invariant}`));
  }
});

test('rejects outcome, PACK, or TUW shrinkage and duplicate TUW IDs', () => {
  const missingOutcome = clone(profile);
  missingOutcome.originalImmediateOutcomes.pop();
  assert.throws(() => validate(missingOutcome), /original immediate outcomes count mismatch/);

  const missingPack = clone(profile);
  missingPack.executionPacks.pop();
  assert.throws(() => validate(missingPack), /exactly seven execution packs/);

  const duplicateTuw = clone(profile);
  duplicateTuw.executionPacks[1].tuws[0] = duplicateTuw.executionPacks[0].tuws[0];
  assert.throws(() => validate(duplicateTuw), /testable TUW IDs must be unique/);
});

test('rejects an unpinned or copy-authorized source', () => {
  const unpinned = clone(profile);
  unpinned.sourcePins[0].runtimeArtifact.digest = 'latest';
  assert.throws(() => validate(unpinned), /artifact digest invalid/);

  const copied = clone(profile);
  copied.sourcePins[0].copyPolicy = 'COPY';
  assert.throws(() => validate(copied), /copy policy must remain NO_COPY/);
});

test('rejects every conditional runtime component without an exact approval', () => {
  const samples = {
    kubernetes: 'apiVersion: apps/v1',
    redis: 'image: redis:7',
    kafka: 'image: kafka:4',
    opensearch: 'image: opensearch:3',
    wopi: 'protocol: WOPI',
    pgbouncer: 'image: pgbouncer:1',
    keycloak: 'image: keycloak:26',
    presidio: 'image: presidio-analyzer:2',
    jaeger: 'image: jaeger:2',
    'otel-collector': 'image: opentelemetry-collector:1',
    collabora: 'image: collabora/code:1',
    onlyoffice: 'image: onlyoffice/documentserver:1',
    tusd: 'image: tusd:2',
  };
  for (const component of profile.expansionPolicy.conditionalComponents) {
    assert.throws(
      () =>
        scanRuntimeExpansion({
          profile,
          runtimeFiles: [{ path: 'infra/production/compose.yml', text: samples[component.id] }],
        }),
      new RegExp(`"component":"${component.id}"`),
    );
  }
});

test('requires both trigger receipt and approval reference for a path-scoped expansion', () => {
  const approved = clone(profile);
  approved.expansionPolicy.approvedExpansions.push({
    component: 'redis',
    path: 'infra/production/compose.yml',
    triggerReceipt: 'TRIGGER-SF20-REDIS-001',
    approvalReference: 'DEC-SF20-REDIS-001',
  });
  assert.doesNotThrow(() =>
    scanRuntimeExpansion({
      profile: approved,
      runtimeFiles: [{ path: 'infra/production/compose.yml', text: 'image: redis:7' }],
    }),
  );

  approved.expansionPolicy.approvedExpansions[0].approvalReference = '';
  assert.throws(
    () =>
      scanRuntimeExpansion({
        profile: approved,
        runtimeFiles: [{ path: 'infra/production/compose.yml', text: 'image: redis:7' }],
      }),
    /approval reference missing/,
  );
});

test('rejects production publication of the ingestion worker port', () => {
  assert.throws(
    () =>
      scanRuntimeExpansion({
        profile,
        runtimeFiles: [
          {
            path: 'infra/production/compose.yml',
            text: 'services:\n  ingestion:\n    image: internal-worker@sha256:abc\n    ports:\n      - "8000:8000"\n  api:\n    image: internal-api@sha256:def\n',
          },
        ],
      }),
    /public-worker-port/,
  );
});
