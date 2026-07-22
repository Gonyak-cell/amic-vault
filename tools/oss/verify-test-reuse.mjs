import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLASSIFICATIONS = new Set(['UNCHANGED_BASELINE', 'APPROVED_PORT', 'FIXTURE_REUSE', 'BEHAVIORAL_SCENARIO', 'REJECTED']);
const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;

function fail(message) {
  throw new Error(`test reuse verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sourceKey(entry) {
  return `${entry.component}:${entry.sourceBlob}:${entry.testBlob}`;
}

export function validateTestReuse({ manifest, sourceMap, repoRoot = process.cwd(), exists = existsSync }) {
  assert(manifest?.schemaVersion === 'amic-vault.oss-test-reuse.v1', 'manifest schema invalid');
  assert(Array.isArray(manifest.entries) && manifest.entries.length > 0, 'manifest entries missing');
  assert(Array.isArray(sourceMap?.sourceTestTargets), 'source map targets missing');
  const sourceTargets = new Map(sourceMap.sourceTestTargets.map((entry) => [sourceKey(entry), entry]));
  const components = new Map(sourceMap.components.map((entry) => [entry.id, entry]));
  const ids = new Set();
  const covered = new Set();
  for (const entry of manifest.entries) {
    assert(typeof entry.id === 'string' && entry.id && !ids.has(entry.id), 'entry id invalid or duplicate');
    ids.add(entry.id);
    assert(CLASSIFICATIONS.has(entry.classification), `${entry.id}: classification invalid`);
    assert(SHA.test(entry.sourceBlob ?? '') && SHA.test(entry.testBlob ?? ''), `${entry.id}: source or test blob invalid`);
    const target = sourceTargets.get(sourceKey(entry));
    assert(target, `${entry.id}: source/test target absent or hash mismatched`);
    const component = components.get(entry.component);
    assert(component?.state === 'PINNED' && component.licenseHash === entry.sourceLicenseHash && DIGEST.test(entry.sourceLicenseHash ?? ''), `${entry.id}: component license provenance invalid`);
    assert(typeof entry.canonicalSuite === 'string' && entry.canonicalSuite.startsWith('tests/integration/') && exists(resolve(repoRoot, entry.canonicalSuite)), `${entry.id}: canonical integration suite invalid`);
    assert(typeof entry.scenario === 'string' && entry.scenario && Array.isArray(entry.assertions) && entry.assertions.length > 0, `${entry.id}: parity scenario invalid`);
    assert(entry.fixturePolicy === 'NO_COPY' || entry.fixturePolicy === 'COPY', `${entry.id}: fixture policy invalid`);
    if (entry.fixturePolicy === 'COPY') {
      assert(entry.classification === 'FIXTURE_REUSE' && entry.reuseLevel === 'L2' && DIGEST.test(entry.fixtureLicenseHash ?? '') && SHA.test(entry.fixtureBlob ?? '') && typeof entry.targetRollback === 'string' && entry.targetRollback, `${entry.id}: copied fixture lacks L2 provenance or rollback`);
    }
    if (entry.classification === 'REJECTED') assert(typeof entry.reason === 'string' && entry.reason, `${entry.id}: rejection reason missing`);
    covered.add(target.portfolio);
  }
  for (const portfolio of ['OSS-04', 'OSS-05', 'OSS-06']) {
    assert(covered.has(portfolio), `security-critical portfolio ${portfolio} uncovered`);
    assert(manifest.entries.some((entry) => sourceTargets.get(sourceKey(entry))?.portfolio === portfolio && entry.assertions.some((value) => value === 'permission-deny' || value === 'fault-reconciliation')), `${portfolio}: negative or fault parity scenario missing`);
  }
  return { schema: 'amic-vault.oss-test-reuse-report.v1', entryCount: manifest.entries.length, coveredPortfolios: [...covered].sort(), copiedFixtureCount: manifest.entries.filter((entry) => entry.fixturePolicy === 'COPY').length };
}

function parseArgs(args) {
  const result = { manifestPath: 'security/oss-test-reuse.yml', sourceMapPath: 'security/oss-source-map.yml' };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--manifest') result.manifestPath = args[++index];
    else if (value === '--source-map') result.sourceMapPath = args[++index];
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(resolve(args.manifestPath), 'utf8'));
  const sourceMap = JSON.parse(readFileSync(resolve(args.sourceMapPath), 'utf8'));
  console.log(JSON.stringify(validateTestReuse({ manifest, sourceMap }), null, 2));
}
