import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateSourceMap } from './verify-source-map.mjs';

const SHA = 'a'.repeat(40);
const LICENSE_HASH = `sha256:${'b'.repeat(64)}`;

function fixture(root) {
  mkdirSync(join(root, 'apps'), { recursive: true });
  writeFileSync(join(root, 'apps', 'authority.ts'), 'export {};\n');
  writeFileSync(join(root, 'apps', 'authority.spec.ts'), 'export {};\n');
  const component = { id: 'candidate', state: 'PINNED', commit: SHA, tree: SHA, licenseHash: LICENSE_HASH, owner: 'engineering', clonePath: 'clones/candidate', release: 'reference-commit', baseline: { command: ['test'], outcome: 'ENVIRONMENT_BLOCKED' } };
  return {
    sourceMap: {
      schemaVersion: 'oss-source-map-v1',
      sourceLab: { productTreeInclusion: 'FORBIDDEN' },
      productAuthorityTargets: [{ portfolio: 'OSS-01', owner: 'platform', productPaths: ['apps/authority.ts'], testPaths: ['apps/authority.spec.ts'] }],
      sourceTestTargets: [{ component: 'candidate', sourcePath: 'src/a.ts', sourceBlob: SHA, testPath: 'test/a.spec.ts', testBlob: SHA }],
      operationalCandidates: [],
      components: [component],
    },
    decisions: {
      schemaVersion: 'amic-vault.oss-adoption-decisions.v1',
      decisions: [{ id: 'candidate', decision: 'L1', status: 'BLOCKED_PENDING_OSS04_SCOPE' }],
    },
    reuseManifest: {
      schemaVersion: 'amic-vault.oss-test-reuse.v1',
      entries: [{ component: 'candidate', fixturePolicy: 'NO_COPY', classification: 'BEHAVIORAL_SCENARIO', sourceBlob: SHA, testBlob: SHA, sourceLicenseHash: LICENSE_HASH, canonicalSuite: 'apps/authority.spec.ts' }],
      conditionalEntries: [],
    },
  };
}

test('accepts a complete bounded static map', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-source-map-'));
  try {
    const { sourceMap, decisions, reuseManifest } = fixture(root);
    const report = validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot: root, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false });
    assert.equal(report.sourceLab.status, 'NOT_RUN_STATIC_CI');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed for a fake source blob or missing mapped path', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-source-map-'));
  try {
    const { sourceMap, decisions, reuseManifest } = fixture(root);
    sourceMap.sourceTestTargets[0].sourceBlob = 'not-a-sha';
    assert.throws(() => validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot: root, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false }), /source blob/);
    sourceMap.sourceTestTargets[0].sourceBlob = SHA;
    sourceMap.productAuthorityTargets[0].productPaths = ['apps/missing.ts'];
    assert.throws(() => validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot: root, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false }), /does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed when an advanced reuse decision lacks obligations', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-source-map-'));
  try {
    const { sourceMap, decisions, reuseManifest } = fixture(root);
    decisions.decisions[0] = { id: 'candidate', decision: 'L2', status: 'APPROVED_FOR_PRODUCT_CHANGE' };
    assert.throws(() => validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot: root, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false }), /requires explicit/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed for missing source lock fields and copied fixtures', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-source-map-'));
  try {
    const { sourceMap, decisions, reuseManifest } = fixture(root);
    for (const [field, message] of [['commit', 'commit'], ['tree', 'tree'], ['licenseHash', 'license hash'], ['owner', 'owner'], ['clonePath', 'clone path'], ['release', 'refresh'], ['sourcePath', 'source path']]) {
      const { sourceMap: map, decisions: decisionRows, reuseManifest: reuse } = fixture(root);
      if (field === 'sourcePath') map.sourceTestTargets[0][field] = '';
      else map.components[0][field] = '';
      assert.throws(() => validateSourceMap({ sourceMap: map, decisions: decisionRows, reuseManifest: reuse, repoRoot: root, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false }), new RegExp(message));
    }
    reuseManifest.entries[0].fixturePolicy = 'COPY';
    assert.throws(() => validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot: root, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false }), /copied upstream fixture/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checks the explicit source lab and rejects a dirty pinned clone', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-product-'));
  const lab = mkdtempSync(join(tmpdir(), 'oss-lab-'));
  try {
    const { sourceMap, decisions, reuseManifest } = fixture(root);
    const clone = join(lab, 'clones', 'candidate');
    mkdirSync(join(clone, 'src'), { recursive: true });
    mkdirSync(join(clone, 'test'), { recursive: true });
    writeFileSync(join(clone, 'src', 'a.ts'), 'source\n');
    writeFileSync(join(clone, 'test', 'a.spec.ts'), 'test\n');
    writeFileSync(join(clone, 'LICENSE'), 'license\n');
    execFileSync('git', ['init', clone]);
    execFileSync('git', ['-C', clone, 'add', '.']);
    execFileSync('git', ['-C', clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
    const git = (args) => execFileSync('git', ['-C', clone, ...args], { encoding: 'utf8' }).trim();
    const component = sourceMap.components[0];
    component.commit = git(['rev-parse', 'HEAD']);
    component.tree = git(['rev-parse', 'HEAD^{tree}']);
    component.licensePath = 'LICENSE';
    component.licenseHash = `sha256:${createHash('sha256').update('license\n').digest('hex')}`;
    sourceMap.sourceTestTargets[0].sourceBlob = git(['rev-parse', 'HEAD:src/a.ts']);
    sourceMap.sourceTestTargets[0].testBlob = git(['rev-parse', 'HEAD:test/a.spec.ts']);
    reuseManifest.entries[0].sourceBlob = sourceMap.sourceTestTargets[0].sourceBlob;
    reuseManifest.entries[0].testBlob = sourceMap.sourceTestTargets[0].testBlob;
    reuseManifest.entries[0].sourceLicenseHash = component.licenseHash;
    const pass = validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot: root, sourceRoot: lab, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false });
    assert.equal(pass.sourceLab.status, 'VERIFIED');
    writeFileSync(join(clone, 'dirty.txt'), 'dirty\n');
    assert.throws(() => validateSourceMap({ sourceMap, decisions, reuseManifest, repoRoot: root, sourceRoot: lab, requiredPortfolios: ['OSS-01'], requireOperationalCoverage: false }), /dirty clone/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(lab, { recursive: true, force: true });
  }
});
