import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateReuseFirst, packageDependencyManifestChanged } from './check-reuse-first.mjs';

const decisions = { decisions: [], l0IneligiblePaths: [] };

test('accepts decision-only changes', () => {
  assert.equal(evaluateReuseFirst({ changedFiles: ['security/oss-source-map.yml'], decisions }).status, 'PASS');
});

test('rejects source-lab, dependency, and unapproved product additions', () => {
  const report = evaluateReuseFirst({ changedFiles: ['clones/tusd/pkg/hooks/hooks.go', 'pnpm-lock.yaml'], addedFiles: ['apps/api/src/new.ts'], decisions });
  assert.equal(report.status, 'FAIL');
  assert.deepEqual(report.violations.map(({ code }) => code), ['SOURCE_LAB_BUILD_CONTEXT_FORBIDDEN', 'NEW_DEPENDENCY_REQUIRES_SCOPED_DECISION', 'NEW_PRODUCT_FILE_REQUIRES_L0_L4_DECISION']);
});

test('allows only an explicitly approved L1 dependency path', () => {
  const scoped = {
    decisions: [
      {
        decision: 'L1',
        status: 'APPROVED_FOR_PRODUCT_CHANGE',
        approvedPaths: ['workers/ingestion/pyproject.toml'],
        approvedDependencyPaths: ['workers/ingestion/pyproject.toml'],
      },
    ],
    l0IneligiblePaths: [],
  };
  assert.equal(
    evaluateReuseFirst({ changedFiles: ['workers/ingestion/pyproject.toml'], decisions: scoped }).status,
    'PASS',
  );
  assert.equal(
    evaluateReuseFirst({ changedFiles: ['workers/ingestion/uv.lock'], decisions: scoped }).status,
    'FAIL',
  );
});

test('allows package script changes but keeps package dependency changes fail closed', () => {
  const before = JSON.stringify({ scripts: { check: 'node check.mjs' }, dependencies: { zod: '3.0.0' }, pnpm: { overrides: { zod: '3.0.0' } } });
  const scriptsOnly = JSON.stringify({ scripts: { check: 'node check.mjs', dlp: 'node dlp.mjs' }, dependencies: { zod: '3.0.0' }, pnpm: { overrides: { zod: '3.0.0' } } });
  const dependencyChange = JSON.stringify({ scripts: { check: 'node check.mjs' }, dependencies: { zod: '3.1.0' }, pnpm: { overrides: { zod: '3.0.0' } } });
  assert.equal(packageDependencyManifestChanged(before, scriptsOnly), false);
  assert.equal(packageDependencyManifestChanged(before, dependencyChange), true);
  assert.equal(evaluateReuseFirst({ changedFiles: ['package.json'], dependencyChangedFiles: [], decisions }).status, 'PASS');
  assert.equal(evaluateReuseFirst({ changedFiles: ['package.json'], dependencyChangedFiles: ['package.json'], decisions }).status, 'FAIL');
});
