import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTelemetryPolicy, validateTelemetryPolicy } from './check-telemetry-policy.mjs';

const policy = {
  canaryTokens: ['__TEL_CANARY_RAW_TENANT_ID__'],
  legacyIdentifierLogBaseline: [
    { path: 'apps/api/src/legacy.ts', key: 'documentId', count: 1 },
  ],
};

test('accepts the fixed legacy log baseline and inventories telemetry callsites', () => {
  const report = validateTelemetryPolicy({
    policy,
    sources: [
      {
        path: 'apps/api/src/legacy.ts',
        text: "this.logger.warn({ code: 'LEGACY', documentId }); this.registry.observe({ route: '/v1/documents/:id' });",
      },
    ],
  });

  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.rawIdentifierLogFields, { 'apps/api/src/legacy.ts\tdocumentId': 1 });
  assert.deepEqual(report.rawTelemetryFields, {});
  assert.deepEqual(report.telemetryCallsiteInventory, { 'apps/api/src/legacy.ts\troute': 1 });
});

test('rejects sensitive canaries, new raw identifier logs, and raw telemetry attributes', () => {
  const sources = [
    {
      path: 'apps/api/src/new.ts',
      text: "this.logger.warn({ tenantId, code: '__TEL_CANARY_RAW_TENANT_ID__' }); span.setAttribute('document_id', documentId);",
    },
  ];

  assert.throws(() => validateTelemetryPolicy({ policy, sources }), /sensitive canary found/);
  const report = inspectTelemetryPolicy({ policy, sources });
  assert.deepEqual(report.rawIdentifierLogFields, { 'apps/api/src/new.ts\ttenantId': 1 });
  assert.deepEqual(report.rawTelemetryFields, { 'apps/api/src/new.ts\tdocument_id': 1 });
});
