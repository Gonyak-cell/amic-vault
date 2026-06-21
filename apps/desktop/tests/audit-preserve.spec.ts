import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('desktop server audit preservation', () => {
  it('does not implement native document view/download routes', () => {
    const source = [
      readText('src-tauri/Cargo.toml'),
      readText('src-tauri/src/main.rs'),
      readText('src-tauri/src/origin.rs'),
      readText('src-tauri/src/origin_guard.rs'),
    ].join('\n');

    for (const marker of [
      '/v1/documents',
      '/download',
      'DOCUMENT_VIEWED',
      'DOCUMENT_DOWNLOADED',
      'auditService',
      'tauri-plugin-fs',
      'tauri-plugin-shell',
      'tauri-plugin-opener',
      'read_dir',
      'write_file',
    ]) {
      expect(source).not.toContain(marker);
    }
  });

  it('keeps document and audit behavior on the server-backed web surface', () => {
    const main = readText('src-tauri/src/main.rs');
    const origin = readText('src-tauri/src/origin.rs');

    expect(main).toContain('WebviewUrl::External(vault_url)');
    expect(origin).toContain('/dashboard');
    expect(origin).not.toContain('/v1/');
  });
});
