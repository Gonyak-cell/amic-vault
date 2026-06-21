import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('desktop auth session delegation', () => {
  it('delegates auth/session state to the approved web origin', () => {
    const main = readText('src-tauri/src/main.rs');
    const origin = readText('src-tauri/src/origin.rs');
    const shell = readText('src-tauri/desktop-shell/index.html');

    expect(main).toContain('WebviewUrl::External(vault_url)');
    expect(main).toContain('OriginConfig::load_from_env');
    expect(origin).toContain('url.set_path("/dashboard")');
    expect(origin).toContain('url.set_query(Some("source=tauri"))');
    expect(shell).not.toContain('login');
    expect(shell).not.toContain('token');
  });

  it('does not implement native token, cookie, or credential handling', () => {
    const source = [
      readText('src-tauri/Cargo.toml'),
      readText('src-tauri/src/main.rs'),
      readText('src-tauri/src/origin.rs'),
      readText('src-tauri/src/origin_guard.rs'),
      readText('src-tauri/desktop-shell/index.html'),
    ].join('\n');

    for (const marker of [
      'Authorization',
      'Bearer ',
      'document.cookie',
      'Set-Cookie',
      'CookieStore',
      'localStorage',
      'sessionStorage',
      'indexedDB',
    ]) {
      expect(source).not.toContain(marker);
    }
  });
});
