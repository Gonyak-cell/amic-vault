import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildFileserverManifest } from './fileserver-profile-manifest.mjs';

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'fileserver-profile-'));
  const goodDir = path.join(root, 'AMIC', 'Civil', 'ContractReview');
  const badDir = path.join(root, 'AMIC', 'BadMatterType', 'Legacy');
  await mkdir(goodDir, { recursive: true });
  await mkdir(badDir, { recursive: true });
  const goodFile = path.join(goodDir, 'agreement.docx');
  const badFile = path.join(badDir, 'legacy.pdf');
  await writeFile(goodFile, 'contract bytes', 'utf8');
  await writeFile(badFile, 'legacy bytes', 'utf8');
  return { root, goodFile, badFile };
}

describe('fileserver-profile-manifest', () => {
  it('crawls a directory into deterministic import rows with hashes and mtime', async () => {
    const fixture = await makeFixture();
    const result = await buildFileserverManifest({
      root: fixture.root,
      runId: 'h11-test',
    });

    assert.equal(result.manifestRows.length, 2);
    assert.equal(result.receipt.dry_run_only, true);
    assert.equal(result.receipt.db_writes, 0);
    assert.equal(result.receipt.storage_writes, 0);

    const good = result.manifestRows.find((row) => row.extension === '.docx');
    assert.ok(good);
    assert.equal(good.matter_code, 'AMIC/Civil/ContractReview');
    assert.deepEqual(good.blockers, []);
    assert.equal(good.size_bytes, Buffer.byteLength('contract bytes'));
    assert.equal(good.source_object_hash, sha256(await readFile(fixture.goodFile)));
    assert.equal(Number.isSafeInteger(good.mtime_ms), true);
  });

  it('reuses matter-code blocker rules for invalid folder mappings', async () => {
    const fixture = await makeFixture();
    const result = await buildFileserverManifest({
      root: fixture.root,
      runId: 'h11-test',
    });

    const blocked = result.manifestRows.find((row) => row.extension === '.pdf');
    assert.ok(blocked);
    assert.equal(blocked.matter_code, 'AMIC/BadMatterType/Legacy');
    assert.ok(blocked.blockers.includes('unsupported_matter_type_english'));
    assert.ok(blocked.blockers.includes('unsupported_fileserver_matter_type_segment'));
    assert.equal(result.receipt.blocker_counts.unsupported_matter_type_english, 1);
  });
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
