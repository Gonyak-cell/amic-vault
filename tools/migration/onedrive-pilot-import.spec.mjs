import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { runImport, validateWriteMapping } from './onedrive-pilot-import.mjs';

const writeMapping = {
  candidate_id: 'candidate-a',
  tenant_ref: 'TENANT-REF',
  client_ref: 'CLIENT-REF',
  matter_ref: 'MATTER-REF',
  status: 'ready_for_write_mode',
  scope_kind: 'pilot_matter',
  single_matter_scope: true,
  duplicate_policy: 'new_document',
  unsupported_type_policy: 'skip_with_receipt',
  zero_byte_policy: 'skip_with_receipt',
  large_object_policy: 'worker_stream_only',
  cutover_policy: 'not_requested',
  approval_ref: 'APPROVAL-REF',
  dryrun_pass_ref: 'DRYRUN-PASS-REF',
  write_window_ref: 'WRITE-WINDOW-REF',
  db_snapshot_ref: 'DB-SNAPSHOT-REF',
  storage_containment_ref: 'STORAGE-CONTAINMENT-REF',
  rollback_owner_ref: 'ROLLBACK-OWNER-REF',
};

async function fixtureFiles(rows, mapping = writeMapping) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-import-test-'));
  const scope = path.join(dir, 'scope.ndjson');
  const mappingPath = path.join(dir, 'mapping.json');
  const store = path.join(dir, 'store');
  await writeFile(scope, rows.map((row) => `${JSON.stringify(row)}\n`).join(''), 'utf8');
  await writeFile(mappingPath, `${JSON.stringify(mapping)}\n`, 'utf8');
  return { scope, mappingPath, store };
}

async function readNdjson(filePath) {
  return (await readFile(filePath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('onedrive-pilot-import', () => {
  it('validates write-mode mapping gates', () => {
    assert.deepEqual(validateWriteMapping(writeMapping, 'candidate-a'), []);
    assert.ok(validateWriteMapping({ ...writeMapping, approval_ref: '' }, 'candidate-a').includes('missing_write_ref_approval_ref'));
    assert.ok(validateWriteMapping({ ...writeMapping, status: 'ready_for_dryrun' }, 'candidate-a').includes('mapping_status_not_ready_for_write_mode'));
    assert.ok(validateWriteMapping({ ...writeMapping, scope_kind: 'full_corpus' }, 'candidate-a').includes('scope_kind_not_pilot_matter'));
  });

  it('creates synthetic Vault-shaped records with migration source system', async () => {
    const { scope, mappingPath, store } = await fixtureFiles([
      {
        candidate_id: 'candidate-a',
        source_object_hash: 'a'.repeat(64),
        extension: '.docx',
        size_bytes: 1024,
        readable: true,
      },
      {
        candidate_id: 'candidate-a',
        source_object_hash: 'b'.repeat(64),
        extension: '.pdf',
        size_bytes: 0,
        readable: true,
      },
    ]);

    const report = await runImport({
      mode: 'synthetic-write',
      scopePath: scope,
      mappingPath,
      fixtureStore: store,
      runId: 'run',
      candidateId: 'candidate-a',
    });

    assert.equal(report.gate_status, 'pass');
    assert.equal(report.summary.status_counts.imported, 1);
    assert.equal(report.summary.status_counts.skipped, 1);

    const documents = await readNdjson(path.join(store, 'documents.ndjson'));
    const fileObjects = await readNdjson(path.join(store, 'file_objects.ndjson'));
    const versions = await readNdjson(path.join(store, 'document_versions.ndjson'));
    const auditEvents = await readNdjson(path.join(store, 'audit_events.ndjson'));
    assert.equal(documents.length, 1);
    assert.equal(fileObjects.length, 1);
    assert.equal(fileObjects[0].source_system, 'migration');
    assert.equal(versions.length, 1);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, 'DOCUMENT_IMPORTED');
  });

  it('is idempotent on rerun', async () => {
    const { scope, mappingPath, store } = await fixtureFiles([
      {
        candidate_id: 'candidate-a',
        source_object_hash: 'c'.repeat(64),
        extension: '.xlsx',
        size_bytes: 2048,
        readable: true,
      },
    ]);
    await runImport({ mode: 'synthetic-write', scopePath: scope, mappingPath, fixtureStore: store, runId: 'run', candidateId: 'candidate-a' });
    const second = await runImport({ mode: 'synthetic-write', scopePath: scope, mappingPath, fixtureStore: store, runId: 'run', candidateId: 'candidate-a' });
    assert.equal(second.summary.status_counts.already_imported, 1);
    const documents = await readNdjson(path.join(store, 'documents.ndjson'));
    assert.equal(documents.length, 1);
  });

  it('refuses real pilot write in LC05', async () => {
    const { scope, mappingPath, store } = await fixtureFiles([]);
    await assert.rejects(
      () =>
        runImport({
          mode: 'pilot-write',
          scopePath: scope,
          mappingPath,
          fixtureStore: store,
          runId: 'run',
          candidateId: 'candidate-a',
        }),
      /reserved for LC-ONEDRIVE-06/,
    );
  });

  it('does not serialize source labels in sanitized report', async () => {
    const { scope, mappingPath, store } = await fixtureFiles([
      {
        candidate_id: 'candidate-a',
        source_object_key: 'provider-root/Client Alpha/Matter One/secret.docx',
        extension: '.docx',
        size_bytes: 1024,
        readable: true,
      },
    ]);
    const report = await runImport({ mode: 'synthetic-write', scopePath: scope, mappingPath, fixtureStore: store, runId: 'run', candidateId: 'candidate-a' });
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes('Client Alpha'), false);
    assert.equal(serialized.includes('Matter One'), false);
    assert.equal(serialized.includes('secret.docx'), false);
    assert.equal(serialized.includes('provider-root'), false);
  });
});
