import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateSourceLabBoundary, validateUpstreamLock } from './verify-upstream-lock.mjs';

const row = {
  id: 'paperless-ngx',
  officialUrl: 'https://github.com/paperless-ngx/paperless-ngx',
  release: 'v2.18.4',
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  licensePath: 'LICENSE',
  licenseHash: `sha256:${'c'.repeat(64)}`,
  clonePath: 'clones/paperless-ngx',
  owner: 'engineering',
  state: 'PINNED',
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'amic-upstream-lock-'));
  const product = join(root, 'product');
  const lab = join(root, 'lab');
  mkdirSync(product);
  mkdirSync(lab);
  return { root, product, lab };
}

test('accepts a disjoint source root and safe lock schema', () => {
  const value = fixture();
  try {
    const report = validateUpstreamLock({ map: { schemaVersion: 'oss-source-map-v1', sourceLab: { rootEnvironment: 'OSS_RESEARCH_ROOT' }, components: [row] }, sourceRoot: value.lab, repoRoot: value.product });
    assert.equal(report.componentCount, 1);
    assert.equal(report.productBuildContextIncludesSourceLab, false);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('rejects product overlap, symlink roots, malformed pins, traversal, and unowned blocks', () => {
  const value = fixture();
  try {
    assert.throws(() => validateSourceLabBoundary({ sourceRoot: value.product, repoRoot: value.product }), /disjoint/);
    const linked = join(value.root, 'linked-lab');
    symlinkSync(value.lab, linked);
    assert.throws(() => validateSourceLabBoundary({ sourceRoot: linked, repoRoot: value.product }), /symlink/);
    assert.throws(() => validateUpstreamLock({ map: { schemaVersion: 'oss-source-map-v1', sourceLab: { rootEnvironment: 'OSS_RESEARCH_ROOT' }, components: [{ ...row, commit: 'short' }] }, sourceRoot: value.lab, repoRoot: value.product }), /commit/);
    assert.throws(() => validateUpstreamLock({ map: { schemaVersion: 'oss-source-map-v1', sourceLab: { rootEnvironment: 'OSS_RESEARCH_ROOT' }, components: [{ ...row, clonePath: '../escape' }] }, sourceRoot: value.lab, repoRoot: value.product }), /traversal/);
    assert.throws(() => validateUpstreamLock({ map: { schemaVersion: 'oss-source-map-v1', sourceLab: { rootEnvironment: 'OSS_RESEARCH_ROOT' }, components: [{ ...row, state: 'BLOCKED', blockedReason: '' }] }, sourceRoot: value.lab, repoRoot: value.product }), /blocked reason/);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
