#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { stableStringify } from './build-backup-set-manifest.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const REFERENCE = /^bset-[A-Za-z0-9][A-Za-z0-9._-]{7,71}$/u;
const DRILL_ID = /^rollback-[A-Za-z0-9][A-Za-z0-9._-]{7,71}$/u;
const MAX_INPUT_BYTES = 1024 * 1024;
const FAILURE_INJECTIONS = Object.freeze([
  'BAD_MIGRATION',
  'BAD_IMAGE_HEALTH',
  'MISSING_KEY',
  'RESTORE_TIMEOUT',
  'OBJECT_MISMATCH',
  'ROLLBACK_INTERRUPTION',
]);
const FAILURE_STAGE = Object.freeze({
  BAD_MIGRATION: 'MIGRATION_APPLY',
  BAD_IMAGE_HEALTH: 'IMAGE_HEALTHCHECK',
  MISSING_KEY: 'SECRET_BIND',
  RESTORE_TIMEOUT: 'DATA_RESTORE',
  OBJECT_MISMATCH: 'OBJECT_VERIFY',
  ROLLBACK_INTERRUPTION: 'COMPENSATION_COMMIT',
});
const INPUT_KEYS = Object.freeze([
  'schemaVersion',
  'drillId',
  'failureInjection',
  'current',
  'previous',
  'observedRollback',
  'probes',
]);
const STATE_KEYS = Object.freeze([
  'schemaVersion',
  'releaseSequence',
  'imageDigest',
  'imageDataCompatibilityFingerprint',
  'migrationFingerprint',
  'dataAuthorityFingerprint',
  'backupSetReference',
  'secretGeneration',
  'objectInventoryHash',
]);
const OBSERVED_KEYS = Object.freeze([
  'status',
  'imageDigest',
  'migrationFingerprint',
  'dataAuthorityFingerprint',
  'backupSetReference',
  'secretGeneration',
  'objectInventoryHash',
]);
const PROBE_KEYS = Object.freeze([
  'permissionDenied',
  'ethicalWallDenied',
  'auditInserted',
  'auditImmutable',
  'originalHashPreserved',
  'originalVersionAdvanced',
  'gatewayDirectPortDenied',
  'gatewayReplayDenied',
  'cleanDocumentOperation',
]);

export class RollbackError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RollbackError';
    this.code = code;
  }
}

