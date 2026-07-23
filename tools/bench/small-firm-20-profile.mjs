import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/u;
const FORBIDDEN_DATA_KEYS = new Set([
  'authorization',
  'body',
  'content',
  'documentbody',
  'email',
  'filename',
  'objectkey',
  'password',
  'prompt',
  'storagekey',
  'text',
  'token',
]);

function fail(message) {
  throw new Error(`small-firm capacity fixture invalid: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function normalizedKey(value) {
  return value.replace(/[._-]/gu, '').toLowerCase();
}

function inspectForRawData(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForRawData(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(!FORBIDDEN_DATA_KEYS.has(normalizedKey(key)), `${path}.${key} is a raw-data field`);
    inspectForRawData(child, `${path}.${key}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function stableSha256(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

export function validateCapacityFixture({ profile, fixture }) {
  assert(
    profile?.schemaVersion === 'amic-vault.small-firm-20-profile.v1',
    'profile schema mismatch',
  );
  assert(
    fixture?.schemaVersion === 'amic-vault.small-firm-20-capacity-fixture.v1',
    'fixture schema mismatch',
  );
  assert(fixture.syntheticOnly === true, 'fixture must be synthetic only');
  assert(fixture.seed === 'sf20-capacity-v1-fixed', 'fixture seed must remain fixed');
  assert(Array.isArray(fixture.tenants), 'tenant fixtures missing');
  assert(
    fixture.tenants.length === profile.capacity.tenantFixtureCount,
    'tenant fixture count mismatch',
  );
  assert(
    new Set(fixture.tenants.map(({ ref }) => ref)).size === fixture.tenants.length,
    'tenant refs must be unique',
  );

  const totals = fixture.tenants.reduce(
    (result, tenant) => ({
      namedUsers: result.namedUsers + tenant.namedUsers,
      documentVersions: result.documentVersions + tenant.documentVersions,
      objectStorageBytes: result.objectStorageBytes + tenant.objectStorageBytes,
    }),
    { namedUsers: 0, documentVersions: 0, objectStorageBytes: 0 },
  );
  for (const key of Object.keys(totals)) {
    assert(totals[key] === profile.capacity[key], `${key} total does not match profile`);
  }
  for (const key of [
    'simultaneousActiveSessions',
    'concurrentApiRequestBurst',
    'simultaneousPreviewDownloads',
    'concurrentIngestionJobs',
  ]) {
    assert(fixture.load?.[key] === profile.capacity[key], `${key} load does not match profile`);
  }
  assert(fixture.expectedOutcomes?.authorizedMatterRead === 'ALLOW', 'authorized control missing');
  assert(
    fixture.expectedOutcomes?.crossTenantDocumentRead === 'PERMISSION_DENIED',
    'cross-tenant deny missing',
  );
  assert(
    fixture.expectedOutcomes?.ethicalWallSearch === 'ETHICAL_WALL_BLOCKED',
    'ethical-wall deny missing',
  );
  assert(
    fixture.expectedOutcomes?.unknownPolicy === 'PERMISSION_DENIED',
    'unknown-policy fail-closed result missing',
  );
  inspectForRawData(fixture);
  return { totals, tenantCount: fixture.tenants.length };
}

export function buildCapacityManifest({
  profile,
  fixture,
  sourceSha = profile?.baseline?.sourceSha,
}) {
  assert(SHA.test(sourceSha ?? ''), 'source SHA must be 40 lower-case hex');
  const validation = validateCapacityFixture({ profile, fixture });
  const manifest = {
    schemaVersion: 'amic-vault.small-firm-20-capacity-manifest.v1',
    profileId: profile.profileId,
    sourceSha,
    seed: fixture.seed,
    syntheticOnly: true,
    tenantCount: validation.tenantCount,
    totals: validation.totals,
    load: fixture.load,
    expectedOutcomes: fixture.expectedOutcomes,
    thresholds: profile.slo,
  };
  return { ...manifest, manifestSha256: stableSha256(manifest) };
}

function parseArgs(argv) {
  const result = {
    profilePath: 'security/small-firm-20-profile.yml',
    fixturePath: 'tests/fixtures/small-firm-20-capacity.json',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--profile') result.profilePath = argv[++index];
    else if (token === '--fixture') result.fixturePath = argv[++index];
    else if (token === '--source-sha') result.sourceSha = argv[++index];
    else fail(`unknown argument: ${token}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const profile = JSON.parse(readFileSync(resolve(args.profilePath), 'utf8'));
    const fixture = JSON.parse(readFileSync(resolve(args.fixturePath), 'utf8'));
    process.stdout.write(
      `${JSON.stringify(buildCapacityManifest({ profile, fixture, sourceSha: args.sourceSha }), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`SMALL_FIRM_CAPACITY_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
