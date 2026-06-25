import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveImportTargets,
  summarizeImportTargetResults,
  validateImportScopeRow,
} from './onedrive-import-target-resolution.mjs';
import { sha256Hex } from './onedrive-target-resolution-dry-run.mjs';

const tenantId = '11111111-1111-4111-8111-111111111111';

function scopeRow(overrides = {}) {
  return {
    client_short_name: '알파',
    extension: '.docx',
    group_id: 'group-1',
    matter_code: '알파/Civil/계약분쟁',
    matter_detail_type_korean: '계약분쟁',
    matter_type_english: 'Civil',
    raw: {
      bucket: 'migration-staging',
      key: 'migration-runs/run/source-tree/1. 민사/알파/계약서.docx',
    },
    size_bytes: 1234,
    source_object_hash: sha256Hex('source-object-key-1'),
    ...overrides,
  };
}

function dbSnapshot(overrides = {}) {
  return {
    tenantId,
    migrationRunId: 'run-1',
    approvalRef: 'approval-ref',
    clients: [{ client_id: 'client-alpha', name: '(주)알파 주식회사', status: 'active' }],
    matters: [
      {
        matter_id: 'matter-alpha',
        client_id: 'client-alpha',
        matter_code: '알파/Civil/계약분쟁',
        matter_type: 'litigation',
        status: 'active',
      },
    ],
    counts: { clients: 1, matters: 1, documents: 0, document_versions: 0, file_objects: 0 },
    duplicateMatterCodeGroups: 0,
    ...overrides,
  };
}

test('validates approved import scope row matter code shape', () => {
  assert.deepEqual(validateImportScopeRow(scopeRow()), []);
  assert.deepEqual(validateImportScopeRow(scopeRow({ matter_type_english: '민사' })), [
    'unsupported_matter_type_english',
    'matter_code_type_segment_mismatch',
  ]);
  assert.deepEqual(validateImportScopeRow(scopeRow({ matter_code: '알파/Civil' })), [
    'invalid_matter_code_format',
  ]);
});

test('resolves approved import rows to existing Vault matter targets without raw source output', () => {
  const { resolvedManifest, conflicts, results } = resolveImportTargets([scopeRow()], dbSnapshot());

  assert.equal(conflicts.length, 0);
  assert.equal(results[0].state, 'resolved_existing_matter');
  assert.equal(resolvedManifest.length, 1);
  assert.equal(resolvedManifest[0].tenant_id, tenantId);
  assert.equal(resolvedManifest[0].client_id, 'client-alpha');
  assert.equal(resolvedManifest[0].matter_id, 'matter-alpha');
  assert.equal(resolvedManifest[0].planned_action, 'create_document_version_file_object_audit');
  assert.equal(JSON.stringify(resolvedManifest).includes('source-tree'), false);
  assert.equal(JSON.stringify(resolvedManifest).includes('계약서.docx'), false);
});

test('blocks matter-code and client consistency conflicts', () => {
  const missing = resolveImportTargets(
    [scopeRow({ matter_code: '베타/Civil/계약분쟁', client_short_name: '베타' })],
    dbSnapshot(),
  );
  assert.equal(missing.results[0].state, 'blocked_matter_code_not_found');
  assert.deepEqual(missing.results[0].blockers, ['matter_code_not_found']);

  const conflict = resolveImportTargets(
    [scopeRow()],
    dbSnapshot({ clients: [{ client_id: 'client-alpha', name: '다른알파' }] }),
  );
  assert.equal(conflict.results[0].state, 'blocked_client_conflict');
  assert.deepEqual(conflict.results[0].blockers, ['matter_client_name_mismatch']);
});

test('excludes archive-only source rows and blocks duplicate import targets', () => {
  const archive = scopeRow({
    raw: {
      bucket: 'migration-staging',
      key: 'migration-runs/run/source-tree/999_이전 자료/old.docx',
    },
  });
  const duplicate = scopeRow();
  const { results, resolvedManifest } = resolveImportTargets(
    [archive, duplicate, duplicate],
    dbSnapshot(),
  );
  const summary = summarizeImportTargetResults(results);

  assert.deepEqual(
    results.map((result) => result.state),
    ['archive_only_excluded', 'resolved_existing_matter', 'blocked_duplicate_import_target'],
  );
  assert.equal(resolvedManifest.length, 1);
  assert.equal(summary.archive_only_excluded_count, 1);
  assert.equal(summary.blocked_count, 1);
  assert.deepEqual(summary.blocker_counts, { duplicate_import_idempotency_key: 1 });
});
