import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('desktop origin guard policy', () => {
  it('installs a Tauri navigation guard before opening the webview', () => {
    const main = readText('src-tauri/src/main.rs');

    expect(main).toContain('.on_navigation');
    expect(main).toContain('is_allowed_navigation');
    expect(main).toContain('AMIC_VAULT_DESKTOP_NAV_BLOCKED: UNAPPROVED_ORIGIN');
    expect(main).not.toContain('{url}');
    expect(main).not.toContain('url.as_str()');
  });

  it('rejects private endpoints and external identity providers as remote Vault origins', () => {
    const origin = readText('src-tauri/src/origin.rs');
    const guard = readText('src-tauri/src/origin_guard.rs');

    expect(origin).toContain('reject_disallowed_remote_origin');
    expect(guard).toContain('is_private_or_local_endpoint');
    expect(guard).toContain('login.microsoftonline.com');
    expect(guard).toContain('accounts.google.com');
  });
});
