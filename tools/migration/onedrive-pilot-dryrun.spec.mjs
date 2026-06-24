import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { runDryRun, validateMapping } from './onedrive-pilot-dryrun.mjs';

const validMapping = {
  candidate_id: 'candidate-a',
  candidate_risk_class: 'low_risk',
  tenant_ref: 'TENANT-REF',
  client_ref: 'CLIENT-REF',
  matter_ref: 'MATTER-REF',
  matter_owner_ref: 'MATTER-OWNER-REF',
  source_owner_ref: 'SOURCE-OWNER-REF',
  folder_class: 'matter_record',
  retention_class: 'RETENTION-REF',
  legal_hold_flag: 'no',
  permission_source_ref: 'PERMISSION-REF',
  ethical_wall_implication: 'none',
  ai_allowed_default: 'false',
  duplicate_policy: 'new_document',
  unsupported_type_policy: 'skip_with_receipt',
  zero_byte_policy: 'skip_with_receipt',
  large_object_policy: 'worker_stream_only',
  rollback_owner_ref: 'ROLLBACK-OWNER-REF',
  cutover_policy: 'not_requested',
  status: 'ready_for_dryrun',
  scope_kind: 'pilot_matter',
  single_matter_scope: true,
};

async function fixtureFiles(rows, mapping = validMapping) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-dryrun-test-'));
  const scope = path.join(dir, 'scope.ndjson');
  const mappingPath = path.join(dir, 'mapping.json');
  const report = path.join(dir, 'report.json');
  await writeFile(scope, rows.map((row) => `${JSON.stringify(row)}\n`).join(''), 'utf8');
  await writeFile(mappingPath, `${JSON.stringify(mapping)}\n`, 'utf8');
  return { scope, mappingPath, report };
}

describe('onedrive-pilot-dryrun', () => {
  it('validates required mapping gates', () => {
    assert.deepEqual(validateMapping(validMapping, 'candidate-a'), []);
    assert.ok(validateMapping({ ...validMapping, scope_kind: 'full_corpus' }, 'candidate-a').includes('scope_kind_not_pilot_matter'));
    assert.ok(validateMapping({ ...validMapping, single_matter_scope: false }, 'candidate-a').includes('scope_not_single_matter'));
    assert.ok(validateMapping({ ...validMapping, status: 'draft' }, 'candidate-a').includes('mapping_status_not_ready_for_dryrun'));
  });

  it('produces sanitized ready/skipped/retryable counts without writes', async () => {
    const { scope, mappingPath } = await fixtureFiles([
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
      {
        candidate_id: 'candidate-a',
        source_object_hash: 'c'.repeat(64),
        extension: '.xlsx',
        size_bytes: 300 * 1024 * 1024,
        readable: false,
      },
    ]);

    const report = await runDryRun({ scopePath: scope, mappingPath, runId: 'run', candidateId: 'candidate-a' });
    assert.equal(report.gate_status, 'pass');
    assert.equal(report.summary.status_counts.ready, 1);
    assert.equal(report.summary.status_counts.skipped, 1);
    assert.equal(report.summary.status_counts.retryable, 1);
    assert.equal(report.summary.expected_write_counts.documents, 1);
    assert.ok(report.not_claimed.includes('Vault DB write'));
  });

  it('blocks duplicate review when policy requires review', async () => {
    const mapping = { ...validMapping, duplicate_policy: 'block_pending_review' };
    const duplicate = 'd'.repeat(64);
    const { scope, mappingPath } = await fixtureFiles(
      [
        { candidate_id: 'candidate-a', source_object_hash: duplicate, extension: '.docx', size_bytes: 100 },
        { candidate_id: 'candidate-a', source_object_hash: duplicate, extension: '.pdf', size_bytes: 100 },
      ],
      mapping,
    );

    const report = await runDryRun({ scopePath: scope, mappingPath, runId: 'run', candidateId: 'candidate-a' });
    assert.equal(report.gate_status, 'blocked');
    assert.equal(report.summary.duplicate_candidate_hash_count, 1);
    assert.equal(report.summary.status_counts.blocked, 2);
  });

  it('does not serialize source object keys or labels', async () => {
    const { scope, mappingPath } = await fixtureFiles([
      {
        candidate_id: 'candidate-a',
        source_object_key: 'provider-root/Client Alpha/Matter One/secret.docx',
        extension: '.docx',
        size_bytes: 1024,
      },
    ]);

    const report = await runDryRun({ scopePath: scope, mappingPath, runId: 'run', candidateId: 'candidate-a' });
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes('Client Alpha'), false);
    assert.equal(serialized.includes('Matter One'), false);
    assert.equal(serialized.includes('secret.docx'), false);
    assert.equal(serialized.includes('provider-root'), false);
  });
});
