import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  RollbackError,
  main,
  runRollbackStateMachine,
  runSmallFirmRollbackDrill,
} from './small-firm-rollback-drill.mjs';

const successfulInjections = Object.freeze([
  'BAD_MIGRATION',
  'BAD_IMAGE_HEALTH',
  'MISSING_KEY',
  'RESTORE_TIMEOUT',
  'OBJECT_MISMATCH',
]);
const probeKeys = Object.freeze([
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

describe('SF20 rollback state machine', () => {
  it('fails forward and restores only the exact previous compatible pair', async (t) => {
    for (const failureInjection of successfulInjections) {
      await t.test(failureInjection, () => {
        const input = canonicalInput(failureInjection);
        const first = runSmallFirmRollbackDrill(input);
        const second = runSmallFirmRollbackDrill(structuredClone(input));

        assert.equal(first.status, 'TECHNICAL_PASS');
        assert.equal(first.technicalReady, true);
        assert.equal(first.deploymentReady, false);
        assert.equal(first.forwardReadiness, 'FAILED_AS_INJECTED');
        assert.deepEqual(first.selected, projection(input.previous));
        assert.equal(first.resultHash, second.resultHash);
        assert.equal(first.transitions.at(-1).state, 'TECHNICAL_PASS');
        assert.equal(
          first.deploymentStatus,
          'EXTERNAL_BLOCKED_APPROVED_STAGING_ROLLBACK_RECEIPT_REQUIRED',
        );
        assert.equal(JSON.stringify(first).includes(input.current.imageDigest), false);
        assert.equal(JSON.stringify(first).includes('DEPLOYMENT_READY'), false);
      });
    }
  });

  it('keeps an interrupted compensation failed closed and never runs success probes', () => {
    const input = canonicalInput('ROLLBACK_INTERRUPTION');
    input.observedRollback.status = 'PARTIAL';
    const first = runSmallFirmRollbackDrill(input);
    const second = runSmallFirmRollbackDrill(structuredClone(input));

    assert.equal(first.status, 'FAILED_CLOSED');
    assert.equal(first.technicalReady, false);
    assert.equal(first.deploymentReady, false);
    assert.equal(first.failureCode, 'ROLLBACK_INTERRUPTED');
    assert.equal(first.transitions.at(-1).state, 'ROLLBACK_INCOMPLETE');
    assert.equal('probes' in first, false);
    assert.equal(first.resultHash, second.resultHash);
  });

  it('selects the previous pair before compensation without accepting a caller selection', () => {
    const input = canonicalInput('BAD_MIGRATION');
    const machine = runRollbackStateMachine(input);
    assert.deepEqual(machine.selected, projection(input.previous));
    assert.notDeepEqual(machine.selected, projection(input.current));
    assert.match(machine.selectedPairHash, /^[a-f0-9]{64}$/u);
  });

  it('rejects incompatible, latest, partial, old-key, and mismatched rollback receipts', async (t) => {
    const cases = [
      {
        name: 'previous image and data incompatible',
        mutate: (input) => {
          input.previous.imageDataCompatibilityFingerprint = sha256('wrong-schema');
        },
        code: 'ROLLBACK_STATE_INCOMPATIBLE',
      },
      {
        name: 'release sequence gap',
        mutate: (input) => {
          input.previous.releaseSequence -= 1;
        },
        code: 'ROLLBACK_PREVIOUS_STATE_INVALID',
      },
      {
        name: 'latest/current image selected',
        mutate: (input) => {
          input.observedRollback.imageDigest = input.current.imageDigest;
        },
        code: 'ROLLBACK_IMAGE_MISMATCH',
      },
      {
        name: 'incompatible migration selected',
        mutate: (input) => {
          input.observedRollback.migrationFingerprint = input.current.migrationFingerprint;
        },
        code: 'ROLLBACK_MIGRATION_MISMATCH',
      },
      {
        name: 'partial data authority selected',
        mutate: (input) => {
          input.observedRollback.dataAuthorityFingerprint = input.current.dataAuthorityFingerprint;
        },
        code: 'ROLLBACK_DATA_AUTHORITY_MISMATCH',
      },
      {
        name: 'wrong backup set selected',
        mutate: (input) => {
          input.observedRollback.backupSetReference = 'bset-unrelated-proof-0001';
        },
        code: 'ROLLBACK_BACKUP_SET_MISMATCH',
      },
      {
        name: 'old key fallback',
        mutate: (input) => {
          input.observedRollback.secretGeneration -= 1;
        },
        code: 'ROLLBACK_SECRET_GENERATION_MISMATCH',
      },
      {
        name: 'object inventory mismatch',
        mutate: (input) => {
          input.observedRollback.objectInventoryHash = sha256('wrong-inventory');
        },
        code: 'ROLLBACK_OBJECT_INVENTORY_MISMATCH',
      },
      {
        name: 'partial compensation',
        mutate: (input) => {
          input.observedRollback.status = 'PARTIAL';
        },
        code: 'ROLLBACK_COMPENSATION_PARTIAL',
      },
      {
        name: 'floating image value',
        mutate: (input) => {
          input.previous.imageDigest = 'vault-api:latest';
        },
        code: 'ROLLBACK_STATE_INVALID',
      },
    ];

    for (const testCase of cases) {
      await t.test(testCase.name, () => {
        const input = canonicalInput('BAD_MIGRATION');
        testCase.mutate(input);
        assert.throws(
          () => runSmallFirmRollbackDrill(input),
          (error) => error instanceof RollbackError && error.code === testCase.code,
        );
      });
    }
  });

  it('requires every permission, wall, audit, original, gateway, and clean probe', async (t) => {
    for (const key of probeKeys) {
      await t.test(key, () => {
        const input = canonicalInput('BAD_IMAGE_HEALTH');
        input.probes[key] = false;
        assert.throws(
          () => runSmallFirmRollbackDrill(input),
          (error) => error instanceof RollbackError && error.code === probeFailureCode(key),
        );
      });
    }

    const missing = canonicalInput('BAD_IMAGE_HEALTH');
    delete missing.probes.cleanDocumentOperation;
    assert.throws(
      () => runSmallFirmRollbackDrill(missing),
      (error) => error instanceof RollbackError && error.code === 'ROLLBACK_PROBES_SCHEMA_INVALID',
    );
  });

  it('returns a nonzero bounded CLI result for interruption and hides input details', () => {
    const input = canonicalInput('ROLLBACK_INTERRUPTION');
    input.observedRollback.status = 'PARTIAL';
    let stdout = '';
    let stderr = '';
    const exitCode = main(['--input', '/private/provider-account.json'], {
      input,
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: (value) => (stderr += value) },
    });

    assert.equal(exitCode, 1);
    assert.equal(stderr, '');
    const result = JSON.parse(stdout);
    assert.equal(result.status, 'FAILED_CLOSED');
    assert.equal(result.technicalReady, false);
    assert.equal(result.deploymentReady, false);
    assert.equal(stdout.includes('/private/provider-account.json'), false);
    assert.equal(stdout.includes(input.current.backupSetReference), false);
    assert.equal(stdout.includes(input.current.imageDigest), false);
  });

  it('emits only a bounded code for an invalid rollback input', () => {
    const input = canonicalInput('BAD_MIGRATION');
    input.observedRollback.secretGeneration = 0;
    let stdout = '';
    let stderr = '';
    const exitCode = main(['--input', '/private/key-and-provider.json'], {
      input,
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: (value) => (stderr += value) },
    });

    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
    assert.deepEqual(JSON.parse(stderr), {
      status: 'FAILED',
      code: 'ROLLBACK_OBSERVED_INVALID',
    });
    assert.equal(stderr.includes('/private/key-and-provider.json'), false);
    assert.equal(stderr.includes(input.previous.backupSetReference), false);
  });
});

