import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classifyResult, redactLog, runUpstreamBaseline } from './run-upstream-baseline.mjs';

test('redacts sensitive log tokens and classifies nonzero outcomes', () => {
  assert.equal(redactLog('token=secret-value').includes('secret-value'), false);
  assert.equal(classifyResult({ status: 0 }), 'PASS');
  assert.equal(classifyResult({ status: 2 }), 'TEST_FAILURE');
  assert.equal(classifyResult({ error: { code: 'ETIMEDOUT' } }), 'ENVIRONMENT_BLOCKED');
});

test('requires a pinned external clone and writes only a safe manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'amic-baseline-'));
  const lab = join(root, 'lab');
  const product = join(root, 'product');
  const clone = join(lab, 'clones', 'candidate');
  mkdirSync(clone, { recursive: true });
  mkdirSync(product);
  try {
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: clone, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    writeFileSync(join(clone, 'LICENSE'), 'test license\n');
    git(['init', '--quiet']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'user.name', 'Test']);
    git(['add', 'LICENSE']);
    git(['commit', '--quiet', '-m', 'baseline fixture']);
    git(['remote', 'add', 'origin', 'https://github.com/example/candidate']);
    const component = { id: 'candidate', state: 'PINNED', officialUrl: 'https://github.com/example/candidate', release: 'v1.0.0', commit: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), licensePath: 'LICENSE', licenseHash: `sha256:${createHash('sha256').update('test license\n').digest('hex')}`, clonePath: 'clones/candidate', owner: 'engineering' };
    const manifest = runUpstreamBaseline({
      map: { schemaVersion: 'oss-source-map-v1', sourceLab: { rootEnvironment: 'OSS_RESEARCH_ROOT' }, components: [component] },
      component,
      sourceRoot: lab,
      repoRoot: product,
      command: ['baseline'],
      outDir: join(root, 'out'),
      run: () => ({ status: 0, stdout: 'token=not-retained', stderr: '' }),
    });
    assert.equal(manifest.outcome, 'PASS');
    assert.equal(JSON.stringify(manifest).includes('not-retained'), false);
    assert.throws(() => runUpstreamBaseline({ map: { components: [] }, component: { state: 'BLOCKED' }, sourceRoot: lab, repoRoot: product, command: ['baseline'], outDir: join(root, 'out') }), /pinned/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
