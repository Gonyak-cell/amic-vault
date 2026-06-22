import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const verifier = join(root, 'tools/verify-origin-config.mjs');
const localFixture = join(root, 'src-tauri/config/local.signed.json');

function runVerifier(configPath: string) {
  return spawnSync(process.execPath, [verifier, configPath], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('desktop origin config verifier', () => {
  it('accepts the committed signed local fixture without printing the origin', () => {
    const result = runVerifier(localFixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Desktop origin config verified.');
    expect(result.stdout).not.toContain('localhost');
  });

  it('rejects tampered signed configs before desktop startup', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'amic-vault-origin-'));
    const tamperedPath = join(tempDir, 'tampered-origin.json');
    const config = JSON.parse(readFileSync(localFixture, 'utf8')) as { origin: string };
    config.origin = 'http://localhost:3100';
    writeFileSync(tamperedPath, JSON.stringify(config, null, 2));

    const result = runVerifier(tamperedPath);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('AMIC_VAULT_DESKTOP_ORIGIN_CONFIG_INVALID');
    expect(result.stderr).not.toContain('localhost:3100');
  });
});
