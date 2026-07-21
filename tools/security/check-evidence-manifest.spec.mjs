import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateInventory } from './check-evidence-manifest.mjs';

const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);

function fixture(mutator = (value) => value) {
  const root = mkdtempSync(join(tmpdir(), 'amic-oss-provenance-'));
  mkdirSync(join(root, 'apps/api'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { alpha: '1.0.0' } }));
  writeFileSync(join(root, 'apps/api/package.json'), JSON.stringify({ dependencies: { '@local/api': 'workspace:*' } }));
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  mkdirSync(join(root, 'workers/ingestion'), { recursive: true });
  writeFileSync(join(root, 'workers/ingestion/pyproject.toml'), '[project]\ndependencies = ["fastapi>=1"]\n[project.optional-dependencies]\ntest = ["pytest>=8"]\n[build-system]\nrequires = ["setuptools>=69"]\n');
  writeFileSync(join(root, 'Dockerfile'), 'FROM node:22-bookworm-slim AS base\n');
  const provenance = mutator({
    schemaVersion: 'oss-provenance-v1',
    baseline: { sourceSha: SHA, sourceTree: TREE },
    inventory: {
      nodePackageManifests: ['package.json', 'apps/api/package.json'],
      nodeLockfile: 'pnpm-lock.yaml',
      pythonProject: 'workers/ingestion/pyproject.toml',
      dockerfiles: ['Dockerfile'],
    },
    upstreamDefaults: Object.fromEntries(['npm', 'python', 'image'].map((kind) => [kind, {
      upstreamUrl: 'unresolved', upstreamSha: 'unresolved', upstreamTree: 'unresolved', licenseHash: 'unresolved', artifactDigest: 'unresolved', owner: 'security', evidenceState: 'UNRESOLVED', modifier: 'none',
    }]).concat([['workspace', {
      upstreamUrl: 'repository', upstreamSha: SHA, upstreamTree: TREE, licenseHash: 'policy', artifactDigest: 'tree', owner: 'engineering', evidenceState: 'VERIFIED', modifier: 'none',
    }]])),
    overrides: {},
  });
  writeFileSync(join(root, 'provenance.json'), JSON.stringify(provenance));
  writeFileSync(join(root, 'schema.json'), JSON.stringify({
    required: ['pack', 'tuw', 'sourceSha', 'sourceTree', 'upstreamInputs', 'commands', 'artifacts', 'truthState', 'syntheticOnly', 'externalEvidence'],
    upstreamInputRequired: ['inputKey', 'kind', 'manifestPath', 'fileInclusion', 'upstreamUrl', 'upstreamSha', 'upstreamTree', 'licenseHash', 'artifactDigest', 'owner', 'evidenceState', 'modifier'],
    truthStates: ['SOURCE_IMPLEMENTED', 'EXTERNAL_BLOCKED'],
  }));
  return root;
}

function run(root) {
  return validateInventory({ repoRoot: root, provenancePath: 'provenance.json', evidenceSchemaPath: 'schema.json' });
}

test('covers direct node, Python, workspace, and image inputs from declared sources', () => {
  const root = fixture();
  try {
    const result = run(root);
    assert.equal(result.inputCount, 6);
    assert.equal(result.unresolvedCount, 5);
    assert.deepEqual(result.inputs.map((input) => input.kind).sort(), ['image', 'npm', 'python', 'python', 'python', 'workspace']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects non-exact baseline source identity', () => {
  const root = fixture((value) => ({ ...value, baseline: { ...value.baseline, sourceSha: 'abc1234' } }));
  try {
    assert.throws(() => run(root), /baseline sourceSha/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a verified tag-only image', () => {
  const root = fixture((value) => ({
    ...value,
    overrides: {
      'image:Dockerfile:1': {
        upstreamUrl: 'https://example.invalid/node', upstreamSha: SHA, upstreamTree: TREE, licenseHash: 'license-hash', artifactDigest: `sha256:${'c'.repeat(64)}`, owner: 'platform', evidenceState: 'VERIFIED', modifier: 'none',
      },
    },
  }));
  try {
    const result = spawnSync(process.execPath, [
      new URL('./check-evidence-manifest.mjs', import.meta.url).pathname,
      join(root, 'provenance.json'),
      join(root, 'schema.json'),
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /verified image must use digest reference/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects blank license metadata even before an upstream source is resolved', () => {
  const root = fixture((value) => ({
    ...value,
    upstreamDefaults: { ...value.upstreamDefaults, npm: { ...value.upstreamDefaults.npm, licenseHash: '' } },
  }));
  try {
    assert.throws(() => run(root), /missing licenseHash/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
