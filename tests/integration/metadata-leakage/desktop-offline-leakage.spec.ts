import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const offlinePath = path.join(process.cwd(), 'apps/web/public/offline.html');
const manifestPath = path.join(process.cwd(), 'apps/web/public/manifest.webmanifest');

describe('desktop offline leakage integration', () => {
  it('keeps the offline shell free of tenant, matter, document, search, audit, and AI state', () => {
    const offlineHtml = fs.readFileSync(offlinePath, 'utf8').toLowerCase();

    for (const forbidden of ['tenant', 'matter', 'document', 'search', 'audit', 'ai', 'client']) {
      expect(new RegExp(`\\b${forbidden}\\b`).test(offlineHtml), forbidden).toBe(false);
    }
  });

  it('keeps the manifest limited to app identity and shell assets', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      name: string;
      start_url: string;
      icons: Array<{ src: string; purpose?: string }>;
    };

    expect(manifest.name).toBe('AMIC Vault');
    expect(manifest.start_url).toBe('/dashboard?source=pwa');
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/icons/amic-vault-icon.svg',
      '/icons/amic-vault-maskable.svg',
    ]);
    expect(JSON.stringify(manifest)).not.toContain('/v1/');
  });
});
