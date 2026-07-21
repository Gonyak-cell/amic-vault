import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateReuseFirst } from './check-reuse-first.mjs';

const emptyDecisions = { decisions: [] };

test('allows new governance files without treating them as product code', () => {
  const result = evaluateReuseFirst({ changedFiles: ['tools/oss/check-reuse-first.mjs', 'security/oss-source-map.yml'], decisions: emptyDecisions });
  assert.equal(result.status, 'PASS');
});

test('fails closed for new product code and dependency manifests', () => {
  const result = evaluateReuseFirst({ changedFiles: ['apps/api/src/copied.ts', 'packages/domain/package.json'], decisions: emptyDecisions });
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.violations.map((item) => item.code), ['NEW_DEPENDENCY_REQUIRES_SCOPED_DECISION', 'NEW_PRODUCT_FILE_REQUIRES_L0_L4_DECISION', 'NEW_PRODUCT_FILE_REQUIRES_L0_L4_DECISION']);
});

test('fails closed for source-lab content but accepts an explicitly approved bounded file', () => {
  const blocked = evaluateReuseFirst({ changedFiles: ['clones/tusd/main.go'], decisions: emptyDecisions });
  assert.equal(blocked.violations[0].code, 'SOURCE_LAB_BUILD_CONTEXT_FORBIDDEN');
  const approved = evaluateReuseFirst({
    changedFiles: ['apps/api/src/modules/document/tus-adapter.ts'],
    decisions: { decisions: [{ decision: 'L1', status: 'APPROVED_FOR_PRODUCT_CHANGE', approvedPaths: ['apps/api/src/modules/document/tus-adapter.ts'] }] },
  });
  assert.equal(approved.status, 'PASS');
});

test('allows an explicitly L0-ineligible new product file but still catches a changed dependency manifest', () => {
  const l0 = evaluateReuseFirst({
    changedFiles: ['apps/api/src/common/local-helper.ts'],
    decisions: { decisions: [], l0IneligiblePaths: ['apps/api/src/common/local-helper.ts'] },
  });
  assert.equal(l0.status, 'PASS');
  const dependency = evaluateReuseFirst({
    changedFiles: ['apps/api/package.json'],
    addedFiles: [],
    decisions: emptyDecisions,
  });
  assert.equal(dependency.status, 'FAIL');
  assert.equal(dependency.violations[0].code, 'NEW_DEPENDENCY_REQUIRES_SCOPED_DECISION');
});
