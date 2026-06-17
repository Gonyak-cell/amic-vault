import { describe, expect, it } from 'vitest';
import {
  DESKTOP_NO_STORE_HEADER_VALUE,
  desktopCacheDirectiveForPath,
  isDesktopCacheAllowedPath,
  isDesktopSensitivePath,
} from './cache-policy';

describe('desktop PWA cache policy', () => {
  it('allows only static shell assets into the desktop cache', () => {
    expect(isDesktopCacheAllowedPath('/manifest.webmanifest')).toBe(true);
    expect(isDesktopCacheAllowedPath('/offline.html')).toBe(true);
    expect(isDesktopCacheAllowedPath('/_next/static/chunks/app.js')).toBe(true);
    expect(isDesktopCacheAllowedPath('/fonts/amic/Pretendard-Regular.otf')).toBe(true);
    expect(isDesktopCacheAllowedPath('/icons/amic-vault-icon.svg')).toBe(true);
  });

  it('marks authenticated and API paths no-store', () => {
    for (const path of [
      '/v1/documents/document-id/download',
      '/v1/search',
      '/dashboard',
      '/matters/matter-id',
      '/search',
      '/documents/document-id',
      '/audit',
      '/records',
      '/integrations/outlook',
      '/ai/sessions/session-id',
      '/external/token',
      '/login',
    ]) {
      expect(isDesktopSensitivePath(path), path).toBe(true);
      expect(desktopCacheDirectiveForPath(path), path).toBe('no-store');
    }
  });

  it('uses the desktop no-store value required by the threat model', () => {
    expect(DESKTOP_NO_STORE_HEADER_VALUE).toBe(
      'no-store, no-cache, max-age=0, must-revalidate, private',
    );
  });
});
