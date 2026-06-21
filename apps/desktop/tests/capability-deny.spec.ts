import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as T;
}

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('desktop capability deny policy', () => {
  it('keeps the capability directory closed to one empty allow-list', () => {
    const capabilityFiles = readdirSync(join(root, 'src-tauri/capabilities'))
      .filter((fileName) => fileName.endsWith('.json'))
      .sort();
    const config = readJson<{ app: { security: { capabilities: string[] } } }>(
      'src-tauri/tauri.conf.json',
    );
    const capability = readJson<{
      identifier: string;
      windows: string[];
      permissions: string[];
    }>('src-tauri/capabilities/vault-thin-shell.json');

    expect(capabilityFiles).toEqual(['vault-thin-shell.json']);
    expect(config.app.security.capabilities).toEqual(['vault-thin-shell']);
    expect(capability.identifier).toBe('vault-thin-shell');
    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual([]);
  });

  it('does not enable denied native plugin families', () => {
    const cargoToml = readText('src-tauri/Cargo.toml');
    const main = readText('src-tauri/src/main.rs');
    const origin = readText('src-tauri/src/origin.rs');
    const guard = readText('src-tauri/src/origin_guard.rs');
    const source = `${cargoToml}\n${main}\n${origin}\n${guard}`;

    for (const marker of [
      'tauri-plugin-fs',
      'tauri-plugin-shell',
      'tauri-plugin-dialog',
      'tauri-plugin-clipboard',
      'tauri-plugin-notification',
      'tauri-plugin-global-shortcut',
      'tauri-plugin-opener',
      'tauri-plugin-updater',
      'plugin(',
      'Command::new',
      'read_dir',
      'write_file',
      'shell::open',
      'open_path',
    ]) {
      expect(source).not.toContain(marker);
    }
  });
});
