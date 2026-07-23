import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';

import { stableStringify } from './build-backup-set-manifest.mjs';
import {
  ResidencyError,
  checkSf20Residency,
  deriveRecoveryMeasurements,
  main,
  sealHashedResidencyReceipt,
} from './check-sf20-residency.mjs';

const profileFingerprint = sha256('sf20-profile');
const region = 'kr-central-1';
const evaluatedAt = '2026-07-23T12:00:00.000Z';
const surfaces = Object.freeze(['app', 'database', 'object-storage', 'backup', 'secret-key']);

describe('SF20 residency and recovery timing gate', () => {
  it('derives boundary RPO/RTO values and returns technical-only readiness', () => {
    const input = canonicalInput();
    const first = checkSf20Residency(input);
    const second = checkSf20Residency(structuredClone(input));

    assert.equal(first.status, 'TECHNICAL_PASS');
    assert.equal(first.deploymentReady, false);
    assert.equal(
      first.deploymentStatus,
      'EXTERNAL_BLOCKED_APPROVED_STAGING_ROLLBACK_RECEIPT_REQUIRED',
    );
    assert.deepEqual(first.measurements, {
      rpoSeconds: 3600,
      rpoCeilingSeconds: 3600,
      rtoSeconds: 14400,
      rtoCeilingSeconds: 14400,
    });
    assert.equal(first.resultHash, second.resultHash);
    assert.deepEqual(
      first.surfaces.map(({ surface }) => surface),
      [...surfaces].sort(),
    );
    const serialized = JSON.stringify(first);
    assert.equal(serialized.includes('provider-account'), false);
    assert.equal(serialized.includes('customer'), false);
    assert.equal(serialized.includes('DEPLOYMENT_READY'), false);
  });

  it('accepts an Ed25519 receipt only with the matching trusted key', () => {
    const input = canonicalInput();
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' });
    const keyFingerprint = `sha256:${sha256(der)}`;
    const payload = Object.fromEntries(
      Object.entries(input.receipts[0]).filter(([key]) => key !== 'integrity'),
    );
    input.receipts[0] = {
      ...payload,
      integrity: {
        kind: 'ed25519',
        keyFingerprint,
        signature: sign(null, Buffer.from(stableStringify(payload)), privateKey).toString(
          'base64url',
        ),
      },
    };

    const result = checkSf20Residency(input, {
      trustedSigningKeys: new Map([[keyFingerprint, publicKey]]),
    });
    assert.equal(result.surfaces.find(({ surface }) => surface === 'app').integrityKind, 'ed25519');

    assert.throws(
      () => checkSf20Residency(input),
      (error) => error instanceof ResidencyError && error.code === 'RECEIPT_SIGNING_KEY_UNTRUSTED',
    );
  });

  it('fails closed for receipt, region, profile, timing, and telemetry mutations', async (t) => {
    const cases = [
      {
        name: 'missing mandatory receipt',
        mutate: (input) => input.receipts.pop(),
        code: 'RESIDENCY_RECEIPT_MISSING',
      },
      {
        name: 'duplicate receipt surface',
        mutate: (input) => {
          input.receipts[4] = structuredClone(input.receipts[0]);
        },
        code: 'RESIDENCY_RECEIPT_DUPLICATE',
      },
      {
        name: 'wrong country',
        mutate: (input) => reseal(input, 0, { country: 'US' }),
        code: 'RECEIPT_RESIDENCY_MISMATCH',
      },
      {
        name: 'mixed region',
        mutate: (input) => reseal(input, 1, { region: 'kr-south-2' }),
        code: 'RECEIPT_RESIDENCY_MISMATCH',
      },
      {
        name: 'profile hash drift',
        mutate: (input) => reseal(input, 2, { profileFingerprint: sha256('drift') }),
        code: 'RECEIPT_RESIDENCY_MISMATCH',
      },
      {
        name: 'receipt stale',
        mutate: (input) =>
          reseal(input, 3, {
            capturedAt: '2026-07-22T10:00:00.000Z',
            validUntil: '2026-07-24T10:00:00.000Z',
          }),
        code: 'RECEIPT_STALE',
      },
      {
        name: 'receipt expired',
        mutate: (input) => reseal(input, 3, { validUntil: '2026-07-23T11:59:59.000Z' }),
        code: 'RECEIPT_STALE',
      },
      {
        name: 'hash tamper',
        mutate: (input) => {
          input.receipts[0].capturedAt = '2026-07-23T11:30:00.000Z';
        },
        code: 'RECEIPT_HASH_INVALID',
      },
      {
        name: 'unsigned receipt',
        mutate: (input) => {
          input.receipts[0].integrity = { kind: 'none' };
        },
        code: 'RECEIPT_INTEGRITY_INVALID',
      },
      {
        name: 'clock inversion RPO',
        mutate: (input) => {
          input.timing.restorePointAt = '2026-07-23T11:00:01.000Z';
        },
        code: 'RECOVERY_CLOCK_INVERSION',
      },
      {
        name: 'clock inversion RTO',
        mutate: (input) => {
          input.timing.verifiedReadyAt = '2026-07-23T07:59:59.000Z';
        },
        code: 'RECOVERY_CLOCK_INVERSION',
      },
      {
        name: 'declared-only RTO',
        mutate: (input) => {
          delete input.timing.monotonicRtoSeconds;
          input.timing.rtoSeconds = 100;
        },
        code: 'RECOVERY_TIMING_SCHEMA_INVALID',
      },
      {
        name: 'monotonic mismatch',
        mutate: (input) => {
          input.timing.monotonicRtoSeconds -= 1;
        },
        code: 'RECOVERY_MONOTONIC_MISMATCH',
      },
      {
        name: 'RPO ceiling plus one second',
        mutate: (input) => {
          input.timing.restorePointAt = '2026-07-23T09:59:59.000Z';
        },
        code: 'RPO_CEILING_EXCEEDED',
      },
      {
        name: 'RTO ceiling plus one second',
        mutate: (input) => {
          input.timing.verifiedReadyAt = '2026-07-23T12:00:01.000Z';
          input.timing.monotonicRtoSeconds = 14401;
        },
        code: 'RTO_CEILING_EXCEEDED',
      },
      {
        name: 'subsecond timing ambiguity',
        mutate: (input) => {
          input.timing.verifiedReadyAt = '2026-07-23T12:00:00.001Z';
        },
        code: 'RECOVERY_SUBSECOND_AMBIGUOUS',
      },
    ];

    for (const testCase of cases) {
      await t.test(testCase.name, () => {
        const input = canonicalInput();
        testCase.mutate(input);
        assert.throws(
          () => checkSf20Residency(input),
          (error) => error instanceof ResidencyError && error.code === testCase.code,
        );
      });
    }
  });

  it('requires and verifies telemetry when the later profile activates it', () => {
    const input = canonicalInput();
    assert.throws(
      () => checkSf20Residency(input, { requireTelemetry: true }),
      (error) => error instanceof ResidencyError && error.code === 'RESIDENCY_RECEIPT_MISSING',
    );
    input.receipts.push(receipt('telemetry'));
    const result = checkSf20Residency(input, { requireTelemetry: true });
    assert.equal(result.receiptCount, 6);

    reseal(input, 5, { region: 'kr-south-2' });
    assert.throws(
      () => checkSf20Residency(input, { requireTelemetry: true }),
      (error) => error instanceof ResidencyError && error.code === 'RECEIPT_RESIDENCY_MISMATCH',
    );
  });

  it('emits only a bounded failure code', () => {
    let stdout = '';
    let stderr = '';
    const input = canonicalInput();
    input.receipts[0].integrity.payloadSha256 = sha256('bad');
    const exitCode = main(['--input', '/private/provider-account.json'], {
      input,
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: (value) => (stderr += value) },
    });

    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
    assert.deepEqual(JSON.parse(stderr), {
      status: 'FAILED',
      code: 'RECEIPT_HASH_INVALID',
    });
    assert.equal(stderr.includes('provider-account'), false);
    assert.equal(stderr.includes(region), false);
    assert.equal(stderr.includes(profileFingerprint), false);
  });
});

