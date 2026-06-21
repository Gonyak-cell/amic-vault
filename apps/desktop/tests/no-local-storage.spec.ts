import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('desktop no local storage policy', () => {
  it('does not include browser or Tauri local persistence APIs', () => {
    const source = [
      readText('package.json'),
      readText('src-tauri/Cargo.toml'),
      readText('src-tauri/tauri.conf.json'),
      readText('src-tauri/src/main.rs'),
      readText('src-tauri/src/origin.rs'),
      readText('src-tauri/src/origin_guard.rs'),
      readText('src-tauri/desktop-shell/index.html'),
    ].join('\n');

    for (const marker of [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'CacheStorage',
      'caches.open',
      'document.cookie',
      'tauri-plugin-store',
      'tauri-plugin-sql',
      'rusqlite',
      'sqlx',
      'sqlite',
      'rocksdb',
      'sled',
      'redb',
      'BaseDirectory::AppData',
      'app_data_dir',
    ]) {
      expect(source).not.toContain(marker);
    }
  });

  it('does not cache document, search, AI, records, or audit surfaces locally', () => {
    const source = [
      readText('src-tauri/src/main.rs'),
      readText('src-tauri/src/origin.rs'),
      readText('src-tauri/src/origin_guard.rs'),
      readText('src-tauri/desktop-shell/index.html'),
    ].join('\n');

    for (const marker of [
      '/v1/documents',
      '/v1/search',
      '/documents/',
      '/search',
      '/audit',
      '/records',
      '/ai',
      'document_body',
      'search_results',
      'audit_events',
    ]) {
      expect(source).not.toContain(marker);
    }
  });
});
