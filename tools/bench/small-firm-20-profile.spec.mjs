import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildCapacityManifest,
  stableSha256,
  validateCapacityFixture,
} from './small-firm-20-profile.mjs';

const profile = JSON.parse(readFileSync('security/small-firm-20-profile.yml', 'utf8'));
const fixture = JSON.parse(readFileSync('tests/fixtures/small-firm-20-capacity.json', 'utf8'));

function clone(value) {
  return structuredClone(value);
}

test('builds the same synthetic manifest twice for the same source SHA', () => {
  const first = buildCapacityManifest({ profile, fixture });
  const second = buildCapacityManifest({ profile, fixture });
  assert.deepEqual(first, second);
  assert.equal(first.manifestSha256, stableSha256({ ...first, manifestSha256: undefined }));
});

test('binds two tenants and the exact SF20 totals and denial controls', () => {
  const result = validateCapacityFixture({ profile, fixture });
  assert.deepEqual(result, {
    tenantCount: 2,
    totals: {
      namedUsers: 20,
      documentVersions: 500000,
      objectStorageBytes: 2199023255552,
    },
  });
});

test('rejects capacity drift and a raw-content field', () => {
  const tooManyUsers = clone(fixture);
  tooManyUsers.tenants[0].namedUsers += 1;
  assert.throws(
    () => validateCapacityFixture({ profile, fixture: tooManyUsers }),
    /namedUsers total/,
  );

  const rawData = clone(fixture);
  rawData.tenants[0].fileName = 'synthetic-but-prohibited.pdf';
  assert.throws(() => validateCapacityFixture({ profile, fixture: rawData }), /raw-data field/);
});

test('rejects a missing cross-tenant or ethical-wall denial', () => {
  const permissive = clone(fixture);
  permissive.expectedOutcomes.crossTenantDocumentRead = 'ALLOW';
  assert.throws(
    () => validateCapacityFixture({ profile, fixture: permissive }),
    /cross-tenant deny missing/,
  );

  permissive.expectedOutcomes.crossTenantDocumentRead = 'PERMISSION_DENIED';
  permissive.expectedOutcomes.ethicalWallSearch = 'ALLOW';
  assert.throws(
    () => validateCapacityFixture({ profile, fixture: permissive }),
    /ethical-wall deny missing/,
  );
});
