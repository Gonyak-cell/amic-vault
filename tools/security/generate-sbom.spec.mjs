import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMatchingNormalizedInventories, assertSourceIdentity, normalizedComponentHash, normalizedComponents, parseImageSpec, verifySyft } from './generate-sbom.mjs';

const DIGEST = `sha256:${'a'.repeat(64)}`;

test('accepts only exact local image digest identities', () => {
  assert.deepEqual(parseImageSpec(`api=docker:${DIGEST}`), { name: 'api', reference: `docker:${DIGEST}`, digest: DIGEST });
  assert.throws(() => parseImageSpec('api=docker:amic-vault-api:latest'), /digest identity/);
  assert.throws(() => parseImageSpec('api=docker:sha256:abc'), /64hex/);
});

test('normalizes components without timestamps or paths and produces stable hashes', () => {
  const document = {
    bomFormat: 'CycloneDX',
    metadata: { timestamp: '2099-01-01T00:00:00.000Z' },
    components: [
      { type: 'library', name: 'bravo', version: '2.0.0', purl: 'pkg:npm/bravo@2.0.0', properties: [{ name: 'path', value: '/private/path' }] },
      { type: 'library', name: 'alpha', version: '1.0.0', purl: 'pkg:npm/alpha@1.0.0' },
    ],
  };
  assert.deepEqual(normalizedComponents(document).map((component) => component.name), ['alpha', 'bravo']);
  assert.equal(normalizedComponentHash(document), normalizedComponentHash({ ...document, metadata: { timestamp: '2100-01-01T00:00:00.000Z' } }));
  assert.equal(normalizedComponents({ bomFormat: 'CycloneDX', components: [{ name: 'checkout', purl: 'pkg:github/actions/checkout@v5' }] })[0].version, 'v5');
  assert.deepEqual(normalizedComponents({ bomFormat: 'CycloneDX', components: [{ type: 'file', name: 'pnpm-lock.yaml' }] }), []);
});

test('deduplicates identical purls but rejects conflicting purl identities and malformed source identities', () => {
  assert.deepEqual(normalizedComponents({ bomFormat: 'CycloneDX', components: [{ name: 'a', version: '1', purl: 'pkg:npm/a@1' }, { name: 'a', version: '1', purl: 'pkg:npm/a@1' }] }), [{ type: 'library', name: 'a', version: '1', purl: 'pkg:npm/a@1' }]);
  assert.throws(() => normalizedComponents({ bomFormat: 'CycloneDX', components: [{ name: 'a', version: '1', purl: 'pkg:npm/a@1' }, { name: 'a2', version: '1', purl: 'pkg:npm/a@1' }] }), /conflicting duplicate component purl/);
  assert.throws(() => assertSourceIdentity({ sourceSha: 'a'.repeat(39), sourceTree: 'b'.repeat(40) }), /sourceSha/);
});

test('requires the pinned Syft release identity', () => {
  const good = () => ({ status: 0, stdout: 'Version:       1.44.0\nGitCommit:     8cb78ce40ced6a731fb83f2a491a67444f541bf1\n', stderr: '' });
  verifySyft('/tmp/syft', good);
  assert.throws(() => verifySyft('/tmp/syft', () => ({ status: 0, stdout: 'Version:       1.44.0\nGitCommit:     deadbeef\n', stderr: '' })), /GitCommit/);
});

test('accepts only identical normalized inventories for the same inputs', () => {
  const inventory = { sboms: [{ name: 'api', imageDigest: DIGEST, normalizedComponentHash: `sha256:${'b'.repeat(64)}`, componentCount: 1 }] };
  assert.doesNotThrow(() => assertMatchingNormalizedInventories(inventory, { ...inventory, sboms: [...inventory.sboms] }));
  assert.throws(() => assertMatchingNormalizedInventories(inventory, { sboms: [{ ...inventory.sboms[0], componentCount: 2 }] }), /same-input/);
});
