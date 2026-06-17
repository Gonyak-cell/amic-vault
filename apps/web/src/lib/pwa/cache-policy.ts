export const DESKTOP_NO_STORE_HEADER_VALUE =
  'no-store, no-cache, max-age=0, must-revalidate, private';

const exactAllowedCachePaths = new Set(['/manifest.webmanifest', '/offline.html']);

const allowedCachePrefixes = ['/_next/static/', '/fonts/amic/', '/icons/'] as const;

const sensitivePathPrefixes = [
  '/v1',
  '/dashboard',
  '/matters',
  '/files',
  '/search',
  '/documents',
  '/audit',
  '/records',
  '/ai',
  '/contracts',
  '/dd',
  '/litigation',
  '/enterprise',
  '/integrations',
  '/scale',
  '/walls',
  '/external',
  '/login',
] as const;

function exactOrDescendant(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isDesktopSensitivePath(pathname: string): boolean {
  return sensitivePathPrefixes.some((prefix) => exactOrDescendant(pathname, prefix));
}

export function isDesktopCacheAllowedPath(pathname: string): boolean {
  if (exactAllowedCachePaths.has(pathname)) return true;
  return allowedCachePrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function desktopCacheDirectiveForPath(pathname: string): 'cacheable-shell' | 'no-store' {
  if (isDesktopSensitivePath(pathname)) return 'no-store';
  return isDesktopCacheAllowedPath(pathname) ? 'cacheable-shell' : 'no-store';
}
