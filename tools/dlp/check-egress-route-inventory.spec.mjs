import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectEgressInventory,
  loadEgressSources,
  validateEgressInventory,
} from './check-egress-route-inventory.mjs';

const sources = loadEgressSources();

test('closes every discovered byte, ticket, internal-reference, and generated-document route', () => {
  const report = validateEgressInventory({ sources });

  assert.equal(report.status, 'PASS');
  assert.equal(report.unknownCount, 0);
  assert.equal(report.staleCount, 0);
  assert.ok(report.candidateCount >= 18);
  assert.equal(report.routeContractCount, 6);
  assert.ok((report.categories.gated ?? 0) >= 6);
  assert.ok((report.categories.reviewed_exclusion ?? 0) >= 6);
});

test('fails when a covered document download loses its DLP gate', () => {
  const path = 'apps/api/src/modules/document/document-lifecycle.service.ts';
  const mutated = {
    ...sources,
    [path]: sources[path].replace('evaluateDocumentEgress', 'evaluateDocumentPolicy'),
  };

  const report = inspectEgressInventory({ sources: mutated });
  assert.equal(report.status, 'FAIL');
  assert.match(report.errors.join('\n'), /DocumentLifecycleService\.download.*evaluateDocumentEgress/u);
});

test('fails closed on a newly discovered unclassified storage-read method', () => {
  const path = 'apps/api/src/modules/document/document-lifecycle.service.ts';
  const mutated = {
    ...sources,
    [path]: `${sources[path]}\nclass NewSilentExport {\n  async stream() {\n    return this.storageService.getByStorageUri('tenant', 'uri');\n  }\n}\n`,
  };

  const report = inspectEgressInventory({ sources: mutated });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.unknownCount, 1);
  assert.match(report.errors.join('\n'), /NewSilentExport\.stream: unknown egress candidate/u);
});

test('fails when an explicit preview exclusion loses its named authorization control', () => {
  const path = 'apps/api/src/modules/preview/preview.service.ts';
  const mutated = {
    ...sources,
    [path]: sources[path].replace(
      'previewSessionService.authorizeStream',
      'previewSessionService.uncheckedStream',
    ),
  };

  assert.throws(
    () => validateEgressInventory({ sources: mutated }),
    /PreviewService\.openPreview.*previewSessionService\.authorizeStream/u,
  );
});

test('fails when DLP evaluation moves after a storage read', () => {
  const path = 'apps/api/src/modules/document/document-lifecycle.service.ts';
  const source = sources[path];
  const gate = 'this.dlpService.evaluateDocumentEgress';
  const storage = 'this.storageService.getByStorageUri';
  const mutated = {
    ...sources,
    [path]: source
      .replace(gate, '__DLP_GATE_CALL__')
      .replace(storage, gate)
      .replace('__DLP_GATE_CALL__', storage),
  };

  const report = inspectEgressInventory({ sources: mutated });
  assert.equal(report.status, 'FAIL');
  assert.match(report.errors.join('\n'), /unsafe order/u);
});