function canonicalInput(failureInjection) {
  const current = releaseState({
    releaseSequence: 8,
    name: 'current',
    secretGeneration: 8,
  });
  const previous = releaseState({
    releaseSequence: 7,
    name: 'previous',
    secretGeneration: 7,
  });
  return {
    schemaVersion: 'amic-vault.sf20-rollback-input.v1',
    drillId: 'rollback-synthetic-proof-0001',
    failureInjection,
    current,
    previous,
    observedRollback: {
      status: 'COMPLETE',
      ...projection(previous),
    },
    probes: Object.fromEntries(probeKeys.map((key) => [key, true])),
  };
}

function releaseState({ releaseSequence, name, secretGeneration }) {
  const migrationFingerprint = sha256(`${name}-migration`);
  return {
    schemaVersion: 'amic-vault.sf20-release-state.v1',
    releaseSequence,
    imageDigest: `sha256:${sha256(`${name}-image`)}`,
    imageDataCompatibilityFingerprint: migrationFingerprint,
    migrationFingerprint,
    dataAuthorityFingerprint: sha256(`${name}-data-authority`),
    backupSetReference: `bset-${name}-proof-0001`,
    secretGeneration,
    objectInventoryHash: sha256(`${name}-object-inventory`),
  };
}

function projection(state) {
  return {
    imageDigest: state.imageDigest,
    migrationFingerprint: state.migrationFingerprint,
    dataAuthorityFingerprint: state.dataAuthorityFingerprint,
    backupSetReference: state.backupSetReference,
    secretGeneration: state.secretGeneration,
    objectInventoryHash: state.objectInventoryHash,
  };
}

function probeFailureCode(key) {
  return `ROLLBACK_PROBE_${key.replaceAll(/([A-Z])/gu, '_$1').toUpperCase()}_FAILED`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
