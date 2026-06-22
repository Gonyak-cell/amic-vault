import { describe, expect, it } from 'vitest';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as T;
}

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('desktop Tauri thin-shell policy', () => {
  it('keeps the Tauri shell on an empty native-capability allow-list', () => {
    const config = readJson<{
      app: { windows: unknown[]; security: { capabilities: string[] } };
      bundle: { targets: string[]; icon: string[] };
    }>('src-tauri/tauri.conf.json');
    const capability = readJson<{ windows: string[]; permissions: string[] }>(
      'src-tauri/capabilities/vault-thin-shell.json',
    );

    expect(config.app.windows).toEqual([]);
    expect(config.app.security.capabilities).toEqual(['vault-thin-shell']);
    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual([]);
    expect(config.bundle.targets).toEqual(['app']);
    expect(config.bundle.icon).toEqual([
      'icons/32x32.png',
      'icons/128x128.png',
      'icons/128x128@2x.png',
      'icons/icon.icns',
      'icons/icon.ico',
    ]);
  });

  it('does not add native file, shell, dialog, clipboard, or updater plugins', () => {
    const cargoToml = readText('src-tauri/Cargo.toml');
    const main = readText('src-tauri/src/main.rs');
    const forbiddenMarkers = [
      'tauri-plugin-fs',
      'tauri-plugin-shell',
      'tauri-plugin-dialog',
      'tauri-plugin-clipboard',
      'tauri-plugin-updater',
      'plugin(',
      'Command::new',
      'read_dir',
      'write_file',
    ];

    for (const marker of forbiddenMarkers) {
      expect(`${cargoToml}\n${main}`).not.toContain(marker);
    }
    expect(main).toContain('WebviewUrl::External');
    expect(main).toContain('OriginConfig::load_from_env');
  });

  it('requires a signed origin config for the local fixture', () => {
    const config = readJson<{
      schemaVersion: number;
      releaseChannel: string;
      originRef: string;
      origin: string;
      signature: string;
    }>('src-tauri/config/local.signed.json');
    const spkiDer = Buffer.from(
      'MCowBQYDK2VwAyEAy3uFqTX+HBSpd+fJ7p2RdFjIkkVyvhnKWEGGabCCWmE=',
      'base64',
    );
    const key = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    const payload = Buffer.from(
      `schemaVersion=${config.schemaVersion}\nreleaseChannel=${config.releaseChannel}\noriginRef=${config.originRef}\norigin=${config.origin}\n`,
    );

    expect(config.releaseChannel).toBe('local');
    expect(config.originRef).toBe('LOCAL-DEV');
    expect(config.origin).toBe('http://localhost:3000');
    expect(verify(null, payload, key, Buffer.from(config.signature, 'base64'))).toBe(true);
  });
});
