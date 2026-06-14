import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  desktopCacheDirectiveForPath,
  isDesktopCacheAllowedPath,
} from '../../../apps/web/src/lib/pwa/cache-policy';

const serviceWorkerPath = path.join(process.cwd(), 'apps/web/public/sw.js');

describe('desktop document cache integration', () => {
  it('keeps document, search, audit, records, AI, and API paths out of cache policy', () => {
    for (const pathname of [
      '/v1/documents/00000000-0000-4000-8000-000000000001/preview',
      '/v1/documents/00000000-0000-4000-8000-000000000001/download',
      '/v1/search',
      '/documents/00000000-0000-4000-8000-000000000001',
      '/search',
      '/audit',
      '/records',
      '/ai/sessions/00000000-0000-4000-8000-000000000001',
    ]) {
      expect(isDesktopCacheAllowedPath(pathname), pathname).toBe(false);
      expect(desktopCacheDirectiveForPath(pathname), pathname).toBe('no-store');
    }
  });

  it('mirrors the deny-list in the service worker before any cache match', () => {
    const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');

    expect(serviceWorker).toContain("'/v1'");
    expect(serviceWorker).toContain("'/documents'");
    expect(serviceWorker).toContain("'/search'");
    expect(serviceWorker).toContain("'/audit'");
    expect(serviceWorker).toContain("'/records'");
    expect(serviceWorker).toContain("'/ai'");
    expect(serviceWorker.indexOf('isDeniedPath(url.pathname)')).toBeLessThan(
      serviceWorker.indexOf('isAllowedCachePath(url.pathname)'),
    );
  });
});
