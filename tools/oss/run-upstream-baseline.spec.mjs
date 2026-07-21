import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
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
    const manifest = runUpstreamBaseline({
      component: { id: 'candidate', state: 'PINNED', commit: 'a'.repeat(40), tree: 'b'.repeat(40), licenseHash: `sha256:${'c'.repeat(64)}`, clonePath: 'clones/candidate' },
      sourceRoot: lab,
      repoRoot: product,
      command: ['baseline'],
      outDir: join(root, 'out'),
      run: () => ({ status: 0, stdout: 'token=not-retained', stderr: '' }),
    });
    assert.equal(manifest.outcome, 'PASS');
    assert.equal(JSON.stringify(manifest).includes('not-retained'), false);
    assert.throws(() => runUpstreamBaseline({ component: { state: 'BLOCKED' }, sourceRoot: lab, repoRoot: product, command: ['baseline'], outDir: join(root, 'out') }), /pinned/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
