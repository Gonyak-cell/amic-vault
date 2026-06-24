import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import {
  extensionOfKey,
  profileManifest,
  renderMarkdown,
  sizeBucket,
} from './onedrive-profile-manifest.mjs';

const gzipAsync = promisify(gzip);

async function writeGzipNdjson(rows) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-profile-test-'));
  const ndjson = path.join(dir, 'manifest.ndjson');
  const gz = path.join(dir, 'manifest.ndjson.gz');
  await mkdir(dir, { recursive: true });
  await writeFile(
    ndjson,
    rows.map((row) => `${JSON.stringify(row)}\n`).join(''),
    'utf8',
  );
  const compressed = await gzipAsync(await readFile(ndjson));
  await writeFile(gz, compressed);
  return gz;
}

describe('onedrive-profile-manifest', () => {
  it('extracts sanitized extensions and size buckets', () => {
    assert.equal(extensionOfKey('prefix/source-tree/A/B/Contract.DOCX'), '.docx');
    assert.equal(extensionOfKey('prefix/source-tree/A/B/no-extension'), '[no_ext]');
    assert.equal(extensionOfKey('prefix/source-tree/A/B/.hidden'), '[no_ext]');
    assert.equal(sizeBucket(0), 'zero_bytes');
    assert.equal(sizeBucket(500), 'lt_1_mib');
    assert.equal(sizeBucket(5 * 1024 * 1024), '1_to_10_mib');
    assert.equal(sizeBucket(2 * 1024 ** 3), 'gte_1_gib');
  });

  it('profiles rows without exposing raw keys or names', async () => {
    const rows = [
      {
        key: 'migration-runs/run/source-tree/Client Alpha/Matter One/a.docx',
        size: 1024,
      },
      {
        key: 'migration-runs/run/source-tree/Client Alpha/Matter One/b.pdf',
        size: 2 * 1024 * 1024,
      },
      {
        key: 'migration-runs/run/source-tree/Client Beta/Matter Two/c.xlsx',
        size: 0,
      },
    ];
    const input = await writeGzipNdjson(rows);

    const profile = await profileManifest({
      inputPath: input,
      runId: 'run',
      sourcePrefix: 'migration-runs/run/source-tree/',
      topLimit: 10,
    });

    assert.equal(profile.totals.object_count, 3);
    assert.equal(profile.totals.zero_byte_object_count, 1);
    assert.equal(profile.pilot_candidate_summary.medium_risk_count, 1);
    assert.equal(profile.pilot_candidate_summary.blocked_count, 1);

    const serialized = JSON.stringify(profile);
    assert.equal(serialized.includes('Client Alpha'), false);
    assert.equal(serialized.includes('Matter One'), false);
    assert.equal(serialized.includes('a.docx'), false);
    assert.equal(serialized.includes('migration-runs/run/source-tree'), false);
  });

  it('renders markdown without raw source labels', async () => {
    const input = await writeGzipNdjson([
      {
        key: 'migration-runs/run/source-tree/Client Alpha/Matter One/a.docx',
        size: 1024,
      },
    ]);
    const profile = await profileManifest({
      inputPath: input,
      runId: 'run',
      sourcePrefix: 'migration-runs/run/source-tree/',
    });
    const markdown = renderMarkdown(profile);
    assert.equal(markdown.includes('Client Alpha'), false);
    assert.equal(markdown.includes('a.docx'), false);
    assert.match(markdown, /OneDrive Pilot Candidate Summary/);
  });
});