function fail(code) {
  throw new RollbackError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function exactKeys(value, expected, code) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  const actual = Object.keys(value);
  assert(
    actual.length === expected.length &&
      actual.every((key) => expected.includes(key)) &&
      expected.every((key) => actual.includes(key)),
    code,
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateState(state) {
  exactKeys(state, STATE_KEYS, 'ROLLBACK_STATE_SCHEMA_INVALID');
  assert(
    state.schemaVersion === 'amic-vault.sf20-release-state.v1' &&
      Number.isSafeInteger(state.releaseSequence) &&
      state.releaseSequence >= 1 &&
      DIGEST.test(state.imageDigest) &&
      HASH.test(state.imageDataCompatibilityFingerprint) &&
      HASH.test(state.migrationFingerprint) &&
      HASH.test(state.dataAuthorityFingerprint) &&
      REFERENCE.test(state.backupSetReference) &&
      Number.isSafeInteger(state.secretGeneration) &&
      state.secretGeneration >= 1 &&
      HASH.test(state.objectInventoryHash),
    'ROLLBACK_STATE_INVALID',
  );
  assert(
    state.imageDataCompatibilityFingerprint === state.migrationFingerprint,
    'ROLLBACK_STATE_INCOMPATIBLE',
  );
  return state;
}

function stateProjection(state) {
  return {
    imageDigest: state.imageDigest,
    migrationFingerprint: state.migrationFingerprint,
    dataAuthorityFingerprint: state.dataAuthorityFingerprint,
    backupSetReference: state.backupSetReference,
    secretGeneration: state.secretGeneration,
    objectInventoryHash: state.objectInventoryHash,
  };
}

function validateObservedShape(observed) {
  exactKeys(observed, OBSERVED_KEYS, 'ROLLBACK_OBSERVED_SCHEMA_INVALID');
  assert(
    ['COMPLETE', 'PARTIAL'].includes(observed.status) &&
      DIGEST.test(observed.imageDigest) &&
      HASH.test(observed.migrationFingerprint) &&
      HASH.test(observed.dataAuthorityFingerprint) &&
      REFERENCE.test(observed.backupSetReference) &&
      Number.isSafeInteger(observed.secretGeneration) &&
      observed.secretGeneration >= 1 &&
      HASH.test(observed.objectInventoryHash),
    'ROLLBACK_OBSERVED_INVALID',
  );
}

function validateObservedRollback(observed, expected) {
  validateObservedShape(observed);
  if (observed.status !== 'COMPLETE') fail('ROLLBACK_COMPENSATION_PARTIAL');
  if (observed.imageDigest !== expected.imageDigest) fail('ROLLBACK_IMAGE_MISMATCH');
  if (observed.migrationFingerprint !== expected.migrationFingerprint) {
    fail('ROLLBACK_MIGRATION_MISMATCH');
  }
  if (observed.dataAuthorityFingerprint !== expected.dataAuthorityFingerprint) {
    fail('ROLLBACK_DATA_AUTHORITY_MISMATCH');
  }
  if (observed.backupSetReference !== expected.backupSetReference) {
    fail('ROLLBACK_BACKUP_SET_MISMATCH');
  }
  if (observed.secretGeneration !== expected.secretGeneration) {
    fail('ROLLBACK_SECRET_GENERATION_MISMATCH');
  }
  if (observed.objectInventoryHash !== expected.objectInventoryHash) {
    fail('ROLLBACK_OBJECT_INVENTORY_MISMATCH');
  }
}

function validateProbeShape(probes) {
  exactKeys(probes, PROBE_KEYS, 'ROLLBACK_PROBES_SCHEMA_INVALID');
  assert(
    PROBE_KEYS.every((key) => typeof probes[key] === 'boolean'),
    'ROLLBACK_PROBES_INVALID',
  );
}

function validateProbes(probes) {
  validateProbeShape(probes);
  for (const key of PROBE_KEYS) {
    assert(
      probes[key] === true,
      `ROLLBACK_PROBE_${key.replaceAll(/([A-Z])/gu, '_$1').toUpperCase()}_FAILED`,
    );
  }
  return {
    permission: 'DENIED',
    ethicalWall: 'DENIED',
    auditInsert: 'VERIFIED',
    auditImmutable: 'VERIFIED',
    originalHash: 'PRESERVED',
    originalVersion: 'ADVANCED',
    gatewayDirectPort: 'DENIED',
    gatewayReplay: 'DENIED',
    cleanDocumentOperation: 'VERIFIED',
  };
}

export function runRollbackStateMachine({
  drillId,
  failureInjection,
  current,
  previous,
  interrupted = failureInjection === 'ROLLBACK_INTERRUPTION',
}) {
  assert(DRILL_ID.test(drillId), 'ROLLBACK_DRILL_ID_INVALID');
  assert(FAILURE_INJECTIONS.includes(failureInjection), 'ROLLBACK_FAILURE_INJECTION_INVALID');
  validateState(current);
  validateState(previous);
  assert(
    previous.releaseSequence === current.releaseSequence - 1 &&
      previous.imageDigest !== current.imageDigest &&
      previous.dataAuthorityFingerprint !== current.dataAuthorityFingerprint,
    'ROLLBACK_PREVIOUS_STATE_INVALID',
  );
  const selected = stateProjection(previous);
  const selectedPairHash = sha256(stableStringify(selected));
  const transitions = [
    {
      sequence: 1,
      state: 'FORWARD_FAILED',
      stage: FAILURE_STAGE[failureInjection],
    },
    {
      sequence: 2,
      state: 'PREVIOUS_PAIR_SELECTED',
      pairHash: selectedPairHash,
    },
    {
      sequence: 3,
      state: interrupted ? 'ROLLBACK_INCOMPLETE' : 'COMPENSATING',
    },
  ];
  if (!interrupted) {
    transitions.push({
      sequence: 4,
      state: 'PREVIOUS_PAIR_RESTORED',
      pairHash: selectedPairHash,
    });
  }
  return {
    selected,
    selectedPairHash,
    transitions,
    interrupted,
  };
}

export function runSmallFirmRollbackDrill(input) {
  exactKeys(input, INPUT_KEYS, 'ROLLBACK_INPUT_SCHEMA_INVALID');
  assert(
    input.schemaVersion === 'amic-vault.sf20-rollback-input.v1',
    'ROLLBACK_INPUT_SCHEMA_INVALID',
  );
  validateObservedShape(input.observedRollback);
  validateProbeShape(input.probes);
  const machine = runRollbackStateMachine(input);
  if (machine.interrupted) {
    assert(input.observedRollback.status === 'PARTIAL', 'ROLLBACK_INTERRUPTION_RECEIPT_INVALID');
    const result = {
      schemaVersion: 'amic-vault.sf20-rollback-result.v1',
      status: 'FAILED_CLOSED',
      technicalReady: false,
      deploymentReady: false,
      failureInjection: input.failureInjection,
      failureCode: 'ROLLBACK_INTERRUPTED',
      selectedPairHash: machine.selectedPairHash,
      transitions: machine.transitions,
      deploymentStatus: 'EXTERNAL_BLOCKED_APPROVED_STAGING_ROLLBACK_RECEIPT_REQUIRED',
    };
    return {
      ...result,
      resultHash: sha256(stableStringify(result)),
    };
  }

  validateObservedRollback(input.observedRollback, machine.selected);
  const probeVerdicts = validateProbes(input.probes);
  const transitions = [
    ...machine.transitions,
    {
      sequence: 5,
      state: 'POST_ROLLBACK_PROBES_VERIFIED',
    },
    {
      sequence: 6,
      state: 'TECHNICAL_PASS',
    },
  ];
  const result = {
    schemaVersion: 'amic-vault.sf20-rollback-result.v1',
    status: 'TECHNICAL_PASS',
    technicalReady: true,
    deploymentReady: false,
    failureInjection: input.failureInjection,
    forwardReadiness: 'FAILED_AS_INJECTED',
    selected: machine.selected,
    selectedPairHash: machine.selectedPairHash,
    transitions,
    probes: probeVerdicts,
    deploymentStatus: 'EXTERNAL_BLOCKED_APPROVED_STAGING_ROLLBACK_RECEIPT_REQUIRED',
    nonClaims: ['NO_EXTERNAL_MUTATION', 'NO_STAGING_ROLLBACK', 'NO_RELEASE_OR_GO_LIVE'],
  };
  return {
    ...result,
    resultHash: sha256(stableStringify(result)),
  };
}

function readBoundedJson(path) {
  assert(typeof path === 'string' && path && !path.includes('\0'), 'INPUT_FILE_INVALID');
  let descriptor;
  try {
    descriptor = openSync(
      resolve(path),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const metadata = fstatSync(descriptor);
    assert(
      metadata.isFile() && metadata.size >= 1 && metadata.size <= MAX_INPUT_BYTES,
      'INPUT_FILE_INVALID',
    );
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error instanceof RollbackError) throw error;
    fail('INPUT_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  assert(values.input, 'CLI_OPTION_REQUIRED');
  return values;
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  try {
    const options = parseCli(argv);
    if (options.help) {
      stdout.write('Usage: small-firm-rollback-drill.mjs --input FILE\n');
      return 0;
    }
    const result = runSmallFirmRollbackDrill(deps.input ?? readBoundedJson(options.input));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'TECHNICAL_PASS' ? 0 : 1;
  } catch (error) {
    stderr.write(
      `${JSON.stringify({
        status: 'FAILED',
        code: error instanceof RollbackError ? error.code : 'ROLLBACK_DRILL_FAILED',
      })}\n`,
    );
    return 1;
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) process.exitCode = main();