describe('SF20 recovery measurement derivation', () => {
  it('uses timestamps plus the monotonic duration, never a declared-only number', () => {
    assert.deepEqual(deriveRecoveryMeasurements(canonicalInput().timing), {
      rpoSeconds: 3600,
      rpoCeilingSeconds: 3600,
      rtoSeconds: 14400,
      rtoCeilingSeconds: 14400,
    });
  });
});

function canonicalInput() {
  return {
    schemaVersion: 'amic-vault.sf20-residency-input.v1',
    approvedCountry: 'KR',
    approvedRegion: region,
    profileFingerprint,
    evaluatedAt,
    timing: {
      incidentCutoffAt: '2026-07-23T11:00:00.000Z',
      restorePointAt: '2026-07-23T10:00:00.000Z',
      drillStartedAt: '2026-07-23T08:00:00.000Z',
      verifiedReadyAt: '2026-07-23T12:00:00.000Z',
      monotonicRtoSeconds: 14400,
    },
    receipts: surfaces.map((surface) => receipt(surface)),
  };
}

function receipt(surface) {
  return sealHashedResidencyReceipt({
    schemaVersion: 'amic-vault.sf20-residency-receipt.v1',
    surface,
    country: 'KR',
    region,
    profileFingerprint,
    capturedAt: '2026-07-23T11:00:00.000Z',
    validUntil: '2026-07-23T13:00:00.000Z',
    status: 'VERIFIED',
  });
}

function reseal(input, index, mutation) {
  const payload = Object.fromEntries(
    Object.entries(input.receipts[index]).filter(([key]) => key !== 'integrity'),
  );
  input.receipts[index] = sealHashedResidencyReceipt({
    ...payload,
    ...mutation,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
