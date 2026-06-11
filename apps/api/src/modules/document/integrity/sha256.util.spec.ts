import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { sha256File, sha256Stream } from './sha256.util';

describe('sha256 utilities', () => {
  it('matches known vectors for empty and abc inputs', async () => {
    await expect(sha256Stream(Readable.from(Buffer.alloc(0)))).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    await expect(sha256Stream(Readable.from(Buffer.from('abc')))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes files through a stream', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amic-vault-sha-'));
    const path = join(dir, 'large.bin');
    await writeFile(path, Buffer.alloc(1024 * 1024, 'a'));

    await expect(sha256File(path)).resolves.toBe(
      '9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360',
    );
  });
});
