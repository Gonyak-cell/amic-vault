import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGitleaks, normalizeSemgrep, normalizeTrivy, parseImageSpec, summarizeFindings, validateGitleaksIgnoreContents, validateScannerException } from './run-security-scans.mjs';

test('redacts secret content while retaining a hashed Gitleaks fingerprint', () => {
  const [finding] = normalizeGitleaks([{ RuleID: 'generic-api-key', File: 'tests/fixtures/secret.txt', StartLine: 4, Fingerprint: 'opaque-fingerprint' }], 'working-tree');
  assert.equal(finding.findingId, 'generic-api-key');
  assert.equal(finding.scanScope, 'working-tree');
  assert.match(finding.fingerprintHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(finding).includes('opaque-fingerprint'), false);
});

test('rejects absolute scanner paths and classifies Trivy High results as blocked', () => {
  assert.throws(() => normalizeSemgrep({ results: [{ check_id: 'x', path: '/private/path.ts', extra: {} }] }), /repository-relative/);
  const findings = normalizeTrivy({ Results: [{ Target: 'apps/api/Dockerfile', Misconfigurations: [{ ID: 'DS-0002', Severity: 'HIGH' }] }] });
  assert.deepEqual(summarizeFindings(findings).productionHighCritical, { unclassified: 0, blocked: 1, releaseSafe: false });
  assert.equal(parseImageSpec(`api=docker:sha256:${'a'.repeat(64)}`).name, 'api');
  assert.throws(() => parseImageSpec('api=docker:api:latest'), /immutable local digest/);
});

test('rejects ownerless and expired scanner exceptions', () => {
  assert.throws(() => validateScannerException({ id: 'x' }), /tool missing/);
  assert.throws(() => validateScannerException({ id: 'x', tool: 'trivy', findingId: 'DS-0002', owner: 'security-oss', issuedAt: '2026-01-01', expiresAt: '2026-01-02', evidenceHash: 'sha256:x', decision: 'VEX_APPROVED' }, new Date('2026-07-21T00:00:00.000Z')), /expired/);
});

test('rejects broad and wrong-scope Gitleaks ignores', () => {
  assert.deepEqual(validateGitleaksIgnoreContents('a'.repeat(40) + ':apps/api/test.ts:generic-api-key:12\n'), ['a'.repeat(40) + ':apps/api/test.ts:generic-api-key:12']);
  assert.throws(() => validateGitleaksIgnoreContents('*.ts'), /exact historical/);
  assert.throws(() => validateGitleaksIgnoreContents('a'.repeat(40) + ':apps/api/test.ts:github-pat:12'), /exact historical/);
});
