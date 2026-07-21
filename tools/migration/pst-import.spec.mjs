import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildPstImportPlan } from './pst-import.mjs';

async function writeEml(dir, name, headers, body = 'body') {
  const filePath = path.join(dir, name);
  await writeFile(
    filePath,
    `${Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}\n\n${body}\n`,
    'utf8',
  );
  return filePath;
}

describe('pst-import', () => {
  it('builds a dry-run email import plan and skips duplicate message hashes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pst-import-'));
    await mkdir(path.join(root, 'nested'), { recursive: true });
    const firstHeaders = {
      'Message-ID': '<first@example.test>',
      Subject: 'Korean subject',
      From: 'sender@example.test',
    };
    await writeEml(root, 'first.eml', firstHeaders);
    await writeEml(path.join(root, 'nested'), 'first-copy.eml', firstHeaders);
    await writeEml(root, 'second.eml', {
      'Message-ID': '<second@example.test>',
      Subject: 'Second',
    });

    const result = await buildPstImportPlan({
      emlDir: root,
      matterCode: 'AMIC/Civil/ContractReview',
      runId: 'h11-pst-test',
    });

    assert.equal(result.planRows.length, 3);
    assert.equal(result.receipt.dry_run_only, true);
    assert.equal(result.receipt.db_writes, 0);
    assert.equal(result.receipt.storage_writes, 0);
    assert.equal(result.receipt.email_service_writes, 0);
    assert.equal(result.receipt.totals.eml_count, 3);
    assert.equal(result.receipt.totals.unique_message_count, 2);
    assert.equal(result.receipt.totals.duplicate_message_count, 1);
    assert.equal(result.receipt.blocker_counts.duplicate_message_hash, 1);
    assert.equal(
      result.planRows.filter((row) => row.planned_action === 'import_via_email_service_raw_eml')
        .length,
      2,
    );
  });

  it('blocks rows when the PST wave mapping matter code is invalid', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pst-import-invalid-'));
    await writeEml(root, 'first.eml', {
      'Message-ID': '<first@example.test>',
      Subject: 'First',
    });

    const result = await buildPstImportPlan({
      emlDir: root,
      matterCode: 'AMIC/Civil',
      runId: 'h11-pst-test',
    });

    assert.equal(result.planRows.length, 1);
    assert.deepEqual(result.planRows[0].blockers, ['invalid_matter_code_format']);
    assert.equal(result.planRows[0].planned_action, 'blocked_pending_mapping');
    assert.equal(result.receipt.blocker_counts.invalid_matter_code_format, 1);
  });
});
